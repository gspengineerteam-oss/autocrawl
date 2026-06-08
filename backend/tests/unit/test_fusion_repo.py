"""Tests for fusion repository CRUD using in-memory SQLite."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    # Register all ORM models with Base.metadata BEFORE create_all
    from crawler.db import models as _models  # noqa: F401
    from crawler.db.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield sm
    await engine.dispose()


def _make_fusion(fusion_id="f1"):
    from crawler.db.models import FusionORM

    return FusionORM(
        fusion_id=fusion_id,
        name="DroneCam",
        tagline="Aerial",
        description="desc",
        image_url="/static/fusions/f1.svg",
        source_vendor_ids=["v1", "v2"],
        industries=["drone"],
        tags=["surveillance"],
        rationale="r",
        status="draft",
    )


def _make_draft(vendor_id, email):
    from crawler.db.models import FusionEmailDraftORM

    return FusionEmailDraftORM(
        vendor_id=vendor_id,
        to_email=email,
        subject="sub",
        body="body",
    )


@pytest.mark.asyncio
async def test_create_persists_fusion_and_drafts(session_factory):
    from crawler.db.repositories import fusion_repo

    async with session_factory() as s:
        f = _make_fusion("f1")
        drafts = [_make_draft("v1", "v1@x.com"), _make_draft("v2", "v2@x.com")]
        await fusion_repo.create(s, fusion=f, drafts=drafts)
        await s.commit()

    async with session_factory() as s:
        got = await fusion_repo.get_by_id(s, "f1")
        assert got is not None
        assert got.name == "DroneCam"
        assert len(got.drafts) == 2


@pytest.mark.asyncio
async def test_list_paginated_orders_by_created_desc(session_factory):
    from crawler.db.repositories import fusion_repo

    async with session_factory() as s:
        for i in range(3):
            await fusion_repo.create(s, fusion=_make_fusion(f"f{i}"), drafts=[])
        await s.commit()

    async with session_factory() as s:
        rows = await fusion_repo.list_paginated(s, limit=10)
        assert len(rows) == 3
        ids = [r.fusion_id for r in rows]
        assert set(ids) == {"f0", "f1", "f2"}


@pytest.mark.asyncio
async def test_mark_email_copied_updates_timestamp(session_factory):
    from crawler.db.repositories import fusion_repo

    async with session_factory() as s:
        d = _make_draft("v1", "v1@x.com")
        f = _make_fusion("f1")
        await fusion_repo.create(s, fusion=f, drafts=[d])
        await s.commit()
        email_id = d.id

    async with session_factory() as s:
        ok = await fusion_repo.mark_email_copied(s, email_id)
        await s.commit()
        assert ok is True

    async with session_factory() as s:
        got = await fusion_repo.get_by_id(s, "f1")
        assert got is not None
        assert got.drafts[0].copied_at is not None


@pytest.mark.asyncio
async def test_mark_email_copied_returns_false_for_missing(session_factory):
    from crawler.db.repositories import fusion_repo

    async with session_factory() as s:
        ok = await fusion_repo.mark_email_copied(s, 99999)
        assert ok is False


@pytest.mark.asyncio
async def test_vendors_with_verified_email_sqlite_fallback(session_factory):
    from crawler.db.models import VendorORM
    from crawler.db.repositories import fusion_repo

    async with session_factory() as s:
        s.add(VendorORM(
            vendor_id="vA",
            company_name="With Email",
            domain="a.example.com",
            contacts=[{"type": "email", "value": "x@a.com", "verified": True}],
            confidence_score=0.8,
        ))
        s.add(VendorORM(
            vendor_id="vB",
            company_name="No Email",
            domain="b.example.com",
            contacts=[{"type": "phone", "value": "+62", "verified": True}],
            confidence_score=0.7,
        ))
        await s.commit()

    async with session_factory() as s:
        rows = await fusion_repo.vendors_with_verified_email(s, limit=10)
        ids = [r.vendor_id for r in rows]
        assert "vA" in ids
        assert "vB" not in ids
