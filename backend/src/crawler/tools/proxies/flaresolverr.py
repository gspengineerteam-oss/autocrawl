"""flaresolverr client — bypass Cloudflare's interactive challenge.

flaresolverr runs as its own docker service. We POST a job spec; it returns
the rendered HTML once the challenge is cleared.
"""

from __future__ import annotations

from typing import Any

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total

_log = get_logger(__name__)


async def solve(url: str, *, timeout_ms: int = 60_000) -> dict[str, Any]:
    settings = get_settings()
    payload = {"cmd": "request.get", "url": url, "maxTimeout": timeout_ms}
    try:
        async with httpx.AsyncClient(timeout=timeout_ms / 1000 + 5) as client:
            r = await client.post(settings.flaresolverr_url, json=payload)
            r.raise_for_status()
            data = r.json()
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="anti_bot", category="flaresolverr").inc()
        _log.debug("flaresolverr.failed", url=url, error=str(e))
        return {"url": url, "html": "", "status": None, "error": str(e)}

    sol = data.get("solution") or {}
    return {
        "url": sol.get("url", url),
        "html": sol.get("response", "") or "",
        "status": sol.get("status"),
        "headers": sol.get("headers", {}),
        "cookies": sol.get("cookies", []),
    }
