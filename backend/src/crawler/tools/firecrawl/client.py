"""Quota-aware Firecrawl wrapper.

We only have ONE paid scraping budget (Firecrawl). Treat it as a scarce
resource: prefer self-hosted Playwright first, fall back to Firecrawl
only when necessary, and stop calling Firecrawl entirely when the
configured credit floor is hit.

The official `firecrawl-py` SDK exposes synchronous methods. We run them
in a threadpool from async code to avoid blocking the event loop.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import (
    errors_total,
    firecrawl_credits_used_total,
    request_duration_seconds,
)

_log = get_logger(__name__)
_CLIENT: Any | None = None
_BUDGET_STATE: dict[str, Any] = {
    "low": False,
    "last_check": 0.0,
    "credits_remaining": None,
    "credits_total": None,
}
_BUDGET_LOCK = asyncio.Lock()


@dataclass
class FirecrawlResult:
    success: bool
    data: dict | None = None
    error: str | None = None
    used_fallback: bool = False


def _get_sdk() -> Any:
    """Lazy import — only fail at call time if firecrawl-py is missing."""
    global _CLIENT
    if _CLIENT is None:
        from firecrawl import FirecrawlApp  # type: ignore

        _CLIENT = FirecrawlApp(api_key=get_settings().firecrawl_api_key)
    return _CLIENT


def _is_configured() -> bool:
    return bool(get_settings().firecrawl_api_key.strip())


_LOG_NO_KEY_ONCE = False


def _log_no_key_once() -> None:
    global _LOG_NO_KEY_ONCE
    if not _LOG_NO_KEY_ONCE:
        _LOG_NO_KEY_ONCE = True
        _log.info("firecrawl.disabled_no_key", hint="set FIRECRAWL_API_KEY in .env to enable")


async def _check_budget(force: bool = False) -> bool:
    """Returns True if budget is low (we should stop / fall back)."""
    settings = get_settings()
    now = time.monotonic()
    async with _BUDGET_LOCK:
        if not force and now - _BUDGET_STATE["last_check"] < 60:
            return _BUDGET_STATE["low"]
        try:
            sdk = _get_sdk()
            # Different SDK versions expose this differently; both shapes are tolerated.
            usage_fn = getattr(sdk, "get_credit_usage", None) or getattr(sdk, "credit_usage", None)
            if usage_fn is None:
                _BUDGET_STATE["last_check"] = now
                return False
            usage = await asyncio.to_thread(usage_fn)
            remaining = (
                usage.get("remaining_credits")
                or usage.get("credits_remaining")
                or usage.get("remaining")
            ) if isinstance(usage, dict) else None
            total = (
                usage.get("total_credits")
                or usage.get("credits_total")
                or usage.get("total")
            ) if isinstance(usage, dict) else None
            _BUDGET_STATE["credits_remaining"] = remaining
            _BUDGET_STATE["credits_total"] = total
            if remaining is not None and total:
                pct = 100.0 * remaining / total
                _BUDGET_STATE["low"] = pct < settings.firecrawl_credit_threshold_pct
                if _BUDGET_STATE["low"]:
                    _log.warning(
                        "firecrawl.budget_low",
                        remaining=remaining,
                        total=total,
                        pct=round(pct, 2),
                    )
        except Exception as e:  # noqa: BLE001
            _log.debug("firecrawl.budget_check_failed", error=str(e))
        finally:
            _BUDGET_STATE["last_check"] = now
    return _BUDGET_STATE["low"]


async def budget_low() -> bool:
    return await _check_budget()


@retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def search(query: str, *, limit: int = 10) -> FirecrawlResult:
    """Firecrawl `/search` — returns SERP results with optional auto-extraction."""
    if not _is_configured():
        _log_no_key_once()
        return FirecrawlResult(success=False, error="no_key", used_fallback=True)
    if await budget_low():
        _log.info("firecrawl.skipped_search_budget_low", query=query)
        return FirecrawlResult(success=False, error="budget_low", used_fallback=True)
    started = time.monotonic()
    try:
        sdk = _get_sdk()
        # Newer firecrawl-py expects keyword args; older versions accept dict.
        try:
            result = await asyncio.to_thread(sdk.search, query, limit=limit)
        except TypeError:
            result = await asyncio.to_thread(sdk.search, query, {"limit": limit})
        firecrawl_credits_used_total.labels(operation="search").inc(limit)
        return FirecrawlResult(success=True, data=result if isinstance(result, dict) else {"results": result})
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="firecrawl", category="search").inc()
        _log.warning("firecrawl.search_failed", query=query, error=str(e))
        return FirecrawlResult(success=False, error=str(e))
    finally:
        request_duration_seconds.labels(tool="firecrawl_search").observe(time.monotonic() - started)


@retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def scrape(url: str, *, formats: list[str] | None = None) -> FirecrawlResult:
    """Firecrawl `/scrape` — single-page render with markdown/html extract."""
    if not _is_configured():
        _log_no_key_once()
        return FirecrawlResult(success=False, error="no_key", used_fallback=True)
    if await budget_low():
        return FirecrawlResult(success=False, error="budget_low", used_fallback=True)
    started = time.monotonic()
    formats = formats or ["markdown", "html"]
    try:
        sdk = _get_sdk()
        try:
            result = await asyncio.to_thread(sdk.scrape_url, url, formats=formats)
        except TypeError:
            result = await asyncio.to_thread(sdk.scrape_url, url, {"formats": formats})
        firecrawl_credits_used_total.labels(operation="scrape").inc(1)
        return FirecrawlResult(success=True, data=result if isinstance(result, dict) else {"data": result})
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="firecrawl", category="scrape").inc()
        _log.warning("firecrawl.scrape_failed", url=url, error=str(e))
        return FirecrawlResult(success=False, error=str(e))
    finally:
        request_duration_seconds.labels(tool="firecrawl_scrape").observe(time.monotonic() - started)


@retry(reraise=True, stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=10))
async def crawl(url: str, *, limit: int = 25) -> FirecrawlResult:
    """Firecrawl `/crawl` — multi-page crawl (use sparingly, expensive)."""
    if not _is_configured():
        _log_no_key_once()
        return FirecrawlResult(success=False, error="no_key", used_fallback=True)
    if await budget_low():
        return FirecrawlResult(success=False, error="budget_low", used_fallback=True)
    started = time.monotonic()
    try:
        sdk = _get_sdk()
        try:
            result = await asyncio.to_thread(sdk.crawl_url, url, limit=limit)
        except TypeError:
            result = await asyncio.to_thread(sdk.crawl_url, url, {"limit": limit})
        firecrawl_credits_used_total.labels(operation="crawl").inc(limit)
        return FirecrawlResult(success=True, data=result if isinstance(result, dict) else {"data": result})
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="firecrawl", category="crawl").inc()
        _log.warning("firecrawl.crawl_failed", url=url, error=str(e))
        return FirecrawlResult(success=False, error=str(e))
    finally:
        request_duration_seconds.labels(tool="firecrawl_crawl").observe(time.monotonic() - started)
