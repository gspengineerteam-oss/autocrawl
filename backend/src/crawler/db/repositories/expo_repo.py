from __future__ import annotations

from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...schemas import Expo
from ..models import ExpoORM, ExpoVendorORM, VendorORM


def _to_orm_dict(e: Expo) -> dict[str, Any]:
    return {
        "expo_id": e.expo_id,
        "name": e.name,
        "source": e.source.value if hasattr(e.source, "value") else str(e.source),
        "aggregator_url": str(e.aggregator_url) if e.aggregator_url else None,
        "official_url": str(e.official_url) if e.official_url else None,
        "location": e.location,
        "country": e.country,
        "start_date": e.start_date,
        "end_date": e.end_date,
        "topics": list(e.topics or []),
        "discovery_query": e.discovery_query,
        "discovered_at": e.discovered_at,
        "pdf_brochure_urls": list(e.pdf_brochure_urls or []),
        "raw_metadata": dict(e.raw_metadata or {}),
    }


def orm_to_dict(orm: ExpoORM, vendor_domains: list[str] | None = None) -> dict[str, Any]:
    return {
        "expo_id": orm.expo_id,
        "name": orm.name,
        "source": orm.source,
        "aggregator_url": orm.aggregator_url,
        "official_url": orm.official_url,
        "location": orm.location,
        "country": orm.country,
        "start_date": orm.start_date.isoformat() if orm.start_date else None,
        "end_date": orm.end_date.isoformat() if orm.end_date else None,
        "topics": orm.topics or [],
        "discovery_query": orm.discovery_query,
        "discovered_at": orm.discovered_at.isoformat() if orm.discovered_at else None,
        "pdf_brochure_urls": orm.pdf_brochure_urls or [],
        "vendor_domains": vendor_domains or [],
        "raw_metadata": orm.raw_metadata or {},
    }


async def upsert(session: AsyncSession, expo: Expo, vendor_domains: list[str] | None = None) -> ExpoORM:
    payload = _to_orm_dict(expo)
    existing = await session.get(ExpoORM, expo.expo_id)
    if existing is None:
        existing = ExpoORM(**payload)
        session.add(existing)
    else:
        for key, value in payload.items():
            setattr(existing, key, value)
    await session.flush()

    for domain in vendor_domains or []:
        existing_vendor = await session.get(VendorORM, domain)
        if existing_vendor is None:
            continue
        link = await session.get(ExpoVendorORM, (expo.expo_id, domain))
        if link is None:
            session.add(ExpoVendorORM(expo_id=expo.expo_id, vendor_domain=domain))
    await session.flush()
    return existing


async def get_by_id(session: AsyncSession, expo_id: str) -> ExpoORM | None:
    return await session.get(ExpoORM, expo_id)


async def get_vendor_domains(session: AsyncSession, expo_id: str) -> list[str]:
    stmt = select(ExpoVendorORM.vendor_domain).where(ExpoVendorORM.expo_id == expo_id)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows)


async def list_paginated(
    session: AsyncSession,
    *,
    country: str | None = None,
    search: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[ExpoORM], int]:
    stmt = select(ExpoORM)
    count_stmt = select(func.count()).select_from(ExpoORM)
    if search:
        like = f"%{search.lower()}%"
        cond = func.lower(ExpoORM.name).like(like) | func.lower(ExpoORM.expo_id).like(like)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if country:
        stmt = stmt.where(ExpoORM.country == country)
        count_stmt = count_stmt.where(ExpoORM.country == country)
    stmt = stmt.order_by(desc(ExpoORM.discovered_at)).limit(limit).offset(offset)
    items = list((await session.execute(stmt)).scalars().all())
    total = int((await session.execute(count_stmt)).scalar_one())
    return items, total


async def count(session: AsyncSession) -> int:
    return int((await session.execute(select(func.count()).select_from(ExpoORM))).scalar_one())


async def vendor_count_per_expo(session: AsyncSession) -> dict[str, int]:
    stmt = (
        select(ExpoVendorORM.expo_id, func.count())
        .group_by(ExpoVendorORM.expo_id)
    )
    rows = (await session.execute(stmt)).all()
    return {r[0]: int(r[1]) for r in rows}


async def country_breakdown(session: AsyncSession) -> list[dict[str, Any]]:
    """Group expos by country with vendor count joined per country.

    Used by the world-map view on the overview dashboard. Vendor count is
    derived from the expo_vendors many-to-many so a vendor seen at multiple
    expos in the same country is counted once per (country, vendor).
    """
    expo_stmt = (
        select(ExpoORM.country, func.count())
        .where(ExpoORM.country.isnot(None))
        .where(ExpoORM.country != "")
        .group_by(ExpoORM.country)
    )
    expo_rows = (await session.execute(expo_stmt)).all()
    expo_counts = {row[0]: int(row[1]) for row in expo_rows}

    vendor_stmt = (
        select(ExpoORM.country, func.count(func.distinct(ExpoVendorORM.vendor_domain)))
        .join(ExpoVendorORM, ExpoVendorORM.expo_id == ExpoORM.expo_id)
        .where(ExpoORM.country.isnot(None))
        .where(ExpoORM.country != "")
        .group_by(ExpoORM.country)
    )
    vendor_rows = (await session.execute(vendor_stmt)).all()
    vendor_counts = {row[0]: int(row[1]) for row in vendor_rows}

    out: list[dict[str, Any]] = []
    for country, expo_count in expo_counts.items():
        out.append(
            {
                "country": country,
                "expo_count": expo_count,
                "vendor_count": vendor_counts.get(country, 0),
            }
        )
    out.sort(key=lambda r: (-int(r["vendor_count"]), -int(r["expo_count"]), str(r["country"])))
    return out


async def country_arcs(session: AsyncSession, *, limit: int = 80) -> list[dict[str, Any]]:
    """Edges in the bipartite (expo-country -> vendor-country) graph.

    Each row = one country pair: an expo somewhere joined to a vendor
    whose registrar country differs from the expo's country. Used by
    the overview map to draw arc connections that read as "the
    crawler discovered vendor X in country B from expo Y in country A".

    Self-loops (same country) are excluded — they add no visual signal.
    Sorted by vendor count desc; top-N returned to keep the map legible.
    """
    stmt = (
        select(
            ExpoORM.country,
            VendorORM.registrar_country,
            func.count(func.distinct(VendorORM.domain)),
            func.count(func.distinct(ExpoORM.expo_id)),
        )
        .join(ExpoVendorORM, ExpoVendorORM.expo_id == ExpoORM.expo_id)
        .join(VendorORM, VendorORM.domain == ExpoVendorORM.vendor_domain)
        .where(ExpoORM.country.isnot(None))
        .where(ExpoORM.country != "")
        .where(VendorORM.registrar_country.isnot(None))
        .where(VendorORM.registrar_country != "")
        .where(ExpoORM.country != VendorORM.registrar_country)
        .group_by(ExpoORM.country, VendorORM.registrar_country)
        .order_by(desc(func.count(func.distinct(VendorORM.domain))))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "from_country": r[0],
            "to_country": r[1],
            "vendor_count": int(r[2]),
            "expo_count": int(r[3]),
        }
        for r in rows
    ]


async def country_detail(session: AsyncSession, *, country: str) -> dict[str, Any]:
    """Detail for one country: counts, top expos, top vendors.

    Powers the world-map side panel. Country is matched by the messy
    `expos.country` column verbatim — caller is expected to send the canonical
    name as stored in the DB (the frontend country_resolver already maps
    aliases to a canonical form).
    """
    expo_stmt = (
        select(ExpoORM)
        .where(ExpoORM.country == country)
        .order_by(desc(ExpoORM.discovered_at))
        .limit(5)
    )
    top_expos_orm = list((await session.execute(expo_stmt)).scalars().all())

    expo_count_stmt = select(func.count()).select_from(ExpoORM).where(ExpoORM.country == country)
    expo_count = int((await session.execute(expo_count_stmt)).scalar_one())

    vendor_stmt = (
        select(VendorORM)
        .join(ExpoVendorORM, ExpoVendorORM.vendor_domain == VendorORM.domain)
        .join(ExpoORM, ExpoORM.expo_id == ExpoVendorORM.expo_id)
        .where(ExpoORM.country == country)
        .order_by(desc(VendorORM.confidence_score))
        .limit(3)
    )
    top_vendors_orm = list((await session.execute(vendor_stmt)).scalars().all())

    vendor_count_stmt = (
        select(func.count(func.distinct(ExpoVendorORM.vendor_domain)))
        .select_from(ExpoVendorORM)
        .join(ExpoORM, ExpoORM.expo_id == ExpoVendorORM.expo_id)
        .where(ExpoORM.country == country)
    )
    vendor_count = int((await session.execute(vendor_count_stmt)).scalar_one())

    return {
        "country": country,
        "expo_count": expo_count,
        "vendor_count": vendor_count,
        "top_expos": [
            {
                "expo_id": e.expo_id,
                "name": e.name,
                "start_date": e.start_date.isoformat() if e.start_date else None,
                "location": e.location,
            }
            for e in top_expos_orm
        ],
        "top_vendors": [
            {
                "domain": v.domain,
                "company_name": v.company_name,
                "industries": list(v.industries or [])[:3],
                "confidence_score": float(v.confidence_score or 0),
            }
            for v in top_vendors_orm
        ],
    }
