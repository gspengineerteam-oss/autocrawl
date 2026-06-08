from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.repositories import expo_repo, pdf_repo, run_repo, vendor_repo
from ..deps import get_db

router = APIRouter(prefix="", tags=["overview"])


@router.get("/overview")
async def overview(
    session: AsyncSession = Depends(get_db),
    include_hidden: bool = Query(False),
) -> dict:
    settings = get_settings()
    vendors_total = await vendor_repo.count(session, include_hidden=include_hidden)
    expos_total = await expo_repo.count(session)
    pdfs_total = await pdf_repo.count(session)
    threshold = settings.phase_2_vendor_threshold or 100
    latest_run = await run_repo.latest(session)
    industry_breakdown = await vendor_repo.industry_breakdown(
        session, include_hidden=include_hidden
    )
    return {
        "vendors_total": vendors_total,
        "expos_total": expos_total,
        "pdfs_total": pdfs_total,
        "phase_2_threshold": threshold,
        "phase_2_progress_ratio": (vendors_total / threshold) if threshold else 0.0,
        "latest_run": run_repo.orm_to_dict(latest_run) if latest_run else None,
        "industry_breakdown": industry_breakdown,
    }


@router.get("/stats/industries")
async def stats_industries(
    session: AsyncSession = Depends(get_db),
    include_hidden: bool = Query(False),
) -> list[dict]:
    return await vendor_repo.industry_breakdown(session, include_hidden=include_hidden)


@router.get("/stats/countries")
async def stats_countries(
    limit: int = Query(10, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    include_hidden: bool = Query(False),
) -> list[dict]:
    return await vendor_repo.country_breakdown(
        session, limit=limit, include_hidden=include_hidden
    )


@router.get("/stats/source-types")
async def stats_source_types(session: AsyncSession = Depends(get_db)) -> list[dict]:
    return await vendor_repo.source_type_breakdown(session)


@router.get("/stats/expo-countries")
async def stats_expo_countries(session: AsyncSession = Depends(get_db)) -> list[dict]:
    """Per-country expo + vendor counts for the world map."""
    return await expo_repo.country_breakdown(session)


@router.get("/stats/expo-countries/{country}")
async def stats_expo_country_detail(
    country: str, session: AsyncSession = Depends(get_db)
) -> dict:
    """Detail breakdown for one country (drives the world-map side panel)."""
    return await expo_repo.country_detail(session, country=country)


@router.get("/stats/country-arcs")
async def stats_country_arcs(
    limit: int = Query(80, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Country-pair edges (expo country -> vendor country) for arc map."""
    return await expo_repo.country_arcs(session, limit=limit)


@router.get("/stats/timeline")
async def stats_timeline(
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_db),
    include_hidden: bool = Query(False),
) -> list[dict]:
    return await vendor_repo.timeline(session, days=days, include_hidden=include_hidden)


@router.get("/stats/runs-mode")
async def stats_runs_mode(
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await run_repo.runs_mode_breakdown(session, days=days)
