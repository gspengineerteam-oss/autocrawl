"""GitHub search via public REST API.

We exploit two GitHub indexes that often surface curated lists relevant to
defense/security expos:

1. `/search/repositories` — finds repos like `awesome-defense-conferences`
   which usually contain markdown lists of expos with URLs.
2. `/search/code` — finds files mentioning expo names plus exhibitor patterns,
   useful when someone in the wild has open-sourced a vendor list scraper.

Authentication is optional. Without a token, GitHub allows ~10 req/min for
search endpoints. With a personal access token (any scope), it lifts to
30 req/min — plenty for our use.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from ..http_proxy import proxied_client
from .base import SearchHit

_log = get_logger(__name__)


def _headers() -> dict[str, str]:
    s = get_settings()
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AutoCrawler/0.2",
    }
    if s.github_token:
        headers["Authorization"] = f"Bearer {s.github_token}"
    return headers


async def _search_repos(client: httpx.AsyncClient, query: str, limit: int) -> list[SearchHit]:
    url = "https://api.github.com/search/repositories"
    params = {"q": query, "per_page": min(limit, 30), "sort": "stars"}
    try:
        resp = await client.get(url, params=params, headers=_headers())
    except httpx.RequestError as e:
        _log.debug("github_search.repos_failed", error=str(e)[:160])
        return []
    if resp.status_code >= 400:
        return []
    data: Any = resp.json() if resp.text else {}
    out: list[SearchHit] = []
    for it in (data.get("items") or [])[:limit]:
        repo_url = it.get("html_url") or ""
        if not repo_url:
            continue
        out.append(
            SearchHit(
                title=str(it.get("full_name") or "")[:200],
                url=repo_url,
                snippet=str(it.get("description") or "")[:400],
                source="github_repos",
            )
        )
    return out


async def _search_code(client: httpx.AsyncClient, query: str, limit: int) -> list[SearchHit]:
    """Code search needs auth on GitHub side. Skip silently when token is missing."""
    if not get_settings().github_token:
        return []
    url = "https://api.github.com/search/code"
    params = {"q": query, "per_page": min(limit, 30)}
    try:
        resp = await client.get(url, params=params, headers=_headers())
    except httpx.RequestError as e:
        _log.debug("github_search.code_failed", error=str(e)[:160])
        return []
    if resp.status_code >= 400:
        return []
    data: Any = resp.json() if resp.text else {}
    out: list[SearchHit] = []
    for it in (data.get("items") or [])[:limit]:
        url_html = it.get("html_url") or ""
        if not url_html:
            continue
        out.append(
            SearchHit(
                title=f"{it.get('repository', {}).get('full_name', '')} - {it.get('name', '')}"[:200],
                url=url_html,
                snippet=str(it.get("path") or "")[:400],
                source="github_code",
            )
        )
    return out


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    if not get_settings().enable_github_search:
        return []

    timeout = httpx.Timeout(15.0, connect=5.0)
    half = max(1, max_results // 2)
    async with proxied_client(timeout=timeout) as client:
        repos, code = await asyncio.gather(
            _search_repos(client, query, half),
            _search_code(client, query, half),
            return_exceptions=True,
        )

    merged: list[SearchHit] = []
    seen: set[str] = set()
    for batch in (repos, code):
        if isinstance(batch, BaseException):
            continue
        for hit in batch:
            if hit.url in seen:
                continue
            seen.add(hit.url)
            merged.append(hit)
            if len(merged) >= max_results:
                break

    _log.info("github_search.merged", query=query[:60], hits=len(merged))
    return merged


__all__ = ["search"]
