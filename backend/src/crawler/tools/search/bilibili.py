"""Bilibili (B站) search via the public web-interface API.

Why this matters for security/defense vendor discovery:
- Chinese small-batch manufacturers post factory-tour and product-demo
  videos on Bilibili more aggressively than they update their own
  websites. Vendor name is in the video title, the uploader handle is
  often the company's official 公众号 alias, and the description
  carries phone/WeChat contact info that doesn't surface anywhere else.
- Police/security-procurement bloggers review imported equipment, name
  the manufacturer, and link to factory videos.

API endpoint (no auth, generous rate limit):
  https://api.bilibili.com/x/web-interface/search/all/v2?keyword=...

The response is JSON with a `result` array of result-types — we keep
the `video` type (the most signal-rich) and emit a hit per video. The
URL is the bilibili.com video page; the agent enriches by reading
title + description + uploader bio.
"""

from __future__ import annotations

import json
from urllib.parse import quote

import httpx

from ...observability.logger import get_logger
from ...observability.metrics import errors_total
from ..url_utils import canonical_url
from .base import SearchHit

_log = get_logger(__name__)
_API = "https://api.bilibili.com/x/web-interface/search/all/v2"
# Bilibili gates anonymous access via a Referer + a bilibili.com cookie.
# A blank GET to bilibili.com first sets `buvid3` which the API then
# accepts. The wrapping below mirrors what works in practice without
# headless rendering.
_HEADERS = {
    "Referer": "https://search.bilibili.com/",
    "Origin": "https://www.bilibili.com",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
}


async def _ensure_buvid(client: httpx.AsyncClient) -> None:
    """One-shot warm-up GET so Bilibili sets a buvid3 cookie. Without
    this, the API endpoint returns code -412 (anti-crawl)."""
    try:
        await client.get("https://www.bilibili.com/", timeout=8.0)
    except Exception:  # noqa: BLE001
        # If warmup fails, the API call will likely fail too — but we
        # still try, since some networks Bilibili treats as already-warm.
        pass


async def search(query: str, *, max_results: int = 15) -> list[SearchHit]:
    # Use the project's proxied httpx client so VPN/Gluetun gating applies
    # consistently. Falls back to a plain client if proxy_module unavailable
    # (e.g. running tests outside the docker network).
    try:
        from ..http_proxy import proxied_client

        client_cm = proxied_client(timeout=15.0)
    except Exception:  # noqa: BLE001
        client_cm = httpx.AsyncClient(timeout=15.0)  # type: ignore[assignment]

    out: list[SearchHit] = []
    try:
        async with client_cm as client:
            client.headers.update(_HEADERS)
            await _ensure_buvid(client)
            resp = await client.get(
                _API,
                params={
                    "keyword": query,
                    "search_type": "video",
                    "page": 1,
                    "page_size": max_results,
                },
            )
            if resp.status_code != 200:
                errors_total.labels(stage="search", category="bilibili").inc()
                _log.debug(
                    "bilibili.api_status", status=resp.status_code, query=query
                )
                return []
            try:
                payload = resp.json()
            except json.JSONDecodeError:
                return []
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="search", category="bilibili").inc()
        _log.debug("bilibili.fetch_failed", query=query, error=str(e))
        return []

    if not isinstance(payload, dict) or payload.get("code") != 0:
        return []
    data = payload.get("data") or {}
    seen: set[str] = set()

    # The /all endpoint groups results by type; each group has its own list.
    groups = data.get("result") or []
    for grp in groups:
        if not isinstance(grp, dict) or grp.get("result_type") != "video":
            continue
        for item in grp.get("data") or []:
            if not isinstance(item, dict):
                continue
            bvid = item.get("bvid") or ""
            arc = item.get("arcurl")
            if arc and isinstance(arc, str) and arc.startswith("http"):
                href = arc
            elif bvid:
                href = f"https://www.bilibili.com/video/{bvid}"
            else:
                continue
            cu = canonical_url(href)
            if cu in seen:
                continue
            seen.add(cu)
            # Title comes back with <em class="keyword"> tags wrapping the
            # match — strip raw HTML tags via a quick replace.
            raw_title = (item.get("title") or "").replace("<em class=\"keyword\">", "").replace("</em>", "")
            uploader = item.get("author") or ""
            description = item.get("description") or ""
            # Uploader handle is gold for vendor discovery — bake it into
            # the snippet so the agent can detect "this is a 厂家 channel".
            snippet = f"[UP主: {uploader}] {description}".strip()
            out.append(
                SearchHit(
                    title=raw_title[:300],
                    url=cu,
                    snippet=snippet[:500],
                    source="bilibili",
                )
            )
            if len(out) >= max_results:
                return out
    return out
