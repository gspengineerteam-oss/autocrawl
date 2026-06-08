"""Smart unified fetcher: try fast path first, escalate as needed.

Ladder (default):
  1. httpx (cheap, static pages)
  2. Playwright (JS render, our internal pool)
  3. Crawl4AI (chromium mode) — clean markdown + JS
  4. Crawl4AI (undetected + stealth) — anti-bot
  5. flaresolverr (Cloudflare bypass via self-host service)
  6. Firecrawl /scrape — only if ENABLE_FIRECRAWL=true and budget OK

Returns a dict {url, html, markdown?, status, used: <stage>, error?}.
"""

from __future__ import annotations

from typing import Any

from ...config import get_settings
from ...observability.logger import get_logger
from ..proxies.flaresolverr import solve as fs_solve
from . import httpx_client
from .playwright_pool import PlaywrightPool

_log = get_logger(__name__)


def _looks_like_block(html: str, status: int | None) -> bool:
    if status in (403, 429, 503):
        return True
    if not html:
        return True
    needle = html.lower()[:4000]
    blockers = (
        "cloudflare",
        "checking your browser",
        "attention required",
        "access denied",
        "captcha",
        "are you a robot",
    )
    return any(b in needle for b in blockers) and len(html) < 10000


async def fetch(url: str, *, force_render: bool = False) -> dict[str, Any]:
    settings = get_settings()

    if not force_render:
        r = await httpx_client.fetch(url)
        if r.get("status") == 200 and not _looks_like_block(r.get("html", ""), r.get("status")):
            r["used"] = "httpx"
            return r

    pool = await PlaywrightPool.get()
    r = await pool.fetch(url)
    if r.get("html") and not _looks_like_block(r["html"], r.get("status")):
        r["used"] = "playwright"
        return r

    if settings.enable_crawl4ai:
        try:
            from ..crawl4ai_client import c4ai_scrape

            c = await c4ai_scrape(url, stealth=False)
            if c.get("html") and not _looks_like_block(c["html"], c.get("status")):
                return {
                    "url": url,
                    "html": c["html"],
                    "markdown": c.get("markdown", ""),
                    "status": 200,
                    "used": "crawl4ai_chromium",
                }

            c = await c4ai_scrape(url, stealth=True)
            if c.get("html") and not _looks_like_block(c["html"], c.get("status")):
                return {
                    "url": url,
                    "html": c["html"],
                    "markdown": c.get("markdown", ""),
                    "status": 200,
                    "used": "crawl4ai_undetected",
                }
        except Exception as e:  # noqa: BLE001
            _log.debug("fetcher.crawl4ai_failed", url=url, error=str(e))

    r2 = await fs_solve(url)
    if r2.get("html") and not _looks_like_block(r2["html"], r2.get("status")):
        r2["used"] = "flaresolverr"
        return r2

    if settings.enable_firecrawl:
        try:
            from ..firecrawl.client import scrape as fc_scrape

            fr = await fc_scrape(url, formats=["html", "markdown"])
            if fr.success and fr.data:
                data = fr.data.get("data") or fr.data
                html = data.get("html") if isinstance(data, dict) else ""
                return {"url": url, "html": html or "", "status": 200, "used": "firecrawl"}
        except Exception as e:  # noqa: BLE001
            _log.debug("fetcher.firecrawl_failed", url=url, error=str(e))

    _log.warning("fetcher.all_paths_failed", url=url)
    return {"url": url, "html": "", "status": None, "used": "none", "error": "all_paths_failed"}
