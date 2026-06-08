"""urlscan.io passive intel lookup (free tier, key opsional).

urlscan.io is a service that crawls and analyses URLs publicly. Querying for
a domain returns recent scans containing:

- Tech stack detected (from Wappalyzer fingerprints)
- Screenshot URL (low-resolution PNG, useful for the vendor card UI)
- HTTP behaviour (redirects, geo, IP)

Free tier without key allows ~10 req/min. With API key it's ~100 req/min.

API docs: https://urlscan.io/docs/api/
"""

from __future__ import annotations

from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger

_log = get_logger(__name__)


async def lookup_domain(domain: str) -> dict[str, Any] | None:
    """Return latest scan summary for the domain, or None."""
    s = get_settings()
    if not s.enable_urlscan or not domain:
        return None

    url = "https://urlscan.io/api/v1/search/"
    params = {"q": f"domain:{domain}", "size": 5}
    headers: dict[str, str] = {"User-Agent": "AutoCrawler/0.2"}
    if s.urlscan_api_key:
        headers["API-Key"] = s.urlscan_api_key

    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params=params, headers=headers)
    except httpx.RequestError as e:
        _log.debug("urlscan.request_failed", domain=domain, error=str(e)[:160])
        return None

    if resp.status_code >= 400:
        if resp.status_code == 429:
            _log.info("urlscan.rate_limited")
        return None

    try:
        data: Any = resp.json()
    except ValueError:
        return None

    results = data.get("results") or []
    if not results:
        return None

    latest = results[0]
    page = latest.get("page") or {}
    task = latest.get("task") or {}
    return {
        "screenshot_url": task.get("screenshotURL"),
        "scan_url": latest.get("result"),
        "ip": page.get("ip"),
        "asn": page.get("asn"),
        "country": page.get("country"),
        "title": page.get("title"),
        "scanned_at": task.get("time"),
    }


__all__ = ["lookup_domain"]
