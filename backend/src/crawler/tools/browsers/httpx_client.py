"""Plain HTTP/2 fetch via httpx for static pages. No JS rendering."""

from __future__ import annotations

import time

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total, request_duration_seconds
from ..http_proxy import proxied_client

_log = get_logger(__name__)


_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


async def fetch(url: str, *, timeout: float | None = None) -> dict:
    settings = get_settings()
    timeout = timeout or float(settings.global_request_timeout_seconds)
    started = time.monotonic()
    try:
        async with proxied_client(
            timeout=timeout,
            follow_redirects=True,
            http2=True,
            headers=_DEFAULT_HEADERS,
        ) as client:
            resp = await client.get(url)
            return {
                "url": str(resp.url),
                "html": resp.text,
                "status": resp.status_code,
                "headers": dict(resp.headers),
            }
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="browser", category="httpx").inc()
        _log.debug("httpx.fetch_failed", url=url, error=str(e))
        return {"url": url, "html": "", "status": None, "headers": {}, "error": str(e)}
    finally:
        request_duration_seconds.labels(tool="httpx").observe(time.monotonic() - started)
