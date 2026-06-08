"""Wayback Machine CDX API — first / last snapshot. Free, no key."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger

_log = get_logger(__name__)
_CDX = "https://web.archive.org/cdx/search/cdx"


async def lookup(url: str) -> dict[str, Any]:
    timeout = get_settings().global_request_timeout_seconds
    params = {
        "url": url,
        "output": "json",
        "limit": 1,
        "fl": "timestamp,original",
        "filter": "statuscode:200",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r_first = await client.get(_CDX, params={**params, "sort": "ascending"})
            r_last = await client.get(_CDX, params={**params, "sort": "descending"})
        first = r_first.json() if r_first.status_code == 200 else []
        last = r_last.json() if r_last.status_code == 200 else []

        first_ts = first[1][0] if len(first) > 1 else None
        last_ts = last[1][0] if len(last) > 1 else None
        return {
            "url": url,
            "first_snapshot": _to_iso(first_ts),
            "last_snapshot": _to_iso(last_ts),
        }
    except Exception as e:  # noqa: BLE001
        _log.debug("wayback.lookup_failed", url=url, error=str(e))
        return {"url": url, "error": str(e)}


def _to_iso(ts: str | None) -> str | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y%m%d%H%M%S").date().isoformat()
    except Exception:  # noqa: BLE001
        return None
