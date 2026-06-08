"""arXiv search via public Atom API (no auth).

arXiv hosts research papers in cybersecurity, cryptography, surveillance,
autonomous systems, and many other defense-relevant fields. Papers frequently
cite expos and conferences in their bibliography (CVPR for surveillance,
NDSS for cyber, AAAI for AI/autonomy) and link to vendor research portals.

We hit `export.arxiv.org/api/query` directly — the langchain ArxivRetriever
adds dependencies we don't need (PyMuPDF parsing, etc.) since we only want
title plus abstract for the LLM extractor.
"""

from __future__ import annotations

import re

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from ..http_proxy import proxied_client
from .base import SearchHit

_log = get_logger(__name__)


_ENTRY_RE = re.compile(r"<entry>(.*?)</entry>", re.DOTALL)
_TAG_RE = re.compile(r"<{tag}[^>]*>(.*?)</{tag}>", re.DOTALL)


def _extract(entry: str, tag: str) -> str:
    m = re.search(_TAG_RE.pattern.format(tag=tag), entry, re.DOTALL)
    if not m:
        return ""
    return re.sub(r"\s+", " ", m.group(1)).strip()


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    if not get_settings().enable_arxiv:
        return []

    url = "https://export.arxiv.org/api/query"
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": min(max_results, 30),
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with proxied_client(timeout=timeout) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as e:
        _log.debug("arxiv.request_failed", error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    text = resp.text
    hits: list[SearchHit] = []
    for entry in _ENTRY_RE.findall(text):
        title = _extract(entry, "title")
        summary = _extract(entry, "summary")
        link_match = re.search(r'<id>(.*?)</id>', entry, re.DOTALL)
        link = link_match.group(1).strip() if link_match else ""
        if not link or not title:
            continue
        hits.append(
            SearchHit(
                title=title[:300],
                url=link,
                snippet=summary[:500],
                source="arxiv",
            )
        )

    _log.info("arxiv.merged", query=query[:60], hits=len(hits))
    return hits


__all__ = ["search"]
