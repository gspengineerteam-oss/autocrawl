"""Vendor URL resolver — the single most critical component.

INPUT:  ExhibitorRef (e.g. https://10times.com/company/xldefense)
OUTPUT: VendorURL with the REAL vendor domain (e.g. xldefense.com)

NEVER returns an aggregator domain. The aggregator/social/utility blacklist
in `config/aggregator_blacklist.yaml` is enforced strictly: any URL that
canonicalizes to a blacklisted domain is filtered out before any other check.

Resolution ladder:
  1) JSON-LD `Organization.url` from the exhibitor page
  2) Anchor with cue-text like "Visit Website" / "Official Site"
  3) Highest-frequency outbound non-blacklisted domain whose anchor text
     overlaps with the exhibitor name
  4) LLM tie-break with the candidate list and exhibitor name as context
  5) None (record FailureRecord)

After picking a candidate, we validate:
  - Domain has a working DNS A record
  - The page does NOT look like a parking / for-sale page
  - URL canonicalized (strip tracking params, lowercase, no www.)
"""

from __future__ import annotations

import asyncio
import socket
from collections import Counter
from typing import Any

from pydantic import BaseModel, Field

from ..observability.logger import get_logger
from ..observability.metrics import errors_total, vendors_resolved_total
from ..schemas import ExhibitorRef, VendorURL
from ..tools.parsers.html_parser import (
    find_visit_website_links,
    outbound_candidates,
    text as html_text,
)
from ..tools.parsers.schema_org import find_organization_url
from ..tools.url_utils import (
    canonical_domain,
    canonical_url,
    is_aggregator_or_excluded,
    looks_like_parking_page,
)

_log = get_logger(__name__)


class _LLMPick(BaseModel):
    chosen_url: str | None = Field(default=None, description="URL string of the most likely vendor official site")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reasoning: str = Field(default="")


async def _dns_alive(domain: str) -> bool:
    if not domain:
        return False
    try:
        return await asyncio.to_thread(_dns_resolve_blocking, domain)
    except Exception:  # noqa: BLE001
        return False


def _dns_resolve_blocking(domain: str) -> bool:
    try:
        socket.gethostbyname(domain)
        return True
    except socket.gaierror:
        return False


async def _validate_candidate(url: str) -> bool:
    """Lightly probe a candidate. Reject parking pages and dead domains."""
    from ..tools.browsers.httpx_client import fetch as httpx_fetch  # local: keeps pure-logic test free of httpx

    domain = canonical_domain(url)
    if not domain or is_aggregator_or_excluded(url):
        return False
    if not await _dns_alive(domain):
        return False
    probe = await httpx_fetch(canonical_url(url))
    if probe.get("status") and probe["status"] >= 400:
        return False
    if looks_like_parking_page(probe.get("html", "")):
        return False
    return True


async def _llm_tiebreak(exhibitor_name: str, candidates: list[dict[str, Any]]) -> _LLMPick:
    if not candidates:
        return _LLMPick()
    from langchain_core.messages import HumanMessage, SystemMessage  # local import: avoid forcing langchain on pure-logic users

    from ..tools.llm.cloud_router import chat_structured
    from ..tools.llm.openai_client import chat

    rendered = "\n".join(
        f"- {c['url']}  (anchor: {c.get('anchor_text', '')[:80]!r})"
        for c in candidates[:25]
    )
    sys = SystemMessage(
        content=(
            "You are a URL disambiguator. Given an exhibitor company name and a "
            "list of candidate URLs scraped from an event-aggregator page, return the "
            "ONE URL most likely to be that company's official website. "
            "REJECT urls of social platforms, news sites, search engines, and event "
            "aggregators. Prefer URLs whose domain or path resembles the company name. "
            "If you are unsure, set chosen_url to null."
        )
    )
    user = HumanMessage(content=f"Exhibitor name: {exhibitor_name}\n\nCandidates:\n{rendered}")
    try:
        result = await chat_structured(
            [sys, user], _LLMPick, local_chat=chat, tier="light"
        )
        return result if isinstance(result, _LLMPick) else _LLMPick()
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="resolver", category="llm_tiebreak").inc()
        _log.warning("resolver.llm_tiebreak_failed", error=str(e))
        return _LLMPick()


def _name_overlap_score(exhibitor: str, candidate_domain: str) -> float:
    """Tiny lexical similarity to bias toward the right vendor when domain
    obviously contains a company-name token."""
    if not exhibitor or not candidate_domain:
        return 0.0
    name_tokens = {t.lower() for t in exhibitor.replace("-", " ").split() if len(t) >= 3}
    if not name_tokens:
        return 0.0
    domain_token = candidate_domain.split(".")[0].lower()
    matches = sum(1 for t in name_tokens if t in domain_token or domain_token in t)
    return min(1.0, matches / max(1, len(name_tokens)))


async def resolve_vendor_url(exhibitor: ExhibitorRef) -> VendorURL | None:
    from ..tools.browsers.fetcher import fetch  # local: heavy module
    from ..tools.proxies.rate_limit import acquire as rl_acquire  # local: needs redis

    raw_url = str(exhibitor.raw_url)
    aggregator_domain = exhibitor.aggregator_domain or canonical_domain(raw_url)

    await rl_acquire(raw_url)
    page = await fetch(raw_url, force_render=True)
    html = page.get("html", "")
    base_url = page.get("url") or raw_url
    if not html:
        _log.debug("resolver.no_html", raw_url=raw_url)
        return None

    # 1) schema.org Organization
    schema_url = find_organization_url(html, base_url)
    if schema_url and not is_aggregator_or_excluded(schema_url):
        if await _validate_candidate(schema_url):
            cu = canonical_url(schema_url)
            vendors_resolved_total.labels(resolution_method="schema_org").inc()
            return VendorURL(
                domain=canonical_domain(cu),
                canonical_url=cu,
                resolved_from=raw_url,
                expo_id=exhibitor.expo_id,
                exhibitor_name=exhibitor.name,
                resolution_method="schema_org",
                confidence=0.95,
            )

    # 2) "Visit Website" buttons
    visit_links = find_visit_website_links(html, base_url=base_url)
    for vl in visit_links:
        if is_aggregator_or_excluded(vl):
            continue
        if await _validate_candidate(vl):
            cu = canonical_url(vl)
            vendors_resolved_total.labels(resolution_method="visit_website_button").inc()
            return VendorURL(
                domain=canonical_domain(cu),
                canonical_url=cu,
                resolved_from=raw_url,
                expo_id=exhibitor.expo_id,
                exhibitor_name=exhibitor.name,
                resolution_method="visit_website_button",
                confidence=0.9,
            )

    # 3) Outbound link analysis with name overlap heuristic
    candidates = outbound_candidates(html, base_url=base_url, aggregator_domain=aggregator_domain)
    if not candidates:
        return None

    # Group by domain — pages often have multiple links to the same vendor site
    domain_count: Counter[str] = Counter(c["domain"] for c in candidates)
    by_domain: dict[str, dict[str, Any]] = {}
    for c in candidates:
        prior = by_domain.get(c["domain"])
        if not prior or len(c["anchor_text"] or "") > len(prior["anchor_text"] or ""):
            by_domain[c["domain"]] = c

    # Score: frequency + name overlap
    scored = []
    for dom, info in by_domain.items():
        score = domain_count[dom] + _name_overlap_score(exhibitor.name, dom) * 5.0
        scored.append((score, info))
    scored.sort(key=lambda t: t[0], reverse=True)
    top_candidates = [info for _, info in scored[:10]]

    if scored and scored[0][0] >= 6.0:
        winner = scored[0][1]
        if await _validate_candidate(winner["url"]):
            cu = canonical_url(winner["url"])
            vendors_resolved_total.labels(resolution_method="outbound_link").inc()
            return VendorURL(
                domain=canonical_domain(cu),
                canonical_url=cu,
                resolved_from=raw_url,
                expo_id=exhibitor.expo_id,
                exhibitor_name=exhibitor.name,
                resolution_method="outbound_link",
                confidence=0.8,
            )

    # 4) LLM tie-break
    pick = await _llm_tiebreak(exhibitor.name, top_candidates)
    if pick.chosen_url and not is_aggregator_or_excluded(pick.chosen_url):
        if await _validate_candidate(pick.chosen_url):
            cu = canonical_url(pick.chosen_url)
            vendors_resolved_total.labels(resolution_method="llm_tiebreak").inc()
            return VendorURL(
                domain=canonical_domain(cu),
                canonical_url=cu,
                resolved_from=raw_url,
                expo_id=exhibitor.expo_id,
                exhibitor_name=exhibitor.name,
                resolution_method="llm_tiebreak",
                confidence=max(0.5, min(pick.confidence, 0.85)),
            )

    _log.info("resolver.no_vendor_found", raw_url=raw_url, exhibitor=exhibitor.name)
    return None


# Helper used by tests — pure function, no network.
def pure_filter_candidates(html: str, *, base_url: str, aggregator_domain: str) -> list[dict[str, Any]]:
    """Returns the post-filter candidate list for unit tests of vendor resolution."""
    return outbound_candidates(html, base_url=base_url, aggregator_domain=aggregator_domain)


__all__ = ["resolve_vendor_url", "pure_filter_candidates", "html_text"]
