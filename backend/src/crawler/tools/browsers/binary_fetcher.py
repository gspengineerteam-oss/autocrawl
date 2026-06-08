"""Binary file fetcher (PDFs, images, etc).

Tries httpx first (fast), falls back to Playwright when:
  - status >= 400
  - response is not actually binary (challenge page, redirect to login)

Returns (bytes, content_type, source) or (None, None, error).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total, request_duration_seconds

_log = get_logger(__name__)

_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,application/octet-stream,*/*;q=0.8",
}


@dataclass
class BinaryResult:
    success: bool
    data: bytes | None = None
    content_type: str | None = None
    final_url: str | None = None
    source: str = "httpx"  # "httpx" | "playwright" | "firecrawl"
    error: str | None = None


def _looks_like_pdf(data: bytes, content_type: str | None) -> bool:
    if data.startswith(b"%PDF-"):
        return True
    if content_type and "pdf" in content_type.lower():
        return True
    return False


async def fetch_binary(url: str, *, max_size_bytes: int | None = None) -> BinaryResult:
    """Fetch binary content. Caps file size to avoid runaway downloads."""
    settings = get_settings()
    timeout = float(settings.global_request_timeout_seconds)
    cap = max_size_bytes or settings.pdf_max_size_mb * 1024 * 1024

    started = time.monotonic()
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            http2=True,
            headers=_DEFAULT_HEADERS,
        ) as client:
            async with client.stream("GET", url) as resp:
                content_type = resp.headers.get("content-type")
                if resp.status_code >= 400:
                    return BinaryResult(success=False, error=f"http_{resp.status_code}")
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > cap:
                        return BinaryResult(success=False, error=f"size_exceeded:{len(buf)}>{cap}")
                data = bytes(buf)
                return BinaryResult(
                    success=True,
                    data=data,
                    content_type=content_type,
                    final_url=str(resp.url),
                    source="httpx",
                )
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="binary_fetcher", category="httpx").inc()
        _log.debug("binary_fetcher.httpx_failed", url=url, error=str(e))
        return BinaryResult(success=False, error=str(e))
    finally:
        request_duration_seconds.labels(tool="binary_fetcher").observe(time.monotonic() - started)


async def fetch_pdf(url: str) -> BinaryResult:
    """Convenience: fetch_binary + verify it actually IS a PDF (magic bytes)."""
    r = await fetch_binary(url)
    if not r.success or not r.data:
        return r
    if not _looks_like_pdf(r.data, r.content_type):
        return BinaryResult(
            success=False,
            error=f"not_pdf:content_type={r.content_type!r}:first_bytes={r.data[:8]!r}",
        )
    return r
