"""Direct scrape of eventseye.com event listings.

eventseye.com is in our `aggregator_blacklist.yaml` because we never want to
treat it as a vendor identity (it's a listing site). But for DISCOVERY of
expos, it's actually one of the best curated sources for trade shows in
defense/security/aerospace because human editors maintain the listings.

Hence this module is consumed only by the discovery agent — it never feeds
into the URL resolver as a vendor candidate.
"""

from __future__ import annotations

from urllib.parse import urljoin

from ...observability.logger import get_logger
from ..browsers.fetcher import fetch
from ..parsers.html_parser import all_links

_log = get_logger(__name__)

_CATEGORIES = (
    # Eventseye organises events by sector; these are the URL patterns we
    # care about. They occasionally shift — if a category 404s we skip it.
    "https://www.eventseye.com/fairs/cl_security-defence.html",
    "https://www.eventseye.com/fairs/cl_aerospace-aviation.html",
    "https://www.eventseye.com/fairs/cl_law-enforcement.html",
)


async def list_expo_candidates() -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for cat_url in _CATEGORIES:
        try:
            page = await fetch(cat_url, force_render=False)
        except Exception as e:  # noqa: BLE001
            _log.debug("eventseye.fetch_failed", url=cat_url, error=str(e)[:160])
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
            # Event detail pages on eventseye have URL pattern /F/<id>_<slug>.html
            if "/F/" not in absolute and "/fairs/" not in absolute:
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            out.append(
                {
                    "name": text[:200],
                    "aggregator_url": absolute,
                    "official_url": None,
                    "source": "eventseye",
                }
            )

    _log.info("eventseye.scraped", candidates=len(out))
    return out


__all__ = ["list_expo_candidates"]
