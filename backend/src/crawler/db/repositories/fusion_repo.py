"""CRUD buat FusionORM dan FusionEmailDraftORM, plus helper kandidat vendor."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import FusionEmailDraftORM, FusionORM, VendorORM


async def create(
    session: AsyncSession,
    *,
    fusion: FusionORM,
    drafts: list[FusionEmailDraftORM],
) -> FusionORM:
    session.add(fusion)
    for d in drafts:
        d.fusion_id = fusion.fusion_id
        session.add(d)
    await session.flush()
    await session.refresh(fusion)
    return fusion


async def get_by_id(session: AsyncSession, fusion_id: str) -> FusionORM | None:
    res = await session.execute(select(FusionORM).where(FusionORM.fusion_id == fusion_id))
    return res.scalar_one_or_none()


async def list_paginated(
    session: AsyncSession, *, limit: int = 20, offset: int = 0
) -> list[FusionORM]:
    res = await session.execute(
        select(FusionORM).order_by(desc(FusionORM.created_at)).limit(limit).offset(offset)
    )
    return list(res.scalars().all())


async def mark_email_copied(session: AsyncSession, email_id: int) -> bool:
    existing = await session.get(FusionEmailDraftORM, email_id)
    if existing is None:
        return False
    existing.copied_at = datetime.now(timezone.utc)
    await session.flush()
    return True


async def vendors_with_verified_email(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
) -> list[VendorORM]:
    """Filter vendor yang punya minimal 1 contact dengan type='email' dan verified=true.

    Pake JSONB containment di Postgres. Buat SQLite (test fixture), pake fallback
    yang ngambil semua row terus filter di Python (slow tapi ok buat test).
    """
    dialect = session.get_bind().dialect.name if session.get_bind() else "postgresql"

    if dialect == "postgresql":
        stmt = select(VendorORM).where(
            text("contacts @> '[{\"type\": \"email\", \"verified\": true}]'::jsonb")
        )
        if search:
            like = f"%{search.lower()}%"
            stmt = stmt.where(VendorORM.company_name.ilike(like))
        stmt = stmt.order_by(desc(VendorORM.confidence_score)).limit(limit).offset(offset)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    # SQLite fallback (test only): ambil semua, filter di Python.
    stmt = select(VendorORM)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(VendorORM.company_name.ilike(like))
    stmt = stmt.order_by(desc(VendorORM.confidence_score))
    res = await session.execute(stmt)
    rows = list(res.scalars().all())
    filtered = [
        v for v in rows
        if any(
            isinstance(c, dict) and c.get("type") == "email" and c.get("verified")
            for c in (v.contacts or [])
        )
    ]
    return filtered[offset:offset + limit]


async def vendors_for_fusion(
    session: AsyncSession,
    *,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
    industries: list[str] | None = None,
    only_with_products: bool = True,
    only_with_email: bool = False,
) -> tuple[list[VendorORM], int]:
    """Kandidat fusion siap pakai. Default: vendor status='enriched' + minimal
    1 produk (entah di legacy `products` array atau `products_detailed` JSONB).

    Industries filter pake JSONB ?| operator (any-of). Search ilike di
    company_name. Email filter opsional pake JSONB contains.
    Return tuple (rows, total_count) supaya frontend bisa tampilin has_more.
    """
    dialect = session.get_bind().dialect.name if session.get_bind() else "postgresql"

    if dialect == "postgresql":
        base = select(VendorORM)
        conds = []

        if only_with_products:
            conds.append(VendorORM.status == "enriched")
            conds.append(
                or_(
                    func.jsonb_array_length(VendorORM.products) > 0,
                    func.jsonb_array_length(VendorORM.products_detailed) > 0,
                )
            )

        if only_with_email:
            conds.append(
                text("contacts @> '[{\"type\": \"email\", \"verified\": true}]'::jsonb")
            )

        if industries:
            keys_literal = ", ".join(f"'{i.replace(chr(39), chr(39) * 2)}'" for i in industries)
            conds.append(
                text(f"industries ?| array[{keys_literal}]")
            )

        if search:
            like = f"%{search.lower()}%"
            conds.append(VendorORM.company_name.ilike(like))

        for c in conds:
            base = base.where(c)

        total_stmt = select(func.count()).select_from(base.subquery())
        total_res = await session.execute(total_stmt)
        total = int(total_res.scalar_one() or 0)

        rows_stmt = base.order_by(desc(VendorORM.confidence_score)).limit(limit).offset(offset)
        rows_res = await session.execute(rows_stmt)
        rows = list(rows_res.scalars().all())
        return rows, total

    stmt = select(VendorORM)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(VendorORM.company_name.ilike(like))
    stmt = stmt.order_by(desc(VendorORM.confidence_score))
    res = await session.execute(stmt)
    all_rows = list(res.scalars().all())

    def _ok(v: VendorORM) -> bool:
        if only_with_products:
            if v.status != "enriched":
                return False
            has_p = bool(v.products) or bool(v.products_detailed)
            if not has_p:
                return False
        if only_with_email:
            has_e = any(
                isinstance(c, dict) and c.get("type") == "email" and c.get("verified")
                for c in (v.contacts or [])
            )
            if not has_e:
                return False
        if industries:
            row_set = set(v.industries or [])
            if not row_set.intersection(industries):
                return False
        return True

    filtered = [v for v in all_rows if _ok(v)]
    total = len(filtered)
    return filtered[offset:offset + limit], total


async def candidate_industries_facet(
    session: AsyncSession,
    *,
    only_with_products: bool = True,
    only_with_email: bool = False,
) -> list[tuple[str, int]]:
    """Daftar industries unik dari pool fusion candidate, plus count per industry.
    Buat dipakai sebagai chip filter di UI tanpa harus load semua vendor dulu.
    """
    dialect = session.get_bind().dialect.name if session.get_bind() else "postgresql"

    if dialect == "postgresql":
        where_parts = []
        if only_with_products:
            where_parts.append("status = 'enriched'")
            where_parts.append(
                "(jsonb_array_length(products) > 0 OR jsonb_array_length(products_detailed) > 0)"
            )
        if only_with_email:
            where_parts.append(
                "contacts @> '[{\"type\": \"email\", \"verified\": true}]'::jsonb"
            )
        where_sql = "WHERE " + " AND ".join(where_parts) if where_parts else ""
        sql = text(
            f"""
            SELECT ind AS name, COUNT(*) AS n
            FROM vendors, jsonb_array_elements_text(industries) AS ind
            {where_sql}
            GROUP BY ind
            ORDER BY n DESC, ind ASC
            LIMIT 200
            """
        )
        res = await session.execute(sql)
        return [(str(row[0]), int(row[1])) for row in res.fetchall()]

    rows, _ = await vendors_for_fusion(
        session,
        limit=10000,
        offset=0,
        only_with_products=only_with_products,
        only_with_email=only_with_email,
    )
    counts: dict[str, int] = {}
    for v in rows:
        for ind in v.industries or []:
            k = (ind or "").strip()
            if not k:
                continue
            counts[k] = counts.get(k, 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
