"""Reporter — persist Expo / Vendor records and update the master manifest.

Also handles the merge-into-existing case for the dedup hit (adds new
expo_id to a vendor we've already enriched).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ..config import get_settings
from ..observability.logger import get_logger
from ..observability.metrics import phase_2_progress, vendors_enriched_total
from ..schemas import ExhibitorRef, Expo, Vendor
from ..utils.text import sanitize_list, sanitize_punctuation
from ..store.db_reporter import (
    append_expo_to_vendor,
    persist_expo_to_db,
    persist_vendor_to_db,
    vendors_count as db_vendors_count,
)
from ..store.json_reporter import (
    manifest_vendor_count,
    update_manifest,
    write_expo,
    write_vendor,
)
from ..store.vector_store import add_vendor as add_vector
from ..tools.url_utils import canonical_domain
from .scope_classifier import is_in_scope
from .validator import validate

_log = get_logger(__name__)


def _vendor_path(domain: str) -> Path:
    settings = get_settings()
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in domain.lower())
    return settings.data_dir / "reports" / "vendors" / f"{safe}.json"


def _sanitize_vendor_text_fields(vendor: Vendor) -> None:
    """Strip em-dash, en-dash, unicode hyphens, semicolons from user-facing fields."""
    vendor.description = sanitize_punctuation(vendor.description)
    vendor.tagline = sanitize_punctuation(vendor.tagline)
    vendor.description_original = sanitize_punctuation(vendor.description_original)
    vendor.tagline_original = sanitize_punctuation(vendor.tagline_original)
    vendor.products = sanitize_list(vendor.products) or []
    vendor.industries = sanitize_list(vendor.industries) or []
    vendor.products_original = sanitize_list(vendor.products_original) or []
    vendor.industries_original = sanitize_list(vendor.industries_original) or []


async def persist_vendor(vendor: Vendor) -> tuple[bool, str | None]:
    """Persist vendor or reject. Returns (persisted, rejection_category).

    rejection_category is None on success. On failure: "validation_rejected"
    or "scope_rejected" so callers can map to ExhibitorRefORM.failure_category.
    """
    settings = get_settings()
    _sanitize_vendor_text_fields(vendor)
    is_valid, completeness, issues = validate(vendor)
    vendor.confidence_score = max(vendor.confidence_score, completeness)
    if not is_valid:
        _log.info("reporter.vendor_rejected_validation", domain=vendor.domain, issues=issues)
        return False, "validation_rejected"

    # Industry scope gate: reject hotels, news media, academic, event platforms.
    # 2026-05-21: bypass for ChatGPT-imported vendors. They were pre-validated
    # by ChatGPT session prior to import (curated B2B security/defense/
    # surveillance pool). Our Gemini-based scope evaluator is stricter and
    # was demoting 40 vendor/hour to scope_rejected, masking legit catalog.
    # Trust the upstream curation; persist as-is.
    is_chatgpt_curated = "source:chatgpt_database" in (vendor.source_tags or [])
    if is_chatgpt_curated:
        scope_meta = {"industry_tag": "trusted_chatgpt_curated", "bypassed": True}
        vendor.raw_extracts["scope"] = scope_meta
    else:
        in_scope, scope_meta = await is_in_scope(vendor)
        vendor.raw_extracts["scope"] = scope_meta
        if not in_scope:
            _log.info(
                "reporter.vendor_rejected_out_of_scope",
                domain=vendor.domain,
                industry=scope_meta.get("industry_tag"),
                reason=scope_meta.get("scope_reason", "")[:200],
            )
            if not settings.keep_out_of_scope:
                return False, "scope_rejected"
            # Persist with status flag so the row stays auditable.
            vendor.status = "scope_rejected"
            await persist_vendor_to_db(vendor)
            return False, "scope_rejected"

    if scope_meta.get("industry_tag") and scope_meta["industry_tag"] != "other":
        if scope_meta["industry_tag"] not in vendor.industries:
            vendor.industries = [scope_meta["industry_tag"], *vendor.industries]

    await write_vendor(vendor)
    await update_manifest(vendor=vendor)
    await persist_vendor_to_db(vendor)
    # Vector index is best-effort. When embedding provider is unreachable
    # (Ollama VPN down, Gemini rate limit, etc.) the DB row still persists
    # — operator just loses cross-run vector dedup until embedding returns.
    if vendor.domain:
        try:
            await add_vector(
                vendor_id=vendor.domain,
                name=vendor.company_name,
                domain=vendor.domain,
                tagline=vendor.tagline,
                payload={
                    "url": str(vendor.canonical_url) if vendor.canonical_url else "",
                    "industry": scope_meta.get("industry_tag", ""),
                },
            )
        except Exception as _e:  # noqa: BLE001
            _log.warning(
                "reporter.vector_index_skipped",
                domain=vendor.domain, error=str(_e)[:160],
            )
    await _maybe_emit_phase_2_unlock()
    _log.info(
        "reporter.vendor_persisted",
        domain=vendor.domain,
        completeness=completeness,
        industry=scope_meta.get("industry_tag"),
    )
    return True, None


async def persist_unresolved_vendor(ref: ExhibitorRef, *, failure_category: str | None = None) -> bool:
    """Persist an unresolved ref as a Vendor row with status='unresolved'.

    Used when the resolver could not find a domain but we still want the
    company name + provenance to be queryable from the vendors table.
    Domain and canonical_url are NULL. dedup is by (vendor_id) only.
    """
    settings = get_settings()
    if not settings.persist_unresolved:
        return False
    now = datetime.now(timezone.utc)
    vendor = Vendor(
        vendor_id=str(uuid.uuid4()),
        status="unresolved",
        domain=None,
        canonical_url=None,
        company_name=ref.name,
        description=ref.short_description,
        expos_seen=[ref.expo_id] if ref.expo_id else [],
        source_trail=list(ref.provenance or []),
        first_enriched_at=now,
        last_enriched_at=now,
        raw_extracts={
            "unresolved": True,
            "failure_category": failure_category or "unknown",
            "ref_name": ref.name,
        },
    )
    try:
        # JSON is the source of truth. Use vendor_id as the slug since
        # `domain` is None for unresolved refs.
        await write_vendor(vendor)
        await persist_vendor_to_db(vendor)
        _log.info(
            "reporter.unresolved_persisted",
            name=ref.name[:80],
            expo_id=ref.expo_id,
            failure_category=failure_category,
        )
        return True
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "reporter.unresolved_persist_failed",
            name=ref.name[:80],
            error=str(e)[:200],
        )
        return False


async def merge_existing_with_expo(domain: str, expo_id: str) -> bool:
    """Add `expo_id` to an existing vendor record (dedup-hit path)."""
    await append_expo_to_vendor(domain, expo_id)
    path = _vendor_path(domain)
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return False
    expos = list(data.get("expos_seen") or [])
    if expo_id in expos:
        return False
    expos.append(expo_id)
    data["expos_seen"] = expos
    try:
        from datetime import datetime, timezone

        data["last_enriched_at"] = datetime.now(timezone.utc).isoformat()
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        _log.info("reporter.merged_expo_into_existing", domain=domain, expo_id=expo_id)
        return True
    except Exception as e:  # noqa: BLE001
        _log.warning("reporter.merge_failed", domain=domain, error=str(e))
        return False


async def persist_expo(expo: Expo, vendor_domains: list[str]) -> None:
    canonicalized = sorted({canonical_domain(d) for d in vendor_domains if d})
    await write_expo(expo, vendor_domains=canonicalized)
    await update_manifest(expo=expo)
    await persist_expo_to_db(expo, vendor_domains=canonicalized)


async def db_vendor_count_with_fallback() -> int:
    count = await db_vendors_count()
    if count == 0:
        count = await manifest_vendor_count()
    return count


async def _maybe_emit_phase_2_unlock() -> None:
    settings = get_settings()
    count = await manifest_vendor_count()
    if settings.phase_2_vendor_threshold > 0:
        ratio = count / settings.phase_2_vendor_threshold
        phase_2_progress.set(ratio)
    if count == settings.phase_2_vendor_threshold:
        _log.warning(
            "phase_2_unlock_eligible",
            vendors=count,
            message="Phase 1 exit gate reached. Time to consider paid enrichment tier.",
        )


__all__ = [
    "persist_vendor",
    "persist_unresolved_vendor",
    "persist_expo",
    "merge_existing_with_expo",
    "vendors_enriched_total",  # re-exported for graph builder
]
