"""Apply snowglobe-reset enrichment rules to a Vendor before persist.

Rule 2/3/4: classify against military taxonomy, hide if off-scope.
Rule 6: contact = number+email only (deterministic extraction), catalog =
priority signal that's only useful when vendor has a real website.

Pure side-effect: mutates the Vendor in-place. No DB writes here — caller
still goes through reporter_agent.persist_vendor.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from tools.skills import catalog_finder, contact_extractor, military_classifier

from crawler.schemas import ContactPoint, Vendor

_log = structlog.get_logger(__name__)


def _vendor_text(v: Vendor) -> str:
    parts: list[str] = []
    for attr in (
        v.company_name,
        v.tagline,
        v.description,
    ):
        if attr:
            parts.append(str(attr))
    parts.extend(v.products or [])
    parts.extend(v.industries or [])
    parts.extend(v.domain_of_interest or [])
    parts.extend(v.tech_stack or [])
    if v.products_detailed:
        for p in v.products_detailed:
            if hasattr(p, "name") and p.name:
                parts.append(p.name)
            if hasattr(p, "summary") and p.summary:
                parts.append(p.summary)
    return " | ".join(p for p in parts if p)


def _raw_text_for_contacts(v: Vendor) -> str:
    chunks: list[str] = []
    if v.description:
        chunks.append(v.description)
    if v.tagline:
        chunks.append(v.tagline)
    raw = v.raw_extracts or {}
    if isinstance(raw, dict):
        for key in (
            "agentic_email",
            "agentic_phone",
            "agentic_address",
            "agentic_text",
            "page_text",
        ):
            val = raw.get(key)
            if isinstance(val, str):
                chunks.append(val)
            elif isinstance(val, list):
                chunks.extend(str(x) for x in val if x)
    return "\n".join(chunks)


def _merge_contacts(
    v: Vendor, emails: tuple[str, ...], phones: tuple[str, ...]
) -> list[ContactPoint]:
    keep: list[ContactPoint] = []
    seen_keys: set[tuple[str, str]] = set()
    # Keep existing contacts that are emails/phones AND were already verified
    # somehow upstream (form/fax/other dropped per rule 6: only number + email).
    for c in v.contacts or []:
        ctype = getattr(c, "type", "email") or "email"
        if ctype not in {"email", "phone"}:
            continue
        cval = (getattr(c, "value", "") or "").strip()
        if not cval:
            continue
        key = (ctype, cval.lower())
        if key in seen_keys:
            continue
        seen_keys.add(key)
        keep.append(c)
    for email in emails:
        key = ("email", email.lower())
        if key in seen_keys:
            continue
        seen_keys.add(key)
        keep.append(ContactPoint(type="email", value=email))
    for phone in phones:
        key = ("phone", phone.lower())
        if key in seen_keys:
            continue
        seen_keys.add(key)
        keep.append(ContactPoint(type="phone", value=phone))
    return keep


_THIN_DATA_FLOOR = 0.20  # below this we don't trust a positive classifier hit
_THIN_DATA_REASON = "off_scope_thin_data"


def compute_enrichment_completeness(v: Vendor) -> float:
    """Deterministic post-scrape data richness, range [0.0, 1.0].

    Sums weighted evidence the enrichment actually found something real:
    contact + website + products + catalog + description + address +
    socials + firmographics + an agent-emitted self-report. Single source
    of truth — used by the scope-gate to demote keyword-only hits and by
    Vendor.effective_scope to discount the displayed score.
    """
    s = 0.0
    if v.has_email or v.has_phone:
        s += 0.25
    if v.has_website:
        s += 0.15
    if (v.products or []) or (v.products_detailed or []):
        s += 0.15
    if v.catalog_count and v.catalog_count > 0:
        s += 0.10
    if v.description and len(v.description) >= 80:
        s += 0.10
    if v.address:
        s += 0.10
    if v.socials and any(
        [
            getattr(v.socials, "linkedin", None),
            getattr(v.socials, "twitter", None),
            getattr(v.socials, "facebook", None),
        ]
    ):
        s += 0.05
    if v.tech_stack or v.employee_count or v.founded_year:
        s += 0.05
    raw = v.raw_extracts or {}
    if isinstance(raw, dict):
        agent_self = raw.get("agentic_completeness_score") or 0
        try:
            if float(agent_self) > 0:
                s += 0.05
        except (TypeError, ValueError):
            pass
    return round(min(1.0, s), 3)


def apply_scope_and_signals(v: Vendor, *, discover_catalog: bool = True) -> Vendor:
    """Annotate the vendor with snowglobe-reset fields. Returns same object."""
    # Normalize industries BEFORE classifier reads them. Drops hallucinated
    # tags ("aerospace" on commercial MRO) and maps synonyms to canonical
    # vocabulary. Classifier haystack then sees clean signal.
    try:
        from .industries_normalizer import normalize_industries

        v.industries = normalize_industries(v.industries)
    except Exception as e:  # noqa: BLE001
        _log.debug("scope_gate.industries_normalize_failed", error=str(e)[:120])

    haystack = _vendor_text(v)
    cls = military_classifier.classify(haystack)
    v.is_military_scope = cls.is_military
    v.military_categories = list(cls.matched_categories)
    v.scope_match_score = float(cls.score)
    if not cls.is_military:
        v.hidden = True
        v.hidden_reason = "off_scope"
    else:
        # Don't auto-unhide if something else flagged it earlier
        if v.hidden_reason in ("off_scope", _THIN_DATA_REASON):
            v.hidden = False
            v.hidden_reason = None

    raw_text = _raw_text_for_contacts(v)
    cx = contact_extractor.extract(raw_text)
    v.contacts = _merge_contacts(v, cx.emails, cx.phones)
    v.contact_count = sum(1 for c in v.contacts if c.type in {"email", "phone"})
    v.has_email = any(c.type == "email" for c in v.contacts)
    v.has_phone = any(c.type == "phone" for c in v.contacts)

    v.has_website = bool(v.canonical_url and str(v.canonical_url).strip())

    if discover_catalog and v.has_website and v.domain:
        try:
            cat = catalog_finder.discover(v.domain)
            existing_urls = {(r.get("url") or "").strip() for r in (v.catalog_refs or []) if isinstance(r, dict)}
            merged = list(v.catalog_refs or [])
            for r in cat.refs:
                d = r.to_dict()
                url = (d.get("url") or "").strip()
                if url and url not in existing_urls:
                    merged.append(d)
                    existing_urls.add(url)
            v.catalog_refs = merged
            v.catalog_count = len(merged)
        except Exception as e:  # noqa: BLE001
            _log.debug("scope_gate.catalog_probe_failed", error=str(e)[:120], domain=v.domain)
            # Preserve any vision-agent-found refs even if the deterministic probe failed.
            v.catalog_count = len(v.catalog_refs or [])
    else:
        # Don't wipe vision-agent-supplied refs when probe is skipped.
        v.catalog_count = len(v.catalog_refs or [])

    # Snowglobe Phase 2: compute persisted completeness AFTER all signals are
    # populated, then gate weak classifier hits on real data presence.
    v.enrichment_completeness = compute_enrichment_completeness(v)
    if v.is_military_scope and v.enrichment_completeness < _THIN_DATA_FLOOR:
        # Classifier fired on seed-only haystack — don't surface until a
        # real scrape lands. The next enrich pass will re-evaluate.
        v.hidden = True
        v.hidden_reason = _THIN_DATA_REASON

    v.classified_at = datetime.now(timezone.utc)
    return v


def should_enqueue_catalog_backfill(v: Vendor) -> bool:
    """Gate Phase-5 product backfill: only if vendor is in scope, has a
    website, and we already detected ≥1 catalog hint."""
    return bool(
        not v.hidden
        and v.is_military_scope
        and v.has_website
        and v.catalog_count > 0
    )


def to_persist_extras(v: Vendor) -> dict[str, Any]:
    """Snowglobe fields the persist layer should write through to the ORM."""
    return {
        "hidden": v.hidden,
        "hidden_reason": v.hidden_reason,
        "is_military_scope": v.is_military_scope,
        "military_categories": list(v.military_categories or []),
        "scope_match_score": float(v.scope_match_score or 0.0),
        "enrichment_completeness": float(v.enrichment_completeness or 0.0),
        "contact_count": int(v.contact_count or 0),
        "has_email": bool(v.has_email),
        "has_phone": bool(v.has_phone),
        "has_website": bool(v.has_website),
        "catalog_refs": list(v.catalog_refs or []),
        "catalog_count": int(v.catalog_count or 0),
        "classified_at": v.classified_at,
    }
