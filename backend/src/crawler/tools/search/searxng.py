"""SearXNG self-hosted meta-search (no API key, OSS).

SearXNG aggregates 70+ search engines (Google, Bing, DuckDuckGo, Yandex,
Baidu, Qwant, Mojeek, Brave, etc.) and returns deduplicated results in JSON.
Running it self-hosted means no rate limits we don't control, and we don't
expose our IP directly to any single engine.

Container is defined in docker-compose.yml as service `searxng` listening
on `http://searxng:8080`. The `format=json` endpoint requires the instance
to enable JSON output in its `settings.yml` — the official image does this
by default.

If `ENABLE_SEARXNG=false` or the URL is unreachable, the provider returns
silently so the rest of the pipeline keeps moving.
"""

from __future__ import annotations

from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from .base import SearchHit

# Note: SearXNG runs as a docker-internal service (`searxng:8080`). We do NOT
# route through the VPN proxy because the VPN exit node can't resolve
# compose-internal hostnames. SearXNG itself proxies upstream search engines
# through whatever VPN config it has internally.

_log = get_logger(__name__)


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    s = get_settings()
    if not s.enable_searxng:
        return []

    url = f"{s.searxng_url.rstrip('/')}/search"
    params = {
        "q": query,
        "format": "json",
        "language": "en",
        "safesearch": "0",
        # `general` covers most engines; `news` adds newsfeed coverage.
        "categories": "general,news",
    }
    headers = {"User-Agent": "AutoCrawler/0.2"}
    timeout = httpx.Timeout(s.searxng_timeout_seconds, connect=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params=params, headers=headers)
    except httpx.RequestError as e:
        _log.debug("searxng.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    items = data.get("results") or []
    hits: list[SearchHit] = []
    for item in items[:max_results]:
        out_url = item.get("url") or ""
        title = item.get("title") or ""
        if not out_url or not title:
            continue
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(out_url),
                snippet=str(item.get("content") or "")[:500],
                source="searxng",
            )
        )

    _log.info("searxng.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
