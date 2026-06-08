"""Yahoo! Japan search scraper. Free, no key. Critical for Japanese vendors —
Yahoo Japan still dominates Japanese-language web search."""

from __future__ import annotations

from urllib.parse import quote

from selectolax.parser import HTMLParser

from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..browsers.fetcher import fetch
from ..url_utils import canonical_url
from .base import SearchHit

_log = get_logger(__name__)
_BASE = "https://search.yahoo.co.jp/search"


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    url = f"{_BASE}?p={quote(query)}&n={max_results}"
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="yahoo_japan").inc()
        _log.debug("yahoo_japan.fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)
    # Yahoo JP organic results
    for node in tree.css("div.sw-CardBase, li.Algo, div.Result"):
        a = node.css_first("a.sw-Card__titleInner, h3 a, a[data-cl-params]")
        if not a:
            continue
        href = a.attributes.get("href") or ""
        if not href.startswith("http"):
            continue
        cu = canonical_url(href)
        if cu in seen:
            continue
        seen.add(cu)
        title = a.text(strip=True) or ""
        snippet_node = node.css_first("p.sw-Card__summary, p.compText")
        snippet = snippet_node.text(strip=True) if snippet_node else ""
        out.append(SearchHit(title=title[:300], url=cu, snippet=snippet[:500], source="yahoo_japan"))
        if len(out) >= max_results:
            break
    return out
