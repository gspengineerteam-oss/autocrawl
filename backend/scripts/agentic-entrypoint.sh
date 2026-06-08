#!/usr/bin/env bash
# Agentic crawler entrypoint.
#
# Boots a virtual display (Xvfb) + a lightweight window manager (fluxbox) +
# a VNC server (x11vnc) wrapped by noVNC (websockify), then runs the
# agentic-crawl command IN FOREGROUND under this shell. We deliberately do
# NOT `exec` the command — keeping bash as PID 1 means the background X
# stack stays attached to a stable parent process. Without this, the bg
# children's parent flips to init mid-run and Xvfb/fluxbox/x11vnc tend to
# die unpredictably (their stdio gets reaped or signals propagate weirdly).
#
# Browser-Use spawns Chromium against the Xvfb display, and the operator
# watches it real-time at:
#
#   http://localhost:7900/vnc.html
#
# When AGENTIC_HEADLESS=true the VNC stack is skipped entirely — Chromium
# runs truly headless against no display. Faster + zero VNC overhead.

DISPLAY_NUM="${DISPLAY_NUM:-99}"
RES="${VNC_RESOLUTION:-1280x800}"
HEADLESS="${AGENTIC_HEADLESS:-false}"

# Forward shutdown signals to all jobs. Without this, `docker compose stop`
# kills bash (PID 1) but leaves background X processes hanging long enough
# for Docker to escalate to SIGKILL → unclean shutdown.
shutdown() {
    echo "[agentic-entrypoint] Shutdown signal — terminating jobs"
    kill $(jobs -p) 2>/dev/null
    wait
    exit 0
}
trap shutdown TERM INT

if [ "$HEADLESS" != "false" ]; then
    echo "[agentic-entrypoint] AGENTIC_HEADLESS=$HEADLESS — skipping VNC stack."
    "$@" &
    wait $!
    exit $?
fi

echo "[agentic-entrypoint] Booting virtual display :$DISPLAY_NUM (${RES}x24)"

# Clean up stale lock files from previous container runs (Xvfb refuses to
# start if /tmp/.X${N}-lock exists from a prior instance that died unclean).
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" 2>/dev/null

# Xvfb: virtual X server. -ac disables host-based access control, +extension
# GLX +render so Chromium WebGL/canvas don't blow up on this display.
Xvfb ":$DISPLAY_NUM" -screen 0 "${RES}x24" -ac +extension GLX +render -noreset \
     >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Wait for Xvfb to actually be ready before downstream tools attach.
for i in 1 2 3 4 5 6 7 8 9 10; do
    if DISPLAY=":$DISPLAY_NUM" xdpyinfo >/dev/null 2>&1; then
        echo "[agentic-entrypoint] Xvfb ready after ${i}× retry"
        break
    fi
    sleep 0.5
done

export DISPLAY=":$DISPLAY_NUM"

# Paint a non-black background — sanity check that VNC stream is alive even
# before Chromium pops up.
xsetroot -solid "#1a2332" 2>/tmp/xsetroot.log || true

# Phase 3: pre-create fluxbox config with 4 workspaces so the listing pool
# can land windows on workspace 1 and the enrich pool on workspace 2 (the
# operator can swipe via right-click → workspaces). fluxbox reads ~/.fluxbox/
# init at start; defaults to 4 already but writing it explicit is idempotent
# and survives image rebuilds.
mkdir -p "$HOME/.fluxbox"
if ! grep -qs "session.screen0.workspaces" "$HOME/.fluxbox/init" 2>/dev/null; then
    cat >> "$HOME/.fluxbox/init" <<'EOF'
session.screen0.workspaces:    4
session.screen0.workspaceNames: listing,enrich,reserve3,reserve4,
EOF
    echo "[agentic-entrypoint] fluxbox init: 4 workspaces configured"
fi

# Verify wmctrl is on PATH (PR4 helper uses it for workspace assignment).
# If missing the helper no-ops cleanly, but warn so the operator knows.
if ! command -v wmctrl >/dev/null 2>&1; then
    echo "[agentic-entrypoint] WARNING: wmctrl not installed — VNC workspace"
    echo "[agentic-entrypoint]          assignment will no-op. apt-get install"
    echo "[agentic-entrypoint]          wmctrl in Dockerfile.agentic to enable."
fi

# fluxbox: lightweight WM so Chromium has a frame to render into.
fluxbox >/tmp/fluxbox.log 2>&1 &
FLUXBOX_PID=$!

# Sanity-check xterm so noVNC viewer always has SOMETHING visible.
xterm -geometry 80x24+20+20 -fa "Monospace" -fs 11 -bg "#0d1117" -fg "#c9d1d9" \
      -title "agentic-crawler boot terminal" \
      -e "echo 'Agentic crawler ready.'; \
          echo 'Display: \$DISPLAY  Resolution: ${RES}'; \
          echo ''; \
          echo 'Tail logs in another terminal:  docker compose logs -f agentic-crawler'; \
          echo ''; \
          while true; do sleep 60; done" \
      >/tmp/xterm.log 2>&1 &

# x11vnc: share the Xvfb display over VNC port 5900 (container-internal).
# Run in FOREGROUND-but-backgrounded (no -bg flag) so we can catch its PID
# and let `wait` know about it. -bg double-forks and detaches, which makes
# bash lose the job and signal forwarding miss it.
x11vnc -display ":$DISPLAY_NUM" -forever -shared -nopw -rfbport 5900 \
       -quiet -o /tmp/x11vnc.log >>/tmp/x11vnc.log 2>&1 &
X11VNC_PID=$!

# noVNC + websockify bridges VNC -> WebSocket on port 7900.
websockify --web /usr/share/novnc 7900 localhost:5900 \
           >/tmp/websockify.log 2>&1 &
WEBSOCKIFY_PID=$!

# Give x11vnc a moment to bind port 5900 before websockify needs it.
sleep 1

echo "[agentic-entrypoint] Stack alive (all jobs under bash supervision):"
echo "[agentic-entrypoint]   Xvfb       pid=$XVFB_PID"
echo "[agentic-entrypoint]   fluxbox    pid=$FLUXBOX_PID"
echo "[agentic-entrypoint]   x11vnc     pid=$X11VNC_PID  (port 5900)"
echo "[agentic-entrypoint]   websockify pid=$WEBSOCKIFY_PID  (port 7900)"
echo "[agentic-entrypoint] Open http://localhost:7900/vnc.html in your host browser."
echo "[agentic-entrypoint] Launching: $*"

# Run agentic-crawl in foreground but catch its PID so `wait $!` only blocks
# on it (not on the background X stack).
"$@" &
APP_PID=$!
wait $APP_PID
APP_EXIT=$?

# App exited — tear down VNC stack cleanly so Docker `stop` doesn't have to
# escalate to SIGKILL.
shutdown
exit $APP_EXIT
