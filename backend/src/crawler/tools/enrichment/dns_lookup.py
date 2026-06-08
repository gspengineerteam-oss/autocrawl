"""DNS resolver — A, MX, NS records. Free, no key."""

from __future__ import annotations

import asyncio
from typing import Any

from ...observability.logger import get_logger

_log = get_logger(__name__)


_MAIL_PROVIDER_HINTS = {
    "google.com": "google_workspace",
    "googlemail.com": "google_workspace",
    "outlook.com": "microsoft_365",
    "office365.com": "microsoft_365",
    "protonmail": "protonmail",
    "zoho.com": "zoho",
    "fastmail.com": "fastmail",
    "yandex": "yandex",
    "mailgun": "mailgun",
}


async def lookup(domain: str) -> dict[str, Any]:
    def _run() -> dict[str, Any]:
        out: dict[str, Any] = {
            "domain": domain,
            "a": [],
            "ns": [],
            "mx": [],
            "txt": [],
            "mail_provider": None,
        }
        try:
            import dns.resolver  # type: ignore

            resolver = dns.resolver.Resolver()
            resolver.lifetime = 5.0
            for rtype in ("A", "NS", "MX", "TXT"):
                try:
                    answer = resolver.resolve(domain, rtype)
                    out[rtype.lower()] = [r.to_text() for r in answer]
                except Exception:  # noqa: BLE001
                    pass
            if out["mx"]:
                lower_mx = " ".join(m.lower() for m in out["mx"])
                for hint, label in _MAIL_PROVIDER_HINTS.items():
                    if hint in lower_mx:
                        out["mail_provider"] = label
                        break
        except Exception as e:  # noqa: BLE001
            _log.debug("dns.lookup_failed", domain=domain, error=str(e))
            out["error"] = str(e)
        return out

    return await asyncio.to_thread(_run)
