"""Direct scrape of conferenceindex.org for security/defense conferences.

conferenceindex.org indexes 5000+ academic and industry conferences with
structured pages per category. Unlike search-engine results, we get a clean
list of upcoming events with names, locations, dates, and homepage URLs.

This module is consumed by the discovery agent at the same level as
`search_all` results — each entry becomes a candidate Expo for the LLM
extractor to validate.
"""

from __future__ import annotations

from urllib.parse import urljoin

from ...observability.logger import get_logger
from ..browsers.fetcher import fetch
from ..parsers.html_parser import all_links

_log = get_logger(__name__)

# Conference categories that match our target verticals. URL patterns can
# rotate, but the directory layout is stable enough that we can hit category
# pages directly and parse anchor lists.
_CATEGORIES = (
    "https://conferenceindex.org/conferences/security",
    "https://conferenceindex.org/conferences/defense",
    "https://conferenceindex.org/conferences/cyber-security",
    "https://conferenceindex.org/conferences/surveillance",
    "https://conferenceindex.org/conferences/military",
    "https://conferenceindex.org/conferences/border-security",
)


async def list_expo_candidates() -> list[dict]:
    """Fetch each category page, parse links to individual conference pages.

    Returns dicts shaped like the discovery agent's candidate list:
    `{name, aggregator_url, official_url, source: "conferenceindex"}`.
    """
    out: list[dict] = []
    seen: set[str] = set()
    for cat_url in _CATEGORIES:
        try:
            page = await fetch(cat_url, force_render=False)
        except Exception as e:  # noqa: BLE001
            _log.debug("conferenceindex.fetch_failed", url=cat_url, error=str(e)[:160])
            continue
        html = page.get("html") or ""
        if not html:
            continue

        for link in all_links(html, base_url=cat_url):
            href = link.get("href") or ""
            text = (link.get("text") or "").strip()
            if not href or len(text) < 6:
                continue
            absolute = href if href.startswith("http") else urljoin(cat_url, href)
            # Conference detail pages live under /event/<slug> on this site.
            if "/event/" not in absolute and "/conferences/" not in absolute.lower():
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            out.append(
                {
                    "name": text[:200],
                    "aggregator_url": absolute,
                    "official_url": None,
                    "source": "conferenceindex",
                }
            )

    _log.info("conferenceindex.scraped", candidates=len(out))
    return out


__all__ = ["list_expo_candidates"]
