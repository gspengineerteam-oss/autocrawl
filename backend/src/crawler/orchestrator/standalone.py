"""Standalone resolve+enrich+persist for a single ExhibitorRef.

Used by the reprocess-pdfs CLI and by /api/exhibitor-refs/{id}/retry-resolve.
Does NOT require LangGraph state. Updates exhibitor_refs lifecycle status
identically to the in-graph workers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import AnyHttpUrl

from ..agents import dedup as dedup_agent
from ..agents import enricher as enricher_agent
from ..agents import name_resolver as name_resolver_agent
from ..agents import reporter as reporter_agent
from ..agents import resolver as resolver_agent
from ..db.engine import get_sessionmaker
from ..db.repositories import exhibitor_ref_repo
from ..observability.logger import get_logger
from ..schemas import ExhibitorRef, SourceProvenance

_log = get_logger(__name__)


RefOutcomeStatus = Literal[
    "enriched",
    "dedup_skipped",
    "resolve_failed",
    "enrich_failed",
    "validation_rejected",
    "scope_rejected",
    "error",
]


@dataclass
class RefOutcome:
    status: RefOutcomeStatus
    domain: str | None = None
    failure_category: str | None = None
    failure_reason: str | None = None


def _classify_resolve_failure(ref: ExhibitorRef, err_str: str | None) -> str:
    if err_str:
        e = err_str.lower()
        if "timeout" in e or "timed out" in e:
            return "scrape_failed"
        if "dns" in e or "no such host" in e or "nodename" in e:
            return "dns_invalid"
        if "no candidates" in e or "no matches" in e:
            return "no_url_no_match"
    if ref.raw_url is None:
        return "no_url_no_match"
    return "unknown"


async def _update_status(
    ref: ExhibitorRef,
    *,
    status: str,
    failure_category: str | None = None,
    failure_reason: str | None = None,
    resolved_domain: str | None = None,
    ref_id: str | None = None,
) -> None:
    """Update lifecycle status. Prefer ref_id (PK) when available — natural-key
    lookup can miss because AnyHttpUrl normalizes the raw_url string when round-tripping.
    """
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            try:
                if ref_id is not None:
                    await exhibitor_ref_repo.update_status_by_id(
                        session,
                        ref_id,
                        status=status,
                        failure_category=failure_category,
                        failure_reason=failure_reason,
                        resolved_domain=resolved_domain,
                        increment_attempts=True,
                    )
                else:
                    await exhibitor_ref_repo.update_status_by_natural_key(
                        session,
                        expo_id=ref.expo_id,
                        name=ref.name,
                        raw_url=ref.raw_url,
                        status=status,
                        failure_category=failure_category,
                        failure_reason=failure_reason,
                        resolved_domain=resolved_domain,
                        increment_attempts=True,
                    )
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    except Exception as e:  # noqa: BLE001
        _log.debug("standalone.status_update_failed", name=ref.name[:80], error=str(e)[:200])


async def process_ref(
    ref: ExhibitorRef, *, run_id: str | None = None, ref_id: str | None = None
) -> RefOutcome:
    """Resolve → enrich → persist a single ref. Best-effort. Updates audit table.

    When called from the retry path (process_ref_by_id), pass ref_id so status
    updates use the primary key — natural-key lookup misses if AnyHttpUrl
    normalized the raw_url string differently between persist and retry.
    """
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            try:
                await exhibitor_ref_repo.upsert(session, ref, status="extracted", run_id=run_id)
                await session.commit()
            except Exception:
                await session.rollback()
    except Exception as e:  # noqa: BLE001
        _log.debug("standalone.upsert_failed", name=ref.name[:80], error=str(e)[:200])

    last_err: str | None = None
    try:
        if ref.raw_url:
            vurl = await resolver_agent.resolve_vendor_url(ref)
        else:
            vurl = await name_resolver_agent.resolve_from_name(
                ref.name,
                expo_id=ref.expo_id,
                context_snippet=ref.short_description,
            )
    except Exception as e:  # noqa: BLE001
        last_err = str(e)
        vurl = None

    if vurl is None:
        cat = _classify_resolve_failure(ref, last_err)
        await _update_status(
            ref,
            status="resolve_failed",
            failure_category=cat,
            failure_reason=last_err,
            ref_id=ref_id,
        )
        try:
            from ..config import get_settings

            if get_settings().persist_unresolved:
                await reporter_agent.persist_unresolved_vendor(ref, failure_category=cat)
        except Exception as e:  # noqa: BLE001
            _log.debug("standalone.unresolved_persist_failed", name=ref.name[:80], error=str(e)[:200])
        return RefOutcome(status="resolve_failed", failure_category=cat, failure_reason=last_err)

    if ref.provenance:
        vurl.provenance = list(ref.provenance) + list(vurl.provenance or [])

    await _update_status(ref, status="resolved", resolved_domain=vurl.domain, ref_id=ref_id)

    try:
        is_dup = await dedup_agent.check_and_merge(vurl)
    except Exception as e:  # noqa: BLE001
        is_dup = False
        _log.debug("standalone.dedup_check_failed", domain=vurl.domain, error=str(e)[:200])

    if is_dup:
        try:
            await reporter_agent.merge_existing_with_expo(vurl.domain, vurl.expo_id)
        except Exception as e:  # noqa: BLE001
            _log.debug("standalone.merge_existing_failed", domain=vurl.domain, error=str(e)[:200])
        await _update_status(ref, status="dedup_skipped", resolved_domain=vurl.domain, ref_id=ref_id)
        return RefOutcome(status="dedup_skipped", domain=vurl.domain)

    try:
        vendor = await enricher_agent.enrich_vendor(vurl)
    except Exception as e:  # noqa: BLE001
        last_err = str(e)
        vendor = None

    if vendor is None:
        cat = "llm_merge_error" if last_err and "llm" in last_err.lower() else "scrape_failed"
        await _update_status(
            ref,
            status="enrich_failed",
            failure_category=cat,
            failure_reason=last_err or "no_profile",
            resolved_domain=vurl.domain,
            ref_id=ref_id,
        )
        return RefOutcome(
            status="enrich_failed",
            domain=vurl.domain,
            failure_category=cat,
            failure_reason=last_err,
        )

    try:
        persisted, reject_cat = await reporter_agent.persist_vendor(vendor)
    except Exception as e:  # noqa: BLE001
        await _update_status(
            ref,
            status="enrich_failed",
            failure_category="llm_merge_error",
            failure_reason=str(e),
            resolved_domain=vurl.domain,
            ref_id=ref_id,
        )
        return RefOutcome(
            status="enrich_failed",
            domain=vurl.domain,
            failure_category="llm_merge_error",
            failure_reason=str(e),
        )

    if persisted:
        await _update_status(ref, status="enriched", resolved_domain=vurl.domain, ref_id=ref_id)
        return RefOutcome(status="enriched", domain=vurl.domain)

    if reject_cat == "scope_rejected":
        await _update_status(
            ref,
            status="scope_rejected",
            failure_category="scope_out_of_scope",
            resolved_domain=vurl.domain,
            ref_id=ref_id,
        )
        return RefOutcome(
            status="scope_rejected",
            domain=vurl.domain,
            failure_category="scope_out_of_scope",
        )

    await _update_status(
        ref,
        status="validation_rejected",
        failure_category="completeness_low",
        resolved_domain=vurl.domain,
        ref_id=ref_id,
    )
    return RefOutcome(
        status="validation_rejected",
        domain=vurl.domain,
        failure_category="completeness_low",
    )


async def process_ref_by_id(ref_id: str) -> RefOutcome | None:
    """Look up a ref by id, hydrate to ExhibitorRef, and process."""
    sm = get_sessionmaker()
    async with sm() as session:
        orm = await exhibitor_ref_repo.get_by_id(session, ref_id)
    if orm is None:
        return None

    raw_url: AnyHttpUrl | None = None
    if orm.raw_url:
        try:
            raw_url = AnyHttpUrl(orm.raw_url)
        except Exception:  # noqa: BLE001
            raw_url = None

    provenance: list[SourceProvenance] = []
    for p in orm.provenance or []:
        try:
            provenance.append(SourceProvenance(**p))
        except Exception:  # noqa: BLE001
            pass

    ref = ExhibitorRef(
        expo_id=orm.expo_id or "",
        name=orm.name,
        raw_url=raw_url,
        booth=orm.booth,
        short_description=orm.short_description,
        provenance=provenance,
    )
    return await process_ref(ref, run_id=orm.run_id, ref_id=orm.ref_id)
