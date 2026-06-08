"""Naver search scraper. Free, no key. Critical for Korean vendors."""

from __future__ import annotations

from urllib.parse import quote

from selectolax.parser import HTMLParser

from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..browsers.fetcher import fetch
from ..url_utils import canonical_url
from .base import SearchHit

_log = get_logger(__name__)
_BASE = "https://search.naver.com/search.naver"


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    url = f"{_BASE}?where=web&query={quote(query)}"
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="naver").inc()
        _log.debug("naver.fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)
    # Naver web results are inside div.total_wrap / li.bx
    for node in tree.css("li.bx, div.total_wrap, div.api_subject_bx"):
        a = node.css_first("a.link_tit, a.api_txt_lines, .total_tit a, h3 a")
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
        snippet_node = node.css_first(".api_txt_lines.dsc_txt, .total_dsc, .dsc_txt_wrap")
        snippet = snippet_node.text(strip=True) if snippet_node else ""
        out.append(SearchHit(title=title[:300], url=cu, snippet=snippet[:500], source="naver"))
        if len(out) >= max_results:
            break
    return out
