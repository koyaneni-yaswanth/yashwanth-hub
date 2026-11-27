#!/usr/bin/env bash
set -euo pipefail
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"
cat > "$SERVICE_DIR/jarvis-local.service" <<EOF
[Unit]
Description=JARVIS 5.0 Local Autonomous Runtime
After=network.target

[Service]
Type=simple
WorkingDirectory=$AGENT_DIR
Environment=JARVIS_LOCAL_HOST=127.0.0.1
Environment=JARVIS_LOCAL_PORT=8787
ExecStart=/usr/bin/python3 -m jarvis_local.app
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now jarvis-local.service
echo "Installed and started systemd user service: jarvis-local.service"
