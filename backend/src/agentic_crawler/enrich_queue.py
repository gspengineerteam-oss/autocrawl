"""Redis-stream queue between the listing pool and the enrich pool.

Why this exists
---------------
The listing pool discovers vendor names from expo aggregator pages and
needs to hand each one off to the enrich pool, which runs a separate
Browser-Use agent that searches the web → finds the official domain →
visits + extracts (contact, address, scope). The two pools run as
separate asyncio tasks (and possibly separate processes/containers), so
the hand-off can't be an in-process queue.

Redis streams give us:
- XADD-on-publish + XREADGROUP consumer-group-on-pull for fair fan-out
  across N enrich workers
- XACK after persist for at-least-once semantics
- XAUTOCLAIM to recover entries from crashed workers' Pending Entries List
  after `enrich_pel_reclaim_idle_seconds`

This module is a thin typed wrapper around the existing helpers in
`crawler.store.redis_queue` so we don't reimplement the client / consumer-
group bootstrap.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from crawler.observability.logger import get_logger
from crawler.observability.metrics import agentic_enrich_queue_depth
from crawler.store.redis_queue import (
    ack as _ack,
    get_redis,
    pull as _pull,
    push as _push,
    queue_depth as _queue_depth,
    task_id,
)

_log = get_logger(__name__)

STREAM_NAME = "agentic:enrich:queue"
CONSUMER_GROUP = "agentic-enrich-workers"


class EnrichTask(BaseModel):
    """One vendor handed from the listing pool to the enrich pool.

    Stored as flat string→string in the Redis stream entry. `from_redis`
    reconstructs the typed object; `to_redis` serializes it.
    """

    task_id: str
    vendor_name: str
    hint_url: str | None = None
    expo_id: str
    country_hint: str | None = None
    product_hint: str | None = None
    source_query: str | None = None
    lesson_id_of_listing: str | None = None
    # Snowglobe Phase 2: when True the consumer skips the Jina/static/Gemini
    # fast-path gauntlet and routes straight to the Browser-Use vision agent.
    # Set by the bring-back restore script so 22K thin-data vendors get a real
    # scrape instead of another seed-only classify.
    force_vision: bool = False
    enqueued_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_redis(self) -> dict[str, str]:
        # Redis stream fields are bytes-or-string. Pydantic's `model_dump`
        # already produces JSON-safe types; we just stringify None → "" so
        # round-trip is lossless.
        d = self.model_dump()
        return {k: ("" if v is None else str(v)) for k, v in d.items()}

    @classmethod
    def from_redis(cls, fields: dict[str, str]) -> "EnrichTask":
        cleaned: dict[str, Any] = {}
        for k, v in fields.items():
            if v == "" and k in {
                "hint_url", "country_hint", "product_hint",
                "source_query", "lesson_id_of_listing",
            }:
                cleaned[k] = None
            elif k == "force_vision":
                cleaned[k] = str(v).lower() in {"true", "1", "yes"}
            else:
                cleaned[k] = v
        return cls(**cleaned)


def make_task_id(vendor_name: str, expo_id: str | None = None) -> str:
    """Stable id for the enrich task — used as the Redis claim key for
    idempotency. Same vendor on same date → same id → second worker that
    pulls a redelivered entry sees the claim and skips."""
    key = f"{vendor_name.lower().strip()}|{(expo_id or '').lower().strip()}"
    return task_id(key, kind="enrich")


async def publish(task: EnrichTask) -> str | None:
    """XADD the task to the stream. Returns the entry id, or None when
    Redis is unavailable. Caller (listing runner) decides retry policy."""
    return await _push(STREAM_NAME, task.to_redis())


async def pull(consumer_id: str, count: int = 1, block_ms: int = 5000) -> list[tuple[str, EnrichTask]]:
    """XREADGROUP one (or more) tasks off the stream for this consumer.
    Returns list of (entry_id, task). Empty list if stream empty after
    `block_ms`. Auto-creates the consumer group on first call."""
    raw = await _pull(STREAM_NAME, CONSUMER_GROUP, consumer_id, count=count, block_ms=block_ms)
    out: list[tuple[str, EnrichTask]] = []
    for entry_id, fields in raw:
        try:
            out.append((entry_id, EnrichTask.from_redis(fields)))
        except Exception as e:  # noqa: BLE001
            # Malformed entry — ack to prevent re-delivery and log so
            # operator notices. Don't crash the worker.
            _log.warning("enrich_queue.malformed_entry", entry_id=entry_id, error=str(e)[:160])
            try:
                await _ack(STREAM_NAME, CONSUMER_GROUP, entry_id)
            except Exception:  # noqa: BLE001
                pass
    return out


async def ack(entry_id: str) -> None:
    await _ack(STREAM_NAME, CONSUMER_GROUP, entry_id)


async def depth() -> int:
    """Return the number of entries not yet consumed by the worker group.

    Uses XINFO GROUPS lag (undelivered) + pending (in-flight) rather than
    XLEN (total stream length). XLEN grows forever since we don't trim the
    stream, so it was always above high_water=50 and the backfill drainer
    never enqueued new work.
    """
    client = await get_redis()
    if client is None:
        return 0
    try:
        groups = await client.xinfo_groups(STREAM_NAME)
        n = 0
        for g in groups:
            name = g.get("name", b"")
            if isinstance(name, bytes):
                name = name.decode()
            if name == CONSUMER_GROUP:
                n = (g.get("lag") or 0) + (g.get("pending") or 0)
                break
    except Exception:  # noqa: BLE001
        n = await _queue_depth(STREAM_NAME)
    try:
        agentic_enrich_queue_depth.set(float(n))
    except Exception:  # noqa: BLE001
        pass
    return n


async def claim_pending_idle(consumer_id: str, idle_ms: int) -> list[tuple[str, EnrichTask]]:
    """XAUTOCLAIM entries idle longer than `idle_ms`. Recovers tasks from
    a crashed worker's PEL so they get re-processed by a healthy worker.
    Returns list of (entry_id, task) the caller should now re-execute.

    Redis 6.2+ required (autocrawl pins redis:7-alpine).
    """
    client = await get_redis()
    if client is None:
        return []
    try:
        # XAUTOCLAIM <stream> <group> <consumer> <min-idle-ms> <start-id> COUNT N
        # Returns (next_cursor, claimed_entries, deleted_ids).
        result = await client.xautoclaim(
            STREAM_NAME, CONSUMER_GROUP, consumer_id, idle_ms, "0-0", count=20
        )
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_queue.xautoclaim_failed", error=str(e)[:160])
        return []
    out: list[tuple[str, EnrichTask]] = []
    # redis-py returns (cursor, list[(entry_id, fields)], list[deleted_ids]) on
    # 6.2+, but some versions drop the third tuple element — handle both.
    try:
        if isinstance(result, (list, tuple)) and len(result) >= 2:
            entries = result[1]
        else:
            entries = result
        for entry_id, fields in entries or []:
            try:
                out.append((entry_id, EnrichTask.from_redis(fields)))
            except Exception:  # noqa: BLE001
                # Malformed reclaim — ack-drop.
                try:
                    await _ack(STREAM_NAME, CONSUMER_GROUP, entry_id)
                except Exception:  # noqa: BLE001
                    pass
    except Exception as e:  # noqa: BLE001
        _log.debug("enrich_queue.autoclaim_parse_failed", error=str(e)[:160])
    if out:
        _log.info("enrich_queue.reclaimed_pel", count=len(out), idle_ms=idle_ms)
    return out


async def watch_depth(interval_seconds: float = 30.0) -> None:
    """Background coro: periodically refresh `agentic_enrich_queue_depth`
    Prometheus gauge so operators can see queue backlog. Spawned by the
    scheduler when enrich is enabled."""
    while True:
        try:
            await depth()
        except Exception as e:  # noqa: BLE001
            _log.debug("enrich_queue.watch_depth_failed", error=str(e)[:160])
        await asyncio.sleep(interval_seconds)
