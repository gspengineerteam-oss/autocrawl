from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SQLALCHEMY_ECHO"] = "false"


@pytest.fixture
async def app_with_db():
    from crawler.db.engine import dispose_engine, init_db

    await init_db()
    from crawler.api.app import create_app

    application = create_app()
    yield application
    await dispose_engine()


@pytest.mark.asyncio
async def test_health_endpoint(app_with_db):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["db"] == "ok"


@pytest.mark.asyncio
async def test_overview_empty(app_with_db):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        response = await client.get("/api/overview")
        assert response.status_code == 200
        body = response.json()
        assert body["vendors_total"] == 0
        assert body["expos_total"] == 0
        assert body["latest_run"] is None
        assert body["industry_breakdown"] == []


@pytest.mark.asyncio
async def test_vendors_empty_list(app_with_db):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        response = await client.get("/api/vendors")
        assert response.status_code == 200
        body = response.json()
        assert body["items"] == []
        assert body["total"] == 0


@pytest.mark.asyncio
async def test_vendor_404(app_with_db):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        response = await client.get("/api/vendors/missing-domain.com")
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_full_round_trip_via_repo(app_with_db):
    from httpx import ASGITransport, AsyncClient

    from crawler.db.engine import get_sessionmaker
    from crawler.db.repositories import vendor_repo
    from crawler.schemas import (
        Address,
        ContactPoint,
        SocialLinks,
        SourceProvenance,
        Vendor,
    )

    sm = get_sessionmaker()
    async with sm() as session:
        v = Vendor(
            domain="acme.com",
            company_name="Acme Corp",
            canonical_url="https://acme.com",
            description="Sample vendor",
            tagline="Test tagline",
            products=["radar"],
            industries=["defense"],
            expos_seen=["expo-1"],
            address=Address(country="US", city="Arlington"),
            contacts=[ContactPoint(type="email", value="info@acme.com", verified=True, verification_score=0.9)],
            socials=SocialLinks(linkedin="https://linkedin.com/company/acme"),
            source_trail=[
                SourceProvenance(
                    type="aggregator",
                    url="https://10times.com/company/acme",
                    discovered_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
                )
            ],
            confidence_score=0.85,
        )
        await vendor_repo.upsert(session, v)
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        response = await client.get("/api/vendors/acme.com")
        assert response.status_code == 200
        body = response.json()
        assert body["domain"] == "acme.com"
        assert body["company_name"] == "Acme Corp"
        assert "defense" in body["industries"]
        assert body["confidence_score"] == 0.85
        assert len(body["contacts"]) == 1
        assert body["contacts"][0]["verified"] is True

        listing = await client.get("/api/vendors")
        assert listing.json()["total"] == 1

        overview = await client.get("/api/overview")
        body = overview.json()
        assert body["vendors_total"] == 1
        assert body["industry_breakdown"][0]["tag"] == "defense"


@pytest.mark.asyncio
async def test_stats_endpoints(app_with_db):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        for path in (
            "/api/stats/industries",
            "/api/stats/countries",
            "/api/stats/source-types",
            "/api/stats/timeline",
            "/api/stats/runs-mode",
        ):
            r = await client.get(path)
            assert r.status_code == 200
            assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_expos_and_pdfs_runs_empty(app_with_db):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as client:
        for path in ("/api/expos", "/api/pdfs", "/api/runs"):
            r = await client.get(path)
            assert r.status_code == 200
            body = r.json()
            assert body["items"] == []
