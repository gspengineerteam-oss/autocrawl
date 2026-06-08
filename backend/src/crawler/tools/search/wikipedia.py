"""Wikipedia direct REST integration via the MediaWiki Action API.

Replaces the previous minimal `/v1/search/page` wrapper with a full client
exposing OpenSearch, full-text search, category enumeration, page extracts,
inbound/outbound links, and external links. Used as the Tier-1 discovery
source for the multi-search aggregator.

ToS notes:
- User-Agent header is mandatory; generic browsers UAs are blocked.
- Send `maxlag=5` so Wikipedia can reject our requests when their replicas
  are stressed; we back off on `ratelimited` errors.
- Concurrency limit of 2 in-flight requests at a time.

Doc anchors:
  https://www.mediawiki.org/wiki/API:Main_page
  https://www.mediawiki.org/wiki/API:Opensearch
  https://www.mediawiki.org/wiki/API:Categorymembers
  https://www.mediawiki.org/wiki/API:Extracts
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..http_proxy import proxied_client
from .base import SearchHit

_log = get_logger(__name__)

_BASE = "https://en.wikipedia.org/w/api.php"
_USER_AGENT = (
    "AutoCrawler/0.2 (+https://github.com/autocrawler; "
    "gemilangsatriaperkasa@gmail.com) httpx"
)
_HEADERS = {
    "User-Agent": _USER_AGENT,
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
}
_SEM = asyncio.Semaphore(2)


class WikiRateLimited(Exception):
    """Raised when Wikipedia returns ratelimited so tenacity can back off."""


async def _request(params: dict[str, Any], *, timeout: float | None = None) -> dict[str, Any]:
    """Single API call with shared semaphore + retry on rate limit / network errors."""
    timeout = timeout or get_settings().global_request_timeout_seconds

    full_params = {
        "format": "json",
        "formatversion": 2,
        "maxlag": 5,
        **params,
    }

    async for attempt in AsyncRetrying(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((WikiRateLimited, httpx.TimeoutException, httpx.NetworkError)),
    ):
        with attempt:
            async with _SEM, proxied_client(timeout=timeout, headers=_HEADERS) as client:
                resp = await client.get(_BASE, params=full_params)
                if resp.status_code == 429:
                    raise WikiRateLimited("HTTP 429 from Wikipedia")
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and "error" in data:
                    code = data["error"].get("code", "")
                    if code in {"ratelimited", "maxlag"}:
                        raise WikiRateLimited(f"Wikipedia error: {code}")
                return data
    raise RuntimeError("unreachable")


async def opensearch(query: str, *, limit: int = 10) -> list[SearchHit]:
    """Type-ahead search returning a flat list of titles + URLs.

    OpenSearch returns a list, not a dict, so we route around `_request`
    and call httpx directly here while reusing the same headers + retry.
    """
    if not query.strip():
        return []
    timeout = get_settings().global_request_timeout_seconds
    params = {
        "action": "opensearch",
        "search": query,
        "limit": limit,
        "namespace": 0,
        "format": "json",
    }
    payload: Any = None
    try:
        async for attempt in AsyncRetrying(
            reraise=True,
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception_type(
                (WikiRateLimited, httpx.TimeoutException, httpx.NetworkError)
            ),
        ):
            with attempt:
                async with _SEM, proxied_client(timeout=timeout, headers=_HEADERS) as client:
                    resp = await client.get(_BASE, params=params)
                    if resp.status_code == 429:
                        raise WikiRateLimited("HTTP 429 from Wikipedia")
                    resp.raise_for_status()
                    payload = resp.json()
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="wikipedia_opensearch").inc()
        _log.warning("wikipedia.opensearch_failed", query=query, error=str(e))
        return []

    if not isinstance(payload, list) or len(payload) < 4:
        return []

    titles = payload[1] if isinstance(payload[1], list) else []
    descs = payload[2] if isinstance(payload[2], list) else []
    urls = payload[3] if isinstance(payload[3], list) else []
    out: list[SearchHit] = []
    for i, title in enumerate(titles):
        url = urls[i] if i < len(urls) else ""
        snippet = descs[i] if i < len(descs) else ""
        if title and url:
            out.append(
                SearchHit(
                    title=str(title),
                    url=str(url),
                    snippet=str(snippet),
                    source="wikipedia",
                )
            )
    return out


async def fulltext_search(query: str, *, limit: int = 10) -> list[SearchHit]:
    """Full-text search via action=query&list=search. Use as fallback for OpenSearch misses."""
    if not query.strip():
        return []
    try:
        data = await _request(
            {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": limit,
                "srnamespace": 0,
            }
        )
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="wikipedia_search").inc()
        _log.warning("wikipedia.search_failed", query=query, error=str(e))
        return []

    out: list[SearchHit] = []
    for page in data.get("query", {}).get("search", []) or []:
        title = page.get("title") or ""
        slug = title.replace(" ", "_")
        out.append(
            SearchHit(
                title=title,
                url=f"https://en.wikipedia.org/wiki/{slug}",
                snippet=page.get("snippet", "") or "",
                source="wikipedia",
            )
        )
    return out


async def category_members(category: str, *, limit: int = 500) -> list[SearchHit]:
    """List page titles directly in a category. Best for exhaustive enumeration."""
    if not category.strip():
        return []
    norm = category if category.lower().startswith("category:") else f"Category:{category}"
    out: list[SearchHit] = []
    cmcontinue: str | None = None

    while True:
        params: dict[str, Any] = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": norm,
            "cmlimit": min(500, max(1, limit - len(out))),
            "cmnamespace": 0,
            "cmtype": "page",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        try:
            data = await _request(params)
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="search", category="wikipedia_categorymembers").inc()
            _log.warning(
                "wikipedia.category_members_failed",
                category=norm,
                error=str(e),
            )
            return out

        members = data.get("query", {}).get("categorymembers", []) or []
        for m in members:
            title = m.get("title") or ""
            if not title:
                continue
            slug = title.replace(" ", "_")
            out.append(
                SearchHit(
                    title=title,
                    url=f"https://en.wikipedia.org/wiki/{slug}",
                    snippet=norm,
                    source="wikipedia",
                )
            )
            if len(out) >= limit:
                return out

        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break
    return out


async def extracts(titles: list[str]) -> dict[str, str]:
    """Batch fetch plain-text intro extracts. Up to 50 titles per call."""
    if not titles:
        return {}
    out: dict[str, str] = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        try:
            data = await _request(
                {
                    "action": "query",
                    "prop": "extracts",
                    "exintro": 1,
                    "explaintext": 1,
                    "exsentences": 5,
                    "titles": "|".join(chunk),
                }
            )
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="search", category="wikipedia_extracts").inc()
            _log.warning("wikipedia.extracts_failed", error=str(e))
            continue
        for page in data.get("query", {}).get("pages", []) or []:
            t = page.get("title") or ""
            if t:
                out[t] = page.get("extract") or ""
    return out


async def page_categories(titles: list[str]) -> dict[str, list[str]]:
    """Batch fetch category memberships per title."""
    if not titles:
        return {}
    out: dict[str, list[str]] = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        try:
            data = await _request(
                {
                    "action": "query",
                    "prop": "categories",
                    "cllimit": "max",
                    "titles": "|".join(chunk),
                }
            )
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="search", category="wikipedia_categories").inc()
            _log.warning("wikipedia.categories_failed", error=str(e))
            continue
        for page in data.get("query", {}).get("pages", []) or []:
            t = page.get("title") or ""
            if not t:
                continue
            cats = [c.get("title", "") for c in page.get("categories", []) or [] if c.get("title")]
            out[t] = cats
    return out


async def extlinks(title: str, *, limit: int = 200) -> list[str]:
    """External URLs cited by an article. Use to find vendor/expo official sites."""
    if not title.strip():
        return []
    out: list[str] = []
    eloffset: int | None = None
    while True:
        params: dict[str, Any] = {
            "action": "query",
            "prop": "extlinks",
            "ellimit": "max",
            "titles": title,
        }
        if eloffset is not None:
            params["eloffset"] = eloffset
        try:
            data = await _request(params)
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="search", category="wikipedia_extlinks").inc()
            _log.warning("wikipedia.extlinks_failed", title=title, error=str(e))
            return out
        pages = data.get("query", {}).get("pages", []) or []
        for page in pages:
            for el in page.get("extlinks", []) or []:
                url = el.get("url") if isinstance(el, dict) else el
                if isinstance(url, str) and url.startswith(("http://", "https://")):
                    out.append(url)
                    if len(out) >= limit:
                        return out
        eloffset = data.get("continue", {}).get("eloffset")
        if eloffset is None:
            break
    return out


async def outbound_links(title: str, *, limit: int = 500) -> list[str]:
    """Internal /wiki/ links from an article (mainspace only)."""
    if not title.strip():
        return []
    out: list[str] = []
    plcontinue: str | None = None
    while True:
        params: dict[str, Any] = {
            "action": "query",
            "prop": "links",
            "plnamespace": 0,
            "pllimit": "max",
            "titles": title,
        }
        if plcontinue:
            params["plcontinue"] = plcontinue
        try:
            data = await _request(params)
        except Exception as e:  # noqa: BLE001
            errors_total.labels(stage="search", category="wikipedia_links").inc()
            _log.warning("wikipedia.links_failed", title=title, error=str(e))
            return out
        for page in data.get("query", {}).get("pages", []) or []:
            for link in page.get("links", []) or []:
                t = link.get("title") if isinstance(link, dict) else None
                if t:
                    out.append(t)
                    if len(out) >= limit:
                        return out
        plcontinue = data.get("continue", {}).get("plcontinue")
        if not plcontinue:
            break
    return out


async def search(query: str, *, max_results: int = 10) -> list[SearchHit]:
    """Backward-compatible wrapper: try OpenSearch first, fallback to fulltext."""
    hits = await opensearch(query, limit=max_results)
    if len(hits) >= 3:
        return hits
    extra = await fulltext_search(query, limit=max_results)
    seen = {h.url for h in hits}
    for e in extra:
        if e.url not in seen:
            hits.append(e)
            seen.add(e.url)
    return hits[:max_results]
