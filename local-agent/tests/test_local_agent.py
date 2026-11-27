"""Comprehensive pytest suite for JARVIS 5.0 Local Autonomous Runtime."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from jarvis_local.app import create_app
from jarvis_local.config import LocalAgentSettings
from jarvis_local.db import LocalStateStore
from jarvis_local.ollama_manager import recommend_quantized_models
from jarvis_local.tools import resolve_authorized_path


@pytest.fixture()
def isolated_env(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("# Demo Repo\nJARVIS 5.0 local runtime test.\n", encoding="utf-8")
    (workspace / ".env").write_text("SECRET_KEY=topsecret\n", encoding="utf-8")

    os.environ["JARVIS_LOCAL_STATE_DIR"] = str(tmp_path / "state")
    os.environ["JARVIS_LOCAL_TOKEN"] = "jlocal_test_secret_token_0011223344"
    os.environ["JARVIS_ALLOWED_DIRS"] = str(workspace)
    settings = LocalAgentSettings()
    app = create_app(settings)
    with TestClient(app) as client:
        yield client, workspace, settings
    for k in ("JARVIS_LOCAL_STATE_DIR", "JARVIS_LOCAL_TOKEN", "JARVIS_ALLOWED_DIRS"):
        os.environ.pop(k, None)


def auth_headers():
    return {"Authorization": "Bearer jlocal_test_secret_token_0011223344"}


def test_loopback_enforcement_and_auth_guards(isolated_env):
    client, _, settings = isolated_env
    assert settings.host == "127.0.0.1"

    # Unauthenticated protected route rejected
    r_unauth = client.get("/status")
    assert r_unauth.status_code == 401

    # Invalid token rejected
    r_bad = client.get("/status", headers={"Authorization": "Bearer wrong"})
    assert r_bad.status_code == 401

    # Disallowed origin rejected
    r_origin = client.get("/health", headers={"Origin": "https://evil-attacker.example"})
    assert r_origin.status_code == 403


def test_workspace_boundary_and_secret_file_protection(isolated_env):
    client, workspace, settings = isolated_env

    # Allowed file read succeeds
    res = client.post(
        "/tools/execute",
        headers=auth_headers(),
        json={"tool_name": "read_file", "args": {"path": "README.md"}},
    )
    assert res.status_code == 200
    assert "JARVIS 5.0 local runtime test" in res.json()["output"]["content"]

    # Path traversal blocked
    with pytest.raises(PermissionError):
        resolve_authorized_path("../../etc/passwd", [workspace])

    # Reading .env blocked
    res_env = client.post(
        "/tools/execute",
        headers=auth_headers(),
        json={"tool_name": "read_file", "args": {"path": ".env"}},
    )
    assert res_env.status_code == 403

    # Tier 3 arbitrary shell command blocked
    res_t3 = client.post(
        "/tools/execute",
        headers=auth_headers(),
        json={"tool_name": "shell_exec", "args": {"cmd": "rm -rf /"}, "approved_by_human": True},
    )
    assert res_t3.status_code == 403


def test_tier2_write_doc_requires_approval_then_executes(isolated_env):
    client, workspace, _ = isolated_env

    pending = client.post(
        "/tools/execute",
        headers=auth_headers(),
        json={
            "tool_name": "write_doc",
            "args": {"path": "notes/handover.md", "content": "# Local Handover\nVerified."},
            "approved_by_human": False,
        },
    )
    assert pending.status_code == 200
    body = pending.json()
    assert body["status"] == "pending_approval"
    aid = body["approval"]["id"]

    decided = client.post(
        f"/approvals/{aid}",
        headers=auth_headers(),
        json={"decision": "approve"},
    )
    assert decided.status_code == 200
    assert decided.json()["status"] == "executed"
    assert (workspace / "notes" / "handover.md").exists()


def test_sqlite_crash_recovery_and_dead_letter_retry(tmp_path: Path):
    db_file = tmp_path / "recover.db"
    store1 = LocalStateStore(db_file)
    task = store1.enqueue_task("coding", "tool_run", {"tool_name": "python_version"}, max_retries=1)
    # Simulate task left running before crash
    claimed = store1.claim_next_queued_task()
    assert claimed and claimed["id"] == task["id"]

    # New instance after restart must recover 'running' back to 'queued'
    store2 = LocalStateStore(db_file)
    recovered = store2.get_task(task["id"])
    assert recovered["status"] == "queued"

    # Simulate exceeding max_retries -> dead_letter -> requeue
    store2.fail_or_requeue_task(task["id"], "timeout 1")
    dead = store2.fail_or_requeue_task(task["id"], "timeout 2")
    assert dead["status"] == "dead_letter"
    assert store2.retry_dead_letters() == 1
    assert store2.get_task(task["id"])["status"] == "queued"


def test_vram_model_recommendations_and_ollama_chat(isolated_env):
    recs = recommend_quantized_models(total_vram_mib=8151, free_vram_mib=3320, free_ram_gb=16.0)
    small = next(r for r in recs if r["model"] == "llama3.2:3b")
    coder = next(r for r in recs if "qwen2.5-coder" in r["model"])
    assert small["fits_current_free_vram"] is True
    assert coder["fits_gpu"] is True
    assert coder["fits_current_free_vram"] is False
    assert coder["fallback"] == "partial_cpu_offload"

    client, _, _ = isolated_env
    with patch(
        "jarvis_local.ollama_manager.OllamaManager.status",
        new=AsyncMock(return_value={"reachable": True, "status": "connected", "models": [{"name": "llama3.2:3b"}], "loaded_models": []}),
    ), patch(
        "jarvis_local.ollama_manager.OllamaManager.chat",
        new=AsyncMock(return_value={"text": "Local Ollama verified.", "model": "llama3.2:3b", "latency_ms": 42.1, "tokens_input": 10, "tokens_output": 5}),
    ):
        chat_res = client.post(
            "/chat",
            headers=auth_headers(),
            json={"model": "llama3.2:3b", "messages": [{"role": "user", "content": "ping"}]},
        )
        assert chat_res.status_code == 200
        assert chat_res.json()["provider"] == "ollama"
        assert "Local Ollama verified" in chat_res.json()["text"]


def test_pause_resume_and_authenticated_websocket_events(isolated_env):
    client, _, _ = isolated_env

    # Pause / resume works cleanly
    assert client.post("/control/pause", headers=auth_headers()).json()["paused"] is True
    assert client.get("/health").json()["paused"] is True
    assert client.post("/control/resume", headers=auth_headers()).json()["paused"] is False

    # WebSocket connects with token and responds to ping
    with client.websocket_connect("/events?token=jlocal_test_secret_token_0011223344") as ws:
        welcome = ws.receive_json()
        assert welcome["event_type"] == "connected"
        ws.send_text("ping")
        pong = ws.receive_json()
        assert pong["event_type"] == "pong"
