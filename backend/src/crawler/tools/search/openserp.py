"""OpenSERP search provider — self-hosted multi-engine SERP scraper.

Calls into a local OpenSERP container (https://github.com/karust/openserp) which
fronts Google, Bing, Yandex, Baidu, and DuckDuckGo via headless Chromium. The
container handles HTML scraping + per-engine quirks; we just talk to its REST
API and shape results into our SearchHit contract.

Trade-offs:
  - Coverage is much better than the ddgs library for niche security/defense
    queries (Google + Bing return long-tail vendor sites that DDG misses).
  - Latency is 2-5s per engine because of the headless browser. Engines run in
    parallel here so wall-time ≈ slowest engine.
  - Captcha can return HTTP 503; we back off exponentially and let the rest of
    the engines fill in. multi.py also catches our exception, so a total
    failure here doesn't sink the run.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from .base import SearchHit

# Note: OpenSERP runs as a docker-internal service (`openserp:7000`). We do
# NOT route through the VPN proxy because the VPN exit can't resolve
# compose-internal hostnames. OpenSERP itself drives headless Chromium with
# its own egress.

_log = get_logger(__name__)


def _engines_list() -> list[str]:
    raw = (get_settings().openserp_engines or "google").strip()
    out = [e.strip().lower() for e in raw.split(",") if e.strip()]
    return out or ["google"]


async def _query_one_engine(
    client: httpx.AsyncClient,
    base_url: str,
    engine: str,
    text: str,
    limit: int,
    max_retries: int,
) -> list[SearchHit]:
    """Hit one engine via OpenSERP. Returns [] on persistent failure."""
    url = f"{base_url.rstrip('/')}/{engine}/search"
    params = {"text": text, "limit": min(limit, 50)}
    backoff = 5.0

    for attempt in range(max_retries + 1):
        try:
            resp = await client.get(url, params=params)
        except httpx.RequestError as e:
            _log.warning(
                "openserp.request_failed",
                engine=engine,
                error=str(e)[:160],
                attempt=attempt,
            )
            if attempt >= max_retries:
                return []
            await asyncio.sleep(backoff)
            backoff *= 2
            continue

        if resp.status_code == 503:
            # Captcha / rate-limit. Backoff + retry.
            _log.info("openserp.captcha", engine=engine, attempt=attempt)
            if attempt >= max_retries:
                return []
            await asyncio.sleep(backoff)
            backoff *= 2
            continue

        if resp.status_code >= 400:
            _log.warning(
                "openserp.http_error",
                engine=engine,
                status=resp.status_code,
                body=resp.text[:200],
            )
            return []

        data: Any
        try:
            data = resp.json()
        except ValueError:
            _log.warning("openserp.bad_json", engine=engine, body=resp.text[:200])
            return []

        # OpenSERP responds with either a top-level list (legacy) or an object
        # with `results: [...]`. Handle both.
        items: list[dict] = []
        if isinstance(data, list):
            items = [r for r in data if isinstance(r, dict)]
        elif isinstance(data, dict):
            raw = data.get("results") or data.get("data") or []
            if isinstance(raw, list):
                items = [r for r in raw if isinstance(r, dict)]

        hits: list[SearchHit] = []
        for it in items[:limit]:
            if it.get("is_ad") is True or it.get("isAd") is True:
                continue
            url_value = it.get("url") or it.get("link") or ""
            if not url_value:
                continue
            hits.append(
                SearchHit(
                    title=str(it.get("title") or "")[:300],
                    url=str(url_value),
                    snippet=str(it.get("snippet") or it.get("description") or "")[:500],
                    source=f"openserp_{engine}",
                )
            )
        return hits

    return []


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    """Multi-engine search via OpenSERP. Returns merged & deduped hits."""
    settings = get_settings()
    if not settings.enable_openserp:
        return []

    engines = _engines_list()
    timeout = httpx.Timeout(settings.openserp_timeout_seconds, connect=10.0)
    seen_urls: set[str] = set()
    merged: list[SearchHit] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        results = await asyncio.gather(
            *[
                _query_one_engine(
                    client,
                    settings.openserp_url,
                    engine,
                    query,
                    max_results,
                    settings.openserp_max_retries,
                )
                for engine in engines
            ],
            return_exceptions=True,
        )

    for engine, result in zip(engines, results, strict=True):
        if isinstance(result, BaseException):
            _log.warning("openserp.engine_exception", engine=engine, error=str(result)[:160])
            continue
        for hit in result:
            if hit.url in seen_urls:
                continue
            seen_urls.add(hit.url)
            merged.append(hit)
            if len(merged) >= max_results * len(engines):
                break

    _log.info("openserp.merged", query=query[:60], engines=engines, hits=len(merged))
    return merged


__all__ = ["search"]
