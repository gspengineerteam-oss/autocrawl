"""Backfill drainer pool.

Polls Postgres vendors yang status nya bukan enriched atau enrichment_gap
nya non empty, lalu republish ke `agentic:enrich:queue` biar enrich worker
yang udah ada yang cerna. Idempotency lewat make_task_id keyed di
(vendor_name, expo_id) jadi same vendor re-enqueued across passes collide
di claim key dan worker yang lebih lambat skip natural.

Prioritas seleksi.
1. Missing email duluan (rules sales paling kritis).
2. Missing products kedua (katalog kosong sama aja vendor tidak ada).
3. Sisanya urut last_enriched_at NULLS FIRST.

Guards.
- High water. Skip pass kalau queue depth udah di atas
  AGENTIC_BACKFILL_HIGH_WATER biar gak dobel piling sebelum worker selesai.
- Domain hint. Kalau vendor punya domain, di-set sebagai hint_url biar
  enrich worker skip name resolution.
- Sentinel expo_id "backfill" biar reporter bisa beda origin antara
  task dari listing vs task dari backfill.
"""

from __future__ import annotations

import asyncio
import signal

from sqlalchemy import case, func, or_, select

from crawler.db.models import VendorORM
from crawler.db.session import get_session
from crawler.observability.logger import get_logger

from .config import get_agentic_settings
from .enrich_queue import EnrichTask, depth, make_task_id, publish

_log = get_logger(__name__)

_BACKFILL_EXPO_ID = "backfill"


async def select_backlog_batch(session, *, limit: int) -> list[tuple[str, str, str | None, list[str]]]:
    """Pick the next batch yang butuh re enrich.

    Returns list of (vendor_id, company_name, domain, enrichment_gap)
    sudah urut by priority (missing email, missing products, oldest).
    """
    gap_col = VendorORM.enrichment_gap
    gap_len = func.coalesce(func.jsonb_array_length(gap_col), 0)
    # JSONB `?` operator. true kalau array berisi element string ini.
    has_email_gap = gap_col.op("?")("email")
    has_products_gap = gap_col.op("?")("products")
    priority = case(
        (has_email_gap, 0),
        (has_products_gap, 1),
        else_=2,
    )
    stmt = (
        select(
            VendorORM.vendor_id,
            VendorORM.company_name,
            VendorORM.domain,
            VendorORM.enrichment_gap,
        )
        .where(
            or_(
                VendorORM.status != "enriched",
                gap_len > 0,
            )
        )
        .order_by(priority.asc(), VendorORM.last_enriched_at.asc().nulls_first())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [(r[0], r[1], r[2], list(r[3] or [])) for r in rows]


async def enqueue_backlog_batch(rows: list[tuple[str, str, str | None, list[str]]]) -> int:
    """Publish setiap vendor ke enrich queue. Return count yang berhasil."""
    if not rows:
        return 0
    n_pub = 0
    for vendor_id, company_name, domain, gap in rows:
        name = (company_name or "").strip()
        if not name:
            continue
        hint_url = f"https://{domain}" if domain else None
        source_query = (
            f"backfill:{','.join(gap[:3])}" if gap else "backfill:status"
        )
        task = EnrichTask(
            task_id=make_task_id(name, _BACKFILL_EXPO_ID),
            vendor_name=name,
            hint_url=hint_url,
            expo_id=_BACKFILL_EXPO_ID,
            country_hint=None,
            product_hint=None,
            source_query=source_query,
            lesson_id_of_listing=None,
        )
        try:
            entry_id = await publish(task)
        except Exception as e:  # noqa: BLE001
            _log.debug(
                "backfill_drainer.publish_failed",
                vendor_id=vendor_id,
                error=str(e)[:120],
            )
            continue
        if entry_id:
            n_pub += 1
    return n_pub


async def drainer_loop(stop_event: asyncio.Event) -> None:
    """Wake every interval, poll backlog, publish ke queue.

    Skip pass kalau queue masih tebal. Exits clean kalau stop_event di set
    atau task di cancel (signal cascade dari sibling task crash).
    """
    s = get_agentic_settings()
    if not s.agentic_backfill_enabled:
        _log.info("backfill_drainer.disabled")
        await stop_event.wait()
        return
    interval = max(60, s.agentic_backfill_interval_seconds)
    high_water = max(0, s.agentic_backfill_high_water)
    batch_limit = max(1, s.agentic_backfill_batch_limit)
    _log.info(
        "backfill_drainer.started",
        interval_seconds=interval,
        high_water=high_water,
        batch_limit=batch_limit,
    )
    while not stop_event.is_set():
        try:
            current_depth = await depth()
            if high_water > 0 and current_depth >= high_water:
                _log.debug(
                    "backfill_drainer.high_water_skip",
                    current_depth=current_depth,
                    high_water=high_water,
                )
            else:
                async with get_session() as session:
                    rows = await select_backlog_batch(session, limit=batch_limit)
                n_pub = await enqueue_backlog_batch(rows)
                if n_pub:
                    _log.info(
                        "backfill_drainer.batch_published",
                        n_pub=n_pub,
                        candidates=len(rows),
                        queue_depth_before=current_depth,
                    )
                elif rows:
                    _log.debug(
                        "backfill_drainer.batch_no_pub",
                        candidates=len(rows),
                    )
                else:
                    _log.debug("backfill_drainer.no_backlog")
        except Exception as e:  # noqa: BLE001
            _log.warning("backfill_drainer.cycle_failed", error=str(e)[:200])
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
    _log.info("backfill_drainer.stopped")


async def run_forever() -> None:
    """Entry for combined mode CLI. Owns its own stop event yang juga
    kena trigger lewat SIGTERM / SIGINT kalau loop punya signal handler
    yang free."""
    stop = asyncio.Event()
    try:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                loop.add_signal_handler(sig, stop.set)
            except (NotImplementedError, RuntimeError):
                pass
    except RuntimeError:
        pass
    await drainer_loop(stop)
