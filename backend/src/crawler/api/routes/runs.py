from __future__ import annotations

import asyncio
import ctypes
import gc
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.repositories import run_repo
from ...observability.logger import get_logger
from ...schemas import CrawlMode
from ..deps import get_db

_log = get_logger(__name__)
router = APIRouter(prefix="/runs", tags=["runs"])

_LOCK_KEY = "autocrawl:active_run"
_LOCK_TTL_SECONDS = 60 * 60 * 6  # 6 hours, longer than any real run

_run_lock = asyncio.Lock()

# Reference to the running asyncio task + stop request flag.
# Held in module scope (single-process API) so the /stop endpoint can target
# the correct task. Cleared at task completion in finally-block of _execute_run.
_active_task: asyncio.Task | None = None
_stop_requested: bool = False


class TriggerRequest(BaseModel):
    mode: str = "normal"


async def _redis():
    settings = get_settings()
    from redis.asyncio import from_url

    return from_url(settings.redis_url, decode_responses=True)


async def _get_active_run() -> dict[str, Any] | None:
    """Read active-run lock from Redis. Falls back to None on Redis failure."""
    try:
        client = await _redis()
        try:
            raw = await client.get(_LOCK_KEY)
        finally:
            await client.aclose()
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:  # noqa: BLE001
            return None
    except Exception as e:  # noqa: BLE001
        _log.warning("runs.redis_get_failed", error=str(e))
        return None


async def _try_set_active_run(payload: dict[str, Any]) -> bool:
    """Atomic SET NX with TTL. True if we won the lock."""
    try:
        client = await _redis()
        try:
            ok = await client.set(
                _LOCK_KEY,
                json.dumps(payload),
                ex=_LOCK_TTL_SECONDS,
                nx=True,
            )
        finally:
            await client.aclose()
        return bool(ok)
    except Exception as e:  # noqa: BLE001
        _log.warning("runs.redis_set_failed", error=str(e))
        return False


async def _clear_active_run() -> None:
    try:
        client = await _redis()
        try:
            await client.delete(_LOCK_KEY)
        finally:
            await client.aclose()
    except Exception as e:  # noqa: BLE001
        _log.warning("runs.redis_clear_failed", error=str(e))


@router.get("")
async def list_runs(
    limit: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
) -> dict:
    items = await run_repo.list_recent(session, limit=limit)
    payload = [run_repo.orm_to_dict(r) for r in items]
    return {"items": payload, "total": len(payload), "limit": limit, "offset": 0}


@router.get("/active")
async def get_active_run() -> dict:
    active = await _get_active_run()
    if active is not None:
        active["stop_requested"] = _stop_requested
    return {"active": active}


class StopRequest(BaseModel):
    force: bool = False


@router.post("/stop")
async def stop_run(payload: StopRequest | None = None) -> dict:
    """Stop the currently running operation.

    Graceful (default): sets a cooperative stop flag; workers skip remaining
    work at their next boundary check. The state-machine drains naturally
    (typically <60s). Vendors already enriched stay committed.

    Force: cancels the asyncio task immediately, kills Chromium subprocesses,
    and aborts mid-flight LLM calls. Faster but messier — in-flight tokens
    are charged with no return value.
    """
    global _active_task, _stop_requested
    body = payload or StopRequest()

    active = await _get_active_run()
    if active is None and (_active_task is None or _active_task.done()):
        raise HTTPException(status_code=404, detail="No active run to stop")

    from ...graph import request_stop

    _stop_requested = True

    if body.force:
        # Forceful: cancel task, release Redis lock, cleanup resources.
        if _active_task and not _active_task.done():
            _active_task.cancel()
        await _clear_active_run()
        await _release_run_resources()
        await _mark_in_flight_aborted("aborted_force")
        _stop_requested = False
        return {"status": "stopped", "mode": "force"}

    # Graceful: signal workers; lock + cleanup happens in _execute_run finally.
    request_stop()
    return {"status": "stop_requested", "mode": "graceful"}


async def _mark_in_flight_aborted(reason: str) -> None:
    """Reconcile DB state after an abort: close open runs, reset mid-pipeline refs."""
    try:
        from ...db.engine import get_sessionmaker
        from sqlalchemy import text as _text

        sm = get_sessionmaker()
        async with sm() as session:
            await session.execute(
                _text(
                    "UPDATE runs SET finished_at = NOW(), notes = :reason "
                    "WHERE finished_at IS NULL"
                ),
                {"reason": reason},
            )
            await session.execute(
                _text(
                    "UPDATE exhibitor_refs SET status = 'extracted', "
                    "failure_category = NULL, failure_reason = NULL "
                    "WHERE status IN ('resolving', 'enriching')"
                )
            )
            await session.commit()
    except Exception as e:  # noqa: BLE001
        _log.warning("runs.abort_reconcile_failed", error=str(e))


async def _execute_run(mode: CrawlMode) -> None:
    global _stop_requested
    try:
        from ...db.engine import get_sessionmaker
        from ...graph import is_stop_requested, run_once

        _log.info("api.run_started", mode=mode.value)
        summary = await run_once(mode=mode)
        was_aborted = is_stop_requested()
        _log.info(
            "api.run_finished",
            run_id=summary.run_id,
            enriched=summary.vendors_enriched,
            aborted=was_aborted,
        )
        if was_aborted:
            summary.notes = "aborted_graceful"

        try:
            sessionmaker = get_sessionmaker()
            async with sessionmaker() as session:
                await run_repo.upsert(session, summary)
                await session.commit()
            _log.info("api.run_persisted", run_id=summary.run_id)
        except Exception as db_exc:
            _log.exception(
                "api.run_persist_failed",
                run_id=summary.run_id,
                error=str(db_exc),
            )
        if was_aborted:
            await _mark_in_flight_aborted("aborted_graceful")
    except asyncio.CancelledError:
        # Forceful stop took this path. _stop_run already did the bookkeeping.
        _log.info("api.run_cancelled_forcefully")
        raise
    except Exception as exc:
        _log.exception("api.run_failed", error=str(exc))
    finally:
        await _clear_active_run()
        await _release_run_resources()
        _stop_requested = False


async def _release_run_resources() -> None:
    """Free heavy in-process state after a run so VmmemWSL can reclaim RAM.

    Why: Crawl4AI keeps a persistent Chromium until the API process exits, which
    pins ~500MB-1.5GB per browser instance inside WSL2. Without explicit close,
    VmmemWSL grows monotonically and can only be reclaimed by `wsl --shutdown`.
    """
    try:
        from ...tools.crawl4ai_client import c4ai_close

        await c4ai_close()
    except Exception as e:  # noqa: BLE001
        _log.debug("api.c4ai_close_failed", error=str(e))

    try:
        from ...tools.browsers.playwright_pool import PlaywrightPool

        pool = getattr(PlaywrightPool, "_instance", None)
        if pool is not None:
            await pool.close()
            PlaywrightPool._instance = None
    except Exception as e:  # noqa: BLE001
        _log.debug("api.playwright_pool_close_failed", error=str(e))

    gc.collect()
    try:
        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
    except Exception:  # noqa: BLE001
        pass


@router.post("/trigger", status_code=202)
async def trigger_run(payload: TriggerRequest | None = None) -> dict:
    body = payload or TriggerRequest()
    try:
        mode = CrawlMode(body.mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {body.mode}") from exc

    candidate = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode.value,
        "status": "running",
    }

    async with _run_lock:
        existing = await _get_active_run()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail={"message": "A run is already active", "active": existing},
            )
        won = await _try_set_active_run(candidate)
        if not won:
            current = await _get_active_run()
            raise HTTPException(
                status_code=409,
                detail={"message": "A run is already active", "active": current},
            )

    global _active_task, _stop_requested
    _stop_requested = False
    _active_task = asyncio.create_task(_execute_run(mode))
    return {"status": "accepted", "active": candidate}
