"""Tavily AI search (free tier 1000 req/month, key opsional).

Tavily is built specifically for AI agents — returns clean, deduplicated
results with cleaned summaries instead of raw HTML excerpts. Great signal
when active, but requires user-provided API key (free at tavily.com).

If `TAVILY_API_KEY` is empty or `ENABLE_TAVILY=false`, the provider returns
silently to keep the multi-search pipeline tolerant of missing config.
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
    if not s.enable_tavily or not s.tavily_api_key:
        return []

    url = "https://api.tavily.com/search"
    payload = {
        "api_key": s.tavily_api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": min(max_results, 20),
        "include_answer": False,
        "include_raw_content": False,
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
    except httpx.RequestError as e:
        _log.debug("tavily.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        if resp.status_code == 401:
            _log.warning("tavily.unauthorized")
        elif resp.status_code == 429:
            _log.info("tavily.rate_limited")
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    hits: list[SearchHit] = []
    for item in (data.get("results") or [])[:max_results]:
        out_url = item.get("url") or ""
        title = item.get("title") or ""
        if not out_url or not title:
            continue
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(out_url),
                snippet=str(item.get("content") or "")[:500],
                source="tavily",
            )
        )

    _log.info("tavily.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
