"""APScheduler-based 24/7 runner.

Schedules:
  * `crawl_run`     every RUN_INTERVAL_MINUTES — kicks off `graph.run_once()`
  * `daily_summary` 23:55 UTC daily — collates per-vendor JSON into a
                    rollup file so the office can pick it up

Graceful shutdown: signal handlers wait for the in-flight run before
allowing the process to exit.
"""

from __future__ import annotations

import asyncio
import json
import signal
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import get_settings
from .graph import run_once
from .observability.logger import configure_logging, get_logger
from .observability.metrics import (
    queue_depth,
    start_metrics_server,
)
from .store.json_reporter import manifest_vendor_count

_log = get_logger(__name__)
_RUNNING_TASK: asyncio.Task | None = None
_STOP = asyncio.Event()


async def _scheduled_run() -> None:
    global _RUNNING_TASK
    if _RUNNING_TASK is not None and not _RUNNING_TASK.done():
        _log.info("scheduler.skip_overlap")
        return

    async def _do() -> None:
        try:
            summary = await run_once()
            _log.info(
                "scheduler.run_finished",
                run_id=summary.run_id,
                expos=summary.expos_discovered,
                enriched=summary.vendors_enriched,
                failures=summary.failures,
            )
        except Exception as e:  # noqa: BLE001
            _log.exception("scheduler.run_crashed", error=str(e))

    _RUNNING_TASK = asyncio.create_task(_do())


async def _daily_summary() -> None:
    settings = get_settings()
    today = datetime.now(timezone.utc).date()
    out_path = settings.data_dir / "reports" / "runs" / f"summary_{today.isoformat()}.json"

    vendors_dir = settings.data_dir / "reports" / "vendors"
    expo_dir = settings.data_dir / "reports" / "expos"
    vendors = list(vendors_dir.glob("*.json")) if vendors_dir.exists() else []
    expos = list(expo_dir.glob("*.json")) if expo_dir.exists() else []

    manifest_count = await manifest_vendor_count()
    body = {
        "date": today.isoformat(),
        "vendors_total": manifest_count,
        "vendor_files": len(vendors),
        "expo_files": len(expos),
        "phase_2_threshold": settings.phase_2_vendor_threshold,
        "phase_2_progress_ratio": (
            manifest_count / settings.phase_2_vendor_threshold if settings.phase_2_vendor_threshold else 0.0
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(body, indent=2), encoding="utf-8")
    _log.info("scheduler.daily_summary_written", path=str(out_path), vendors_total=manifest_count)


async def _queue_depth_poller() -> None:
    """Background sampler for redis stream depth metric."""
    from .store.redis_queue import queue_depth as redis_qd

    while not _STOP.is_set():
        try:
            depth = await redis_qd("autocrawl:work")
            queue_depth.labels(queue="autocrawl:work").set(depth)
        except Exception:  # noqa: BLE001
            pass
        try:
            await asyncio.wait_for(_STOP.wait(), timeout=15)
        except asyncio.TimeoutError:
            pass


def _install_signals(loop: asyncio.AbstractEventLoop) -> None:
    def _stop() -> None:
        _log.info("scheduler.signal_received_stopping")
        _STOP.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            # Windows: no add_signal_handler; KeyboardInterrupt path handles SIGINT.
            pass


async def main_async(*, metrics_port: int = 8080) -> None:
    configure_logging()
    settings = get_settings()
    start_metrics_server(metrics_port)
    _log.info(
        "scheduler.boot",
        mode=settings.mode.value,
        interval_minutes=settings.run_interval_minutes,
        max_vendors_per_run=settings.max_vendors_per_run,
        max_expos_per_run=settings.max_expos_per_run,
        metrics_port=metrics_port,
    )

    sched = AsyncIOScheduler()
    sched.add_job(
        _scheduled_run,
        "interval",
        minutes=settings.run_interval_minutes,
        id="crawl_run",
        next_run_time=datetime.now(timezone.utc),
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _daily_summary,
        "cron",
        hour=23,
        minute=55,
        id="daily_summary",
        max_instances=1,
    )
    sched.start()

    poller = asyncio.create_task(_queue_depth_poller())

    loop = asyncio.get_running_loop()
    _install_signals(loop)

    await _STOP.wait()

    sched.shutdown(wait=True)
    if _RUNNING_TASK is not None and not _RUNNING_TASK.done():
        try:
            await asyncio.wait_for(_RUNNING_TASK, timeout=120)
        except asyncio.TimeoutError:
            _log.warning("scheduler.run_did_not_finish_in_time")
    poller.cancel()


def main() -> None:
    asyncio.run(main_async())


__all__ = ["main", "main_async"]
