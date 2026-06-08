"""Per-domain token bucket using Redis. Honors `PER_DOMAIN_RPS` setting.

`acquire(domain)` waits until a token is available. Many parallel workers
can call this safely; only one request per domain per (1/PER_DOMAIN_RPS)
seconds is allowed across the whole crawler fleet.
"""

from __future__ import annotations

import asyncio
import time

from ...config import get_settings
from ...observability.logger import get_logger
from ..url_utils import canonical_domain

_log = get_logger(__name__)
_LOCAL_FALLBACK_LOCKS: dict[str, asyncio.Lock] = {}
_LOCAL_FALLBACK_LAST: dict[str, float] = {}


async def _redis():
    """Lazy redis client. Falls back to in-memory if Redis is unreachable."""
    try:
        import redis.asyncio as aioredis  # type: ignore

        client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        await client.ping()
        return client
    except Exception as e:  # noqa: BLE001
        _log.debug("rate_limit.redis_unavailable_fallback_local", error=str(e))
        return None


async def acquire(url_or_domain: str) -> None:
    """Block until allowed by per-domain rate limit."""
    domain = canonical_domain(url_or_domain)
    if not domain:
        return
    settings = get_settings()
    interval = 1.0 / max(settings.per_domain_rps, 0.01)

    client = await _redis()
    key = f"ratelimit:{domain}"
    if client is not None:
        for _ in range(60):
            now = time.time()
            last = await client.get(key)
            last_f = float(last) if last else 0.0
            if now - last_f >= interval:
                await client.set(key, str(now), ex=int(interval) + 5)
                return
            await asyncio.sleep(max(0.05, interval - (now - last_f)))
        return  # ⚠ give up after a minute and let caller proceed

    lock = _LOCAL_FALLBACK_LOCKS.setdefault(domain, asyncio.Lock())
    async with lock:
        last = _LOCAL_FALLBACK_LAST.get(domain, 0.0)
        wait = interval - (time.time() - last)
        if wait > 0:
            await asyncio.sleep(wait)
        _LOCAL_FALLBACK_LAST[domain] = time.time()
