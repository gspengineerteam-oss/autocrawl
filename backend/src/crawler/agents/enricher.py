"""Enrichment agent — gather all free signals about a vendor and merge into a `Vendor`.

Parallel tool calls:
  whois + DNS + Wayback + crawl_vendor_site
After collecting raw data, an LLM (gpt-4o-mini) merges everything into the
strict `Vendor` Pydantic schema.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ..observability.logger import get_logger
from ..observability.metrics import errors_total, vendors_enriched_total
from ..schemas import Vendor, VendorURL
from ..tools.enrichment.dns_lookup import lookup as dns_lookup
from ..tools.enrichment.vendor_site_crawl import crawl_vendor_site
from ..tools.enrichment.wayback import lookup as wayback_lookup
from ..tools.enrichment.whois_lookup import lookup as whois_lookup
from ..tools.llm.cloud_router import chat_structured
from ..tools.llm.openai_client import chat
from ..tools.url_utils import canonical_domain, canonical_url

_log = get_logger(__name__)


_PHASE1_GAPS = ["funding", "headcount", "verified_emails", "tech_stack"]


async def enrich_vendor(vurl: VendorURL) -> Vendor | None:
    canon = canonical_url(str(vurl.canonical_url))
    domain = canonical_domain(canon)

    whois_t = whois_lookup(domain)
    dns_t = dns_lookup(domain)
    wb_t = wayback_lookup(canon)
    site_t = crawl_vendor_site(canon, max_pages=10)

    raw_results = await asyncio.gather(whois_t, dns_t, wb_t, site_t, return_exceptions=True)

    def _safe(r) -> dict:
        if isinstance(r, BaseException):
            return {"error": str(r)}
        return r if isinstance(r, dict) else {}

    whois_r, dns_r, wb_r, site_r = (_safe(r) for r in raw_results)

    profile = await _llm_merge(
        vurl=vurl,
        domain=domain,
        canonical=canon,
        whois_data=whois_r,
        dns_data=dns_r,
        wayback_data=wb_r,
        site_data=site_r,
    )
    if profile is None:
        return None

    # Propagate provenance from the VendorURL (which already carries
    # aggregator + PDF + search trail) into the final Vendor record.
    if vurl.provenance:
        profile.source_trail = list(vurl.provenance) + list(profile.source_trail or [])

    # Translation hook: when enabled, swap text fields to target language.
    # Failure is non-fatal — keep English profile rather than dropping the vendor.
    from ..config import get_settings as _get_settings

    settings = _get_settings()
    if settings.translation_enabled and settings.translation_provider != "none":
        try:
            from ..tools.llm.translator import translate_vendor_fields

            await translate_vendor_fields(profile)
        except Exception as e:  # noqa: BLE001
            _log.warning("enricher.translation_failed", domain=domain, error=str(e))

    vendors_enriched_total.inc()
    return profile


class _LLMVendor:
    """Light schema we ask the LLM to fill — converted into Vendor afterwards."""

    pass


async def _llm_merge(
    *,
    vurl: VendorURL,
    domain: str,
    canonical: str,
    whois_data: dict,
    dns_data: dict,
    wayback_data: dict,
    site_data: dict,
) -> Vendor | None:
    from pydantic import BaseModel, Field

    class _MergeOutput(BaseModel):
        company_name: str
        description: str | None = None
        tagline: str | None = None
        products: list[str] = Field(default_factory=list)
        industries: list[str] = Field(default_factory=list)
        address_country: str | None = None
        address_city: str | None = None
        address_region: str | None = None
        address_street: str | None = None
        primary_emails: list[str] = Field(default_factory=list)
        primary_phones: list[str] = Field(default_factory=list)
        founded_year: int | None = None
        confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    excerpt = (site_data.get("combined_text_excerpt") or "")[:25000]
    org_jsonld = json.dumps(site_data.get("organization_jsonld") or [], default=str)[:6000]
    open_graph = json.dumps(site_data.get("open_graph") or {})[:1500]
    site_emails = json.dumps(site_data.get("emails") or [])[:600]
    site_phones = json.dumps(site_data.get("phones") or [])[:300]

    sys = SystemMessage(
        content=(
            "Merge multi-source signals about a single company into a structured "
            "profile. Use only what the source supports — do NOT invent. If a "
            "field cannot be derived, omit it. Prefer schema.org `Organization` "
            "data when present. Confidence reflects how complete and consistent "
            "the inputs are (0..1)."
        )
    )
    user = HumanMessage(
        content=(
            f"Vendor domain: {domain}\nCanonical URL: {canonical}\n"
            f"Exhibitor name (per aggregator): {vurl.exhibitor_name}\n\n"
            f"WHOIS: {json.dumps(whois_data, default=str)[:1500]}\n"
            f"DNS: {json.dumps(dns_data, default=str)[:800]}\n"
            f"Wayback: {json.dumps(wayback_data, default=str)[:400]}\n"
            f"Open Graph: {open_graph}\n"
            f"Org JSON-LD: {org_jsonld}\n"
            f"Site emails (regex): {site_emails}\n"
            f"Site phones (regex): {site_phones}\n\n"
            f"Site text excerpt:\n{excerpt}\n"
        )
    )
    try:
        merged = await chat_structured(
            [sys, user], _MergeOutput, local_chat=chat, tier="light"
        )
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="enrichment", category="llm_merge").inc()
        _log.warning("enricher.llm_merge_failed", domain=domain, error=str(e))
        return None

    socials_dict: dict[str, list[str]] = site_data.get("socials") or {}

    def _first(values: Any) -> str | None:
        if isinstance(values, list) and values:
            return str(values[0])
        return None

    from ..schemas import Address, ContactPoint, SocialLinks

    socials = SocialLinks(
        linkedin=_first(socials_dict.get("linkedin")),
        twitter=_first(socials_dict.get("twitter")),
        facebook=_first(socials_dict.get("facebook")),
        youtube=_first(socials_dict.get("youtube")),
        instagram=_first(socials_dict.get("instagram")),
        github=_first(socials_dict.get("github")),
    )

    from ..tools.enrichment.email_verifier import verify_many

    contacts: list[ContactPoint] = []
    primary_emails = list(merged.primary_emails or [])
    if primary_emails:
        mx_records = list(dns_data.get("mx") or [])
        verifications = await verify_many(
            primary_emails,
            vendor_domain=domain,
            mx_records=mx_records,
        )
        for v in verifications:
            contacts.append(ContactPoint(
                type="email",
                value=v.email,
                verified=v.score >= 0.7,
                verification_score=v.score,
                verification_signals={
                    "valid_syntax": v.valid_syntax,
                    "mx_present": v.mx_present,
                    "disposable": v.disposable,
                    "role_based": v.role_based,
                    "domain_matches_vendor": v.domain_matches_vendor,
                },
            ))
    for p in merged.primary_phones or []:
        contacts.append(ContactPoint(type="phone", value=p))

    address = (
        Address(
            country=merged.address_country,
            city=merged.address_city,
            region=merged.address_region,
            street=merged.address_street,
        )
        if any([merged.address_country, merged.address_city, merged.address_region, merged.address_street])
        else None
    )

    domain_age = whois_data.get("age_days")
    first_seen = wayback_data.get("first_snapshot")

    logo_url = site_data.get("logo_url")
    tech_stack = list(site_data.get("tech_stack") or [])

    # Best-effort passive recon for richer profile. Each module checks its
    # own enable flag and returns None on failure, so this never blocks the
    # enrichment path.
    related_subdomains: list[str] = []
    urlscan_summary: dict | None = None
    try:
        from ..tools.recon import crtsh as _crtsh

        related_subdomains = await _crtsh.list_subdomains(domain, max_results=20)
    except Exception as e:  # noqa: BLE001
        _log.debug("enricher.crtsh_failed", domain=domain, error=str(e)[:160])

    try:
        from ..tools.recon import urlscan as _urlscan

        urlscan_summary = await _urlscan.lookup_domain(domain)
    except Exception as e:  # noqa: BLE001
        _log.debug("enricher.urlscan_failed", domain=domain, error=str(e)[:160])

    try:
        return Vendor(
            domain=domain,
            company_name=merged.company_name,
            canonical_url=canonical,
            description=merged.description,
            tagline=merged.tagline,
            products=merged.products,
            industries=merged.industries,
            expos_seen=[vurl.expo_id],
            address=address,
            contacts=contacts,
            socials=socials,
            employee_count=None,
            founded_year=merged.founded_year,
            domain_age_days=domain_age if isinstance(domain_age, int) else None,
            registrar=whois_data.get("registrar"),
            registrar_country=whois_data.get("country"),
            first_seen_wayback=_parse_date(first_seen),
            logo_url=logo_url,
            tech_stack=tech_stack,
            confidence_score=merged.confidence,
            enrichment_gap=list(_PHASE1_GAPS),
            source_tags=[
                "whois",
                "dns",
                "wayback",
                "site_crawl",
                "schema_org",
                "open_graph",
                "email_regex",
            ],
            first_enriched_at=datetime.now(timezone.utc),
            last_enriched_at=datetime.now(timezone.utc),
            raw_extracts={
                "whois": whois_data,
                "dns": dns_data,
                "wayback": wayback_data,
                "open_graph": site_data.get("open_graph"),
                "related_subdomains": related_subdomains,
                "urlscan": urlscan_summary,
            },
        )
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="enrichment", category="vendor_construct").inc()
        _log.warning("enricher.vendor_construct_failed", domain=domain, error=str(e))
        return None


def _parse_date(s: str | None):
    if not s:
        return None
    try:
        from datetime import date

        return date.fromisoformat(s)
    except Exception:  # noqa: BLE001
        return None
