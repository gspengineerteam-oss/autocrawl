"""OpenAlex search (free, no auth).

OpenAlex is the OSS replacement for Microsoft Academic Graph: 240M+ scholarly
works, free API, no key required. Useful for finding conference proceedings,
working papers, and cited industry reports that mention expos and vendors.

API docs: https://docs.openalex.org/api-entities/works/search-works
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
    if not get_settings().enable_openalex:
        return []

    url = "https://api.openalex.org/works"
    params = {
        "search": query,
        "per-page": min(max_results, 25),
        "select": "id,title,abstract_inverted_index,doi,primary_location",
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as e:
        _log.debug("openalex.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    hits: list[SearchHit] = []
    for work in (data.get("results") or [])[:max_results]:
        title = work.get("title") or ""
        # Prefer DOI URL, fall back to OpenAlex ID URL.
        doi = work.get("doi") or ""
        url_out = doi if doi else (work.get("id") or "")
        if not url_out or not title:
            continue
        # OpenAlex stores abstract inverted (word -> positions) for legal reasons.
        # Reconstruct the first ~80 words for snippet display.
        snippet = _reconstruct_abstract(work.get("abstract_inverted_index"))
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(url_out),
                snippet=snippet[:500],
                source="openalex",
            )
        )

    _log.info("openalex.merged", query=query[:60], hits=len(hits))
    return hits


def _reconstruct_abstract(inverted: dict | None) -> str:
    if not isinstance(inverted, dict):
        return ""
    positions: list[tuple[int, str]] = []
    for word, idxs in inverted.items():
        if isinstance(idxs, list):
            for idx in idxs:
                positions.append((int(idx), str(word)))
    positions.sort()
    return " ".join(w for _, w in positions[:80])


__all__ = ["search"]
