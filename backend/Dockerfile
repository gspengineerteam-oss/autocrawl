# syntax=docker/dockerfile:1.7
# Base image version MUST track the `playwright` pin in pyproject.toml. The
# image ships a pre-bundled Chromium build matched to that playwright version;
# mismatch = wipe + re-download from cdn.playwright.dev (~170MB, slow on AS).
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for whois / pdf / lxml. PDF OCR is now served by Ollama's
# vision model (gemma4:e4b) over HTTP — no PyTorch / CUDA libs needed in
# this image, which keeps it ~3GB lighter than the old Surya path.
RUN apt-get update && apt-get install -y --no-install-recommends \
    whois \
    libxml2-dev \
    libxslt1-dev \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# === Python deps install — done BEFORE COPY src so editing source files does
#     not bust the heavy install layer. Cache mount on /root/.cache/pip persists
#     wheel downloads across builds. ===
#
# Stub `src/crawler/__init__.py` so `pip install -e .` reads pyproject metadata
# and installs all transitive deps without needing the real source tree yet.
# The real `COPY src ./src` lower down replaces this stub at the same path; the
# editable install (.pth file) keeps pointing to /app/src so it picks up the
# real package transparently.
COPY pyproject.toml ./
RUN mkdir -p src/crawler && \
    echo '__version__ = "0.1.0"' > src/crawler/__init__.py

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install -e .

# OCR for scanned PDFs is delegated to the existing Ollama vision model
# (default gemma4:e4b). The PDF parser POSTs the rendered page PNG to
# /api/chat over HTTP — no extra Python/system deps required here.

# Agentic browser deps (browser-use). Disabled by default because:
#   1. The base image's Python is 3.10, but browser-use requires Python >=3.11
#      — flipping INSTALL_AGENTIC=true here will FAIL the build on this base.
#   2. Adding agentic to the main image bloats every rebuild for users who
#      only run the deterministic crawler.
#
# Recommended path: run the agentic crawler on the HOST in a Python 3.11+
# venv (see backend/scripts/setup-agentic-host.{ps1,sh}). Host connects to
# the dockerized Redis/Chroma/Postgres via exposed ports. This avoids
# rebuilding this image just to iterate on agentic code.
#
# If you really want it baked into a container, build a separate image from
# `backend/Dockerfile.agentic` (Python 3.11 base) and use that for the
# `agentic-crawler` compose service.
ARG INSTALL_AGENTIC=false
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$INSTALL_AGENTIC" = "true" ]; then \
        pip install "browser-use>=0.1.40" ; \
    fi

# Katana, Go-based URL discovery booster (MIT, projectdiscovery/katana).
# Pure-static Go binary, no runtime apt deps required. Runtime gating is
# done via ENABLE_KATANA env var, not at build time.
COPY --from=projectdiscovery/katana:latest /usr/local/bin/katana /usr/local/bin/katana
RUN chmod +x /usr/local/bin/katana && katana -version || true

# NLLB-200 translation deps. The MODEL ITSELF (~1.34GB safetensors → ~600MB
# int8 ctranslate2) is NO LONGER baked into the image — it lives in a host
# bind-mount at ./nllb_models/, populated once via:
#
#   docker compose --profile setup run --rm nllb-setup
#
# This means image rebuilds don't re-download the model: it's persisted on
# host across any Docker prune / rebuild / cache wipe. INSTALL_NLLB arg is
# kept as an escape hatch (set true to bake into image, e.g. for air-gapped
# deployments), but defaults to false to keep builds fast.
ARG INSTALL_NLLB=false
ARG HF_TOKEN=
ENV HF_HOME=/opt/nllb_hf
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "ctranslate2>=4.4.0" "sentencepiece>=0.2.0" "huggingface-hub>=0.25.0" "transformers>=4.45.0"

RUN --mount=type=cache,target=/root/.cache/huggingface \
    if [ "$INSTALL_NLLB" = "true" ]; then \
        mkdir -p /opt/nllb_hf /opt/nllb_ct2 && \
        HF_TOKEN=$HF_TOKEN HUGGING_FACE_HUB_TOKEN=$HF_TOKEN python -c "from huggingface_hub import snapshot_download; snapshot_download('facebook/nllb-200-distilled-600M', cache_dir='/opt/nllb_hf', local_dir='/opt/nllb_hf/snapshot')" && \
        ct2-transformers-converter \
            --model /opt/nllb_hf/snapshot \
            --output_dir /opt/nllb_ct2 \
            --quantization int8 \
            --copy_files tokenizer.json tokenizer_config.json sentencepiece.bpe.model special_tokens_map.json \
            --force && \
        rm -rf /opt/nllb_hf/snapshot ; \
    fi

RUN python -m playwright install chromium && python -m playwright install-deps chromium

# Crawl4AI post-install: warms up its browser bridge cache. Idempotent.
RUN crawl4ai-setup || true

# === Real source overwrites the stub. Editable install above already linked
#     /app/src into site-packages, so any change here is picked up at runtime
#     without re-running pip. This is the ONLY layer that re-runs on src edit. ===
COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /app/data /app/logs

ENV DATA_DIR=/app/data \
    LOG_DIR=/app/logs \
    CONFIG_DIR=/app/config

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/metrics > /dev/null || exit 1

CMD ["crawl", "schedule", "--metrics-port", "8080"]
