"""Jina Reader free fetcher (https://r.jina.ai).

Jina AI's Reader endpoint takes any URL and returns it as clean,
LLM-friendly markdown. Free tier is generous (no key needed for basic
usage; key just lifts rate limits). Useful as a last-resort fallback in
the fetcher ladder for pages that:

- Need JS rendering but our Crawl4AI/Playwright kept failing.
- Sit behind anti-bot protection that FlareSolverr also tripped over.
- Have heavy template noise (nav, footer, ads) that we'd rather skip.

The trick is the URL prefix: `https://r.jina.ai/<encoded url>`. Jina fetches
the target on its server, runs its own headless browser, and returns the
extracted content as plain markdown. Authorization header optional.
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

from ...config import get_settings
from ...observability.logger import get_logger

_log = get_logger(__name__)


async def fetch_clean_markdown(url: str, *, timeout_seconds: int = 30) -> str | None:
    """Return clean markdown for the URL, or None on failure."""
    s = get_settings()
    if not s.enable_jina_reader:
        return None

    proxy_url = f"{s.jina_reader_url.rstrip('/')}/{quote(url, safe=':/?&=#')}"
    headers = {
        "Accept": "text/markdown",
        "User-Agent": "AutoCrawler/0.2",
    }
    api_key = (s.jina_api_key or "").strip()
    if api_key and api_key != "REPLACE_WITH_YOUR_JINA_API_KEY":
        headers["Authorization"] = f"Bearer {api_key}"
    timeout = httpx.Timeout(float(timeout_seconds), connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(proxy_url, headers=headers)
    except httpx.RequestError as e:
        _log.debug("jina_reader.request_failed", url=url, error=str(e)[:160])
        return None

    if resp.status_code >= 400:
        if resp.status_code == 429:
            _log.info("jina_reader.rate_limited")
        else:
            _log.debug("jina_reader.http_error", status=resp.status_code, url=url)
        return None

    text = resp.text
    if not text or len(text) < 50:
        return None

    _log.debug("jina_reader.fetched", url=url, length=len(text))
    return text


__all__ = ["fetch_clean_markdown"]
