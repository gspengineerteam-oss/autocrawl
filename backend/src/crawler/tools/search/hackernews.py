"""Hacker News search via Algolia API (free, no auth).

`hn.algolia.com` provides a free public search endpoint covering all HN posts
and comments. We restrict to `tags=story` so we only get top-level submissions,
which are usually the ones linking to expo announcements or vendor websites.

Why HN? Defense-tech, cyber, surveillance topics get heavy discussion there
and members often post links to events, vendor launches, and industry reports
that don't surface on mainstream search engines.
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
    if not get_settings().enable_hackernews:
        return []

    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "query": query,
        "tags": "story",
        "hitsPerPage": min(max_results, 30),
    }
    timeout = httpx.Timeout(15.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as e:
        _log.debug("hackernews.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    items = data.get("hits") or []
    hits: list[SearchHit] = []
    for it in items[:max_results]:
        ext_url = it.get("url")
        story_id = it.get("objectID")
        title = it.get("title") or it.get("story_title") or ""
        if not (ext_url or story_id) or not title:
            continue
        # Prefer the external link (more useful), fall back to HN thread.
        out_url = ext_url or f"https://news.ycombinator.com/item?id={story_id}"
        snippet = (it.get("story_text") or "")[:400]
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(out_url),
                snippet=str(snippet),
                source="hackernews",
            )
        )

    _log.info("hackernews.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
