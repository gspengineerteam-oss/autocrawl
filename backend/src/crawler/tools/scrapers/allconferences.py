"""Direct scrape of allconferences.com for security/defense events.

Similar role to conferenceindex but with different curation. We treat both as
duplicate sources and let the discovery dedup pass handle overlap.
"""

from __future__ import annotations

from urllib.parse import urljoin

from ...observability.logger import get_logger
from ..browsers.fetcher import fetch
from ..parsers.html_parser import all_links

_log = get_logger(__name__)

_CATEGORIES = (
    "https://allconferences.com/category/security/",
    "https://allconferences.com/category/defense/",
    "https://allconferences.com/category/cybersecurity/",
    "https://allconferences.com/category/military/",
)


async def list_expo_candidates() -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for cat_url in _CATEGORIES:
        try:
            page = await fetch(cat_url, force_render=False)
        except Exception as e:  # noqa: BLE001
            _log.debug("allconferences.fetch_failed", url=cat_url, error=str(e)[:160])
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
            # Event pages on this directory typically include the year + name
            # in the slug. We accept anything under /event/ or /conference/.
            path_lower = absolute.lower()
            if not any(p in path_lower for p in ("/event/", "/conference/", "/conferences/")):
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            out.append(
                {
                    "name": text[:200],
                    "aggregator_url": absolute,
                    "official_url": None,
                    "source": "allconferences",
                }
            )

    _log.info("allconferences.scraped", candidates=len(out))
    return out


__all__ = ["list_expo_candidates"]
