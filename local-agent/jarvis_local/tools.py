"""Strict Workspace-Bounded Tool Execution Engine with Shell Allowlist & Secret Guards."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from .config import SHELL_DIAGNOSTIC_ALLOWLIST, LocalAgentSettings

FORBIDDEN_FILENAMES = re.compile(r"(^\.env|\.pem$|\.key$|agent\.token$|id_rsa|credentials\.json$)", re.IGNORECASE)

TIER_1_TOOLS = {"read_file", "search_dir", "repo_status", "run_diagnostic"}
TIER_2_TOOLS = {"write_doc"}
TIER_3_BLOCKED = {"delete_file", "shell_exec", "modify_secrets", "wipe_db"}


def resolve_authorized_path(raw_path: str, allowed_dirs: list[Path]) -> Path:
    if not raw_path or "\x00" in raw_path:
        raise PermissionError("Empty or invalid path.")
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = allowed_dirs[0] / candidate
    resolved = candidate.resolve()

    if FORBIDDEN_FILENAMES.search(resolved.name):
        raise PermissionError(f"Access to sensitive file '{resolved.name}' is strictly forbidden.")

    for root in allowed_dirs:
        root_resolved = root.resolve()
        try:
            resolved.relative_to(root_resolved)
            return resolved
        except ValueError:
            continue

    raise PermissionError(f"Path '{resolved}' is outside explicitly authorized workspace directories.")


def classify_local_tool_tier(tool_name: str) -> int:
    name = (tool_name or "").strip().lower()
    if name in TIER_3_BLOCKED or any(k in name for k in ("delete", "wipe", "rm_", "shell", "secret")):
        return 3
    if name in TIER_1_TOOLS:
        return 1
    if name in TIER_2_TOOLS:
        return 2
    return 2


def execute_local_tool(tool_name: str, args: dict[str, Any], settings: LocalAgentSettings) -> dict[str, Any]:
    tier = classify_local_tool_tier(tool_name)
    if tier == 3:
        raise PermissionError(f"Tool '{tool_name}' is Tier 3 restricted and permanently blocked.")

    if tool_name == "read_file":
        target = resolve_authorized_path(str(args.get("path", "")), settings.allowed_dirs)
        if not target.is_file():
            raise FileNotFoundError(f"Not a regular file: {target}")
        content = target.read_text(encoding="utf-8", errors="replace")[:16000]
        return {"path": str(target), "chars": len(content), "content": content}

    if tool_name == "search_dir":
        query = str(args.get("query", "")).strip()
        if len(query) < 2:
            raise ValueError("Search query must be at least 2 characters.")
        base = resolve_authorized_path(str(args.get("subdir", ".")), settings.allowed_dirs)
        matches: list[dict[str, Any]] = []
        for path in base.rglob("*"):
            if len(matches) >= 35:
                break
            if any(part in {"node_modules", ".git", "dist", "__pycache__", ".venv"} for part in path.parts):
                continue
            if not path.is_file() or FORBIDDEN_FILENAMES.search(path.name) or path.stat().st_size > 350_000:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for idx, line in enumerate(text.splitlines(), start=1):
                if query.lower() in line.lower():
                    matches.append({"file": str(path), "line": idx, "snippet": line.strip()[:160]})
                    if len(matches) >= 35:
                        break
        return {"query": query, "count": len(matches), "matches": matches}

    if tool_name == "repo_status":
        cmd = SHELL_DIAGNOSTIC_ALLOWLIST["git_status"]
        res = subprocess.run(cmd, cwd=str(settings.allowed_dirs[0]), capture_output=True, text=True, timeout=8)
        return {"exit_code": res.returncode, "stdout": res.stdout[:4000], "stderr": res.stderr[:1000]}

    if tool_name == "run_diagnostic":
        key = str(args.get("command", "")).strip()
        if key not in SHELL_DIAGNOSTIC_ALLOWLIST:
            raise PermissionError(f"Diagnostic command '{key}' is not in strict SHELL_DIAGNOSTIC_ALLOWLIST.")
        cmd = SHELL_DIAGNOSTIC_ALLOWLIST[key]
        res = subprocess.run(cmd, cwd=str(settings.allowed_dirs[0]), capture_output=True, text=True, timeout=15)
        return {"command": key, "exit_code": res.returncode, "stdout": res.stdout[:6000], "stderr": res.stderr[:1000]}

    if tool_name == "write_doc":
        rel_path = str(args.get("path", "")).strip()
        content = str(args.get("content", ""))
        if not rel_path.endswith(".md"):
            raise PermissionError("write_doc is constrained to Markdown (.md) documents.")
        target = resolve_authorized_path(rel_path, settings.allowed_dirs)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content[:50000], encoding="utf-8")
        return {"written_path": str(target), "bytes": len(content.encode("utf-8"))}

    raise ValueError(f"Unsupported tool: {tool_name}")
