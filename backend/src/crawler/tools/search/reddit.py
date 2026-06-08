"""Reddit search via public JSON endpoint (no OAuth required).

Reddit exposes `/r/{sub}/search.json?q=...&restrict_sr=on` for read-only access
without an API key. Rate limit is moderate (~60 req/min per IP unauthenticated)
which is fine for the small fan-out we do per discovery run.

Subreddits queried come from `Settings.reddit_subreddits` (comma-separated).
The default list targets defense/security/cyber communities where members
often link to upcoming expos and trade shows in self-posts and comments.
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

_USER_AGENT = "AutoCrawler/0.2 (security/defense expo discovery)"


def _subreddits() -> list[str]:
    raw = (get_settings().reddit_subreddits or "").strip()
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


async def _query_subreddit(
    client: httpx.AsyncClient, sub: str, query: str, limit: int
) -> list[SearchHit]:
    url = f"https://www.reddit.com/r/{sub}/search.json"
    params = {
        "q": query,
        "restrict_sr": "on",
        "sort": "relevance",
        "limit": min(limit, 25),
        "t": "year",
    }
    try:
        resp = await client.get(url, params=params, headers={"User-Agent": _USER_AGENT})
    except httpx.RequestError as e:
        _log.debug("reddit.request_failed", sub=sub, error=str(e)[:160])
        return []

    if resp.status_code == 429:
        _log.info("reddit.rate_limited", sub=sub)
        return []
    if resp.status_code >= 400:
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    children = (data.get("data") or {}).get("children") or []
    hits: list[SearchHit] = []
    for child in children[:limit]:
        post = (child or {}).get("data") or {}
        title = post.get("title") or ""
        # Reddit posts have either url_overridden_by_dest (link posts) or
        # the canonical reddit permalink (self posts). Prefer the external URL
        # since it usually points at the expo announcement we want to crawl.
        ext_url = post.get("url_overridden_by_dest")
        permalink = post.get("permalink")
        out_url = ext_url or (f"https://www.reddit.com{permalink}" if permalink else "")
        if not out_url:
            continue
        snippet = (post.get("selftext") or "")[:400]
        hits.append(
            SearchHit(
                title=title[:300],
                url=out_url,
                snippet=snippet,
                source=f"reddit_{sub}",
            )
        )
    return hits


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    """Fan out across configured subreddits in parallel."""
    settings = get_settings()
    if not settings.enable_reddit:
        return []
    subs = _subreddits()
    if not subs:
        return []

    per_sub = max(1, max_results // max(1, len(subs)))
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with proxied_client(timeout=timeout, follow_redirects=True) as client:
        results = await asyncio.gather(
            *[_query_subreddit(client, sub, query, per_sub) for sub in subs],
            return_exceptions=True,
        )

    merged: list[SearchHit] = []
    seen: set[str] = set()
    for sub, batch in zip(subs, results, strict=True):
        if isinstance(batch, BaseException):
            _log.debug("reddit.subreddit_failed", sub=sub, error=str(batch)[:160])
            continue
        for hit in batch:
            if hit.url in seen:
                continue
            seen.add(hit.url)
            merged.append(hit)
            if len(merged) >= max_results:
                break
        if len(merged) >= max_results:
            break

    _log.info("reddit.merged", query=query[:60], subs=len(subs), hits=len(merged))
    return merged


__all__ = ["search"]
