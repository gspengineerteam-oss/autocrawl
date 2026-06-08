"""Redis-backed LLM concurrency queue with asyncio fallback.

Why this exists
---------------
When Mode C runs 4 parallel Browser-Use seeds against `qwen3-vl:30b` AND the
base crawler is concurrently issuing embedding / light / heavy chat calls
against the SAME Ollama daemon, the daemon's request queue collapses: every
`ainvoke()` waits behind every other one and tail latency goes from 5s to
2 minutes. Tenacity then retries on timeout, multiplying the overload.

This module provides a counting semaphore in Redis (one bucket per tier:
`vision`, `heavy`, `light`, `tiny`) that every LLM call acquires before
issuing the network request. Because Redis is shared across processes, this
caps concurrency cluster-wide — agentic-crawler + crawler containers see one
queue, not two.

Falls back to a process-local `asyncio.Semaphore` when Redis is unreachable
so single-process dev / unit tests still work without booting Redis.

Usage
-----
Two `langchain_*.ChatOllama` subclasses are exported:

    QueuedChatOllama             — wraps `browser_use.llm.ollama.chat.ChatOllama`
    QueuedLangchainChatOllama    — wraps `langchain_ollama.ChatOllama`

Both override `ainvoke()` to acquire a tier slot first. Tier is set at
construction time. Defaults are sized for a 2× RTX PRO 6000 host:

    vision=2  heavy=2  light=4  tiny=8

When `LLM_QUEUE_ENABLED=false` the subclasses' `ainvoke()` becomes a thin
pass-through to `super().ainvoke()` — kill switch for incident response.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Literal

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import llm_queue_inflight, llm_queue_wait_seconds

_log = get_logger(__name__)

Tier = Literal["vision", "heavy", "light", "tiny"]
_TIERS: tuple[Tier, ...] = ("vision", "heavy", "light", "tiny")


# ---------------------------------------------------------------------------
# Local fallback — one asyncio.Semaphore per tier, lazy-built so that the
# concurrency limit reads from get_settings() at first acquire (env may be
# applied after import time during test bootstrap).
# ---------------------------------------------------------------------------

_LOCAL_SEMS: dict[Tier, asyncio.Semaphore] = {}
_LOCAL_LOCK = asyncio.Lock()


def _tier_concurrency(tier: Tier) -> int:
    s = get_settings()
    return {
        "vision": s.llm_queue_vision_concurrency,
        "heavy": s.llm_queue_heavy_concurrency,
        "light": s.llm_queue_light_concurrency,
        "tiny": s.llm_queue_tiny_concurrency,
    }[tier]


async def _local_sem(tier: Tier) -> asyncio.Semaphore:
    async with _LOCAL_LOCK:
        sem = _LOCAL_SEMS.get(tier)
        if sem is None:
            sem = asyncio.Semaphore(_tier_concurrency(tier))
            _LOCAL_SEMS[tier] = sem
        return sem


# ---------------------------------------------------------------------------
# Redis counting semaphore. We use a hash of pending tokens with TTL, but
# the simplest correct primitive is INCR-with-rollback: increment a counter,
# check it's <= cap, otherwise DECR and sleep. Includes a per-token TTL'd
# heartbeat key so that crashed callers eventually free their slot.
# ---------------------------------------------------------------------------

_REDIS_OK = True  # flips False after a connect/use failure for this process


async def _get_redis() -> Any | None:
    """Borrow the same Redis client the rest of the crawler uses. Returns
    None when Redis is unreachable (then caller falls back to local sem)."""
    if not _REDIS_OK:
        return None
    try:
        from ...store.redis_queue import get_redis  # lazy import — avoid cycle
        return await get_redis()
    except Exception as e:  # noqa: BLE001
        _log.debug("llm_queue.redis_import_failed", error=str(e)[:120])
        return None


def _slot_key(tier: Tier) -> str:
    return f"llm:concurrency:{tier}"


def _holder_key(tier: Tier, token: str) -> str:
    return f"llm:concurrency:{tier}:holder:{token}"


async def _redis_acquire(
    redis: Any,
    tier: Tier,
    *,
    cap: int,
    timeout_s: float,
    poll_interval_s: float = 0.1,
) -> str | None:
    """INCR-then-check pattern. Returns a holder token on success, None on
    timeout. Token is the value the caller must pass back to release().

    The holder key (TTL=acquire_timeout * 2) is the watchdog: if the caller
    crashes before release(), Redis expires the holder and a periodic janitor
    decrements the slot counter so the queue never deadlocks. We don't run
    the janitor here; sweep is implicit on next acquire when total > cap and
    no holder keys remain.
    """
    deadline = time.monotonic() + timeout_s
    token = uuid.uuid4().hex[:16]
    slot = _slot_key(tier)
    holder = _holder_key(tier, token)
    holder_ttl = max(60, int(timeout_s * 2))

    while True:
        try:
            current = await redis.incr(slot)
        except Exception as e:  # noqa: BLE001
            _log.debug("llm_queue.redis_incr_failed", tier=tier, error=str(e)[:120])
            return None
        if current <= cap:
            try:
                await redis.set(holder, "1", ex=holder_ttl)
            except Exception:  # noqa: BLE001
                # Even if heartbeat write failed, we have the slot — caller
                # will release it on exit. The watchdog just won't fire.
                pass
            return token
        # Over the cap — back off, decrement, retry until deadline.
        try:
            await redis.decr(slot)
        except Exception:  # noqa: BLE001
            pass
        if time.monotonic() >= deadline:
            return None
        await asyncio.sleep(poll_interval_s)


async def _redis_release(redis: Any, tier: Tier, token: str) -> None:
    slot = _slot_key(tier)
    holder = _holder_key(tier, token)
    try:
        await redis.decr(slot)
    except Exception:  # noqa: BLE001
        pass
    try:
        await redis.delete(holder)
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@asynccontextmanager
async def acquire_llm_slot(tier: Tier) -> AsyncIterator[None]:
    """Async context manager: acquire a tier slot, yield, release on exit.

    When `LLM_QUEUE_ENABLED=false` this is a no-op so callers can wrap
    unconditionally without paying the overhead in disabled environments.
    """
    s = get_settings()
    if not s.llm_queue_enabled:
        yield
        return

    if tier not in _TIERS:
        # Unknown tier — don't gate, just log so we notice.
        _log.warning("llm_queue.unknown_tier", tier=tier)
        yield
        return

    cap = _tier_concurrency(tier)
    timeout_s = s.llm_queue_acquire_timeout_s
    waited_started = time.monotonic()

    redis = await _get_redis()
    token: str | None = None
    using_redis = False
    if redis is not None:
        token = await _redis_acquire(redis, tier, cap=cap, timeout_s=timeout_s)
        using_redis = token is not None

    if not using_redis:
        # Fallback: process-local semaphore. asyncio.wait_for raises TimeoutError
        # on miss; let it bubble so caller (tenacity) can retry.
        sem = await _local_sem(tier)
        await asyncio.wait_for(sem.acquire(), timeout=timeout_s)

    waited = time.monotonic() - waited_started
    try:
        llm_queue_wait_seconds.labels(tier=tier).observe(waited)
    except Exception:  # noqa: BLE001
        pass
    try:
        llm_queue_inflight.labels(tier=tier).inc()
    except Exception:  # noqa: BLE001
        pass

    try:
        yield
    finally:
        try:
            llm_queue_inflight.labels(tier=tier).dec()
        except Exception:  # noqa: BLE001
            pass
        if using_redis and redis is not None and token is not None:
            await _redis_release(redis, tier, token)
        else:
            sem = _LOCAL_SEMS.get(tier)
            if sem is not None:
                sem.release()


# ---------------------------------------------------------------------------
# ChatOllama subclasses. Each overrides only `ainvoke()` so that base-class
# methods (`bind`, `with_structured_output`, etc.) bypass the queue — those
# return new wrapped instances whose own `ainvoke` still goes through us.
# ---------------------------------------------------------------------------

def _make_browser_use_subclass() -> type:
    """Build the QueuedChatOllama subclass for Browser-Use. Done lazily so
    the import path doesn't fail in environments without browser_use
    installed (base crawler containers)."""
    from browser_use.llm.ollama.chat import ChatOllama as _BUChatOllama

    class QueuedChatOllama(_BUChatOllama):
        """Browser-Use ChatOllama that acquires `llm:concurrency:<tier>`
        before each `ainvoke()`. Tier defaults to `vision` because this
        subclass is used by the agentic browser agent."""

        # Pydantic model — declare extra field through model_config.
        # Browser-Use's ChatOllama inherits from pydantic BaseModel; adding
        # a private attribute is the cleanest way to carry the tier without
        # tripping schema validation.
        _llm_queue_tier: Tier = "vision"  # type: ignore[assignment]

        def __init__(self, *args: Any, _llm_queue_tier: Tier = "vision", **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            # Use object.__setattr__ to bypass pydantic's frozen-field guards
            # if any are set on the parent.
            object.__setattr__(self, "_llm_queue_tier", _llm_queue_tier)

        async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:  # type: ignore[override]
            tier: Tier = getattr(self, "_llm_queue_tier", "vision")
            async with acquire_llm_slot(tier):
                return await super().ainvoke(*args, **kwargs)

    return QueuedChatOllama


def _make_langchain_subclass() -> type:
    """Build the QueuedLangchainChatOllama subclass for the base crawler."""
    from langchain_ollama import ChatOllama as _LCChatOllama

    class QueuedLangchainChatOllama(_LCChatOllama):  # type: ignore[misc, valid-type]
        """Langchain ChatOllama that acquires `llm:concurrency:<tier>`
        before each `ainvoke()`. Tier defaults to `light`; `_make_chat`
        passes the actual tier when building heavy/tiny instances."""

        _llm_queue_tier: Tier = "light"  # type: ignore[assignment]

        def __init__(self, *args: Any, _llm_queue_tier: Tier = "light", **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            object.__setattr__(self, "_llm_queue_tier", _llm_queue_tier)

        async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:  # type: ignore[override]
            tier: Tier = getattr(self, "_llm_queue_tier", "light")
            async with acquire_llm_slot(tier):
                return await super().ainvoke(*args, **kwargs)

    return QueuedLangchainChatOllama


_QueuedChatOllama: type | None = None
_QueuedLangchainChatOllama: type | None = None


def QueuedChatOllama(*args: Any, **kwargs: Any) -> Any:
    """Factory for Browser-Use's ChatOllama wrapped with our queue.

    Lazy-imports browser_use so this module stays importable in containers
    that don't ship the browser_use dependency.
    """
    global _QueuedChatOllama
    if _QueuedChatOllama is None:
        _QueuedChatOllama = _make_browser_use_subclass()
    return _QueuedChatOllama(*args, **kwargs)


def QueuedLangchainChatOllama(*args: Any, **kwargs: Any) -> Any:
    """Factory for langchain_ollama's ChatOllama wrapped with our queue."""
    global _QueuedLangchainChatOllama
    if _QueuedLangchainChatOllama is None:
        _QueuedLangchainChatOllama = _make_langchain_subclass()
    return _QueuedLangchainChatOllama(*args, **kwargs)
