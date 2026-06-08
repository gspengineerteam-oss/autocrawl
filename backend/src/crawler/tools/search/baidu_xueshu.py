"""Baidu Scholar (Baidu Xueshu, 百度学术) scraper.

Why this matters for security/defense vendor discovery:
- CNKI (中国知网) is the canonical Chinese academic index but requires
  institutional auth + uses hostile anti-crawl tokens. Baidu Scholar
  re-indexes most CNKI content (titles + abstracts) plus Wanfang +
  open-access journals + industry whitepapers — and the SERP is the
  same scrape pattern as the Baidu web SERP we already handle.
- Vendor names appear in case-studies ("基于 XX 公司 智能监控平台 的研究"),
  thesis acknowledgements, and product whitepapers that no Western
  index touches.

We hit https://xueshu.baidu.com/s?wd=... and parse the result list. The
result URL points to xueshu.baidu.com's wrapper — `data-click` /
`data-url` attributes carry the underlying CNKI / Wanfang URL when the
agent wants to chase a paper, otherwise the wrapper page itself has the
abstract inline (good enough for vendor-name extraction).
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
_BASE = "https://xueshu.baidu.com/s"


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    # `tn=SE_baiduxueshu_c1gjeupa` is the param Baidu Scholar uses internally
    # for academic SERP; without it Baidu sometimes redirects to web SERP.
    url = (
        f"{_BASE}?wd={quote(query)}"
        f"&tn=SE_baiduxueshu_c1gjeupa&ie=utf-8&rsv_bp=0&sc_f_para=sc_tasktype%3D%7BfirstSimpleSearch%7D"
    )
    try:
        page = await fetch(url, force_render=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="baidu_xueshu").inc()
        _log.debug("baidu_xueshu.fetch_failed", query=query, error=str(e))
        return []
    html = page.get("html", "")
    if not html:
        return []

    out: list[SearchHit] = []
    seen: set[str] = set()
    tree = HTMLParser(html)

    # Baidu Scholar result containers: div.sc_default_result / div.result.sc_default_result
    # Each has a sc_content > h3.t > a (title link) + .c_abstract (abstract text)
    for node in tree.css(
        "div.sc_default_result, div.result.sc_default_result, div.sc_result"
    ):
        a = node.css_first("h3.t a, .sc_content h3 a, h3 a")
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
        abstract_node = node.css_first(".c_abstract, .abstract, .sc_abstract")
        abstract = abstract_node.text(strip=True) if abstract_node else ""
        # Authors + venue line — useful signal for vendor-extraction (often
        # contains 公司 / 集团 / 研究院 affiliations).
        author_node = node.css_first(".sc_info, .author_wr, .sc_author")
        author = author_node.text(strip=True) if author_node else ""
        snippet = (abstract or "")
        if author:
            snippet = f"[{author}] {snippet}"
        out.append(
            SearchHit(
                title=title[:300],
                url=cu,
                snippet=snippet[:500],
                source="baidu_xueshu",
            )
        )
        if len(out) >= max_results:
            break
    return out
