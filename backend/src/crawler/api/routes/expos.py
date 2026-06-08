from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.repositories import expo_repo
from ...observability.logger import get_logger
from ..deps import get_db

_log = get_logger(__name__)
router = APIRouter(prefix="/expos", tags=["expos"])


@router.get("")
async def list_expos(
    country: str | None = None,
    search: str | None = None,
    limit: int = Query(250, ge=1, le=250),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db),
) -> dict:
    items, total = await expo_repo.list_paginated(
        session, country=country, search=search, limit=limit, offset=offset
    )
    counts = await expo_repo.vendor_count_per_expo(session)
    payload = []
    for orm in items:
        d = expo_repo.orm_to_dict(orm)
        d["vendor_count"] = counts.get(orm.expo_id, 0)
        payload.append(d)
    return {"items": payload, "total": total, "limit": limit, "offset": offset}


@router.get("/{expo_id}")
async def get_expo(expo_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    orm = await expo_repo.get_by_id(session, expo_id)
    if orm is None:
        raise HTTPException(status_code=404, detail=f"Expo {expo_id} not found")
    domains = await expo_repo.get_vendor_domains(session, expo_id)
    return expo_repo.orm_to_dict(orm, vendor_domains=domains)


@router.post("/{expo_id}/deepen", status_code=202)
async def deepen_expo(expo_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Re-run extractor + PDF discovery on this expo, push fresh refs through resolve+enrich."""
    orm = await expo_repo.get_by_id(session, expo_id)
    if orm is None:
        raise HTTPException(status_code=404, detail=f"Expo {expo_id} not found")

    snapshot = expo_repo.orm_to_dict(orm)
    asyncio.create_task(_deepen_expo_task(snapshot))
    return {
        "status": "scheduled",
        "expo_id": expo_id,
        "name": snapshot.get("name"),
    }


async def _deepen_expo_task(snapshot: dict) -> None:
    """Background: re-extract aggregator + re-find PDFs + re-process refs.

    Reuses standalone.process_ref so each ref lands in exhibitor_refs and (if
    resolved) flows to vendors with the same persist_unresolved guarantee.
    """
    try:
        from ...agents import extractor as extractor_agent
        from ...agents import pdf_finder as pdf_finder_agent
        from ...config import get_settings
        from ...orchestrator.standalone import process_ref
        from ...schemas import Expo, ExpoSource
        from ...tools.scrapers import pdf_extractor as pdf_extractor_mod

        expo = Expo(
            expo_id=snapshot["expo_id"],
            name=snapshot.get("name") or snapshot["expo_id"],
            source=ExpoSource(snapshot.get("source", "unknown")) if snapshot.get("source") else ExpoSource.UNKNOWN,
            aggregator_url=snapshot.get("aggregator_url"),
            official_url=snapshot.get("official_url"),
            location=snapshot.get("location"),
            country=snapshot.get("country"),
            topics=snapshot.get("topics") or [],
            pdf_brochure_urls=snapshot.get("pdf_brochure_urls") or [],
        )

        refs: list = []
        try:
            refs.extend(await extractor_agent.extract_exhibitors(expo))
        except Exception as e:  # noqa: BLE001
            _log.warning("expos.deepen_extract_failed", expo_id=expo.expo_id, error=str(e)[:200])

        try:
            pdf_urls = await pdf_finder_agent.find_pdfs_for_expo(expo)
            for pdf_url in pdf_urls:
                try:
                    refs.extend(await pdf_extractor_mod.list_exhibitors(pdf_url, expo.expo_id))
                except Exception as inner:  # noqa: BLE001
                    _log.debug("expos.deepen_pdf_failed", pdf=pdf_url, error=str(inner)[:200])
        except Exception as e:  # noqa: BLE001
            _log.warning("expos.deepen_pdf_finder_failed", expo_id=expo.expo_id, error=str(e)[:200])

        _log.info("expos.deepen_extracted", expo_id=expo.expo_id, refs=len(refs))
        if not refs:
            return

        settings = get_settings()
        cap = max(1, int(settings.crawl4ai_max_concurrent))
        sem = asyncio.Semaphore(cap)

        async def _run(r):
            async with sem:
                try:
                    await process_ref(r)
                except Exception as e:  # noqa: BLE001
                    _log.debug("expos.deepen_process_failed", name=r.name[:80], error=str(e)[:200])

        await asyncio.gather(*(_run(r) for r in refs), return_exceptions=True)
        _log.info("expos.deepen_done", expo_id=expo.expo_id, refs=len(refs))
    except Exception as e:  # noqa: BLE001
        _log.warning("expos.deepen_failed", expo_id=snapshot.get("expo_id"), error=str(e)[:200])
