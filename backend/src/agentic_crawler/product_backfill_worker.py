"""Phase 5 — Product catalog backfill worker.

Drains `agentic:product_backfill:queue`. Per task:
  1. Load Vendor from DB (skip if not found).
  2. Skip if vendor.products list is empty (nothing to enrich).
  3. Run `product_enricher.enrich_vendor_products(vendor)`.
  4. Persist via `vendor_repo.update_product_catalog`.
  5. Translator pass on summary/pros/cons (idempotent).
  6. XACK regardless of outcome (failures retry via operator-triggered
     enqueue, not auto-redelivery — we don't want broken vendors to
     loop forever).

Concurrency: N parallel async tasks per process, similar to enrich_worker.
Each task uses claim() SET-NX for idempotency against XAUTOCLAIM
redelivery.
"""

from __future__ import annotations

import asyncio
import os
import socket
from typing import Any

from crawler.agents import reporter as reporter_agent
from crawler.db.repositories import vendor_repo
from crawler.db.session import get_session
from crawler.observability.logger import get_logger
from crawler.schemas import Vendor
from crawler.store.redis_queue import claim, release

from . import product_backfill_queue
from .config import get_agentic_settings
from .product_backfill_queue import ProductBackfillTask
from .product_enricher import enrich_vendor_products

_log = get_logger(__name__)


def _consumer_id(idx: int) -> str:
    host = os.environ.get("HOSTNAME") or socket.gethostname()
    return f"{host}-{os.getpid()}-{idx}"


async def _process_task(
    consumer_id: str,
    entry_id: str,
    task: ProductBackfillTask,
) -> None:
    """Run one product enrichment task end-to-end."""
    if not await claim(task.task_id, ttl_seconds=3600):
        _log.info(
            "product_backfill_worker.task_already_claimed",
            vendor_id=task.vendor_id, task_id=task.task_id,
        )
        await product_backfill_queue.ack(entry_id)
        return

    _log.info(
        "product_backfill_worker.task_started",
        vendor_id=task.vendor_id, source=task.source, consumer=consumer_id,
    )
    try:
        # Load vendor
        async with get_session() as session:
            orm = await vendor_repo.get_by_vendor_id(session, task.vendor_id)
        if orm is None:
            _log.info(
                "product_backfill_worker.vendor_not_found",
                vendor_id=task.vendor_id,
            )
            return
        v = Vendor.model_validate(vendor_repo.orm_to_dict(orm))

        if not v.products:
            _log.info(
                "product_backfill_worker.skip_no_products",
                vendor_id=task.vendor_id, name=v.company_name[:80],
            )
            return

        # Run enrichment
        out = await enrich_vendor_products(v)
        if not out.products_detailed:
            _log.info(
                "product_backfill_worker.skip_zero_output",
                vendor_id=task.vendor_id, name=v.company_name[:80],
            )
            return

        # Translate (idempotent, fail-soft)
        try:
            from .translator import translate_vendor_inplace
            # Build a temporary vendor-like object to translate fields on.
            v.products_detailed = out.products_detailed
            v.focus_summary = out.focus_summary
            await translate_vendor_inplace(v)
            out.products_detailed = v.products_detailed
            out.focus_summary = v.focus_summary
        except Exception as e:  # noqa: BLE001
            _log.debug(
                "product_backfill_worker.translate_skipped",
                error=str(e)[:160],
            )

        # Persist
        async with get_session() as session:
            ok = await vendor_repo.update_product_catalog(
                session,
                task.vendor_id,
                products_detailed=[p.model_dump() for p in out.products_detailed],
                overall_scope_score=out.overall_scope_score,
                focus_summary=out.focus_summary,
                domain_of_interest=out.domain_of_interest,
            )
            if ok:
                await session.commit()

        _log.info(
            "product_backfill_worker.task_persisted",
            vendor_id=task.vendor_id, name=v.company_name[:80],
            n_products=out.n_products,
            overall_score=round(out.overall_scope_score, 3),
            elapsed_s=round(out.elapsed_s, 1),
            ok=ok,
        )
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "product_backfill_worker.task_unhandled_error",
            vendor_id=task.vendor_id, error=str(e)[:200],
        )
    finally:
        try:
            await product_backfill_queue.ack(entry_id)
        except Exception:  # noqa: BLE001
            pass
        try:
            await release(task.task_id)
        except Exception:  # noqa: BLE001
            pass


async def _worker_loop(idx: int, stop_event: asyncio.Event) -> None:
    """One async loop: pulls tasks from the stream and processes them."""
    consumer = _consumer_id(idx)
    _log.info("product_backfill_worker.started", consumer=consumer, idx=idx)
    while not stop_event.is_set():
        try:
            entries = await product_backfill_queue.pull(
                consumer, count=1, block_ms=5000
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("product_backfill_worker.pull_error", error=str(e)[:160])
            await asyncio.sleep(2.0)
            continue
        if not entries:
            continue
        for entry_id, task in entries:
            if stop_event.is_set():
                break
            await _process_task(consumer, entry_id, task)
    _log.info("product_backfill_worker.stopped", consumer=consumer, idx=idx)


async def run_forever(*, parallel: int | None = None) -> None:
    """Spawn N worker loops. Returns when SIGTERM-style stop is signaled."""
    s = get_agentic_settings()
    n = max(1, parallel or getattr(s, "product_backfill_parallel", 4))
    stop = asyncio.Event()

    # Hook SIGTERM/SIGINT for graceful shutdown.
    import signal as _signal

    loop = asyncio.get_running_loop()
    for sig in (_signal.SIGINT, _signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):
            # Windows / non-main-thread fallback — rely on KeyboardInterrupt
            pass

    _log.info("product_backfill_worker.run_forever_starting", parallel=n)
    workers = [asyncio.create_task(_worker_loop(i, stop)) for i in range(n)]
    try:
        await stop.wait()
    finally:
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
    _log.info("product_backfill_worker.run_forever_stopped")
