"""Routes Labs (Fusion Vendor). Mounted at /api/labs."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from ...agents.fusion import draft_email, generate_artifacts, suggest_fusions
from ...config import get_settings
from ...db.models import FusionEmailDraftORM, FusionORM, VendorORM
from ...db.repositories import fusion_repo
from ...db.repositories.vendor_repo import orm_to_dict
from ...db.session import get_session
from ...observability.logger import get_logger
from ...observability.metrics import (
    fusion_created_total,
    fusion_emails_copied_total,
    fusion_emails_drafted_total,
)
from ...schemas import (
    FusionCreateRequest,
    FusionEmailDraftRead,
    FusionListItem,
    FusionRead,
    FusionSuggestRequest,
    Vendor,
)
from ...tools.fusion.svg_composer import render_composite

_log = get_logger(__name__)

router = APIRouter(prefix="/labs", tags=["labs"])


def _orm_to_vendor(v: VendorORM) -> Vendor:
    return Vendor.model_validate(orm_to_dict(v))


def _has_verified_email(v: VendorORM) -> str | None:
    for c in v.contacts or []:
        if isinstance(c, dict) and c.get("type") == "email" and c.get("verified"):
            value = c.get("value")
            if isinstance(value, str) and value:
                return value
    return None


@router.get("/candidates")
async def list_candidates(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    only_with_email: bool = False,
    only_with_products: bool = True,
    industries: list[str] | None = Query(None),
) -> dict:
    async with get_session() as session:
        rows, total = await fusion_repo.vendors_for_fusion(
            session,
            limit=limit,
            offset=offset,
            search=search,
            industries=industries,
            only_with_products=only_with_products,
            only_with_email=only_with_email,
        )

    items = []
    for v in rows:
        email = _has_verified_email(v)
        products_count = len(v.products or []) + len(v.products_detailed or [])
        items.append({
            "vendor_id": v.vendor_id,
            "company_name": v.company_name,
            "domain": v.domain,
            "logo_url": v.logo_url,
            "industries": v.industries or [],
            "description": (v.description or "")[:300],
            "has_verified_email": email is not None,
            "primary_email": email,
            "confidence_score": v.confidence_score,
            "products_count": products_count,
            "has_products": products_count > 0,
        })
    has_more = (offset + len(items)) < total
    return {
        "items": items,
        "limit": limit,
        "offset": offset,
        "total": total,
        "has_more": has_more,
    }


@router.get("/candidate-industries")
async def list_candidate_industries(
    only_with_products: bool = True,
    only_with_email: bool = False,
) -> dict:
    async with get_session() as session:
        facets = await fusion_repo.candidate_industries_facet(
            session,
            only_with_products=only_with_products,
            only_with_email=only_with_email,
        )
    return {
        "items": [{"name": name, "count": n} for name, n in facets],
    }


@router.post("/suggestions")
async def post_suggestions(req: FusionSuggestRequest) -> dict:
    async with get_session() as session:
        if req.candidate_vendor_ids:
            stmt = select(VendorORM).where(VendorORM.vendor_id.in_(req.candidate_vendor_ids))
            res = await session.execute(stmt)
            vendors_orm = list(res.scalars().all())
        else:
            vendors_orm = await fusion_repo.vendors_with_verified_email(session, limit=30)

    candidates = [_orm_to_vendor(v) for v in vendors_orm]
    suggestions = await suggest_fusions(candidates, k=5)
    return {"suggestions": [s.model_dump() for s in suggestions]}


@router.post("/fusions", response_model=FusionRead)
async def create_fusion(req: FusionCreateRequest) -> FusionRead:
    if len(req.vendor_ids) < 2:
        raise HTTPException(400, "Minimal 2 vendor")

    async with get_session() as session:
        stmt = select(VendorORM).where(VendorORM.vendor_id.in_(req.vendor_ids))
        res = await session.execute(stmt)
        vendors_orm = list(res.scalars().all())

    if len(vendors_orm) != len(req.vendor_ids):
        raise HTTPException(404, "Salah satu vendor ga ketemu")

    # Note: previously rejected fusions when any vendor lacked a verified
    # email. Now allowed — agentic-enriched vendors emit emails without
    # explicit verification flags, and operators want to draft outreach
    # even for partial-data vendors. Caller can still inspect missing
    # emails via the candidates API and warn in UI before pressing
    # Combine.
    vendors = [_orm_to_vendor(v) for v in vendors_orm]

    artifacts = await generate_artifacts(vendors, hint=req.hint)

    fusion_id = str(uuid.uuid4())

    # 2026-05-21: switch fusion identity image from server-side SVG composer
    # to DiceBear shapes API. User feedback: composer SVG looks like
    # photo-collage thumbnail, DiceBear matches the rest of the brand
    # (vendor cards in Labs already use DiceBear via GeoAvatar). Seed by
    # fusion_id so the same fusion always renders the same shape.
    from urllib.parse import quote as _q

    image_url = (
        "https://api.dicebear.com/9.x/shapes/svg?"
        f"seed={_q(fusion_id)}"
        "&backgroundType=gradientLinear"
        "&backgroundColor=b8893a,9a6f26,d4a250"
        "&shape1Color=ffffff,faf6ee,ebe4d7"
        "&shape2Color=09090b,3f3f46,c81212"
        "&shape3Color=f25f4c,38bdf8,9a6f26"
        "&radius=22"
    )

    # Keep composer-generated SVG as legacy archive (in case operator wants
    # to inspect what the agent saw). Best-effort; don't block fusion on it.
    try:
        source_logos = [(v.company_name, str(v.logo_url) if v.logo_url else None) for v in vendors]
        await render_composite(
            fusion_id,
            name=artifacts.name,
            tagline=artifacts.tagline,
            source_logos=source_logos,
        )
    except Exception as _e:  # noqa: BLE001
        _log.debug("labs.composite_archive_skip", error=str(_e)[:120])

    draft_results = await asyncio.gather(
        *(
            draft_email(
                fusion_name=artifacts.name,
                fusion_description=artifacts.description,
                vendor=v,
                to_email=_has_verified_email(vo) or "",
            )
            for v, vo in zip(vendors, vendors_orm)
        ),
        return_exceptions=True,
    )

    fusion = FusionORM(
        fusion_id=fusion_id,
        name=artifacts.name,
        tagline=artifacts.tagline,
        description=artifacts.description,
        image_url=image_url,
        source_vendor_ids=req.vendor_ids,
        industries=artifacts.industries,
        tags=artifacts.tags,
        rationale=artifacts.rationale,
        status="draft",
        llm_provider=get_settings().llm_provider,
    )

    drafts: list[FusionEmailDraftORM] = []
    for v, vo, dr in zip(vendors, vendors_orm, draft_results):
        email_addr = _has_verified_email(vo)
        if email_addr is None:
            continue
        if isinstance(dr, BaseException):
            fusion_emails_drafted_total.labels(status="error").inc()
            _log.warning("labs.draft_email_failed", vendor_id=v.vendor_id, error=str(dr))
            continue
        drafts.append(FusionEmailDraftORM(
            vendor_id=v.vendor_id,
            to_email=email_addr,
            subject=dr.subject,
            body=dr.body,
        ))
        fusion_emails_drafted_total.labels(status="ok").inc()

    async with get_session() as session:
        await fusion_repo.create(session, fusion=fusion, drafts=drafts)

    async with get_session() as session:
        fusion_full = await fusion_repo.get_by_id(session, fusion_id)
        if fusion_full is None:
            raise HTTPException(500, "Fusion gagal dipersist")
        stmt = select(VendorORM).where(VendorORM.vendor_id.in_(fusion_full.source_vendor_ids or []))
        res = await session.execute(stmt)
        source_vendors_orm = list(res.scalars().all())

    fusion_created_total.inc()
    return _to_fusion_read(fusion_full, source_vendors_orm)


@router.get("/fusions")
async def list_fusions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
    async with get_session() as session:
        rows = await fusion_repo.list_paginated(session, limit=limit, offset=offset)
    items = [
        FusionListItem(
            fusion_id=f.fusion_id,
            created_at=f.created_at,
            name=f.name,
            tagline=f.tagline,
            image_url=f.image_url,
            source_vendor_count=len(f.source_vendor_ids or []),
            industries=f.industries or [],
            status=f.status,
        ).model_dump()
        for f in rows
    ]
    return {"items": items, "limit": limit, "offset": offset}


@router.get("/fusions/{fusion_id}", response_model=FusionRead)
async def get_fusion(fusion_id: str) -> FusionRead:
    async with get_session() as session:
        f = await fusion_repo.get_by_id(session, fusion_id)
        if not f:
            raise HTTPException(404, "Fusion ga ketemu")
        stmt = select(VendorORM).where(VendorORM.vendor_id.in_(f.source_vendor_ids or []))
        res = await session.execute(stmt)
        vendors_orm = list(res.scalars().all())
    return _to_fusion_read(f, vendors_orm)


@router.post("/fusions/{fusion_id}/emails/{email_id}/mark-copied")
async def mark_copied(fusion_id: str, email_id: int) -> dict:
    async with get_session() as session:
        ok = await fusion_repo.mark_email_copied(session, email_id)
    if ok:
        fusion_emails_copied_total.inc()
    return {"ok": ok}


def _to_fusion_read(f: FusionORM, vendors_orm: list[VendorORM]) -> FusionRead:
    vendor_lookup = {v.vendor_id: v for v in vendors_orm}
    drafts = []
    for d in (f.drafts or []):
        vendor_match = vendor_lookup.get(d.vendor_id)
        drafts.append(
            FusionEmailDraftRead(
                id=d.id,
                vendor_id=d.vendor_id,
                vendor_name=vendor_match.company_name if vendor_match else None,
                to_email=d.to_email,
                subject=d.subject,
                body=d.body,
                created_at=d.created_at,
                copied_at=d.copied_at,
            )
        )
    source_vendors = [
        {
            "vendor_id": v.vendor_id,
            "company_name": v.company_name,
            "domain": v.domain,
            "logo_url": v.logo_url,
            "industries": v.industries or [],
        }
        for v in vendors_orm
    ]
    return FusionRead(
        fusion_id=f.fusion_id,
        created_at=f.created_at,
        name=f.name,
        tagline=f.tagline,
        description=f.description,
        image_url=f.image_url,
        source_vendor_ids=f.source_vendor_ids or [],
        source_vendors=source_vendors,
        industries=f.industries or [],
        tags=f.tags or [],
        rationale=f.rationale,
        status=f.status,
        drafts=drafts,
    )
