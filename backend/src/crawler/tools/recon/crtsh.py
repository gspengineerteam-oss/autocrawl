"""crt.sh Certificate Transparency search (free, no auth).

crt.sh aggregates every public TLS certificate ever issued. Querying for a
domain returns every subject-name (SAN) that matches, which gives us a
de-facto list of subdomains the vendor owns. Useful for vendor enrichment
because it surfaces things like:

- `partners.vendor.com` (B2B portal)
- `careers.vendor.com` (sometimes lists offices/teams)
- `cloud.vendor.com` (product hosting)

API docs: https://crt.sh/?a=1
"""

from __future__ import annotations

from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger

_log = get_logger(__name__)


async def list_subdomains(domain: str, *, max_results: int = 30) -> list[str]:
    """Return up to `max_results` distinct subdomains for the given root domain."""
    if not get_settings().enable_crtsh or not domain:
        return []

    # Wildcard match all subjects under the domain.
    url = "https://crt.sh/"
    params = {"q": f"%.{domain.lstrip('.')}", "output": "json"}
    timeout = httpx.Timeout(20.0, connect=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params=params, headers={"User-Agent": "AutoCrawler/0.2"})
    except httpx.RequestError as e:
        _log.debug("crtsh.request_failed", domain=domain, error=str(e)[:160])
        return []

    if resp.status_code >= 400:
        return []

    try:
        data: Any = resp.json()
    except ValueError:
        return []

    if not isinstance(data, list):
        return []

    subs: set[str] = set()
    for entry in data:
        if not isinstance(entry, dict):
            continue
        name_value = entry.get("name_value") or ""
        # crt.sh returns name_value as a newline-separated list when a cert
        # has multiple SANs.
        for raw in str(name_value).split("\n"):
            sub = raw.strip().lstrip("*.").lower()
            if not sub or sub == domain.lower():
                continue
            if sub.endswith(domain.lower()):
                subs.add(sub)
        if len(subs) >= max_results:
            break

    out = sorted(subs)[:max_results]
    _log.info("crtsh.found", domain=domain, subdomains=len(out))
    return out


__all__ = ["list_subdomains"]
