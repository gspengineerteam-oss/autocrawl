"""Internet Archive items search (free, no auth).

archive.org indexes scanned trade publications, conference programs, government
defense reports, and lots of niche content that mainstream search engines don't
crawl. Useful especially for historical expos and to get authoritative
provenance for older event names.

API docs: https://archive.org/advancedsearch.php
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
    if not get_settings().enable_internet_archive:
        return []

    url = "https://archive.org/advancedsearch.php"
    params = {
        "q": query,
        "fl[]": ["identifier", "title", "description"],
        "rows": min(max_results, 25),
        "page": 1,
        "output": "json",
        "sort[]": "downloads desc",
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as e:
        _log.debug("internet_archive.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    docs = (data.get("response") or {}).get("docs") or []
    hits: list[SearchHit] = []
    for d in docs[:max_results]:
        ident = d.get("identifier") or ""
        if not ident:
            continue
        title = d.get("title") or ident
        if isinstance(title, list):
            title = title[0] if title else ident
        desc = d.get("description") or ""
        if isinstance(desc, list):
            desc = " ".join(str(x) for x in desc)
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=f"https://archive.org/details/{ident}",
                snippet=str(desc)[:500],
                source="internet_archive",
            )
        )

    _log.info("internet_archive.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
