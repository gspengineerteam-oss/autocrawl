from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import PdfORM


def orm_to_dict(orm: PdfORM) -> dict[str, Any]:
    return {
        "filename": orm.filename,
        "source_url": orm.source_url,
        "expo_id": orm.expo_id,
        "sha256": orm.sha256,
        "size_bytes": orm.size_bytes,
        "page_count": orm.page_count,
        "vendors_found": orm.vendors_found,
        "downloaded_at": orm.downloaded_at.isoformat() if orm.downloaded_at else None,
    }


async def upsert(
    session: AsyncSession,
    *,
    filename: str,
    source_url: str,
    expo_id: str | None,
    sha256: str,
    size_bytes: int,
    page_count: int,
    vendors_found: int,
    downloaded_at: datetime,
    meta: dict[str, Any] | None = None,
) -> PdfORM:
    stmt = select(PdfORM).where(PdfORM.sha256 == sha256)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        existing = PdfORM(
            filename=filename,
            source_url=source_url,
            expo_id=expo_id,
            sha256=sha256,
            size_bytes=size_bytes,
            page_count=page_count,
            vendors_found=vendors_found,
            downloaded_at=downloaded_at,
            meta=meta or {},
        )
        session.add(existing)
    else:
        existing.filename = filename
        existing.source_url = source_url
        existing.expo_id = expo_id
        existing.size_bytes = size_bytes
        existing.page_count = page_count
        existing.vendors_found = vendors_found
        existing.meta = meta or existing.meta
    await session.flush()
    return existing


async def list_for_expo(session: AsyncSession, expo_id: str | None = None) -> list[PdfORM]:
    stmt = select(PdfORM)
    if expo_id:
        stmt = stmt.where(PdfORM.expo_id == expo_id)
    stmt = stmt.order_by(desc(PdfORM.downloaded_at))
    return list((await session.execute(stmt)).scalars().all())


async def count(session: AsyncSession) -> int:
    return int((await session.execute(select(func.count()).select_from(PdfORM))).scalar_one())
