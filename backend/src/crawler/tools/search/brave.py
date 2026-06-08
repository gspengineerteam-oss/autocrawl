"""Brave Search via official API (free tier 2000 req/month registered).

Brave Search has its own crawler index (independent from Bing/Google), good
coverage for tech topics, and the free tier is generous. Requires API key
from search.brave.com.

If `BRAVE_API_KEY` empty or `ENABLE_BRAVE=false`, provider returns silently.
"""

from __future__ import annotations

from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from ..http_proxy import proxied_client
from .base import SearchHit

_log = get_logger(__name__)


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    s = get_settings()
    if not s.enable_brave or not s.brave_api_key:
        return []

    url = "https://api.search.brave.com/res/v1/web/search"
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": s.brave_api_key,
    }
    params = {
        "q": query,
        "count": min(max_results, 20),
        "safesearch": "off",
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as e:
        _log.debug("brave.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        if resp.status_code == 401:
            _log.warning("brave.unauthorized")
        elif resp.status_code == 429:
            _log.info("brave.rate_limited")
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    web_results = ((data.get("web") or {}).get("results")) or []
    hits: list[SearchHit] = []
    for item in web_results[:max_results]:
        out_url = item.get("url") or ""
        title = item.get("title") or ""
        if not out_url or not title:
            continue
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(out_url),
                snippet=str(item.get("description") or "")[:500],
                source="brave",
            )
        )

    _log.info("brave.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
