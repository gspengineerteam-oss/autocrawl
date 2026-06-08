#!/usr/bin/env bash
# Start the Ollama daemon on the inference-kaytus host (10.83.81.246) with
# the warm-model env vars the Snowglobe wave needs. Mirrors the MobaXterm
# post-login macro so you can do it from a plain terminal.
#
# Includes the Snowglobe Phase 2 dual-GPU spread vars from
# report/26052026-DUAL-GPU-RUNBOOK.md — comment them out if your daemon
# already has them set via ~/.ollama-env.
#
# Usage:
#   ./scripts/start-ollama-on-kaytus.sh           # uses ssh gsp alias
#   SSH_TARGET=gsp-user@10.83.81.246 ./scripts/start-ollama-on-kaytus.sh

set -euo pipefail

SSH_TARGET="${SSH_TARGET:-gsp}"

ssh "$SSH_TARGET" bash <<'REMOTE'
set -euo pipefail

# Kill any existing daemon so the env-var changes actually take effect.
pkill -f 'ollama serve' 2>/dev/null || true
sleep 1

setsid nohup env \
  OLLAMA_HOST=0.0.0.0:11434 \
  OLLAMA_NUM_PARALLEL=6 \
  OLLAMA_MAX_LOADED_MODELS=3 \
  OLLAMA_KEEP_ALIVE=1h \
  OLLAMA_CONTEXT_LENGTH=8192 \
  OLLAMA_KV_CACHE_TYPE=q8_0 \
  OLLAMA_FLASH_ATTENTION=1 \
  OLLAMA_SCHED_SPREAD=1 \
  CUDA_VISIBLE_DEVICES=0,1 \
  OLLAMA_GPU_OVERHEAD=268435456 \
  /home/gsp-user/ollama/bin/ollama serve \
  >> /tmp/ollama.log 2>&1 < /dev/null &
disown || true

sleep 2
echo "[start-ollama] launched; recent log lines:"
tail -n 20 /tmp/ollama.log || true
echo
echo "[start-ollama] daemon proc:"
ps eww $(pgrep -f 'ollama serve' | head -1) | tr ' ' '\n' | grep -E 'OLLAMA_|CUDA_VISIBLE' || true
REMOTE
