"""Jina Search wrapper (https://s.jina.ai).

Jina AI's Search endpoint takes a free-form query and returns LLM-friendly
search results. Two modes we exploit:

1. Standard JSON: `Accept: application/json` returns `[{title, url, content}]`
   with the top N pages already fetched + cleaned to markdown. Useful for
   resolve hops where we want both the candidate URL AND its snippet for
   semantic re-ranking.

2. Fast no-content: `X-Respond-With: no-content` returns only titles +
   URLs without fetching page bodies. Cuts response time roughly in half
   when we only need a URL ranking, not content.

Paid tier (with JINA_API_KEY) raises rate limits to ~200 RPM and unlocks
the JSON mode + custom result count via `?num=N`.

Used by enrich_worker as tier 0 of the domain resolve hop (faster than
the 25-engine fanout in name_resolver, with built-in re-ranking).
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

from ...config import get_settings
from ...observability.logger import get_logger

_log = get_logger(__name__)


class JinaSearchHit:
    __slots__ = ("title", "url", "content")

    def __init__(self, title: str, url: str, content: str) -> None:
        self.title = title
        self.url = url
        self.content = content

    def __repr__(self) -> str:  # pragma: no cover
        return f"JinaSearchHit(url={self.url!r}, title={self.title[:60]!r})"


async def search(
    query: str,
    *,
    site_filter: list[str] | None = None,
    num: int = 5,
    geo_country: str | None = None,
    geo_lang: str | None = None,
    fast_no_content: bool = False,
    timeout_seconds: int = 20,
) -> list[JinaSearchHit]:
    """Run a Jina web search. Returns top hits (default 5).

    Args:
        query: Free-form search string. URL-encoding handled internally.
        site_filter: Optional list of domains to restrict (`?site=a.com&site=b.com`).
        num: Max hits to return (Jina caps around 20).
        geo_country: ISO country code (e.g. "de", "id") for geo-targeting.
        geo_lang: Language hint (e.g. "de", "en").
        fast_no_content: If True, skip fetching page bodies (URLs+titles only).
        timeout_seconds: Per-request timeout ceiling.

    Returns:
        List of JinaSearchHit (possibly empty). Never raises — failures
        log + return [].
    """
    if not query or not query.strip():
        return []
    s = get_settings()
    api_key = (s.jina_api_key or "").strip()
    use_auth = bool(api_key) and api_key != "REPLACE_WITH_YOUR_JINA_API_KEY"

    base = "https://s.jina.ai/" + quote(query.strip(), safe="")
    params: list[tuple[str, str]] = []
    for site in site_filter or []:
        params.append(("site", site))
    if geo_country:
        params.append(("gl", geo_country))
    if geo_lang:
        params.append(("hl", geo_lang))
    if num:
        params.append(("num", str(min(int(num), 20))))

    # Free tier sends no Authorization header -> rate-limited (~5 RPM per IP)
    # but works without paid plan. Paid key boosts to ~200 RPM. Falling back
    # to free is graceful when key revoked / negative balance.
    headers = {
        "Accept": "application/json",
        "User-Agent": "AutoCrawler/0.3",
    }
    if use_auth:
        headers["Authorization"] = f"Bearer {api_key}"
    if fast_no_content:
        headers["X-Respond-With"] = "no-content"

    timeout = httpx.Timeout(float(timeout_seconds), connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(base, headers=headers, params=params)
    except httpx.RequestError as e:
        _log.debug("jina_search.request_failed", query=query[:60], error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        if resp.status_code == 429:
            _log.info("jina_search.rate_limited")
        else:
            _log.debug(
                "jina_search.http_error",
                status=resp.status_code, query=query[:60],
            )
        return []

    try:
        body = resp.json()
    except ValueError:
        _log.debug("jina_search.json_decode_failed", query=query[:60])
        return []

    # Jina sometimes wraps results in `{"data": [...]}` instead of returning
    # a bare array. Handle both shapes.
    if isinstance(body, dict):
        raw_hits = body.get("data") or body.get("results") or []
    elif isinstance(body, list):
        raw_hits = body
    else:
        raw_hits = []

    out: list[JinaSearchHit] = []
    for r in raw_hits:
        if not isinstance(r, dict):
            continue
        url = (r.get("url") or "").strip()
        if not url:
            continue
        out.append(JinaSearchHit(
            title=(r.get("title") or "").strip(),
            url=url,
            content=(r.get("content") or r.get("snippet") or "").strip(),
        ))

    _log.debug(
        "jina_search.ok",
        query=query[:60], num_hits=len(out), fast=fast_no_content,
    )
    return out


__all__ = ["JinaSearchHit", "search"]
