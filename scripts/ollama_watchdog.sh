#!/usr/bin/env bash
# Ollama health watchdog. Curl 10.83.81.246:11434 with 8s timeout. If
# the server is unreachable or unhealthy, launch MobaXterm via Windows
# cmd.exe (the portable build at TRIAL\Downloads is preconfigured to
# auto-start its session which restarts Ollama on the remote host).
#
# Usage: bash scripts/ollama_watchdog.sh
# Exit codes: 0 = ok, 1 = down + relaunch triggered, 2 = down + relaunch
#             failed.
set -u

OLLAMA_URL="${OLLAMA_URL:-http://10.83.81.246:11434/api/version}"
MOBA_EXE="${MOBA_EXE:-C:\\Users\\TRIAL\\Downloads\\MobaXterm_Portable_v26.3\\MobaXterm_Personal_26.3.exe}"
LOG_DIR="${LOG_DIR:-C:/Users/TRIAL/Desktop/crawl/logs}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/ollama_watchdog.log}"

mkdir -p "${LOG_DIR}"
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf '[%s] %s\n' "$(ts)" "$1" | tee -a "${LOG_FILE}"; }

probe() {
  curl -sS -m 8 -o /dev/null -w "%{http_code}" "${OLLAMA_URL}" 2>/dev/null
}

code=$(probe || true)
if [ "${code}" = "200" ]; then
  log "ok status=200"
  exit 0
fi

log "down status=${code:-timeout} url=${OLLAMA_URL}"

# Launch MobaXterm via cmd.exe (works from git-bash on Windows).
if [ ! -f "$(cygpath -u "${MOBA_EXE}" 2>/dev/null || echo "${MOBA_EXE}")" ]; then
  log "moba_missing path=${MOBA_EXE}"
  exit 2
fi

cmd.exe /c start "" "${MOBA_EXE}" >/dev/null 2>&1
launch_rc=$?
log "moba_launched rc=${launch_rc}"

if [ "${launch_rc}" -ne 0 ]; then
  exit 2
fi

# Wait up to 90s for Ollama to come back. MobaXterm session typically
# restarts the remote service inside 30 to 60s.
for i in 1 2 3 4 5 6 7 8 9; do
  sleep 10
  code=$(probe || true)
  if [ "${code}" = "200" ]; then
    log "recovered status=200 wait_s=$((i * 10))"
    exit 1
  fi
done

log "recovery_timeout status=${code:-timeout}"
exit 2
