"""Configuration & explicit security boundaries for JARVIS 5.0 Local Agent."""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import List

DEFAULT_ALLOWED_ORIGINS = [
    "https://yashwanth-hub.vercel.app",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
    "capacitor://localhost",
    "http://localhost",
]

SHELL_DIAGNOSTIC_ALLOWLIST: dict[str, list[str]] = {
    "git_status": ["git", "status", "--short", "--branch"],
    "git_log": ["git", "log", "-n", "5", "--oneline"],
    "python_version": ["python", "--version"],
    "ollama_list": ["ollama", "list"],
    "ollama_ps": ["ollama", "ps"],
    "gpu_vram": [
        "nvidia-smi",
        "--query-gpu=name,memory.total,memory.free,utilization.gpu",
        "--format=csv,noheader,nounits",
    ],
}


class LocalAgentSettings:
    def __init__(self) -> None:
        self.host: str = os.getenv("JARVIS_LOCAL_HOST", "127.0.0.1").strip()
        if self.host != "127.0.0.1" and os.getenv("JARVIS_ALLOW_NON_LOOPBACK", "").lower() != "true":
            # Enforce loopback-only binding by default for workstation security
            self.host = "127.0.0.1"

        self.port: int = int(os.getenv("JARVIS_LOCAL_PORT", "8787"))
        self.ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
        self.state_dir: Path = Path(os.getenv("JARVIS_LOCAL_STATE_DIR", Path.home() / ".jarvis-local"))
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.db_path: Path = self.state_dir / "jarvis_local.db"
        self.token_path: Path = self.state_dir / "agent.token"

        self.auth_token: str = self._load_or_create_token()
        self.private_offline_only: bool = os.getenv("JARVIS_PRIVATE_OFFLINE_ONLY", "false").lower() == "true"
        self.max_concurrency: int = max(1, min(8, int(os.getenv("JARVIS_LOCAL_CONCURRENCY", "3"))))
        self.task_timeout_sec: int = max(5, int(os.getenv("JARVIS_LOCAL_TASK_TIMEOUT", "60")))

        env_dirs = os.getenv("JARVIS_ALLOWED_DIRS", "").strip()
        if env_dirs:
            self.allowed_dirs: List[Path] = [Path(p.strip()).resolve() for p in env_dirs.split(os.pathsep) if p.strip()]
        else:
            default_repo = Path(__file__).resolve().parents[2]
            self.allowed_dirs = [default_repo.resolve()]

        env_origins = os.getenv("JARVIS_ALLOWED_ORIGINS", "").strip()
        if env_origins:
            self.allowed_origins = [o.strip() for o in env_origins.split(",") if o.strip()]
        else:
            self.allowed_origins = list(DEFAULT_ALLOWED_ORIGINS)

    def _load_or_create_token(self) -> str:
        env_tok = os.getenv("JARVIS_LOCAL_TOKEN", "").strip()
        if env_tok:
            return env_tok
        if self.token_path.exists():
            stored = self.token_path.read_text(encoding="utf-8").strip()
            if len(stored) >= 24:
                return stored
        fresh = f"jlocal_{secrets.token_urlsafe(32)}"
        self.token_path.write_text(fresh, encoding="utf-8")
        try:
            os.chmod(self.token_path, 0o600)
        except OSError:
            pass
        return fresh


def get_settings() -> LocalAgentSettings:
    return LocalAgentSettings()
