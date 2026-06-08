#!/bin/sh
# Idempotent Ollama bootstrap.
#
# Starts the Ollama daemon, waits until it's ready, then pulls the two models
# we use (granite4.1:3b for chat + granite-embedding:278m for vectors).
# Subsequent restarts are fast because the model files persist in the
# ollama_data volume.

set -e

echo "[ollama-init] starting daemon"
/bin/ollama serve &
DAEMON_PID=$!

# Wait for the server socket. ollama exposes /api/tags as a cheap health probe.
echo "[ollama-init] waiting for daemon to accept connections"
for i in $(seq 1 60); do
    if ollama list > /dev/null 2>&1; then
        echo "[ollama-init] daemon ready (after ${i}s)"
        break
    fi
    sleep 1
done

# Pull the chat model. `ollama pull` is idempotent — exits fast if the model
# is already present locally.
if ! ollama list | grep -q "granite4.1:3b"; then
    echo "[ollama-init] pulling granite4.1:3b (~2.1GB, first run only)"
    ollama pull granite4.1:3b
else
    echo "[ollama-init] granite4.1:3b already present"
fi

# Pull the multilingual embedding model (768-dim, covers EN + CJK).
if ! ollama list | grep -q "granite-embedding:278m"; then
    echo "[ollama-init] pulling granite-embedding:278m (~950MB, first run only)"
    ollama pull granite-embedding:278m
else
    echo "[ollama-init] granite-embedding:278m already present"
fi

# Snowglobe Phase 2 — pull the vision model used by Browser-Use enrich agent.
# Variable so operators can swap model without editing this script.
: "${AGENTIC_VISION_MODEL:=qwen3-vl:30b}"
if ! ollama list | grep -q "${AGENTIC_VISION_MODEL}"; then
    echo "[ollama-init] pulling ${AGENTIC_VISION_MODEL} (vision agent, may be ~20GB)"
    ollama pull "${AGENTIC_VISION_MODEL}" || echo "[ollama-init] WARN: pull failed for ${AGENTIC_VISION_MODEL}; agent will lazy-load on first call"
else
    echo "[ollama-init] ${AGENTIC_VISION_MODEL} already present"
fi

echo "[ollama-init] bootstrap complete; handing off to ollama serve"
# Replace this script with the daemon process so docker tracks the right PID.
wait "$DAEMON_PID"
