"""HEAD-probe preflight for discovery seeds.

Catches dead URLs (404s, non-HTML payloads, sub-5KB stubs) before the agent
spawns a Chromium for them. Saves the dominant cost per seed (LLM turns over
a 404 page) on the cheapest possible probe.

Scope: only enforced for seeds tagged `discovery` (Mode C). Mode A's explicit
URLs and Mode B's Bing SERP URLs are always allowed through — preserves the
existing behavior of those modes.

Failure mode: if the HEAD probe itself errors (DNS fail, connection refused,
TLS error), we fail-open — let the agent try. Better to waste one turn on
a real network blip than to drop a possibly-good URL.
"""

from __future__ import annotations

import asyncio
import socket
from typing import Any
from urllib.parse import urlparse

from crawler.observability.logger import get_logger

from .config import get_agentic_settings
from .seeds import AgenticSeed

_log = get_logger(__name__)

_PREFLIGHT_SEMAPHORE: asyncio.Semaphore | None = None

# Parking / domain-for-sale / typo-squat hosts. Final-host check after
# follow_redirects — if seed.url redirected here, the page is just a
# template with "Buy this domain" + parking ads, so the agent burns turns
# extracting irrelevant "Related Searches" tokens. Production observed
# offenders: dot-tech.org (EWA Conference 2026 -> dot-tech.org/...).
_PARKING_HOST_TOKENS: tuple[str, ...] = (
    "sedoparking.",
    "sedo.com",
    "bodis.com",
    "parkingcrew.",
    "afternic.",
    "dan.com",
    "hugedomains.",
    "dot-tech.org",
    "namecheap-domain-parking.",
    "parking-page.",
    "domainmarket.",
    "above.com",
    "trafficclub.com",
    "smartname.com",
)


def _is_parking_host(host: str) -> bool:
    h = (host or "").lower()
    return any(tok in h for tok in _PARKING_HOST_TOKENS)


def _sem() -> asyncio.Semaphore:
    """Lazy semaphore — bound the HEAD-probe burst when discovery dumps 30+
    seeds at once. 8 in flight is enough to keep latency low without thrashing
    the egress connection pool."""
    global _PREFLIGHT_SEMAPHORE
    if _PREFLIGHT_SEMAPHORE is None:
        _PREFLIGHT_SEMAPHORE = asyncio.Semaphore(8)
    return _PREFLIGHT_SEMAPHORE


def _is_discovery_seed(seed: AgenticSeed) -> bool:
    return "discovery" in (seed.tags or [])


def _is_serp_url(url: str) -> bool:
    """Mode B seeds point at a Bing SERP — those always 200 and the agent's
    job is to PICK from results, not fetch the SERP itself. Bypass preflight."""
    u = url.lower()
    return any(s in u for s in ("bing.com/search", "duckduckgo.com/", "google.com/search"))


async def _dns_resolve(host: str, timeout_s: float) -> tuple[bool, str]:
    """Resolve `host` with a hard timeout. Returns (resolved, reason).
    `reason` is "ok", "nxdomain", "no_host", or a short error tag.
    """
    if not host:
        return False, "no_host"
    loop = asyncio.get_running_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, socket.getaddrinfo, host, None),
            timeout=timeout_s,
        )
        return True, "ok"
    except asyncio.TimeoutError:
        return True, "dns_timeout"  # fail-open: treat slow resolver as transient
    except socket.gaierror as e:
        # EAI_NONAME (-2 on Linux, 11001 on Windows) = NXDOMAIN.
        # EAI_NODATA / EAI_FAIL = SERVFAIL-class. Map all hard-fails to nxdomain.
        if e.errno in (socket.EAI_NONAME, getattr(socket, "EAI_NODATA", -5), getattr(socket, "EAI_FAIL", -4)):
            return False, "nxdomain"
        # Any other gaierror (network unreachable etc) → fail-open.
        return True, f"dns_gai_{e.errno}"
    except Exception:  # noqa: BLE001
        return True, "dns_unknown_error"


async def passes_preflight(seed: AgenticSeed) -> tuple[bool, str]:
    """Return (ok, reason). ok=False means drop this seed before crawling."""
    s = get_agentic_settings()
    if not s.preflight_enabled:
        return True, "disabled"
    # Modes A + B skip preflight to preserve existing behavior.
    if not _is_discovery_seed(seed):
        return True, "not_discovery"
    if _is_serp_url(seed.url):
        return True, "serp_bypass"

    # F2: DNS hard-fail. Cheaper than the HEAD probe and catches the
    # ERR_NAME_NOT_RESOLVED class we burn 20+ Chromium minutes on otherwise.
    if s.preflight_dns_check_enabled:
        host = urlparse(seed.url).hostname or ""
        resolved, dns_reason = await _dns_resolve(host, s.preflight_dns_timeout_s)
        if not resolved:
            try:
                from .knowledge import KnowledgeStore, domain_of

                store = await KnowledgeStore.load()
                dom = domain_of(seed.url)
                if dom:
                    await store.mark_blacklist(dom, "dns_dead")
                    await store.save()
                _log.info(
                    "agentic.preflight_dns_dead",
                    url=seed.url,
                    host=host,
                    domain=dom,
                    dns_reason=dns_reason,
                )
            except Exception as e:  # noqa: BLE001
                _log.warning(
                    "agentic.preflight_dns_dead_persist_failed",
                    url=seed.url,
                    error=str(e)[:120],
                )
            return False, "dns_dead"

    # Use the same proxied_client our search modules use, so the preflight
    # probe sees the same egress IP the agent will see. Without this we'd
    # accept URLs from the home IP that then fail under the VPN exit (or
    # vice versa: discard URLs the VPN exit can reach).
    try:
        from crawler.tools.http_proxy import proxied_client
    except ImportError:
        return True, "http_proxy_unavailable"

    async with _sem():
        try:
            async with proxied_client(
                follow_redirects=True,
                timeout=s.preflight_head_timeout_s,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AgenticCrawler-Preflight/1.0)"},
            ) as client:
                resp = await client.head(seed.url)
                # Some servers reject HEAD with 405 — fall back to a tiny GET.
                if resp.status_code == 405:
                    resp = await client.get(seed.url)
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.preflight_network_error", url=seed.url, error=str(e)[:120])
            return True, "network_check_skipped"

    final_url = str(getattr(resp, "url", "") or seed.url)
    final_host = urlparse(final_url).hostname or ""
    if _is_parking_host(final_host):
        try:
            from .knowledge import KnowledgeStore, domain_of

            store = await KnowledgeStore.load()
            dom = domain_of(seed.url)
            if dom:
                await store.mark_blacklist(dom, "parking_redirect")
                await store.save()
            _log.info(
                "agentic.preflight_parking_redirect",
                seed_url=seed.url,
                final_url=final_url,
                final_host=final_host,
            )
        except Exception as e:  # noqa: BLE001
            _log.warning(
                "agentic.preflight_parking_persist_failed",
                seed_url=seed.url,
                error=str(e)[:120],
            )
        return False, "parking_redirect"

    return _evaluate_response(resp, s)


def _evaluate_response(resp: Any, s: Any) -> tuple[bool, str]:
    status = getattr(resp, "status_code", 0)
    if status >= 400:
        return False, f"http_{status}"

    headers = getattr(resp, "headers", {}) or {}
    ctype = (headers.get("content-type") or "").lower().split(";")[0].strip()
    # Missing Content-Type is common (some SSR frameworks omit it on HEAD) —
    # let it pass. Only reject if it's set AND clearly not HTML.
    if ctype and not ctype.startswith("text/html"):
        # PDF / image / json — agent can't extract a vendor list from these.
        return False, f"content_type_{ctype.replace('/', '_')}"

    clen_raw = headers.get("content-length")
    if clen_raw:
        try:
            clen = int(clen_raw)
        except ValueError:
            clen = -1
        # Drop only when length is set, > 0 (CDNs sometimes return 0 for SSR),
        # AND below threshold. Skips the false-positive on legit SSR pages.
        if 0 < clen < s.preflight_min_html_bytes:
            return False, f"too_small_{clen}b"

    return True, f"ok_{status}"
