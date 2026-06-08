"""Zhihu (知乎) search scraper. Free, no key.

Why this matters for vendor discovery: Zhihu is the Chinese-language
equivalent of Quora + StackExchange. Procurement professionals,
engineers, and integrators ask "求推荐 / 哪家强" ("recommend a vendor /
which is best") questions about their domain (公共安全装备, 警用装备,
监控摄像头, etc.) — answers cite vendor names, sometimes with photos
of the vendor's products taped to the answer. These threads outrank
many Baidu organic results for procurement-intent queries.

Two surfaces:
  - Search SERP: https://www.zhihu.com/search?q=...&type=content
  - Question detail: https://www.zhihu.com/question/<id>

We hit the SERP and return question/answer URLs. The agent then reads
each thread (Jina Reader works great on Zhihu — strips JS gates).
"""

from __future__ import annotations

from urllib.parse import quote

from selectolax.parser import HTMLParser

from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..browsers.fetcher import fetch
from ..url_utils import canonical_url
from .base import SearchHit

_log = get_logger(__name__)
_BASE = "https://www.zhihu.com/search"


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    # type=content surfaces both questions and standalone answers; Zhihu's
    # JSON API exists but requires auth, so we use the HTML SERP via the
    # rendering fetcher (handles the Cloudflare-style anti-bot challenge).
    url = f"{_BASE}?type=content&q={quote(query)}"
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="zhihu").inc()
        _log.debug("zhihu.fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)
    # Zhihu SERP cards: .SearchResult-Card / .Card.SearchResult-Card / .List-item
    # contain a content-item with a title link to /question/<id> or /question/<id>/answer/<id>
    for node in tree.css(
        ".SearchResult-Card, .Card.SearchResult-Card, .List-item, .ContentItem"
    ):
        a = node.css_first(
            "h2 a, .ContentItem-title a, .Highlight a, .RichContent-title a, "
            "meta[itemprop='url']"
        )
        if not a:
            continue
        href = a.attributes.get("href") or a.attributes.get("content") or ""
        # Zhihu sometimes uses //link.zhihu.com/?target=... wrappers
        if href.startswith("//link.zhihu.com"):
            from urllib.parse import parse_qs, urlparse

            try:
                qs = parse_qs(urlparse("https:" + href).query)
                href = (qs.get("target") or [""])[0]
            except Exception:  # noqa: BLE001
                href = ""
        if href.startswith("/"):
            href = "https://www.zhihu.com" + href
        if href.startswith("//"):
            href = "https:" + href
        if not href.startswith("http"):
            continue
        cu = canonical_url(href)
        if cu in seen:
            continue
        seen.add(cu)
        title_node = node.css_first("h2, .ContentItem-title, .RichContent-title")
        title = title_node.text(strip=True) if title_node else a.text(strip=True)
        snippet_node = node.css_first(
            ".RichContent-inner, .SearchItem-meta, .ContentItem-meta, "
            ".RichText.ztext"
        )
        snippet = snippet_node.text(strip=True) if snippet_node else ""
        out.append(
            SearchHit(
                title=title[:300], url=cu, snippet=snippet[:500], source="zhihu"
            )
        )
        if len(out) >= max_results:
            break
    return out
