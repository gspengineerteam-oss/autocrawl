"""Semantic Scholar search via public API (no auth required).

Allen Institute's Semantic Scholar covers 200M+ papers across CS, defense,
and policy domains. Coverage overlaps OpenAlex but with different ranking,
so running both gives broader recall.

API docs: https://api.semanticscholar.org/api-docs/
Rate limit: ~100 req/5min unauthenticated. We do <30 per discovery, fine.
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
    if not get_settings().enable_semantic_scholar:
        return []

    url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = {
        "query": query,
        "limit": min(max_results, 25),
        "fields": "title,abstract,url,openAccessPdf,externalIds",
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as e:
        _log.debug("semantic_scholar.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        if resp.status_code == 429:
            _log.info("semantic_scholar.rate_limited")
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    hits: list[SearchHit] = []
    for paper in (data.get("data") or [])[:max_results]:
        title = paper.get("title") or ""
        out_url = paper.get("url") or ""
        if not out_url:
            ext = paper.get("externalIds") or {}
            doi = ext.get("DOI")
            if doi:
                out_url = f"https://doi.org/{doi}"
        if not out_url or not title:
            continue
        hits.append(
            SearchHit(
                title=str(title)[:300],
                url=str(out_url),
                snippet=(paper.get("abstract") or "")[:500],
                source="semantic_scholar",
            )
        )

    _log.info("semantic_scholar.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
