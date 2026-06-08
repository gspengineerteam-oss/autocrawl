from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...schemas import RunSummary
from ..models import RunORM


def _to_orm_dict(r: RunSummary) -> dict[str, Any]:
    return {
        "run_id": r.run_id,
        "started_at": r.started_at,
        "finished_at": r.finished_at,
        "mode": r.mode.value if hasattr(r.mode, "value") else str(r.mode),
        "expos_discovered": r.expos_discovered,
        "exhibitors_extracted": r.exhibitors_extracted,
        "vendors_resolved": r.vendors_resolved,
        "vendors_enriched": r.vendors_enriched,
        "vendors_dedup_skipped": r.vendors_dedup_skipped,
        "failures": r.failures,
        "firecrawl_credits_used": r.firecrawl_credits_used,
        "openai_tokens_used": r.openai_tokens_used,
        "exhibitors_resolve_failed": r.exhibitors_resolve_failed,
        "exhibitors_enrich_failed": r.exhibitors_enrich_failed,
        "exhibitors_validation_rejected": r.exhibitors_validation_rejected,
        "exhibitors_scope_rejected": r.exhibitors_scope_rejected,
        "notes": r.notes,
    }


def orm_to_dict(orm: RunORM) -> dict[str, Any]:
    return {
        "run_id": orm.run_id,
        "started_at": orm.started_at.isoformat() if orm.started_at else None,
        "finished_at": orm.finished_at.isoformat() if orm.finished_at else None,
        "mode": orm.mode,
        "expos_discovered": orm.expos_discovered,
        "exhibitors_extracted": orm.exhibitors_extracted,
        "vendors_resolved": orm.vendors_resolved,
        "vendors_enriched": orm.vendors_enriched,
        "vendors_dedup_skipped": orm.vendors_dedup_skipped,
        "failures": orm.failures,
        "firecrawl_credits_used": orm.firecrawl_credits_used,
        "openai_tokens_used": orm.openai_tokens_used,
        "notes": orm.notes,
        "exhibitors_resolve_failed": getattr(orm, "exhibitors_resolve_failed", 0) or 0,
        "exhibitors_enrich_failed": getattr(orm, "exhibitors_enrich_failed", 0) or 0,
        "exhibitors_validation_rejected": getattr(orm, "exhibitors_validation_rejected", 0) or 0,
        "exhibitors_scope_rejected": getattr(orm, "exhibitors_scope_rejected", 0) or 0,
    }


async def upsert(session: AsyncSession, summary: RunSummary) -> RunORM:
    payload = _to_orm_dict(summary)
    existing = await session.get(RunORM, summary.run_id)
    if existing is None:
        existing = RunORM(**payload)
        session.add(existing)
    else:
        for k, v in payload.items():
            setattr(existing, k, v)
    await session.flush()
    return existing


async def latest(session: AsyncSession) -> RunORM | None:
    stmt = select(RunORM).order_by(desc(RunORM.started_at)).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_recent(session: AsyncSession, limit: int = 20) -> list[RunORM]:
    stmt = select(RunORM).order_by(desc(RunORM.started_at)).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


async def count(session: AsyncSession) -> int:
    return int((await session.execute(select(func.count()).select_from(RunORM))).scalar_one())


async def runs_mode_breakdown(session: AsyncSession, *, days: int = 30) -> list[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(RunORM.mode, func.count())
        .where(RunORM.started_at >= cutoff)
        .group_by(RunORM.mode)
    )
    rows = (await session.execute(stmt)).all()
    return [{"mode": r[0], "count": int(r[1])} for r in rows]
