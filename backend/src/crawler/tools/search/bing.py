"""Bing Web Search via official Azure API (free tier 1000 req/month).

Microsoft's Bing Web Search has good coverage for global queries plus easy
free tier through Azure. Different result ranking from Google, useful as
an additional independent index.

If `BING_API_KEY` empty or `ENABLE_BING=false`, provider returns silently.
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
    if not s.enable_bing or not s.bing_api_key:
        return []

    url = "https://api.bing.microsoft.com/v7.0/search"
    headers = {"Ocp-Apim-Subscription-Key": s.bing_api_key}
    params = {
        "q": query,
        "count": min(max_results, 20),
        "responseFilter": "Webpages",
        "textDecorations": "false",
        "textFormat": "Raw",
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as e:
        _log.debug("bing.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        if resp.status_code == 401:
            _log.warning("bing.unauthorized")
        elif resp.status_code == 429:
            _log.info("bing.rate_limited")
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    web_results = ((data.get("webPages") or {}).get("value")) or []
    hits: list[SearchHit] = []
    for item in web_results[:max_results]:
        out_url = item.get("url") or ""
        title = item.get("name") or ""
        if not out_url or not title:
            continue
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(out_url),
                snippet=str(item.get("snippet") or "")[:500],
                source="bing",
            )
        )

    _log.info("bing.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
