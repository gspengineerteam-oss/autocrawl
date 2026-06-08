"""CRUD untuk VendorEmailDraftORM - per-vendor outreach email drafts.

Keyed by (vendor_id, language). Regenerating with the same key overwrites
the existing row in-place; manual edits via the API also overwrite. This
keeps the table bounded (one row per vendor per language) and means the
operator never sees stale drafts in the UI.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import VendorEmailDraftORM


async def get_draft(
    session: AsyncSession,
    *,
    vendor_id: str,
    language: str,
) -> VendorEmailDraftORM | None:
    res = await session.execute(
        select(VendorEmailDraftORM)
        .where(
            VendorEmailDraftORM.vendor_id == vendor_id,
            VendorEmailDraftORM.language == language,
        )
        .limit(1)
    )
    return res.scalar_one_or_none()


async def list_for_vendor(
    session: AsyncSession,
    *,
    vendor_id: str,
) -> list[VendorEmailDraftORM]:
    res = await session.execute(
        select(VendorEmailDraftORM)
        .where(VendorEmailDraftORM.vendor_id == vendor_id)
        .order_by(VendorEmailDraftORM.updated_at.desc())
    )
    return list(res.scalars().all())


async def upsert(
    session: AsyncSession,
    *,
    vendor_id: str,
    language: str,
    subject: str,
    body: str,
    model_used: str | None = None,
    edited_manually: bool = False,
) -> VendorEmailDraftORM:
    existing = await get_draft(session, vendor_id=vendor_id, language=language)
    now = datetime.now(timezone.utc)
    if existing is None:
        row = VendorEmailDraftORM(
            vendor_id=vendor_id,
            language=language,
            subject=subject,
            body=body,
            model_used=model_used,
            edited_manually=edited_manually,
        )
        session.add(row)
        await session.flush()
        return row
    existing.subject = subject
    existing.body = body
    existing.model_used = model_used or existing.model_used
    existing.edited_manually = edited_manually
    existing.updated_at = now
    await session.flush()
    return existing


def orm_to_dict(row: VendorEmailDraftORM) -> dict:
    return {
        "id": row.id,
        "vendor_id": row.vendor_id,
        "language": row.language,
        "subject": row.subject,
        "body": row.body,
        "model_used": row.model_used,
        "edited_manually": row.edited_manually,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
