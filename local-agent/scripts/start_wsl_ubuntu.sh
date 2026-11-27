#!/usr/bin/env bash
set -euo pipefail
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$AGENT_DIR"
export JARVIS_LOCAL_HOST="${JARVIS_LOCAL_HOST:-127.0.0.1}"
export JARVIS_LOCAL_PORT="${JARVIS_LOCAL_PORT:-8787}"
python3 scripts/pair_token.py
exec python3 -m jarvis_local.app
