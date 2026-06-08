"""Phase 5 — Typed wrapper around the product-backfill Redis stream.

Same shape as `enrich_queue.py` but for the secondary catalog enrichment
pass. Both live path (post-persist hook in `enrich_worker`) and historical
backfill (CLI seeder) push to this stream; `product_backfill_worker`
drains it.

Stream key: `agentic:product_backfill:queue`
Group: `agentic-product-backfill`
"""

from __future__ import annotations

import hashlib
import json

from pydantic import BaseModel, Field

from crawler.observability.logger import get_logger
from crawler.store import redis_queue

_log = get_logger(__name__)

STREAM_KEY = "agentic:product_backfill:queue"
GROUP_NAME = "agentic-product-backfill"


class ProductBackfillTask(BaseModel):
    """One vendor to enrich with product catalog data."""

    task_id: str
    vendor_id: str
    source: str = Field(default="live")  # "live" | "backfill" | "operator_deepen"

    def to_redis_payload(self) -> dict[str, str]:
        # Redis stream values must be strings.
        return {
            "task_id": self.task_id,
            "vendor_id": self.vendor_id,
            "source": self.source,
        }

    @classmethod
    def from_redis_payload(cls, payload: dict) -> "ProductBackfillTask":
        return cls(
            task_id=str(payload.get("task_id") or ""),
            vendor_id=str(payload.get("vendor_id") or ""),
            source=str(payload.get("source") or "live"),
        )


def make_task_id(vendor_id: str, source: str = "live") -> str:
    """Deterministic 16-hex task ID. Same vendor+source → same ID, lets
    `claim()` SET-NX dedupe duplicate enqueues within TTL window."""
    raw = f"product_backfill:{vendor_id}:{source}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


async def publish(task: ProductBackfillTask) -> str | None:
    """XADD a task. Returns entry_id or None on Redis unavailable."""
    return await redis_queue.push(STREAM_KEY, task.to_redis_payload())


async def publish_vendor(
    vendor_id: str, *, source: str = "live"
) -> str | None:
    """Convenience: build a task and publish in one call."""
    if not vendor_id:
        return None
    task = ProductBackfillTask(
        task_id=make_task_id(vendor_id, source=source),
        vendor_id=vendor_id,
        source=source,
    )
    return await publish(task)


async def pull(consumer_id: str, *, count: int = 1, block_ms: int = 5000) -> list[tuple[str, ProductBackfillTask]]:
    """XREADGROUP, returning parsed tasks."""
    raw = await redis_queue.pull(
        STREAM_KEY, GROUP_NAME, consumer_id, count=count, block_ms=block_ms
    )
    out: list[tuple[str, ProductBackfillTask]] = []
    for entry_id, payload in raw:
        try:
            out.append((entry_id, ProductBackfillTask.from_redis_payload(payload)))
        except Exception as e:  # noqa: BLE001
            _log.warning(
                "product_backfill_queue.parse_failed",
                entry_id=entry_id, error=str(e)[:160],
                payload=json.dumps(payload, default=str)[:200],
            )
            # Still ack to prevent re-delivery loops on malformed entries.
            await redis_queue.ack(STREAM_KEY, GROUP_NAME, entry_id)
    return out


async def ack(entry_id: str) -> None:
    await redis_queue.ack(STREAM_KEY, GROUP_NAME, entry_id)


async def queue_depth() -> int:
    return await redis_queue.queue_depth(STREAM_KEY)
