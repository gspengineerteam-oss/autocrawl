"""Sogou search scraper — gateway to WeChat 公众号 (公众号 = public account)
articles that Baidu deliberately under-indexes.

Sogou holds an exclusive partnership with Tencent for indexing the WeChat
public-account corpus, which is where a surprising fraction of Chinese
B2B vendor pages live (small manufacturers post product catalogs +
factory tours via 公众号 instead of building a real website).

Two SERP surfaces matter:
  - https://www.sogou.com/web?query=...   → general web results
  - https://weixin.sogou.com/weixin?query=... → WeChat-only results

We hit web first (broader coverage) and weixin as a second pass when
`include_weixin=True` (default ON because that's the whole point of
adding Sogou — Baidu already covers the open web).
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
_WEB = "https://www.sogou.com/web"
_WEIXIN = "https://weixin.sogou.com/weixin"


async def _scrape_web(query: str, max_results: int) -> list[SearchHit]:
    url = f"{_WEB}?query={quote(query)}&num={max_results}"
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="sogou").inc()
        _log.debug("sogou.web_fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)
    # Sogou organic result wrapper: div.vrwrap, .result, .results .rb
    for node in tree.css("div.vrwrap, div.results .rb, div.result"):
        a = node.css_first("h3 a, .vr-title a, a.title")
        if not a:
            continue
        href = a.attributes.get("href") or ""
        # Sogou wraps URLs in /link?url=<base64-ish>; some hits expose the
        # real domain in data-url. Prefer that when present.
        real = node.attributes.get("data-url") or a.attributes.get("data-url")
        if real and real.startswith("http"):
            href = real
        if not href.startswith("http"):
            continue
        cu = canonical_url(href)
        if cu in seen:
            continue
        seen.add(cu)
        title = a.text(strip=True) or ""
        snippet_node = node.css_first(".str-text-info, .ft, p, .star-wiki, .fz-mid")
        snippet = snippet_node.text(strip=True) if snippet_node else ""
        out.append(
            SearchHit(
                title=title[:300], url=cu, snippet=snippet[:500], source="sogou"
            )
        )
        if len(out) >= max_results:
            break
    return out


async def _scrape_weixin(query: str, max_results: int) -> list[SearchHit]:
    """WeChat-only SERP. Hits 公众号 articles directly.

    These URLs typically look like https://mp.weixin.qq.com/s?... — they're
    the article endpoints, not the 公众号 home. The agent can read them
    via Jina Reader / fetch and extract the vendor info inline.
    """
    url = f"{_WEIXIN}?type=2&query={quote(query)}&ie=utf8"
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="sogou_weixin").inc()
        _log.debug("sogou.weixin_fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)
    # Weixin results: ul.news-list > li with .txt-box > h3 > a
    for node in tree.css("ul.news-list li, .news-box .news-list li"):
        a = node.css_first(".txt-box h3 a, h3 a")
        if not a:
            continue
        href = a.attributes.get("href") or ""
        # Sogou returns paths like /link?url=... — they redirect to mp.weixin.qq.com.
        # The fetcher will follow redirects, so we keep the absolute Sogou URL.
        if href.startswith("/"):
            href = "https://weixin.sogou.com" + href
        if not href.startswith("http"):
            continue
        cu = canonical_url(href)
        if cu in seen:
            continue
        seen.add(cu)
        title = a.text(strip=True) or ""
        snippet_node = node.css_first(".txt-info, p.txt-info")
        snippet = snippet_node.text(strip=True) if snippet_node else ""
        out.append(
            SearchHit(
                title=title[:300],
                url=cu,
                snippet=snippet[:500],
                source="sogou_weixin",
            )
        )
        if len(out) >= max_results:
            break
    return out


async def search(
    query: str,
    *,
    max_results: int = 15,
    include_weixin: bool = True,
) -> list[SearchHit]:
    """Combined Sogou web + Sogou WeChat results.

    `include_weixin` (default ON): also hit weixin.sogou.com for 公众号 articles.
    Disable to halve the network cost when the query clearly isn't WeChat-style.
    """
    out: list[SearchHit] = await _scrape_web(query, max_results)

    if include_weixin:
        # Half-budget for weixin to keep total ~max_results post-merge.
        weixin_hits = await _scrape_weixin(query, max(3, max_results // 2))
        seen = {h.url for h in out}
        for h in weixin_hits:
            if h.url not in seen:
                out.append(h)
                seen.add(h.url)

    return out[:max_results]
