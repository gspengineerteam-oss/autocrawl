#!/usr/bin/env bash
# Set up agentic_crawler in a host-side Python 3.11+ venv.
# Works on Linux, macOS, WSL, and Git Bash / MSYS2 on Windows.
#
# Run once:
#   bash backend/scripts/setup-agentic-host.sh
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$BACKEND_DIR/.venv-agentic"

echo "[setup-agentic] Backend dir: $BACKEND_DIR"

# Detect OS — Windows venvs put binaries in Scripts/, *nix in bin/.
case "${OSTYPE:-}" in
    msys*|cygwin*|win*)
        VENV_BIN_SUBDIR="Scripts"
        ;;
    *)
        VENV_BIN_SUBDIR="bin"
        ;;
esac

# 1. Verify Python 3.11+. On Windows the launcher is `python` (not python3).
if command -v python3 >/dev/null 2>&1 && python3 -c "import sys" 2>/dev/null; then
    PY_BIN="${PYTHON:-python3}"
elif command -v python >/dev/null 2>&1; then
    PY_BIN="${PYTHON:-python}"
else
    echo "[setup-agentic] ERROR: Neither python3 nor python found on PATH." >&2
    exit 1
fi
PY_VERSION="$($PY_BIN --version 2>&1)"
echo "[setup-agentic] Python: $PY_VERSION ($PY_BIN)"
PY_MAJOR=$($PY_BIN -c 'import sys; print(sys.version_info[0])')
PY_MINOR=$($PY_BIN -c 'import sys; print(sys.version_info[1])')
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
    echo "[setup-agentic] ERROR: Python 3.11+ required (got $PY_MAJOR.$PY_MINOR)" >&2
    echo "  Install Python 3.11+ and either set PYTHON env var or put it on PATH." >&2
    exit 1
fi

# 2. Create venv
if [ ! -d "$VENV_DIR" ]; then
    echo "[setup-agentic] Creating venv at $VENV_DIR"
    $PY_BIN -m venv "$VENV_DIR"
else
    echo "[setup-agentic] Venv already exists at $VENV_DIR — reusing"
fi

VENV_PY="$VENV_DIR/$VENV_BIN_SUBDIR/python"
# Windows uses python.exe; Git Bash resolves both. Keep the bare name.
if [ ! -x "$VENV_PY" ] && [ -x "$VENV_PY.exe" ]; then
    VENV_PY="$VENV_PY.exe"
fi
VENV_PIP="$VENV_DIR/$VENV_BIN_SUBDIR/pip"

# 3. Upgrade pip + install crawler with agentic extra
echo "[setup-agentic] Installing autocrawler[agentic] in editable mode..."
cd "$BACKEND_DIR"
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -e ".[agentic]"

# 4. Install Playwright Chromium
echo "[setup-agentic] Installing Playwright Chromium..."
"$VENV_PY" -m playwright install chromium
# On Linux, Playwright also needs system libs — try the helper, ignore failure
# (e.g. on macOS where install-deps doesn't apply).
"$VENV_PY" -m playwright install-deps chromium 2>/dev/null || true

# 5. Print activation instructions (path varies by OS).
ACTIVATE_HINT="source backend/.venv-agentic/$VENV_BIN_SUBDIR/activate"
cat <<EOF

[setup-agentic] DONE.

Next steps:
  1. Make sure docker compose services are up:
       docker compose up -d redis chroma autocrawl-db

  2. Activate the venv:
       $ACTIVATE_HINT

  3. Set host-side env overrides (services on localhost, not docker DNS):
       export REDIS_URL='redis://localhost:6379/0'
       export CHROMA_HOST='localhost'
       export DATABASE_URL='postgresql+asyncpg://postgres:123@localhost:5432/autocrawl'
       export AGENTIC_ENABLED=true
       export AGENTIC_HEADLESS=false   # see browser when iterating

  4. Run:
       agentic-crawl seeds
       agentic-crawl run --seed-name '<name from yaml>'
       agentic-crawl schedule          # 24/7 loop, Ctrl-C to stop
EOF
