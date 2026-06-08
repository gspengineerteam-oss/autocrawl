from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.repositories import exhibitor_ref_repo
from ...observability.logger import get_logger
from ..deps import get_db

_log = get_logger(__name__)
router = APIRouter(prefix="/exhibitor-refs", tags=["exhibitor-refs"])


@router.get("/stats")
async def stats(session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Bucketed counts so the frontend can render a forensic dashboard."""
    by_status = await exhibitor_ref_repo.stats_by_status(session)
    by_failure_category = await exhibitor_ref_repo.stats_by_failure_category(session)
    total = await exhibitor_ref_repo.count_total(session)
    return {
        "total": total,
        "by_status": by_status,
        "by_failure_category": by_failure_category,
    }


@router.get("")
async def list_refs(
    status: str | None = Query(default=None),
    failure_category: str | None = Query(default=None),
    expo_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await exhibitor_ref_repo.list_by_status(
        session,
        status=status,
        failure_category=failure_category,
        expo_id=expo_id,
        limit=limit,
        offset=offset,
    )
    items = [exhibitor_ref_repo.orm_to_dict(r) for r in rows]
    total = await exhibitor_ref_repo.count_total(session, status=status)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/{ref_id}/retry-resolve", status_code=202)
async def retry_resolve(ref_id: str, session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Schedule a background re-resolve for one ref. Idempotent."""
    existing = await exhibitor_ref_repo.get_by_id(session, ref_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="ref not found")

    asyncio.create_task(_retry_resolve_task(ref_id))
    return {"status": "scheduled", "ref_id": ref_id}


async def _retry_resolve_task(ref_id: str) -> None:
    """Run resolve+enrich on a single ref by id. Best-effort."""
    try:
        from ...orchestrator.standalone import process_ref_by_id

        await process_ref_by_id(ref_id)
    except Exception as e:  # noqa: BLE001
        _log.warning("exhibitor_refs.retry_failed", ref_id=ref_id, error=str(e)[:200])
