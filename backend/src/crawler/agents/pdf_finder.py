"""PDF Finder — discover PDF brochure URLs for a given Expo.

Combines four strategies:
  1. Scrape <a href="*.pdf"> from aggregator/official URL
  2. Targeted multi-source search: '"<expo>" filetype:pdf'
  3. Firecrawl /search with brochure-oriented query
  4. Plus any URLs already attached on `expo.pdf_brochure_urls`

Returns a deduped, capped list of PDF URLs.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlparse

from ..config import get_settings
from ..observability.logger import get_logger
from ..observability.metrics import errors_total
from ..schemas import Expo
from ..tools.url_utils import canonical_url

_log = get_logger(__name__)


def _is_pdf_url(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    path = parsed.path.lower()
    if path.endswith(".pdf"):
        return True
    if ".pdf?" in url.lower() or ".pdf#" in url.lower():
        return True
    return False


_POSITIVE_KEYWORDS = (
    "exhibitor",
    "exhibitors",
    "vendor",
    "vendors",
    "directory",
    "participant",
    "attendee",
    "company-list",
    "company_list",
    "companylist",
    "brochure",
    "catalog",
    "catalogue",
    "show-guide",
    "show_guide",
    "showguide",
    "showbook",
    "official-program",
    "official_program",
    "program-book",
    "expolist",
    "buyers-guide",
    "buyer-guide",
)
# NOTE: "floor-plan" / "floorplan" intentionally NOT positive — venue floor
# plans (e.g. WSCC's PDF) list rooms, not vendors. Booth maps WITH vendor
# names attached are rare; when they do exist they almost always also have
# "exhibitor" in the URL, which is enough to score them positive.

_NEGATIVE_KEYWORDS = (
    "terms",
    "conditions",
    "tnc",
    "policy",
    "policies",
    "privacy",
    "code-of-conduct",
    "conduct",
    "rules",
    "regulations",
    "regulation",
    "sponsor-prospect",
    "sponsorship",
    "media-kit",
    "press-kit",
    "press-release",
    "newsletter",
    "agenda",
    "schedule",
    "invitation",
    "invite",
    "registration-form",
    "application-form",
    "manual",
    "handbook",
    "rulebook",
    "guideline",
    "faq",
    "logo",
    "branding",
    "letterhead",
    "ethics",
    "contract",
    "agreement",
    "waiver",
    "release-form",
    "covid",
    "safety-plan",
    "evacuation",
    "shipping",
    "freight",
    "venue-map",
    "floor-plan",
    "floorplan",
    "floor_plan",
    "room-map",
    "room-layout",
    "facility-map",
    "facility-guide",
    "site-plan",
    "siteplan",
    "capacity-chart",
    "meeting-room",
    "meeting_room",
    "parking",
    "directions",
    "translator",
    "interpreter",
    "speech",
    "speaker-bio",
    "abstract",
    "whitepaper",
    "annual-report",
    "financial-report",
    "minutes",
)


def _score_pdf_relevance(url: str) -> float:
    """Return relevance score 0..1. Higher = more likely to contain vendor list.

    Cheap heuristic on URL path + filename. Checked BEFORE download to avoid
    burning bandwidth + LLM tokens on terms-and-conditions / sponsor brochures.
    """
    if not url:
        return 0.0
    haystack = url.lower()
    pos_hits = sum(1 for kw in _POSITIVE_KEYWORDS if kw in haystack)
    neg_hits = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in haystack)

    score = 0.5  # neutral baseline (we don't know yet)
    score += min(0.5, pos_hits * 0.25)
    score -= min(0.7, neg_hits * 0.35)
    return max(0.0, min(1.0, score))


def _filter_relevant_pdfs(
    urls: list[str], *, threshold: float, hard_reject_at: float = 0.15
) -> list[str]:
    """Drop PDFs scoring below hard_reject_at; keep the rest sorted by score desc."""
    scored = [(u, _score_pdf_relevance(u)) for u in urls]
    kept = [(u, s) for u, s in scored if s >= hard_reject_at]
    rejected = [(u, s) for u, s in scored if s < hard_reject_at]
    if rejected:
        _log.info(
            "pdf_finder.relevance_rejected",
            count=len(rejected),
            samples=[u for u, _ in rejected[:5]],
        )
    kept.sort(key=lambda x: x[1], reverse=True)
    above_threshold = [u for u, s in kept if s >= threshold]
    if above_threshold:
        return above_threshold
    # Fallback: nothing strong, return whatever we have left so we don't end up empty
    return [u for u, _ in kept]


async def _scrape_pdf_links_from_page(page_url: str) -> list[str]:
    from ..tools.browsers.fetcher import fetch
    from ..tools.parsers.html_parser import all_links

    try:
        page = await fetch(page_url, force_render=False)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_finder", category="scrape").inc()
        _log.debug("pdf_finder.scrape_failed", url=page_url, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []
    links = all_links(html, base_url=page.get("url") or page_url)
    return [canonical_url(link["href"]) for link in links if _is_pdf_url(link["href"])]


async def _targeted_search_pdf(expo_name: str, *, per_source: int = 6) -> list[str]:
    from ..tools.search.multi import PDF_FRIENDLY_ENGINES, search_all

    # NOTE: do NOT search "floor plan filetype:pdf" — venue floor plans list
    # rooms, not vendors, and the relevance scorer drops them anyway. Searching
    # for them upstream just burns provider quota on PDFs we'll reject.
    queries = [
        f'"{expo_name}" exhibitor list filetype:pdf',
        f'"{expo_name}" exhibitor directory filetype:pdf',
        f'"{expo_name}" brochure filetype:pdf',
        f'"{expo_name}" show guide filetype:pdf',
    ]
    found: set[str] = set()
    for q in queries:
        try:
            # Skip Wikipedia/Reddit/HN/GitHub/ArXiv/etc — they don't honor the
            # `filetype:` operator and never carry event brochures, so dispatching
            # to them just burns a roundtrip per provider per query.
            hits = await search_all(q, per_source_limit=per_source, engines=PDF_FRIENDLY_ENGINES)
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="pdf_finder", category="search").inc()
            _log.debug("pdf_finder.search_failed", query=q, error=str(e))
            continue
        for h in hits:
            if _is_pdf_url(h.url):
                found.add(canonical_url(h.url))
    return sorted(found)


async def _crawl4ai_pdf_search(expo_url: str | None) -> list[str]:
    """Use Crawl4AI to inspect a page and return all PDF links."""
    if not expo_url:
        return []
    if not get_settings().enable_crawl4ai:
        return []
    try:
        from ..tools.crawl4ai_client import c4ai_find_pdfs

        urls = await c4ai_find_pdfs(expo_url)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_finder", category="crawl4ai").inc()
        _log.debug("pdf_finder.crawl4ai_failed", url=expo_url, error=str(e))
        return []
    return [canonical_url(u) for u in urls if _is_pdf_url(u)]


async def _firecrawl_pdf_search(expo_name: str) -> list[str]:
    """Legacy Firecrawl path. Skipped unless ENABLE_FIRECRAWL=true."""
    settings = get_settings()
    if not settings.enable_firecrawl:
        return []
    from ..tools.firecrawl.client import search as firecrawl_search

    found: set[str] = set()
    try:
        result = await firecrawl_search(f"{expo_name} exhibitor brochure PDF", limit=5)
    except Exception:  # noqa: BLE001
        return []
    if not result.success or not result.data:
        return []
    items = result.data.get("results") or result.data.get("data") or []
    for item in items:
        if isinstance(item, dict):
            url = item.get("url") or item.get("link") or ""
            if _is_pdf_url(url):
                found.add(canonical_url(url))
    return sorted(found)


async def find_pdfs_for_expo(expo: Expo) -> list[str]:
    settings = get_settings()
    if not settings.pdf_discovery_enabled:
        return []

    tasks: list = [
        _targeted_search_pdf(expo.name),
        _crawl4ai_pdf_search(str(expo.aggregator_url) if expo.aggregator_url else None),
        _crawl4ai_pdf_search(str(expo.official_url) if expo.official_url else None),
    ]
    if settings.enable_firecrawl:
        tasks.append(_firecrawl_pdf_search(expo.name))
    if expo.aggregator_url:
        tasks.append(_scrape_pdf_links_from_page(str(expo.aggregator_url)))
    if expo.official_url:
        tasks.append(_scrape_pdf_links_from_page(str(expo.official_url)))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    found: set[str] = set(expo.pdf_brochure_urls or [])
    for r in results:
        if isinstance(r, list):
            found.update(r)

    relevant = _filter_relevant_pdfs(
        list(found),
        threshold=getattr(settings, "pdf_relevance_threshold", 0.5),
    )
    capped = relevant[: settings.max_pdfs_per_expo]
    if capped:
        _log.info(
            "pdf_finder.discovered",
            expo_id=expo.expo_id,
            kept=len(capped),
            dropped=len(found) - len(capped),
        )
    return capped
