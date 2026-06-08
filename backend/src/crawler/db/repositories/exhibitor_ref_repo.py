"""Repository for ExhibitorRefORM audit table.

Every ExhibitorRef extracted from PDF or HTML lands here with status=extracted.
As the ref moves through the pipeline (resolve → enrich → persist), update_status
flips its lifecycle state. Failed refs keep their failure_category for debugging.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import AnyHttpUrl
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...schemas import ExhibitorRef
from ..models import ExhibitorRefORM


VALID_STATUSES = frozenset({
    "extracted",
    "resolving",
    "resolved",
    "enriching",
    "enriched",
    "dedup_skipped",
    "resolve_failed",
    "enrich_failed",
    "validation_rejected",
    "scope_rejected",
})


def _provenance_to_jsonable(ref: ExhibitorRef) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in ref.provenance:
        d = p.model_dump(mode="json")
        out.append(d)
    return out


def _raw_url_str(ref: ExhibitorRef) -> str | None:
    if ref.raw_url is None:
        return None
    return str(ref.raw_url)


def orm_to_dict(orm: ExhibitorRefORM) -> dict[str, Any]:
    return {
        "ref_id": orm.ref_id,
        "expo_id": orm.expo_id,
        "name": orm.name,
        "raw_url": orm.raw_url,
        "short_description": orm.short_description,
        "booth": orm.booth,
        "provenance": orm.provenance or [],
        "status": orm.status,
        "failure_category": orm.failure_category,
        "failure_reason": orm.failure_reason,
        "resolved_domain": orm.resolved_domain,
        "resolve_attempts": orm.resolve_attempts,
        "last_attempted_at": orm.last_attempted_at.isoformat() if orm.last_attempted_at else None,
        "run_id": orm.run_id,
        "created_at": orm.created_at.isoformat() if orm.created_at else None,
        "updated_at": orm.updated_at.isoformat() if orm.updated_at else None,
    }


async def upsert(
    session: AsyncSession,
    ref: ExhibitorRef,
    *,
    status: str = "extracted",
    run_id: str | None = None,
) -> ExhibitorRefORM:
    """Upsert by natural key (expo_id, name, raw_url). Insert sets status; update keeps existing status (so subsequent calls during the same run don't clobber lifecycle state)."""
    raw_url = _raw_url_str(ref)
    stmt = select(ExhibitorRefORM).where(
        ExhibitorRefORM.expo_id == ref.expo_id,
        ExhibitorRefORM.name == ref.name,
        ExhibitorRefORM.raw_url == raw_url,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        existing = ExhibitorRefORM(
            ref_id=str(uuid.uuid4()),
            expo_id=ref.expo_id,
            name=ref.name,
            raw_url=raw_url,
            short_description=ref.short_description,
            booth=ref.booth,
            provenance=_provenance_to_jsonable(ref),
            status=status,
            run_id=run_id,
        )
        session.add(existing)
    else:
        existing.short_description = ref.short_description or existing.short_description
        existing.booth = ref.booth or existing.booth
        if ref.provenance:
            existing.provenance = _provenance_to_jsonable(ref)
        if run_id and not existing.run_id:
            existing.run_id = run_id
    await session.flush()
    return existing


async def update_status_by_natural_key(
    session: AsyncSession,
    *,
    expo_id: str | None,
    name: str,
    raw_url: AnyHttpUrl | str | None,
    status: str,
    failure_category: str | None = None,
    failure_reason: str | None = None,
    resolved_domain: str | None = None,
    increment_attempts: bool = False,
) -> bool:
    """Update by natural key. Returns True if a row was updated."""
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid status: {status}")
    raw_url_s = str(raw_url) if raw_url is not None else None
    stmt = select(ExhibitorRefORM).where(
        ExhibitorRefORM.expo_id == expo_id,
        ExhibitorRefORM.name == name,
        ExhibitorRefORM.raw_url == raw_url_s,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        return False
    existing.status = status
    if failure_category is not None:
        existing.failure_category = failure_category
    if failure_reason is not None:
        existing.failure_reason = failure_reason[:1000]
    if resolved_domain is not None:
        existing.resolved_domain = resolved_domain
    if increment_attempts:
        existing.resolve_attempts = (existing.resolve_attempts or 0) + 1
    existing.last_attempted_at = datetime.now(timezone.utc)
    await session.flush()
    return True


async def update_status_by_id(
    session: AsyncSession,
    ref_id: str,
    *,
    status: str,
    failure_category: str | None = None,
    failure_reason: str | None = None,
    resolved_domain: str | None = None,
    increment_attempts: bool = False,
) -> bool:
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid status: {status}")
    existing = await session.get(ExhibitorRefORM, ref_id)
    if existing is None:
        return False
    existing.status = status
    if failure_category is not None:
        existing.failure_category = failure_category
    if failure_reason is not None:
        existing.failure_reason = failure_reason[:1000]
    if resolved_domain is not None:
        existing.resolved_domain = resolved_domain
    if increment_attempts:
        existing.resolve_attempts = (existing.resolve_attempts or 0) + 1
    existing.last_attempted_at = datetime.now(timezone.utc)
    await session.flush()
    return True


async def get_by_id(session: AsyncSession, ref_id: str) -> ExhibitorRefORM | None:
    return await session.get(ExhibitorRefORM, ref_id)


async def list_by_status(
    session: AsyncSession,
    status: str | None = None,
    *,
    failure_category: str | None = None,
    expo_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ExhibitorRefORM]:
    stmt = select(ExhibitorRefORM)
    if status:
        stmt = stmt.where(ExhibitorRefORM.status == status)
    if failure_category:
        stmt = stmt.where(ExhibitorRefORM.failure_category == failure_category)
    if expo_id:
        stmt = stmt.where(ExhibitorRefORM.expo_id == expo_id)
    stmt = stmt.order_by(desc(ExhibitorRefORM.updated_at)).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def stats_by_status(session: AsyncSession) -> dict[str, int]:
    stmt = select(ExhibitorRefORM.status, func.count()).group_by(ExhibitorRefORM.status)
    rows = (await session.execute(stmt)).all()
    return {row[0]: int(row[1]) for row in rows}


async def stats_by_failure_category(session: AsyncSession) -> dict[str, int]:
    stmt = (
        select(ExhibitorRefORM.failure_category, func.count())
        .where(ExhibitorRefORM.failure_category.isnot(None))
        .group_by(ExhibitorRefORM.failure_category)
    )
    rows = (await session.execute(stmt)).all()
    return {row[0]: int(row[1]) for row in rows}


async def count_by_status_for_run(session: AsyncSession, run_id: str) -> dict[str, int]:
    stmt = (
        select(ExhibitorRefORM.status, func.count())
        .where(ExhibitorRefORM.run_id == run_id)
        .group_by(ExhibitorRefORM.status)
    )
    rows = (await session.execute(stmt)).all()
    return {row[0]: int(row[1]) for row in rows}


async def count_total(session: AsyncSession, *, status: str | None = None) -> int:
    stmt = select(func.count()).select_from(ExhibitorRefORM)
    if status:
        stmt = stmt.where(ExhibitorRefORM.status == status)
    return int((await session.execute(stmt)).scalar_one())
