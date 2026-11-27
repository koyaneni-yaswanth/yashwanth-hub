$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  Write-Host "Starting JARVIS 5.0 Local Runtime on http://127.0.0.1:8787 ..." -ForegroundColor Cyan
  python scripts/pair_token.py
  python -m jarvis_local.app
} finally {
  Pop-Location
}
