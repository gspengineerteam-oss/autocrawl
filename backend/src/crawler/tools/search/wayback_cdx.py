"""Wayback Machine CDX search (free, no auth).

The Wayback Machine indexes 800B+ historical web pages. Its CDX API lets us
search captured URLs by domain and pattern, useful for:

- Discovering old expo URLs that 404 on the live web but still have content
  in archive snapshots.
- Finding past editions of an expo (`expo-2020.example.com`, `expo-2024...`)
  that hint at the canonical 2026 page structure.
- Resolving moved/renamed events.

API docs: https://web.archive.org/web/timemap/
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
    """Treat query as a URL substring; CDX returns capture entries that match."""
    if not get_settings().enable_wayback_cdx:
        return []

    # CDX expects a URL pattern. Use wildcards around the query for fuzzy match.
    url_pattern = f"*{query.replace(' ', '*')}*"
    url = "http://web.archive.org/cdx/search/cdx"
    params = {
        "url": url_pattern,
        "output": "json",
        "limit": min(max_results, 25),
        "filter": "statuscode:200",
        "collapse": "urlkey",
        "fl": "original,timestamp,mimetype,statuscode",
        "from": "20240101",
    }
    timeout = httpx.Timeout(25.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as e:
        _log.debug("wayback_cdx.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    try:
        rows: Any = resp.json()
    except ValueError:
        return []

    if not isinstance(rows, list) or len(rows) <= 1:
        return []

    header = rows[0]
    try:
        url_idx = header.index("original")
        ts_idx = header.index("timestamp")
    except (ValueError, AttributeError):
        return []

    hits: list[SearchHit] = []
    seen: set[str] = set()
    for row in rows[1:]:
        if not isinstance(row, list) or len(row) <= max(url_idx, ts_idx):
            continue
        original = str(row[url_idx])
        timestamp = str(row[ts_idx])
        if original in seen:
            continue
        seen.add(original)
        playback = f"https://web.archive.org/web/{timestamp}/{original}"
        hits.append(
            SearchHit(
                title=original[:300],
                url=playback,
                snippet=f"Wayback snapshot from {timestamp}",
                source="wayback_cdx",
            )
        )
        if len(hits) >= max_results:
            break

    _log.info("wayback_cdx.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
