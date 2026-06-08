"""Baidu search scraper. Free, no key. Critical for Chinese vendors that
don't appear in Western indexes."""

from __future__ import annotations

from urllib.parse import quote

from selectolax.parser import HTMLParser

from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..browsers.fetcher import fetch
from ..url_utils import canonical_url
from .base import SearchHit

_log = get_logger(__name__)
_BASE = "https://www.baidu.com/s"


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    url = f"{_BASE}?wd={quote(query)}&rn={max_results}"
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="baidu").inc()
        _log.debug("baidu.fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)
    # Baidu organic results have class containing "result" with mu attr or t/h3 child
    for node in tree.css("div.result, div.c-container, div.result-op"):
        a = node.css_first("h3 a, .t a, .c-title a")
        if not a:
            continue
        # Baidu wraps real URL in /link?url=... — prefer mu attribute (real URL) if present
        href = node.attributes.get("mu") or a.attributes.get("href") or ""
        if not href.startswith("http"):
            continue
        cu = canonical_url(href)
        if cu in seen:
            continue
        seen.add(cu)
        title = a.text(strip=True) or ""
        snippet_node = node.css_first(".c-abstract, .content-right_2s-H4, .c-span-last")
        snippet = snippet_node.text(strip=True) if snippet_node else ""
        out.append(SearchHit(title=title[:300], url=cu, snippet=snippet[:500], source="baidu"))
        if len(out) >= max_results:
            break
    return out
