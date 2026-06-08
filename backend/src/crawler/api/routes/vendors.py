from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.repositories import vendor_email_draft_repo, vendor_repo
from ...observability.logger import get_logger
from ..deps import get_db

_log = get_logger(__name__)
router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("")
async def list_vendors(
    industry: str | None = None,
    country: str | None = None,
    search: str | None = None,
    status: str | None = None,
    limit: int = Query(250, ge=1, le=250),
    offset: int = Query(0, ge=0),
    sort: str = Query("effective_scope:desc"),
    include_hidden: bool = Query(False),
    session: AsyncSession = Depends(get_db),
) -> dict:
    items, total = await vendor_repo.list_paginated(
        session,
        industry=industry,
        country=country,
        search=search,
        status=status,
        limit=limit,
        offset=offset,
        sort=sort,
        include_hidden=include_hidden,
    )
    return {
        "items": [vendor_repo.orm_to_dict(v) for v in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/search/semantic")
async def search_semantic(
    q: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(20, ge=1, le=50),
    country: str | None = None,
    include_hidden: bool = Query(False),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Semantic search via ChromaDB `vendor_specialty` collection.

    Snowglobe 2026-05-25 reranking: pull a wider Chroma candidate pool
    (limit × 4) sorted by similarity, then ALWAYS re-rank by
    scope_match_score DESC (military scope wins) with similarity as the
    tiebreaker. Highest-scope vendor is always page 1 row 1.

    Lexical fallback (degraded mode) kicks in when the embedding backend
    is unreachable OR when Chroma returns zero — keeps the user from
    seeing an empty screen and routes through `list_paginated` which is
    already sorted by scope DESC.
    """
    from ...store.specialty_index import EmbeddingUnavailable, search_by_specialty

    mode = "semantic"
    degraded = False
    items: list[dict] = []
    # Over-fetch Chroma agresif. Banyak vendor punya doc sparse (cuma
    # `company: <name>`) jadi top-cosine sering hit off-scope vendor yang
    # kebetulan namanya mirip query. Re-rank by scope DESC butuh kandidat
    # luas biar high-scope vendor (SAAB, ROKETSAN) ter-include sebelum
    # hidden filter buang sebagian besar. Ceiling 1000 = bounded latency
    # tapi kasih recall yang serius.
    candidate_n = min(1000, max(limit * 50, 200)) if not include_hidden else min(200, max(limit * 4, 40))
    try:
        hits = await search_by_specialty(
            q, n_results=candidate_n, country_filter=country,
            include_hidden=include_hidden,
        )
    except EmbeddingUnavailable as e:
        _log.info(
            "vendors.search_semantic_degraded",
            error=str(e)[:160],
            query=q[:80],
        )
        mode = "lexical"
        degraded = True
        hits = []

    if hits:
        ids = [h["vendor_id"] for h in hits]
        by_id = await vendor_repo.get_many_by_ids(session, ids)
        for h in hits:
            orm = by_id.get(h["vendor_id"])
            if orm is None:
                continue
            # Honor snowglobe hide flag — off_scope vendors shouldn't
            # surface even when query happens to embed near them. Operator
            # can override with ?include_hidden=true for full-catalog search.
            if not include_hidden and getattr(orm, "hidden", False):
                continue
            row = vendor_repo.orm_to_dict(orm)
            row["similarity"] = h.get("similarity")
            items.append(row)
        # Re-rank: effective_scope first (scope discounted by completeness so
        # zero-data 100%-keyword vendors stop dominating), similarity as
        # tiebreaker, company_name as final stable sort. effective_scope
        # mirrors Vendor.effective_scope @computed_field — recompute here on
        # the ORM dict since pydantic computed fields don't carry through
        # the dict serializer used in this route.
        for r in items:
            sms = float(r.get("scope_match_score") or 0.0)
            ec = float(r.get("enrichment_completeness") or 0.0)
            r["effective_scope"] = round(sms * (0.4 + 0.6 * ec), 3)
        items.sort(
            key=lambda r: (
                -(float(r.get("effective_scope") or 0.0)),
                -(float(r.get("scope_match_score") or 0.0)),
                -(float(r.get("similarity") or 0.0)),
                (r.get("company_name") or "").lower(),
            )
        )
        # Dedup duplicates yang muncul karena multiple vendor record
        # share nama+domain. Prefer enriched + ada domain + scope tertinggi.
        # Key = (lowercase name, lowercase domain trimmed). Pertama yang
        # masuk wins (sudah disort scope-first).
        best_per_key: dict[tuple[str, str], dict] = {}
        for row in items:
            name = (row.get("company_name") or "").strip().lower()
            dom = (row.get("domain") or "").strip().lower().lstrip("www.")
            key = (name, dom)
            if key in best_per_key:
                continue
            best_per_key[key] = row
        # Second pass: collapse rows yang sama nama tapi salah satu kosong
        # domain. Prefer yang ada domain.
        seen_names: dict[str, dict] = {}
        deduped: list[dict] = []
        for row in best_per_key.values():
            name = (row.get("company_name") or "").strip().lower()
            existing = seen_names.get(name)
            if existing is None:
                seen_names[name] = row
                deduped.append(row)
                continue
            # Same name — prefer the one with a real domain
            if not existing.get("domain") and row.get("domain"):
                deduped[deduped.index(existing)] = row
                seen_names[name] = row
        items = deduped[:limit]

    if degraded or not items:
        # Lexical fallback covers two cases. (a) embed backend down,
        # (b) embed worked but Chroma returned zero (e.g. collection
        # not yet backfilled). LIKE path on company_name + domain keeps
        # the user from seeing an empty screen — list_paginated already
        # sorts by scope_match_score DESC by default.
        if not items:
            mode = "lexical" if degraded else "semantic_empty_fallback"
        lex_rows, _ = await vendor_repo.list_paginated(
            session, search=q, limit=limit, offset=0,
        )
        for orm in lex_rows:
            row = vendor_repo.orm_to_dict(orm)
            row["similarity"] = None
            items.append(row)
        # Dedup by vendor_id, preserving order (semantic-reranked first,
        # lexical second so anything semantic missed still surfaces).
        seen: set[str] = set()
        deduped: list[dict] = []
        for row in items:
            vid = row.get("vendor_id")
            if vid in seen:
                continue
            seen.add(vid)
            deduped.append(row)
        items = deduped[:limit]

    return {
        "items": items,
        "mode": mode,
        "degraded": degraded,
        "query": q,
        "limit": limit,
    }


@router.get("/{vendor_id}")
async def get_vendor(vendor_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Lookup by vendor_id UUID first, fall back to domain for backwards compat."""
    orm = await vendor_repo.get_by_vendor_id(session, vendor_id)
    if orm is None:
        orm = await vendor_repo.get_by_domain(session, vendor_id)
    if orm is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    return vendor_repo.orm_to_dict(orm)


@router.post("/{vendor_id}/deepen", status_code=202)
async def deepen_vendor(vendor_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Trigger a single-vendor re-enrichment in the background.

    Picks up from current state: if domain is set, re-runs enricher to refresh
    description, tagline, contacts, completeness. If domain is null (unresolved),
    re-runs name resolver first, then enricher. Persists in-place.
    """
    orm = await vendor_repo.get_by_vendor_id(session, vendor_id)
    if orm is None:
        orm = await vendor_repo.get_by_domain(session, vendor_id)
    if orm is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")

    snapshot = vendor_repo.orm_to_dict(orm)
    asyncio.create_task(_deepen_task(snapshot))
    return {
        "status": "scheduled",
        "vendor_id": snapshot.get("vendor_id"),
        "domain": snapshot.get("domain"),
        "current_status": snapshot.get("status"),
        "current_score": snapshot.get("confidence_score"),
    }


@router.post("/{vendor_id}/deepen-products", status_code=202)
async def deepen_vendor_products(
    vendor_id: str, session: AsyncSession = Depends(get_db)
) -> dict:
    """Phase 5 — enqueue this vendor for product-catalog enrichment.
    Idempotent (queue claim guard prevents duplicate work)."""
    orm = await vendor_repo.get_by_vendor_id(session, vendor_id)
    if orm is None:
        orm = await vendor_repo.get_by_domain(session, vendor_id)
    if orm is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")

    try:
        from agentic_crawler import product_backfill_queue

        entry_id = await product_backfill_queue.publish_vendor(
            orm.vendor_id, source="operator_deepen"
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"Backfill queue unavailable: {str(e)[:120]}",
        )
    if entry_id is None:
        raise HTTPException(
            status_code=503, detail="Backfill queue unreachable",
        )
    return {
        "status": "queued",
        "vendor_id": orm.vendor_id,
        "queue_entry_id": entry_id,
        "has_legacy_products": bool(orm.products),
    }


async def _deepen_task(snapshot: dict) -> None:
    """Run resolve (if needed) + enrich + persist for one vendor row."""
    try:
        from ...agents import enricher as enricher_agent
        from ...agents import name_resolver as name_resolver_agent
        from ...agents import reporter as reporter_agent
        from ...schemas import VendorURL

        domain = snapshot.get("domain")
        canonical = snapshot.get("canonical_url")
        company = snapshot.get("company_name") or ""
        expos_seen = snapshot.get("expos_seen") or []
        first_expo = expos_seen[0] if expos_seen else ""

        if not domain or not canonical:
            resolved = await name_resolver_agent.resolve_from_name(
                company,
                expo_id=first_expo or "",
                context_snippet=snapshot.get("description") or None,
            )
            if resolved is None:
                _log.info("vendors.deepen_unresolved", vendor_id=snapshot.get("vendor_id"))
                return
            vurl = resolved
        else:
            vurl = VendorURL(
                domain=domain,
                canonical_url=canonical,
                resolved_from=None,
                expo_id=first_expo or "",
                exhibitor_name=company,
                resolution_method="manual",
                confidence=1.0,
            )

        vendor = await enricher_agent.enrich_vendor(vurl)
        if vendor is None:
            _log.info("vendors.deepen_enrich_none", domain=vurl.domain)
            return

        # Preserve identity + lineage from the existing row
        vendor.vendor_id = snapshot.get("vendor_id") or vendor.vendor_id
        merged_expos = list(dict.fromkeys((expos_seen or []) + (vendor.expos_seen or [])))
        vendor.expos_seen = merged_expos
        vendor.status = "enriched"

        persisted, reason = await reporter_agent.persist_vendor(vendor)
        _log.info(
            "vendors.deepen_done",
            vendor_id=snapshot.get("vendor_id"),
            domain=vendor.domain,
            persisted=persisted,
            reason=reason,
            score=vendor.confidence_score,
        )
    except Exception as e:  # noqa: BLE001
        _log.warning("vendors.deepen_failed", vendor_id=snapshot.get("vendor_id"), error=str(e)[:200])


# ---------------------------------------------------------------------- #
# Email draft - industrial outreach invitation                            #
# ---------------------------------------------------------------------- #

Language = Literal["en", "id"]


class _DraftRequest(BaseModel):
    language: Language = Field(default="en")
    our_context: str | None = Field(
        default=None,
        description="Optional override for the operator's project blurb. "
                    "Default uses a sensible industrial-consortium intro.",
    )


class _DraftEditRequest(BaseModel):
    subject: str = Field(..., max_length=500)
    body: str = Field(..., min_length=1)


async def _resolve_vendor_orm(session: AsyncSession, vendor_id: str):
    orm = await vendor_repo.get_by_vendor_id(session, vendor_id)
    if orm is None:
        orm = await vendor_repo.get_by_domain(session, vendor_id)
    if orm is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    return orm


@router.get("/{vendor_id}/email-draft")
async def get_email_draft(
    vendor_id: str,
    language: Language = Query("en"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Return the saved draft (if any) for this vendor + language.

    Returns 200 with a draft payload, or 200 with `{exists: false}` when
    nothing has been generated yet. Lets the frontend skip a 404 round-trip.
    """
    orm_vendor = await _resolve_vendor_orm(session, vendor_id)
    draft = await vendor_email_draft_repo.get_draft(
        session, vendor_id=orm_vendor.vendor_id, language=language
    )
    if draft is None:
        return {"exists": False, "vendor_id": orm_vendor.vendor_id, "language": language}
    return {"exists": True, **vendor_email_draft_repo.orm_to_dict(draft)}


@router.get("/{vendor_id}/email-drafts")
async def list_email_drafts(
    vendor_id: str,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """List all saved drafts for this vendor across all languages."""
    orm_vendor = await _resolve_vendor_orm(session, vendor_id)
    drafts = await vendor_email_draft_repo.list_for_vendor(
        session, vendor_id=orm_vendor.vendor_id
    )
    return {
        "vendor_id": orm_vendor.vendor_id,
        "items": [vendor_email_draft_repo.orm_to_dict(d) for d in drafts],
    }


@router.post("/{vendor_id}/email-draft/generate")
async def generate_email_draft(
    vendor_id: str,
    payload: _DraftRequest = Body(default_factory=_DraftRequest),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Generate (or regenerate) an industrial-invitation email draft via
    the LLM agent and persist it. Replaces any existing draft for the
    same (vendor_id, language). Returns the saved draft."""
    from ...agents import vendor_outreach
    from ...config import get_settings

    orm_vendor = await _resolve_vendor_orm(session, vendor_id)
    snapshot = vendor_repo.orm_to_dict(orm_vendor)

    try:
        result = await vendor_outreach.draft_vendor_email(
            vendor=snapshot,
            language=payload.language,
            our_context=payload.our_context,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"LLM draft generation failed: {str(e)[:160]}",
        )

    settings = get_settings()
    model_used = (
        settings.openai_model_heavy
        if hasattr(settings, "openai_model_heavy")
        else None
    )

    saved = await vendor_email_draft_repo.upsert(
        session,
        vendor_id=orm_vendor.vendor_id,
        language=payload.language,
        subject=result.subject,
        body=result.body,
        model_used=model_used,
        edited_manually=False,
    )
    await session.commit()
    return vendor_email_draft_repo.orm_to_dict(saved)


@router.put("/{vendor_id}/email-draft")
async def save_email_draft_manual(
    vendor_id: str,
    payload: _DraftEditRequest,
    language: Language = Query("en"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Persist operator's manual edits to an existing draft (or create
    fresh from scratch). Marks ``edited_manually=true`` so the UI can
    show a "manually edited" indicator."""
    orm_vendor = await _resolve_vendor_orm(session, vendor_id)
    saved = await vendor_email_draft_repo.upsert(
        session,
        vendor_id=orm_vendor.vendor_id,
        language=language,
        subject=payload.subject,
        body=payload.body,
        model_used=None,
        edited_manually=True,
    )
    await session.commit()
    return vendor_email_draft_repo.orm_to_dict(saved)


# ---------------------------------------------------------------------- #
# Dossier content - structured payload for frontend pdf-lib renderer      #
# ---------------------------------------------------------------------- #


@router.post("/{vendor_id}/dossier-content")
async def generate_dossier_content_endpoint(
    vendor_id: str,
    language: Language = Query("id"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Generate structured content for the vendor PDF dossier.

    Returns: title, subtitle, overview, sections[], pros_cons, mermaid_diagram,
    closing_note. The frontend assembles this into the actual PDF using
    pdf-lib + mermaid.

    No DB persistence — this is a stateless generation endpoint, called
    on-demand when the operator clicks "Download Vendor PDF". Cheap to
    re-run; no need to cache.
    """
    from ...agents import vendor_outreach

    orm_vendor = await _resolve_vendor_orm(session, vendor_id)
    snapshot = vendor_repo.orm_to_dict(orm_vendor)

    try:
        content = await vendor_outreach.generate_dossier_content(
            vendor=snapshot,
            language=language,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"LLM dossier generation failed: {str(e)[:160]}",
        )

    return {
        "vendor_id": orm_vendor.vendor_id,
        "language": language,
        "content": content.model_dump(),
        "vendor_meta": {
            "company_name": snapshot.get("company_name"),
            "domain": snapshot.get("domain"),
            "country": snapshot.get("registrar_country"),
            "industries": snapshot.get("industries") or [],
            "domain_of_interest": snapshot.get("domain_of_interest") or [],
            "overall_scope_score": snapshot.get("overall_scope_score"),
            "products_detailed": snapshot.get("products_detailed") or [],
        },
    }
