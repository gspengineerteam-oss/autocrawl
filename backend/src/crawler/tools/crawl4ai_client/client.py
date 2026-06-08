"""Crawl4AI singleton wrapper.

Replaces Firecrawl as primary scrape/extract tool. Apache-2.0 OSS, only cost
is OpenAI tokens when LLM extraction is invoked.

Design notes:
- Reuse one AsyncWebCrawler across requests to skip Chromium cold-start
  (~3 seconds per call).
- Recycle browser after a configurable page count to dodge slow memory leaks
  in long-lived Chromium sessions.
- Two browser modes: `chromium` (fast) and `undetected` (anti-bot, slower).
- Three public operations mirror Firecrawl's surface area.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, ClassVar

from pydantic import BaseModel
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import (
    crawl4ai_browser_recycles_total,
    crawl4ai_requests_total,
    errors_total,
    request_duration_seconds,
)

_log = get_logger(__name__)


def _resolve_litellm_target(settings: Any) -> tuple[str, str | None, str | None]:
    """Map our LLM_PROVIDER + base_url to a LiteLLM (provider, token, base_url).

    Crawl4AI's LLMExtractionStrategy delegates to LiteLLM, which routes by the
    `<vendor>/<model>` prefix and respects an api_base. Without this mapping
    Crawl4AI silently falls back to api.openai.com even when the rest of the
    crawler is on Ollama.
    """
    raw_provider = (settings.llm_provider or "openai").lower()
    model = settings.crawl4ai_extraction_model or settings.openai_model_light

    if raw_provider == "ollama":
        base = (settings.llm_base_url or "http://ollama:11434").rstrip("/")
        base = base.removesuffix("/v1")
        # ollama_chat/ targets /api/chat which matches the chat-model lineup
        # (qwen, llama, granite). Plain ollama/ would hit /api/generate.
        return f"ollama_chat/{model}", "ollama", base
    if raw_provider == "groq":
        return f"groq/{model}", settings.groq_api_key or None, None
    # openai cloud (or any OpenAI-compatible endpoint via LLM_BASE_URL)
    return (
        f"openai/{model}",
        settings.openai_api_key or None,
        settings.llm_base_url or None,
    )


class Crawl4AIClient:
    """Process-wide singleton wrapping AsyncWebCrawler with recycling."""

    _instance: ClassVar["Crawl4AIClient | None"] = None
    _lock: ClassVar[asyncio.Lock] = asyncio.Lock()

    def __init__(self) -> None:
        self.crawler: Any = None
        self.crawler_undetected: Any = None
        self.pages_processed = 0
        self.pages_processed_undetected = 0

    @classmethod
    async def get(cls) -> "Crawl4AIClient":
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @classmethod
    async def close(cls) -> None:
        async with cls._lock:
            if cls._instance is not None:
                inst = cls._instance
                if inst.crawler is not None:
                    try:
                        await inst.crawler.close()
                    except Exception:  # noqa: BLE001
                        pass
                if inst.crawler_undetected is not None:
                    try:
                        await inst.crawler_undetected.close()
                    except Exception:  # noqa: BLE001
                        pass
                cls._instance = None

    async def _ensure_crawler(self, *, stealth: bool) -> Any:
        from crawl4ai import AsyncWebCrawler, BrowserConfig

        settings = get_settings()
        recycle_after = settings.crawl4ai_recycle_after

        if stealth:
            should_recycle = (
                self.crawler_undetected is None
                or self.pages_processed_undetected >= recycle_after
            )
            if should_recycle:
                if self.crawler_undetected is not None:
                    try:
                        await self.crawler_undetected.close()
                    except Exception:  # noqa: BLE001
                        pass
                    crawl4ai_browser_recycles_total.labels(mode="undetected").inc()
                cfg = BrowserConfig(
                    headless=True,
                    browser_type="undetected",
                    verbose=False,
                    extra_args=["--disable-blink-features=AutomationControlled"],
                )
                self.crawler_undetected = AsyncWebCrawler(config=cfg)
                await self.crawler_undetected.start()
                self.pages_processed_undetected = 0
            return self.crawler_undetected

        should_recycle = (
            self.crawler is None or self.pages_processed >= recycle_after
        )
        if should_recycle:
            if self.crawler is not None:
                try:
                    await self.crawler.close()
                except Exception:  # noqa: BLE001
                    pass
                crawl4ai_browser_recycles_total.labels(mode="chromium").inc()
            cfg = BrowserConfig(
                headless=True,
                browser_type="chromium",
                verbose=False,
                extra_args=["--disable-blink-features=AutomationControlled"],
            )
            self.crawler = AsyncWebCrawler(config=cfg)
            await self.crawler.start()
            self.pages_processed = 0
        return self.crawler

    def _bump(self, *, stealth: bool) -> None:
        if stealth:
            self.pages_processed_undetected += 1
        else:
            self.pages_processed += 1

    async def scrape(self, url: str, *, stealth: bool = False) -> dict[str, Any]:
        from crawl4ai import CacheMode, CrawlerRunConfig

        crawler = await self._ensure_crawler(stealth=stealth)
        cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, verbose=False)
        result = await crawler.arun(url=url, config=cfg)
        self._bump(stealth=stealth)
        markdown = ""
        html = ""
        try:
            md_obj = getattr(result, "markdown", None)
            if md_obj is not None:
                markdown = (
                    getattr(md_obj, "raw_markdown", None)
                    or getattr(md_obj, "fit_markdown", None)
                    or str(md_obj)
                )
            html = getattr(result, "html", "") or getattr(result, "cleaned_html", "") or ""
        except Exception:  # noqa: BLE001
            pass
        return {
            "url": url,
            "html": html,
            "markdown": markdown,
            "links": getattr(result, "links", {}) or {},
            "status": 200 if getattr(result, "success", True) else None,
            "success": getattr(result, "success", True),
        }

    async def extract(
        self,
        url: str,
        *,
        schema: type[BaseModel],
        instruction: str,
        stealth: bool = False,
    ) -> dict[str, Any] | None:
        """LLM-backed extraction via Crawl4AI's LLMExtractionStrategy.

        Honors LLM_PROVIDER so the crawler doesn't quietly hit api.openai.com
        when the rest of the stack is pointed at Ollama / Groq.
        """
        from crawl4ai import CacheMode, CrawlerRunConfig
        from crawl4ai.extraction_strategy import LLMExtractionStrategy

        try:
            from crawl4ai import LLMConfig  # type: ignore[attr-defined]
        except ImportError:
            LLMConfig = None  # type: ignore[assignment]

        settings = get_settings()
        provider, api_token, base_url = _resolve_litellm_target(settings)

        if LLMConfig is not None:
            llm_config = LLMConfig(
                provider=provider, api_token=api_token, base_url=base_url
            )
            strat = LLMExtractionStrategy(
                llm_config=llm_config,
                schema=schema.model_json_schema(),
                extraction_type="schema",
                instruction=instruction,
                input_format="markdown",
                verbose=False,
            )
        else:
            strat = LLMExtractionStrategy(
                provider=provider,
                api_token=api_token,
                base_url=base_url,
                schema=schema.model_json_schema(),
                extraction_type="schema",
                instruction=instruction,
                input_format="markdown",
                verbose=False,
            )

        crawler = await self._ensure_crawler(stealth=stealth)
        cfg = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            extraction_strategy=strat,
            verbose=False,
        )
        result = await crawler.arun(url=url, config=cfg)
        self._bump(stealth=stealth)

        raw = getattr(result, "extracted_content", None)
        if not raw:
            return None
        try:
            if isinstance(raw, str):
                return json.loads(raw)
            if isinstance(raw, list) and raw:
                return raw[0] if isinstance(raw[0], dict) else json.loads(str(raw[0]))
            if isinstance(raw, dict):
                return raw
        except Exception as exc:  # noqa: BLE001
            _log.warning("crawl4ai.extract_parse_failed", url=url, error=str(exc))
        return None

    async def find_pdfs(self, url: str, *, stealth: bool = False) -> list[str]:
        from crawl4ai import CacheMode, CrawlerRunConfig
        from urllib.parse import urljoin

        crawler = await self._ensure_crawler(stealth=stealth)
        cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, verbose=False)
        result = await crawler.arun(url=url, config=cfg)
        self._bump(stealth=stealth)

        links = getattr(result, "links", {}) or {}
        all_links: list[dict[str, Any]] = []
        if isinstance(links, dict):
            all_links.extend(links.get("internal", []) or [])
            all_links.extend(links.get("external", []) or [])

        pdfs: list[str] = []
        for link in all_links:
            href = link.get("href") if isinstance(link, dict) else None
            if not href:
                continue
            absolute = urljoin(url, href)
            if absolute.lower().split("?", 1)[0].endswith(".pdf"):
                pdfs.append(absolute)

        seen: set[str] = set()
        unique: list[str] = []
        for u in pdfs:
            if u not in seen:
                seen.add(u)
                unique.append(u)
        return unique


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((TimeoutError, ConnectionError, OSError)),
)
async def c4ai_scrape(url: str, *, stealth: bool = False) -> dict[str, Any]:
    started = time.monotonic()
    op = "scrape" if not stealth else "scrape_stealth"
    try:
        client = await Crawl4AIClient.get()
        result = await client.scrape(url, stealth=stealth)
        crawl4ai_requests_total.labels(operation=op, status="ok").inc()
        return result
    except Exception as exc:
        errors_total.labels(stage="crawl4ai", category=op).inc()
        crawl4ai_requests_total.labels(operation=op, status="error").inc()
        _log.warning("crawl4ai.scrape_failed", url=url, stealth=stealth, error=str(exc))
        raise
    finally:
        request_duration_seconds.labels(tool=f"crawl4ai_{op}").observe(time.monotonic() - started)


@retry(
    reraise=True,
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((TimeoutError, ConnectionError, OSError)),
)
async def c4ai_extract(
    url: str,
    *,
    schema: type[BaseModel],
    instruction: str,
    stealth: bool = False,
) -> dict[str, Any] | None:
    started = time.monotonic()
    try:
        client = await Crawl4AIClient.get()
        result = await client.extract(
            url, schema=schema, instruction=instruction, stealth=stealth
        )
        status = "ok" if result is not None else "empty"
        crawl4ai_requests_total.labels(operation="extract", status=status).inc()
        return result
    except Exception as exc:
        errors_total.labels(stage="crawl4ai", category="extract").inc()
        crawl4ai_requests_total.labels(operation="extract", status="error").inc()
        _log.warning("crawl4ai.extract_failed", url=url, error=str(exc))
        raise
    finally:
        request_duration_seconds.labels(tool="crawl4ai_extract").observe(time.monotonic() - started)


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((TimeoutError, ConnectionError, OSError)),
)
async def c4ai_find_pdfs(url: str, *, stealth: bool = False) -> list[str]:
    started = time.monotonic()
    try:
        client = await Crawl4AIClient.get()
        result = await client.find_pdfs(url, stealth=stealth)
        crawl4ai_requests_total.labels(operation="find_pdfs", status="ok").inc()
        return result
    except Exception as exc:
        errors_total.labels(stage="crawl4ai", category="find_pdfs").inc()
        crawl4ai_requests_total.labels(operation="find_pdfs", status="error").inc()
        _log.warning("crawl4ai.find_pdfs_failed", url=url, error=str(exc))
        raise
    finally:
        request_duration_seconds.labels(tool="crawl4ai_find_pdfs").observe(time.monotonic() - started)


async def c4ai_scrape_many(
    urls: list[str], *, stealth: bool = False
) -> list[dict[str, Any]]:
    """Concurrent scrape of multiple URLs with semaphore limit."""
    settings = get_settings()
    sem = asyncio.Semaphore(settings.crawl4ai_max_concurrent)

    async def one(u: str) -> dict[str, Any]:
        async with sem:
            try:
                return await c4ai_scrape(u, stealth=stealth)
            except Exception as exc:  # noqa: BLE001
                return {
                    "url": u,
                    "html": "",
                    "markdown": "",
                    "links": {},
                    "status": None,
                    "success": False,
                    "error": str(exc),
                }

    return await asyncio.gather(*(one(u) for u in urls))


async def c4ai_close() -> None:
    """Close singleton at process exit / lifespan shutdown."""
    await Crawl4AIClient.close()
