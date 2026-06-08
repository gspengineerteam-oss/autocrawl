"""Google News RSS — free, no-key. Best for fresh expo announcements."""

from __future__ import annotations

import urllib.parse

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..http_proxy import proxied_client
from .base import SearchHit

_log = get_logger(__name__)
_BASE = "https://news.google.com/rss/search"


async def search(query: str, *, max_results: int = 20, hl: str = "en", gl: str = "US") -> list[SearchHit]:
    import feedparser  # type: ignore

    params = {"q": query, "hl": hl, "gl": gl, "ceid": f"{gl}:{hl}"}
    url = f"{_BASE}?{urllib.parse.urlencode(params)}"

    timeout = get_settings().global_request_timeout_seconds
    try:
        async with proxied_client(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 AutoCrawler"})
            resp.raise_for_status()
            feed = feedparser.parse(resp.text)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="google_news").inc()
        _log.warning("google_news.fetch_failed", query=query, error=str(e))
        return []

    out: list[SearchHit] = []
    for entry in (feed.entries or [])[:max_results]:
        out.append(
            SearchHit(
                title=getattr(entry, "title", "") or "",
                url=getattr(entry, "link", "") or "",
                snippet=getattr(entry, "summary", "") or "",
                source="google_news_rss",
            )
        )
    return out
