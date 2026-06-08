"""Playwright async browser pool.

A single browser process with N reusable contexts. Each context is recycled
after `BROWSER_RECYCLE_AFTER` page loads so its cookie/cache/fingerprint
state churns. Workers borrow a context via `acquire()` and must release
it back when done.

This is the primary scraping engine — Firecrawl is a fallback only.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total, request_duration_seconds

_log = get_logger(__name__)

_SCRAPE_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]


@dataclass
class _ContextSlot:
    context: Any  # playwright.async_api.BrowserContext
    use_count: int = 0
    last_used: float = field(default_factory=time.time)


class PlaywrightPool:
    _instance: "PlaywrightPool | None" = None
    _instance_lock = asyncio.Lock()

    def __init__(self, size: int, recycle_after: int) -> None:
        self._size = size
        self._recycle_after = recycle_after
        self._pw: Any | None = None
        self._browser: Any | None = None
        self._slots: deque[_ContextSlot] = deque()
        self._sem = asyncio.Semaphore(size)
        self._lock = asyncio.Lock()
        self._closed = False

    @classmethod
    async def get(cls) -> "PlaywrightPool":
        async with cls._instance_lock:
            if cls._instance is None:
                s = get_settings()
                cls._instance = cls(s.browser_pool_size, s.browser_recycle_after)
                await cls._instance._start()
            return cls._instance

    async def _start(self) -> None:
        from playwright.async_api import async_playwright  # type: ignore

        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--window-size=1920,1080",
            ],
        )
        for _ in range(self._size):
            self._slots.append(await self._make_slot())
        _log.info("playwright_pool.started", size=self._size, recycle_after=self._recycle_after)

    async def _make_slot(self) -> _ContextSlot:
        assert self._browser is not None
        ua = _SCRAPE_USER_AGENTS[len(self._slots) % len(_SCRAPE_USER_AGENTS)]
        ctx = await self._browser.new_context(
            user_agent=ua,
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            ignore_https_errors=True,
        )
        try:
            from playwright_stealth import stealth_async  # type: ignore

            page = await ctx.new_page()
            await stealth_async(page)
            await page.close()
        except Exception:  # noqa: BLE001
            pass  # stealth optional
        return _ContextSlot(context=ctx)

    async def _recycle(self, slot: _ContextSlot) -> _ContextSlot:
        try:
            await slot.context.close()
        except Exception:  # noqa: BLE001
            pass
        return await self._make_slot()

    @contextlib.asynccontextmanager
    async def acquire(self):
        if self._closed:
            raise RuntimeError("PlaywrightPool is closed")
        await self._sem.acquire()
        slot: _ContextSlot | None = None
        try:
            async with self._lock:
                slot = self._slots.popleft()
                if slot.use_count >= self._recycle_after:
                    slot = await self._recycle(slot)
            yield slot.context
        finally:
            if slot is not None:
                slot.use_count += 1
                slot.last_used = time.time()
                async with self._lock:
                    self._slots.append(slot)
            self._sem.release()

    async def fetch(
        self,
        url: str,
        *,
        wait_until: str = "networkidle",
        timeout_ms: int = 30000,
        wait_selector: str | None = None,
    ) -> dict[str, Any]:
        """Convenience: navigate, wait, return {url, html, status, title}."""
        started = time.monotonic()
        async with self.acquire() as ctx:
            page = await ctx.new_page()
            try:
                resp = await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
                if wait_selector:
                    with contextlib.suppress(Exception):
                        await page.wait_for_selector(wait_selector, timeout=timeout_ms)
                html = await page.content()
                final_url = page.url
                title = await page.title()
                status = resp.status if resp else None
                return {"url": final_url, "html": html, "status": status, "title": title}
            except Exception as e:  # noqa: BLE001
                errors_total.labels(stage="browser", category="playwright_fetch").inc()
                _log.warning("playwright.fetch_failed", url=url, error=str(e))
                return {"url": url, "html": "", "status": None, "title": "", "error": str(e)}
            finally:
                with contextlib.suppress(Exception):
                    await page.close()
                request_duration_seconds.labels(tool="playwright").observe(time.monotonic() - started)

    async def close(self) -> None:
        self._closed = True
        async with self._lock:
            while self._slots:
                slot = self._slots.popleft()
                with contextlib.suppress(Exception):
                    await slot.context.close()
        if self._browser is not None:
            with contextlib.suppress(Exception):
                await self._browser.close()
        if self._pw is not None:
            with contextlib.suppress(Exception):
                await self._pw.stop()
