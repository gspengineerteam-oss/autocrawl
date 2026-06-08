"""Katana subprocess wrapper, discovery-only URL booster.

Katana (https://github.com/projectdiscovery/katana, MIT) is a Go web crawler.
We use it ONLY to enumerate URLs from a seed, then hand those URLs to our
existing fetch pipeline (browsers/fetcher.py). Katana never fetches page
bodies for us, never spawns Chromium, and never bypasses our rate limiter.

Mode: static crawl plus JavaScript file parsing (`-jc`). Headless browser is
explicitly disabled (`-headless=false`) so this stays a pure HTTP crawler
that complements (does not duplicate) Playwright.

Contract: callers MUST be tolerant of `success=False`. Any failure path
(binary missing, timeout, parse error) returns an empty result. The wrapper
NEVER raises and NEVER crashes the caller.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total, request_duration_seconds

_log = get_logger(__name__)

_BINARY_NAME = "katana"
_LOG_UNAVAILABLE_ONCE = False

_ASSET_EXTENSIONS = (
    ".css", ".js", ".mjs", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp4", ".mp3", ".webm", ".ogg", ".wav", ".avi", ".mov",
    ".zip", ".tar", ".gz", ".7z", ".rar",
)


@dataclass
class KatanaResult:
    success: bool
    urls: list[str] = field(default_factory=list)
    error: str | None = None
    used_fallback: bool = False


def _is_available() -> bool:
    return shutil.which(_BINARY_NAME) is not None


def _log_unavailable_once() -> None:
    global _LOG_UNAVAILABLE_ONCE
    if not _LOG_UNAVAILABLE_ONCE:
        _LOG_UNAVAILABLE_ONCE = True
        _log.info(
            "katana.disabled_binary_missing",
            hint="install katana (https://github.com/projectdiscovery/katana) or set ENABLE_KATANA=false",
        )


def _same_origin(seed_host: str, candidate: str) -> bool:
    try:
        p = urlparse(candidate)
    except Exception:  # noqa: BLE001
        return False
    if not p.netloc:
        return False
    if p.scheme not in ("http", "https"):
        return False
    return p.netloc.lower() == seed_host.lower()


def _is_asset(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in _ASSET_EXTENSIONS)


def _extract_url_from_jsonl(line: str) -> str | None:
    """Katana -jsonl emits one object per line. Key location varies by version:

    newer:  {"request": {"endpoint": "...", "method": "GET"}, ...}
    older:  {"endpoint": "..."} or {"url": "..."}
    """
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    req = obj.get("request")
    if isinstance(req, dict):
        u = req.get("endpoint") or req.get("url")
        if isinstance(u, str) and u:
            return u
    u = obj.get("endpoint") or obj.get("url")
    return u if isinstance(u, str) and u else None


def _build_argv(
    seed_url: str,
    *,
    depth: int,
    concurrency: int,
    rate_limit_per_second: int,
    timeout: int,
) -> list[str]:
    return [
        _BINARY_NAME,
        "-u", seed_url,
        "-jc",
        "-d", str(depth),
        "-c", str(concurrency),
        "-rl", str(rate_limit_per_second),
        "-rlm", str(rate_limit_per_second * 60),
        "-timeout", str(max(5, timeout - 2)),
        "-known-files", "robotstxt,sitemapxml",
        "-silent",
        "-jsonl",
        "-headless=false",
    ]


async def discover_urls(
    seed_url: str,
    *,
    max_urls: int = 50,
    timeout: int = 30,
) -> KatanaResult:
    settings = get_settings()
    if not settings.enable_katana:
        return KatanaResult(success=False, error="disabled", used_fallback=True)
    if not _is_available():
        _log_unavailable_once()
        return KatanaResult(success=False, error="binary_missing", used_fallback=True)

    parsed_seed = urlparse(seed_url)
    if not parsed_seed.netloc:
        return KatanaResult(success=False, error="invalid_seed")

    argv = _build_argv(
        seed_url,
        depth=settings.katana_depth,
        concurrency=settings.katana_concurrency,
        rate_limit_per_second=settings.katana_rate_limit_per_second,
        timeout=timeout,
    )

    started = time.monotonic()
    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            errors_total.labels(stage="katana", category="timeout").inc()
            _log.warning("katana.timeout", seed=seed_url, timeout=timeout)
            return KatanaResult(success=False, error="timeout")

        if proc.returncode != 0:
            errors_total.labels(stage="katana", category="exit_nonzero").inc()
            _log.warning(
                "katana.exit_nonzero",
                seed=seed_url,
                code=proc.returncode,
                stderr=stderr.decode("utf-8", errors="replace")[:500],
            )

        urls: list[str] = []
        seen_lower: set[str] = set()
        truncated = False
        seed_host = parsed_seed.netloc

        for raw_line in stdout.splitlines():
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            url = _extract_url_from_jsonl(line)
            if not url:
                _log.debug("katana.unparseable_line", line=line[:200])
                continue
            if not _same_origin(seed_host, url):
                continue
            if _is_asset(url):
                continue
            key = url.lower()
            if key in seen_lower:
                continue
            seen_lower.add(key)
            urls.append(url)
            if len(urls) >= max_urls:
                truncated = True
                break

        if truncated:
            _log.info("katana.truncated", seed=seed_url, max_urls=max_urls)

        _log.info(
            "katana.discover_ok",
            seed=seed_url,
            count=len(urls),
            duration_s=round(time.monotonic() - started, 3),
        )
        return KatanaResult(success=True, urls=urls)

    except FileNotFoundError:
        _log_unavailable_once()
        return KatanaResult(success=False, error="binary_missing", used_fallback=True)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="katana", category="unexpected").inc()
        _log.warning("katana.unexpected_error", seed=seed_url, error=str(e))
        return KatanaResult(success=False, error=str(e))
    finally:
        if proc is not None and proc.returncode is None:
            try:
                proc.kill()
                await proc.wait()
            except Exception:  # noqa: BLE001
                pass
        request_duration_seconds.labels(tool="katana_discover").observe(
            time.monotonic() - started
        )
