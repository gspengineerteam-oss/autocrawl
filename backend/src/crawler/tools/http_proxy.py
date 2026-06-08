"""Single source of truth for outbound HTTP via VPN/proxy.

Why this exists
---------------
Every search-engine module (19 of them) used to construct its own
`httpx.AsyncClient(...)` inline. When we add Gluetun-based VPN egress for
Phase 2 we need ALL outbound traffic to flow through the same SOCKS5/HTTP
forwarder — both for IP-rotation and to avoid leaking the home IP via a
forgotten module. Centralizing client construction here makes that swap
mechanical.

Usage:

    from crawler.tools.http_proxy import proxied_client

    async with proxied_client(timeout=20, http2=True) as client:
        resp = await client.get(url)

When `VPN_ENABLED=false` (default) this falls back to a vanilla
`httpx.AsyncClient` so non-VPN deployments stay byte-identical to today.

Fail-closed semantics
---------------------
We FAIL CLOSED on persistent proxy connect failures. After
`proxy_max_consecutive_failures` consecutive errors that look like proxy
issues, `proxied_client()` raises rather than silently returning a direct
client — silent fallback would deanonymize the operator the moment the VPN
sidecar dies. The counter resets on the next successful call.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import httpx

from ..config import get_settings
from ..observability.logger import get_logger

_log = get_logger(__name__)

# Process-wide failure counter. We only care that the consecutive-failure
# count gates further proxy attempts; concurrent races just bias the counter
# slightly higher and trip the fail-closed guard a hair sooner.
_consecutive_failures: int = 0


class ProxyDeadError(RuntimeError):
    """Raised when the configured proxy has failed too many times in a row.

    Caller should treat this as a hard outbound failure and surface it to
    monitoring rather than retrying with a direct connection (which would
    leak the host IP under VPN_ENABLED=true)."""


def _proxy_for_settings() -> str | None:
    s = get_settings()
    if not s.vpn_enabled:
        return None
    url = (s.proxy_url or "").strip()
    return url or None


def _is_proxy_error(exc: BaseException) -> bool:
    """Heuristic: does this exception look like a proxy/transport problem
    (vs an HTTP-level error from the upstream site)?"""
    if isinstance(exc, (httpx.ConnectError, httpx.ProxyError, httpx.ReadTimeout, httpx.ConnectTimeout)):
        return True
    msg = str(exc).lower()
    return "proxy" in msg or "socks" in msg


@asynccontextmanager
async def proxied_client(
    *,
    timeout: float | int | None = None,
    http2: bool = False,
    follow_redirects: bool = False,
    headers: dict[str, str] | None = None,
    **extra: Any,
) -> AsyncIterator[httpx.AsyncClient]:
    """Yield an `httpx.AsyncClient` honoring `VPN_ENABLED`/`PROXY_URL`.

    Surface mirrors `httpx.AsyncClient(**)` so swapping in is mechanical:

        async with proxied_client(timeout=20) as client:
            resp = await client.get(url)
    """
    global _consecutive_failures

    s = get_settings()
    proxy = _proxy_for_settings()

    if proxy and _consecutive_failures >= s.proxy_max_consecutive_failures:
        # Fail closed — refuse to silently fall back to a direct client.
        raise ProxyDeadError(
            f"proxy {proxy} has {_consecutive_failures} consecutive failures; "
            "refusing to fall back to direct egress while VPN_ENABLED=true"
        )

    client_kwargs: dict[str, Any] = {
        "timeout": timeout if timeout is not None else float(s.global_request_timeout_seconds),
        "http2": http2,
        "follow_redirects": follow_redirects,
        **extra,
    }
    if headers:
        client_kwargs["headers"] = headers
    if proxy:
        # httpx accepts SOCKS5 via httpx-socks if installed, OR plain HTTP
        # proxy URL. Gluetun ships both — we prefer http://gluetun:8888
        # by default to avoid the optional dep.
        client_kwargs["proxy"] = proxy

    client = httpx.AsyncClient(**client_kwargs)
    try:
        yield client
        # Successful exit (no exception escaped) — reset the failure counter
        # so a single transient blip doesn't permanently mark the proxy dead.
        if proxy:
            _consecutive_failures = 0
    except BaseException as e:
        if proxy and _is_proxy_error(e):
            _consecutive_failures += 1
            _log.warning(
                "http_proxy.failure",
                proxy=proxy,
                consecutive=_consecutive_failures,
                error=str(e)[:160],
            )
        raise
    finally:
        await client.aclose()
