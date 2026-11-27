"""SQLite persistence layer for tasks, dead-letter recovery, approvals, and structured audit events."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalStateStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS local_tasks (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL,
                    retries INTEGER NOT NULL DEFAULT 0,
                    max_retries INTEGER NOT NULL DEFAULT 2,
                    result TEXT,
                    error TEXT,
                    correlation_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS local_approvals (
                    id TEXT PRIMARY KEY,
                    tool_name TEXT NOT NULL,
                    args TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    result TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS local_events (
                    id TEXT PRIMARY KEY,
                    level TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    request_id TEXT,
                    metadata TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            # Recover any tasks orphaned mid-run by an unexpected process crash
            conn.execute(
                "UPDATE local_tasks SET status = 'queued', error = 'Recovered after unclean shutdown', updated_at = ? WHERE status = 'running'",
                (utc_now(),),
            )
            conn.commit()

    def enqueue_task(
        self,
        agent_id: str,
        task_type: str,
        payload: dict[str, Any],
        correlation_id: Optional[str] = None,
        max_retries: int = 2,
    ) -> dict[str, Any]:
        task_id = f"lt_{uuid.uuid4().hex[:12]}"
        now = utc_now()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO local_tasks (id, agent_id, task_type, payload, status, retries, max_retries, correlation_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)
                """,
                (task_id, agent_id, task_type, json.dumps(payload), max_retries, correlation_id, now, now),
            )
            conn.commit()
        return self.get_task(task_id)  # type: ignore[return-value]

    def get_task(self, task_id: str) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM local_tasks WHERE id = ?", (task_id,)).fetchone()
            return self._parse_task(row) if row else None

    def list_tasks(self, limit: int = 40) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM local_tasks ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [self._parse_task(r) for r in rows]

    def claim_next_queued_task(self) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM local_tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            conn.execute(
                "UPDATE local_tasks SET status = 'running', updated_at = ? WHERE id = ?",
                (utc_now(), row["id"]),
            )
            conn.commit()
            return self._parse_task(row)

    def complete_task(self, task_id: str, result: dict[str, Any]) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE local_tasks SET status = 'completed', result = ?, error = NULL, updated_at = ? WHERE id = ?",
                (json.dumps(result), utc_now(), task_id),
            )
            conn.commit()
        return self.get_task(task_id)

    def fail_or_requeue_task(self, task_id: str, error_msg: str) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT retries, max_retries FROM local_tasks WHERE id = ?", (task_id,)).fetchone()
            if not row:
                return None
            next_retries = int(row["retries"]) + 1
            next_status = "queued" if next_retries <= int(row["max_retries"]) else "dead_letter"
            conn.execute(
                "UPDATE local_tasks SET status = ?, retries = ?, error = ?, updated_at = ? WHERE id = ?",
                (next_status, next_retries, error_msg[:800], utc_now(), task_id),
            )
            conn.commit()
        return self.get_task(task_id)

    def retry_dead_letters(self) -> int:
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE local_tasks SET status = 'queued', retries = 0, updated_at = ? WHERE status = 'dead_letter'",
                (utc_now(),),
            )
            conn.commit()
            return cur.rowcount

    def create_approval(self, tool_name: str, args: dict[str, Any], reason: str) -> dict[str, Any]:
        aid = f"ap_{uuid.uuid4().hex[:10]}"
        now = utc_now()
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO local_approvals (id, tool_name, args, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
                (aid, tool_name, json.dumps(args), reason, now, now),
            )
            conn.commit()
        return self.get_approval(aid)  # type: ignore[return-value]

    def get_approval(self, approval_id: str) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM local_approvals WHERE id = ?", (approval_id,)).fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "tool_name": row["tool_name"],
                "args": json.loads(row["args"]),
                "reason": row["reason"],
                "status": row["status"],
                "result": json.loads(row["result"]) if row["result"] else None,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }

    def list_approvals(self, limit: int = 30) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM local_approvals ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "tool_name": r["tool_name"],
                    "args": json.loads(r["args"]),
                    "reason": r["reason"],
                    "status": r["status"],
                    "result": json.loads(r["result"]) if r["result"] else None,
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                }
                for r in rows
            ]

    def update_approval(self, approval_id: str, status: str, result: Optional[dict[str, Any]] = None) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE local_approvals SET status = ?, result = ?, updated_at = ? WHERE id = ?",
                (status, json.dumps(result) if result is not None else None, utc_now(), approval_id),
            )
            conn.commit()

    def record_event(
        self,
        event_type: str,
        message: str,
        level: str = "info",
        request_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        eid = f"ev_{uuid.uuid4().hex[:12]}"
        now = utc_now()
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO local_events (id, level, event_type, message, request_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (eid, level, event_type, message[:500], request_id, json.dumps(metadata or {}), now),
            )
            conn.commit()
        return {
            "id": eid,
            "level": level,
            "event_type": event_type,
            "message": message,
            "request_id": request_id,
            "metadata": metadata or {},
            "created_at": now,
        }

    def list_events(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM local_events ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "level": r["level"],
                    "event_type": r["event_type"],
                    "message": r["message"],
                    "request_id": r["request_id"],
                    "metadata": json.loads(r["metadata"]),
                    "created_at": r["created_at"],
                }
                for r in rows
            ]

    @staticmethod
    def _parse_task(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "agent_id": row["agent_id"],
            "task_type": row["task_type"],
            "payload": json.loads(row["payload"]),
            "status": row["status"],
            "retries": row["retries"],
            "max_retries": row["max_retries"],
            "result": json.loads(row["result"]) if row["result"] else None,
            "error": row["error"],
            "correlation_id": row["correlation_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
