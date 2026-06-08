"""Vision-tier LLM factory for the agentic crawler.

Previously the head agent (agent.py:208-213) hardcoded `ChatOllama` which
locked the entire agentic stack to a single self-hosted Ollama box. When the
corporate VPN to 10.83.81.246 went down on 2026-05-21, every Browser-Use
session stalled in LLM retry loops with no escape.

This factory adds two cloud-provider escape hatches selectable via
`AGENTIC_LLM_PROVIDER` env:

  - `ollama` (default): existing path via queue-wrapped ChatOllama. Free,
    self-hosted, requires VPN to 10.83.81.246.
  - `google_gemini`: Google Generative AI native client. Supports web
    grounding (used in agent_grounding.py for the head agent), bypasses
    bot-detection by fetching via Google internal infra.
  - `openrouter`: OpenAI-compatible aggregator. Used for deep-research style
    models when grounding isn't enough.

All three return an object satisfying Browser-Use Agent's `llm.ainvoke()`
contract, so `Agent(llm=...)` works unchanged regardless of provider.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic import SecretStr

from .config import AgenticSettings

# Singleton cache. Without this every Browser-Use seed dispatch creates a
# fresh ChatGoogleGenerativeAI / ChatOpenAI instance which opens an httpx
# client. With 15 parallel workers + multiple seeds per pass, the process
# blows past ulimit -n=1024 within an hour ("Too many open files" crash
# observed 2026-05-21 maintenance tick 3). Cache by provider+model so
# config flip still rebuilds the right client.
_CACHE: dict[tuple[str, str], Any] = {}


def make_vision_llm(s: AgenticSettings) -> Any:
    provider = (s.agentic_llm_provider or "ollama").lower()
    model = s.vision_model
    cache_key = (provider, model)
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    # Snowglobe reset (2026-05-25): cloud LLM disabled by default. Anyone
    # asking for openrouter/gemini must set ALLOW_CLOUD_LLM=true explicitly.
    # Reason: user got billed Rp 1jt from auto-flips. Keep ollama as the only
    # default path.
    if provider in {"google", "gemini", "google_gemini", "openrouter"}:
        if os.getenv("ALLOW_CLOUD_LLM", "").lower() not in {"1", "true", "yes"}:
            raise RuntimeError(
                f"AGENTIC_LLM_PROVIDER={provider} ditolak: cloud LLM dimatiin "
                "default. Set ALLOW_CLOUD_LLM=true kalau lo emang sengaja."
            )

    if provider in {"google", "gemini", "google_gemini"}:
        from langchain_google_genai import ChatGoogleGenerativeAI

        key = s.google_api_key or os.getenv("GOOGLE_API_KEY", "")
        if not key:
            raise RuntimeError(
                "AGENTIC_LLM_PROVIDER=google_gemini tapi GOOGLE_API_KEY kosong"
            )
        client = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=SecretStr(key),
            temperature=0.2,
            timeout=300.0,
        )
        _CACHE[cache_key] = client
        return client

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        key = s.openrouter_api_key or os.getenv("OPENROUTER_API_KEY", "")
        if not key:
            raise RuntimeError(
                "AGENTIC_LLM_PROVIDER=openrouter tapi OPENROUTER_API_KEY kosong"
            )
        client = ChatOpenAI(
            model=model,
            api_key=SecretStr(key),
            base_url="https://openrouter.ai/api/v1",
            timeout=300.0,
            max_retries=2,
            temperature=0.2,
            default_headers={
                "HTTP-Referer": "https://gsp:8090",
                "X-Title": "Autocrawl-Agentic",
            },
        )
        _CACHE[cache_key] = client
        return client

    # Default Ollama path preserved exactly as before. NOT cached because
    # QueuedChatOllama's per-tier semaphore lookup uses process-local state
    # that's safe to recreate.
    from crawler.tools.llm.queue import QueuedChatOllama

    return QueuedChatOllama(
        model=model,
        host=s.llm_base_url.rstrip("/"),
        timeout=300.0,
        _llm_queue_tier="vision",
    )
