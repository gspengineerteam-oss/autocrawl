"""Generic last-resort exhibitor extractor for aggregators we don't have a
specialized scraper for.

Heuristic: find anchors whose URL pattern looks like an exhibitor page (ie.
contains 'exhibitor' or 'company' in path) on the same aggregator domain.
"""

from __future__ import annotations

from urllib.parse import urljoin, urlparse

from ...observability.logger import get_logger
from ...schemas import ExhibitorRef, SourceProvenance
from ..browsers.fetcher import fetch
from ..parsers.html_parser import all_links
from ..proxies.rate_limit import acquire as rl_acquire
from ..url_utils import canonical_domain

_log = get_logger(__name__)


_EXHIBITOR_PATH_HINTS = (
    "/exhibitor",
    "/exhibitors/",
    "/company/",
    "/companies/",
    "/booth/",
    "/profile/",
    "/sponsor/",
)


async def list_exhibitors(expo_url: str, expo_id: str) -> list[ExhibitorRef]:
    await rl_acquire(expo_url)
    page = await fetch(expo_url, force_render=True)
    if not page.get("html"):
        return []
    aggregator_domain = canonical_domain(urlparse(expo_url).netloc)

    out: list[ExhibitorRef] = []
    seen: set[str] = set()
    for link in all_links(page["html"], base_url=page.get("url") or expo_url):
        href = link["href"]
        if not href.startswith("http"):
            href = urljoin(expo_url, href)
        if canonical_domain(href) != aggregator_domain:
            continue
        path = urlparse(href).path.lower()
        if not any(h in path for h in _EXHIBITOR_PATH_HINTS):
            continue
        text = (link["text"] or "").strip()
        if len(text) < 2:
            continue
        if href in seen:
            continue
        seen.add(href)
        try:
            out.append(
                ExhibitorRef(
                    expo_id=expo_id,
                    name=text[:200],
                    raw_url=href,
                    aggregator_domain=aggregator_domain,
                    provenance=[SourceProvenance(type="aggregator", url=href, extraction_method="generic_html")],
                )
            )
        except Exception:  # noqa: BLE001
            continue
    _log.info("generic_scraper.exhibitors_extracted", expo_id=expo_id, count=len(out))
    return out
