"""Cloud LLM router for text-only extraction tasks.

Standalone module. Reads OLLAMA_API_KEY from env. Routes text-only
structured-extraction calls to Ollama Cloud (qwen3-coder:480b-cloud by
default), with circuit-breaker fallback to a caller-supplied local
fallback callable.

Why a separate module: openai_client.py is hot-path for many agents.
Touching it risks regression. This router is opt-in via env flag and
returns a plain string so any caller can decide how to use it.

Bench data (2026-05-19, sample size N=3):
  local mistral-small3.2:24b  mean 31.5s  json_ok 3/3
  cloud qwen3-coder:480b      mean  5.85s json_ok 3/3
  cloud gpt-oss:120b          mean  8.39s json_ok 1/3 (truncates at 600 tok)

Vision/OCR is NOT supported here — Ollama Cloud free tier rejects image
input with HTTP 400 across all probed models. Caller must keep OCR on
local Ollama.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

import httpx

from ...observability.logger import get_logger

_log = get_logger(__name__)


def _flag(name: str, default: bool = False) -> bool:
    v = os.environ.get(name, "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


ENABLED = _flag("ENABLE_CLOUD_LLM_TEXT", default=False)
ENDPOINT = os.environ.get("OLLAMA_CLOUD_ENDPOINT", "https://ollama.com/api/chat")
DEFAULT_MODEL = os.environ.get("OLLAMA_CLOUD_TEXT_MODEL", "qwen3-coder:480b-cloud")
# Read on first use so the .env load order doesn't matter.
_API_KEY: str | None = None


def _api_key() -> str | None:
    global _API_KEY
    if _API_KEY is None:
        _API_KEY = (os.environ.get("OLLAMA_API_KEY") or "").strip() or None
    return _API_KEY


# Circuit breaker — per-backend failure counter. Three consecutive failures
# trips the breaker open for COOLDOWN_S; calls during the open window skip
# straight to local fallback without hitting the network.
_BREAKER_THRESHOLD = 3
_BREAKER_COOLDOWN_S = 60.0


@dataclass
class _Breaker:
    fail_count: int = 0
    opened_at: float = 0.0

    def is_open(self) -> bool:
        if self.fail_count < _BREAKER_THRESHOLD:
            return False
        if (time.time() - self.opened_at) >= _BREAKER_COOLDOWN_S:
            # Cooldown expired — half-open: allow one trial call.
            self.fail_count = 0
            self.opened_at = 0.0
            return False
        return True

    def record_failure(self) -> None:
        self.fail_count += 1
        if self.fail_count >= _BREAKER_THRESHOLD and self.opened_at == 0.0:
            self.opened_at = time.time()
            _log.warning(
                "cloud_router.circuit_open",
                cooldown_s=_BREAKER_COOLDOWN_S,
                fail_count=self.fail_count,
            )

    def record_success(self) -> None:
        if self.fail_count > 0:
            _log.info("cloud_router.circuit_reset", prev_fails=self.fail_count)
        self.fail_count = 0
        self.opened_at = 0.0


_breaker = _Breaker()


@dataclass
class CloudResult:
    text: str
    backend: str  # "cloud" | "local" | "disabled"
    latency_s: float
    error: str = ""


async def _call_cloud(
    prompt: str,
    *,
    model: str,
    num_predict: int,
    temperature: float,
    json_mode: bool,
    timeout_s: float,
) -> tuple[str, float]:
    key = _api_key()
    if not key:
        raise RuntimeError("OLLAMA_API_KEY missing in env")
    body: dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": temperature, "num_predict": num_predict},
    }
    if json_mode:
        body["format"] = "json"
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout_s) as c:
        r = await c.post(ENDPOINT, json=body, headers={"Authorization": f"Bearer {key}"})
    elapsed = time.perf_counter() - t0
    if r.status_code != 200:
        raise RuntimeError(f"cloud HTTP {r.status_code} {r.text[:200]}")
    data = r.json()
    text = data.get("message", {}).get("content", "")
    if not text:
        raise RuntimeError("cloud returned empty content")
    return text, elapsed


async def route_text(
    prompt: str,
    *,
    local_fallback: Callable[[str], Awaitable[str]],
    model: str | None = None,
    num_predict: int = 600,
    temperature: float = 0.1,
    json_mode: bool = True,
    timeout_s: float = 60.0,
) -> CloudResult:
    """Try cloud first when ENABLED + breaker closed, else fall back to local.

    `local_fallback` is invoked with the same prompt string and must return
    the response text. Keeping the fallback as a callable lets the caller
    own its own client config (model, tier, retry) without this module
    needing to know the local LLM stack.
    """
    if not ENABLED:
        t0 = time.perf_counter()
        text = await local_fallback(prompt)
        return CloudResult(text=text, backend="disabled", latency_s=time.perf_counter() - t0)

    if _breaker.is_open():
        t0 = time.perf_counter()
        text = await local_fallback(prompt)
        return CloudResult(
            text=text,
            backend="local",
            latency_s=time.perf_counter() - t0,
            error="circuit_open",
        )

    chosen = model or DEFAULT_MODEL
    try:
        text, elapsed = await _call_cloud(
            prompt,
            model=chosen,
            num_predict=num_predict,
            temperature=temperature,
            json_mode=json_mode,
            timeout_s=timeout_s,
        )
        _breaker.record_success()
        return CloudResult(text=text, backend="cloud", latency_s=elapsed)
    except (httpx.HTTPError, RuntimeError, asyncio.TimeoutError) as e:
        _breaker.record_failure()
        _log.warning("cloud_router.cloud_failed_falling_back", error=str(e)[:200])
        t0 = time.perf_counter()
        text = await local_fallback(prompt)
        return CloudResult(
            text=text,
            backend="local",
            latency_s=time.perf_counter() - t0,
            error=str(e)[:200],
        )


# Shared structured-chat helper. Encapsulates the cloud-route-or-local
# pattern so any caller using `await chat([msgs], response_format=Schema)`
# can adopt cloud routing with one line change. Default OFF so wiring a
# call site to this helper is zero-risk until ENABLE_CLOUD_LLM_TEXT flips.

_T = TypeVar("_T")

_JSON_FENCE_RE = re.compile(
    r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE | re.MULTILINE
)


def _strip_json_fence(text: str) -> str:
    """Remove leading and trailing ```json ... ``` fences.

    qwen3-coder:480b-cloud wraps JSON in markdown fences by default even
    when format=json is requested. Caller must strip before json.loads.
    """
    return _JSON_FENCE_RE.sub("", text or "").strip()


# Track which backend served each structured-chat call. Reset by tests if
# needed. These counters are intentionally simple (no Prometheus dep here)
# so that observability layer can scrape them via getter when it imports.
_backend_counts: dict[str, int] = {"cloud": 0, "local": 0, "disabled": 0, "parse_fallback": 0}


def get_backend_counts() -> dict[str, int]:
    """Snapshot of structured-chat backend selection counts."""
    return dict(_backend_counts)


async def chat_structured(
    messages: list[Any],
    schema: type[_T],
    *,
    local_chat: Callable[..., Awaitable[Any]],
    tier: str = "light",
    num_predict: int = 800,
    timeout_s: float = 45.0,
) -> _T | None:
    """Route a Pydantic-typed structured-extraction call to cloud or local.

    `local_chat` is the existing `openai_client.chat` callable. Passing it
    in keeps this module free of any langchain dependency.

    Default OFF: when ENABLE_CLOUD_LLM_TEXT is false, this is a thin
    pass-through to `local_chat(messages, tier=tier, response_format=schema)`.

    When ON: flattens System/Human messages into a single prompt string,
    routes via `route_text`, strips JSON fence, validates against the
    Pydantic schema, falls back to local on parse failure or schema
    mismatch.
    """
    async def _local() -> Any:
        return await local_chat(messages, tier=tier, response_format=schema)

    if not ENABLED:
        _backend_counts["disabled"] += 1
        result = await _local()
        return result if isinstance(result, schema) else None

    prompt_parts: list[str] = []
    for m in messages:
        content = m.content if hasattr(m, "content") else str(m)
        if not isinstance(content, str):
            content = str(content)
        cls_name = type(m).__name__
        prefix = "System: " if "System" in cls_name else (
            "User: " if "Human" in cls_name else f"{cls_name}: "
        )
        prompt_parts.append(f"{prefix}{content}")
    prompt = "\n\n".join(prompt_parts)

    async def _local_fallback_str(_p: str) -> str:
        obj = await _local()
        if hasattr(obj, "model_dump_json"):
            return obj.model_dump_json()
        return "{}"

    routed = await route_text(
        prompt,
        local_fallback=_local_fallback_str,
        json_mode=True,
        num_predict=num_predict,
        timeout_s=timeout_s,
    )
    if routed.backend == "cloud":
        raw = _strip_json_fence(routed.text or "")
        try:
            parsed = schema.model_validate_json(raw)  # type: ignore[attr-defined]
            _backend_counts["cloud"] += 1
            return parsed
        except Exception as e:  # noqa: BLE001
            _log.info(
                "cloud_router.chat_structured_parse_fallback",
                error=str(e)[:160],
            )
            _backend_counts["parse_fallback"] += 1
            result = await _local()
            return result if isinstance(result, schema) else None

    _backend_counts["local"] += 1
    result = await _local()
    return result if isinstance(result, schema) else None


__all__ = [
    "ENABLED",
    "DEFAULT_MODEL",
    "CloudResult",
    "route_text",
    "chat_structured",
    "get_backend_counts",
]
