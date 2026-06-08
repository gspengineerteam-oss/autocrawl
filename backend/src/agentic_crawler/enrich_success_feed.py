"""Snowglobe Phase 2 — capped Redis-list feed of enrichment successes.

Each entry is a JSON blob with the bare minimum the frontend toast needs:
vendor_id, name, domain, scope/data/effective %, ts. Stored as a Redis
LIST (`enrich:success:feed`) so newest is at index 0 (`LPUSH` + `LTRIM`).
The API hands a slice to the frontend; the toast component renders any
entry whose `ts > last_seen_ts`.

Kept dead-simple on purpose:
- No consumer-group / fan-out — toast widget is a single subscriber per
  browser session, doesn't need delivery guarantees.
- Cap at 200 so a long idle worker doesn't grow unbounded.
- All exceptions swallowed — telemetry must never break enrich path.
"""

from __future__ import annotations

import json
import time
from typing import Any

from crawler.observability.logger import get_logger
from crawler.store.redis_queue import get_redis

_log = get_logger(__name__)

FEED_KEY = "enrich:success:feed"
MAX_LEN = 200


def _round_pct(x: float | None) -> int:
    return int(round(max(0.0, min(1.0, float(x or 0.0))) * 100))


async def publish_success(
    *,
    vendor_id: str,
    company_name: str,
    domain: str | None,
    scope_match_score: float | None,
    enrichment_completeness: float | None,
    catalog_count: int | None = 0,
    has_email: bool = False,
    has_phone: bool = False,
) -> None:
    """Push one enrichment success onto the feed. Best-effort; silent on error."""
    try:
        client = await get_redis()
        if client is None:
            return
        scope = float(scope_match_score or 0.0)
        compl = float(enrichment_completeness or 0.0)
        effective = round(scope * (0.4 + 0.6 * compl), 3)
        payload: dict[str, Any] = {
            "vendor_id": vendor_id,
            "company_name": company_name,
            "domain": domain or "",
            "scope": _round_pct(scope),
            "data": _round_pct(compl),
            "eff": _round_pct(effective),
            "catalog_count": int(catalog_count or 0),
            "has_email": bool(has_email),
            "has_phone": bool(has_phone),
            "ts": time.time(),
        }
        await client.lpush(FEED_KEY, json.dumps(payload, separators=(",", ":")))
        await client.ltrim(FEED_KEY, 0, MAX_LEN - 1)
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_success_feed.publish_failed", error=str(e)[:120])


async def read_feed(*, since_ts: float = 0.0, limit: int = 50) -> list[dict[str, Any]]:
    """Return up to `limit` events newer than `since_ts`, newest-first."""
    try:
        client = await get_redis()
        if client is None:
            return []
        raw = await client.lrange(FEED_KEY, 0, max(0, limit - 1))
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_success_feed.read_failed", error=str(e)[:120])
        return []
    out: list[dict[str, Any]] = []
    for entry in raw or []:
        try:
            d = json.loads(entry)
        except Exception:  # noqa: BLE001
            continue
        if float(d.get("ts") or 0.0) <= since_ts:
            # entries are newest-first; once we hit one older than since_ts
            # everything after is older too.
            break
        out.append(d)
    return out
