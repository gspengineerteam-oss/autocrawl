"""LLM client wrapper — single entry point for chat + embeddings.

The crawler swaps providers via `Settings.llm_provider`:

  - `openai`  → `langchain-openai` ChatOpenAI / OpenAIEmbeddings (cloud, paid).
  - `ollama`  → `langchain-ollama` ChatOllama / OllamaEmbeddings (local, free).
                The Ollama path uses `with_structured_output(method="json_schema")`
                which constrains decoding to the Pydantic schema and is far
                more reliable than letting a small model free-form JSON.

Every agent in the codebase calls `chat()` / `embed_one()` / `embed_many()`
without caring which backend is active, so switching providers is a one-line
config change (plus pulling the model on the local Ollama daemon).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from typing import Any, Literal, TypeVar

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel, SecretStr, ValidationError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import (
    errors_total,
    llm_call_duration_seconds,
    openai_tokens_total,
)
from ...observability.tracer import callback_list

_log = get_logger(__name__)
_T = TypeVar("_T", bound=BaseModel)

# Lazy singletons. Three tiers:
#   heavy → highest-quality reasoning (e.g. enrichment merge over 25KB inputs)
#   light → default chat (extraction, discovery)
#   tiny  → fast classifier (scope judgment, yes/no)
# On Ollama with gpt-oss:20b all three tiers can point at the same model; MoE
# routing keeps decode fast and reasoning_effort knobs handle the quality/
# latency split per call.
_HEAVY: Any = None
_LIGHT: Any = None
_TINY: Any = None
_EMB: Any = None

# In-memory LRU embedding cache. Vendor name+domain dedup checks reembed the
# same string repeatedly within a single run; skipping the network round-trip
# is a substantial win for high-fanout pipelines. Cap = 2048 entries — size
# scales with active model dim (~6 MB at 768, ~32 MB at 4096 for qwen3-embedding).
_EMBED_CACHE: OrderedDict[str, list[float]] = OrderedDict()
_EMBED_CACHE_MAX = 2048


def _is_ollama() -> bool:
    return get_settings().llm_provider.lower() == "ollama"


def _is_groq() -> bool:
    return get_settings().llm_provider.lower() == "groq"


def _is_gemini() -> bool:
    return get_settings().llm_provider.lower() in {"gemini", "google", "google_gemini"}


def _is_openrouter() -> bool:
    return get_settings().llm_provider.lower() == "openrouter"


def _is_ollama_embedding() -> bool:
    return get_settings().embedding_provider.lower() == "ollama"


def _ollama_base_url(default: str = "http://ollama:11434") -> str:
    """ChatOllama wants the bare base, not the /v1 path that ChatOpenAI uses."""
    s = get_settings()
    raw = s.llm_base_url or default
    return raw.rstrip("/").removesuffix("/v1")


def _ollama_embedding_base_url(default: str = "http://ollama:11434") -> str:
    s = get_settings()
    raw = s.embedding_base_url or default
    return raw.rstrip("/").removesuffix("/v1")


def _make_chat(model: str, *, tier: _Tier | None = None) -> Any:
    s = get_settings()
    if _is_ollama():
        # langchain-ollama gives us native Ollama API access (better than the
        # openai-compat shim) plus structured output via `format=json_schema`.
        kwargs: dict[str, Any] = {
            "model": model,
            "base_url": _ollama_base_url(),
            "temperature": 0.0,
            "num_ctx": s.ollama_num_ctx,
            "num_predict": s.ollama_num_predict,
            "keep_alive": s.ollama_keep_alive,
            # langchain-ollama 0.3.6+ maps this to `think` on the Ollama API.
            # `reasoning=False` skips the model's reasoning phase entirely
            # for gpt-oss / Qwen3 / DeepSeek-R1 (requires Ollama server
            # >= 0.6 for gpt-oss think support; older versions just ignore).
            "reasoning": s.ollama_reasoning,
        }
        if s.llm_queue_enabled:
            # Wrap with our Redis counting-semaphore subclass so each
            # `ainvoke()` acquires `llm:concurrency:<tier>` first. Tier
            # defaults to "light" when caller didn't specify.
            from .queue import QueuedLangchainChatOllama

            return QueuedLangchainChatOllama(
                **kwargs, _llm_queue_tier=(tier or "light")
            )
        from langchain_ollama import ChatOllama

        return ChatOllama(**kwargs)
    if _is_groq():
        # Groq is OpenAI-compatible, so reuse ChatOpenAI with a base_url override.
        # Free tier rate limits live on the Groq dashboard; if you blow them
        # we get HTTP 429 which tenacity in chat() retries.
        return ChatOpenAI(
            model=model,
            api_key=SecretStr(s.groq_api_key or "missing-groq-key"),
            base_url=s.groq_base_url or "https://api.groq.com/openai/v1",
            timeout=s.global_request_timeout_seconds,
            max_retries=2,
            temperature=0.0,
        )
    if _is_openrouter():
        # OpenRouter is OpenAI-compatible. Send HTTP-Referer + X-Title for
        # the OpenRouter dashboard analytics + better rate-limit priority.
        return ChatOpenAI(
            model=model,
            api_key=SecretStr(s.openrouter_api_key or "missing-openrouter-key"),
            base_url="https://openrouter.ai/api/v1",
            timeout=s.global_request_timeout_seconds,
            max_retries=2,
            temperature=0.0,
            default_headers={
                "HTTP-Referer": "https://gsp:8090",
                "X-Title": "Autocrawl",
            },
        )
    if _is_gemini():
        # Google Generative AI native (Gemma / Gemini) via langchain-google-genai.
        # Web grounding tool is set per-call in the grounding agent, not here.
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=SecretStr(s.google_api_key or "missing-google-key"),
            temperature=0.0,
            timeout=s.global_request_timeout_seconds,
        )
    # OpenAI cloud path (escape hatch).
    return ChatOpenAI(
        model=model,
        api_key=SecretStr(s.openai_api_key),
        base_url=s.llm_base_url or None,
        timeout=s.global_request_timeout_seconds,
        max_retries=4,
    )


def _make_embeddings() -> Any:
    s = get_settings()
    # Quantity pivot 2026-05-21 — Google embedding fallback when explicitly
    # set EMBEDDING_PROVIDER=google_gemini. Cheap (text-embedding-004 free
    # tier 1500 RPM) and bypasses Ollama VPN dependency for vector dedup.
    if s.embedding_provider.lower() in {"google", "gemini", "google_gemini"}:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        return GoogleGenerativeAIEmbeddings(
            model=s.openai_embedding_model if s.openai_embedding_model.startswith("models/") or "/" in s.openai_embedding_model else "models/text-embedding-004",
            google_api_key=SecretStr(s.google_api_key or "missing-google-key"),
        )
    if _is_ollama_embedding():
        from langchain_ollama import OllamaEmbeddings

        return OllamaEmbeddings(
            model=s.openai_embedding_model,
            base_url=_ollama_embedding_base_url(),
        )
    return OpenAIEmbeddings(
        model=s.openai_embedding_model,
        api_key=SecretStr(s.openai_api_key),
        base_url=s.embedding_base_url or None,
    )


def heavy_llm() -> Any:
    global _HEAVY
    if _HEAVY is None:
        _HEAVY = _make_chat(get_settings().openai_model_heavy, tier="heavy")
    return _HEAVY


def light_llm() -> Any:
    global _LIGHT
    if _LIGHT is None:
        _LIGHT = _make_chat(get_settings().openai_model_light, tier="light")
    return _LIGHT


def tiny_llm() -> Any:
    global _TINY
    if _TINY is None:
        _TINY = _make_chat(get_settings().openai_model_tiny, tier="tiny")
    return _TINY


def embeddings() -> Any:
    global _EMB
    if _EMB is None:
        _EMB = _make_embeddings()
    return _EMB


def _embed_cache_key(text: str) -> str:
    # Include the active embedding model in the key so a model swap (e.g.
    # embeddinggemma:300m → qwen3-embedding:8b) doesn't bleed 768-dim vectors
    # into 4096-dim callers via cache hits.
    model = get_settings().openai_embedding_model
    return hashlib.sha1(f"{model}\0{text}".encode("utf-8")).hexdigest()


def _embed_cache_get(text: str) -> list[float] | None:
    key = _embed_cache_key(text)
    if key in _EMBED_CACHE:
        _EMBED_CACHE.move_to_end(key)
        return _EMBED_CACHE[key]
    return None


def _embed_cache_put(text: str, vec: list[float]) -> None:
    key = _embed_cache_key(text)
    _EMBED_CACHE[key] = vec
    _EMBED_CACHE.move_to_end(key)
    while len(_EMBED_CACHE) > _EMBED_CACHE_MAX:
        _EMBED_CACHE.popitem(last=False)


def _track_usage(model: str, response: BaseMessage, started_at: float) -> None:
    duration = time.monotonic() - started_at
    llm_call_duration_seconds.labels(model=model).observe(duration)
    usage = (response.response_metadata or {}).get("token_usage", {}) if hasattr(response, "response_metadata") else {}
    if usage:
        openai_tokens_total.labels(model=model, kind="prompt").inc(usage.get("prompt_tokens", 0))
        openai_tokens_total.labels(model=model, kind="completion").inc(usage.get("completion_tokens", 0))


def _extract_json(text: str) -> Any:
    """Extract the first balanced JSON object/array from a possibly-prose blob.

    Some Ollama models (custom-tagged Qwen variants etc.) ignore json_schema
    and function_calling instructions and return markdown-wrapped prose. gpt-
    oss generally doesn't, but this salvage path stays as a safety net for
    when an unfamiliar model gets pulled in.
    """
    s = text.strip()
    # Strip ```json fences if present.
    if s.startswith("```"):
        s = s.split("```", 2)[1] if s.count("```") >= 2 else s
        s = s.removeprefix("json").lstrip("\n")
        s = s.rsplit("```", 1)[0]
        s = s.strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    # Find balanced {...} or [...] anywhere in the body.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = s.find(opener)
        while start != -1:
            depth = 0
            for i in range(start, len(s)):
                if s[i] == opener:
                    depth += 1
                elif s[i] == closer:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(s[start : i + 1])
                        except json.JSONDecodeError:
                            break
            start = s.find(opener, start + 1)
    raise ValueError(f"no JSON object found in output: {text[:200]}")


async def _ollama_raw_json_call(
    llm: Any,
    messages: list[BaseMessage],
    response_format: type[_T],
) -> _T:
    """Universal Ollama path when constrained-decoding methods misbehave.

    Pins `format="json"` on the next request (forces Ollama's permissive
    JSON-mode decoder), prepends a SystemMessage carrying the schema, then
    pulls the first JSON blob out of the response and validates with
    Pydantic. Reliable on every model we've tried (gpt-oss, granite, qwen)
    because it doesn't depend on tool-calling templates or structured-output
    fine-tuning — just plain JSON output.
    """
    schema = response_format.model_json_schema()
    schema_hint = SystemMessage(
        content=(
            "Respond with ONE JSON object matching this schema. No prose, no "
            "markdown fences, no explanations — just the JSON.\n\n"
            f"Schema:\n{json.dumps(schema, ensure_ascii=False)}"
        )
    )
    constrained = llm.bind(format="json") if hasattr(llm, "bind") else llm
    augmented = [schema_hint, *messages]
    msg = await constrained.ainvoke(augmented, config={"callbacks": callback_list()})
    raw = msg.content if isinstance(msg.content, str) else str(msg.content)
    payload = _extract_json(raw)
    return response_format.model_validate(payload)


async def _chat_structured_with_retry(
    llm: Any,
    messages: list[BaseMessage],
    response_format: type[_T],
    *,
    max_attempts: int = 3,
) -> _T:
    """Drive a structured-output chat with multi-strategy fallback.

    Ollama strategy chain (one per attempt). Default with gpt-oss:20b is
    `OLLAMA_STRUCTURED_FAST=true` because gpt-oss honors json_schema cleanly:
      1. json_schema       — fast constrained decoding (gpt-oss native).
      2. function_calling  — fallback for tool-trained chat models.
      3. raw_json_format   — universal sledgehammer; pins `format=json` and
                             reparses manually. Reliable on any model.
    Set `OLLAMA_STRUCTURED_FAST=false` to invert the order (raw_json_format
    first) when running a model that can't follow schemas — e.g. custom Qwen
    tags that emit prose under json_schema.
    Groq + OpenAI use function_calling on every retry — they're tool-native.
    """
    if _is_ollama():
        s = get_settings()
        if getattr(s, "ollama_structured_fast", True):
            method_chain: list[str] = ["json_schema", "function_calling", "raw_json_format"]
        else:
            method_chain = ["raw_json_format", "function_calling", "json_schema"]
    else:
        method_chain = ["function_calling"]
    last_err: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        method = method_chain[min(attempt - 1, len(method_chain) - 1)]
        try:
            if method == "raw_json_format":
                return await _ollama_raw_json_call(llm, messages, response_format)
            structured = llm.with_structured_output(response_format, method=method)
            result = await structured.ainvoke(messages, config={"callbacks": callback_list()})
            if isinstance(result, response_format):
                return result
            # langchain may return a dict if validation succeeds but instance
            # construction was skipped — rebuild explicitly.
            if isinstance(result, dict):
                return response_format.model_validate(result)
            return result  # type: ignore[return-value]
        except ValidationError as e:
            last_err = e
            _log.warning(
                "llm.structured_validation_retry",
                attempt=attempt,
                error=str(e)[:200],
            )
            if attempt >= max_attempts:
                raise
            await asyncio.sleep(0.4 * attempt)
        except Exception as e:  # noqa: BLE001
            # Network / timeout / unparseable JSON. Retry up to max_attempts.
            last_err = e
            _log.warning(
                "llm.structured_call_retry",
                attempt=attempt,
                error=str(e)[:200],
            )
            if attempt >= max_attempts:
                raise
            await asyncio.sleep(0.6 * attempt)

    # Defensive: should never hit (loop either returned or raised).
    if last_err:
        raise last_err
    raise RuntimeError("structured chat exhausted retries without producing a result")


_Tier = Literal["tiny", "light", "heavy"]


def _resolve_tier(tier: _Tier | None, use_heavy: bool) -> tuple[Any, str]:
    """Pick (llm, model_name) for the requested tier. `use_heavy` kept for
    callers that haven't migrated to the explicit `tier=` kwarg yet."""
    settings = get_settings()
    if tier is None:
        tier = "heavy" if use_heavy else "light"
    if tier == "heavy":
        return heavy_llm(), settings.openai_model_heavy
    if tier == "tiny":
        return tiny_llm(), settings.openai_model_tiny
    return light_llm(), settings.openai_model_light


def _prepend_reasoning_hint(messages: list[BaseMessage]) -> list[BaseMessage]:
    """For gpt-oss harmony format: a SystemMessage of the form `Reasoning: low`
    sets the model's reasoning_effort. Other models read it as a no-op extra
    system instruction.

    Skipped entirely when `OLLAMA_REASONING=false` — at that point the API-level
    `think:false` flag has already killed the reasoning phase, so a harmony
    directive is redundant and risks pulling the model back into half-reasoning
    mode on some templates.
    """
    settings = get_settings()
    if not _is_ollama():
        return messages
    if not settings.ollama_reasoning:
        return messages
    if not settings.ollama_reasoning_effort:
        return messages
    hint = SystemMessage(content=f"Reasoning: {settings.ollama_reasoning_effort}")
    return [hint, *messages]


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(Exception),
)
async def chat(
    messages: list[BaseMessage],
    *,
    use_heavy: bool = False,
    tier: _Tier | None = None,
    response_format: type[_T] | None = None,
) -> _T | str:
    """Async chat with retry, telemetry, and optional structured output."""
    messages = _prepend_reasoning_hint(messages)
    llm, model_name = _resolve_tier(tier, use_heavy)
    started = time.monotonic()
    try:
        if response_format is not None:
            return await _chat_structured_with_retry(llm, messages, response_format)
        msg = await llm.ainvoke(messages, config={"callbacks": callback_list()})
        _track_usage(model_name, msg, started)
        return msg.content if isinstance(msg.content, str) else str(msg.content)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="llm", category=type(e).__name__).inc()
        _log.warning("llm.call_failed", model=model_name, error=str(e))
        raise


async def embed_one(text: str) -> list[float]:
    cached = _embed_cache_get(text)
    if cached is not None:
        return cached
    vec = await embeddings().aembed_query(text)
    _embed_cache_put(text, vec)
    return vec


async def embed_many(texts: list[str]) -> list[list[float]]:
    # Split into hits + misses to keep the network roundtrip minimal.
    hits: dict[int, list[float]] = {}
    miss_indices: list[int] = []
    miss_texts: list[str] = []
    for i, t in enumerate(texts):
        cached = _embed_cache_get(t)
        if cached is not None:
            hits[i] = cached
        else:
            miss_indices.append(i)
            miss_texts.append(t)

    if miss_texts:
        new_vecs = await embeddings().aembed_documents(miss_texts)
        for idx, t, v in zip(miss_indices, miss_texts, new_vecs, strict=True):
            _embed_cache_put(t, v)
            hits[idx] = v

    return [hits[i] for i in range(len(texts))]


async def warmup() -> None:
    """Best-effort warm-up. Only matters for Ollama (loads models into VRAM
    before first parallel burst). Groq + OpenAI have no cold-start so we skip."""
    if not _is_ollama():
        return
    from langchain_core.messages import HumanMessage

    for label, llm in (
        ("tiny", tiny_llm()),
        ("light", light_llm()),
        ("heavy", heavy_llm()),
    ):
        try:
            await llm.ainvoke([HumanMessage(content="ping")], config={"callbacks": []})
            _log.info("ollama.warmup_ok", model=label)
        except Exception as e:  # noqa: BLE001
            _log.warning("ollama.warmup_failed", model=label, error=str(e))
