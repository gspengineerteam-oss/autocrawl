"""WHOIS / RDAP lookup using `python-whois`. Free, no key."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from typing import Any

from ...observability.logger import get_logger

_log = get_logger(__name__)


def _coerce_date(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, list):
        v = v[0] if v else None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


async def lookup(domain: str) -> dict[str, Any]:
    """Return registrar, country, creation_date, expiration_date, age_days, raw."""

    def _run() -> dict[str, Any]:
        try:
            import whois  # type: ignore

            data = whois.whois(domain)
        except Exception as e:  # noqa: BLE001
            _log.debug("whois.lookup_failed", domain=domain, error=str(e))
            return {"domain": domain, "error": str(e)}
        created = _coerce_date(data.get("creation_date"))
        expires = _coerce_date(data.get("expiration_date"))
        age_days = (date.today() - created).days if created else None
        registrar = data.get("registrar")
        if isinstance(registrar, list):
            registrar = registrar[0] if registrar else None
        country = data.get("country")
        if isinstance(country, list):
            country = country[0] if country else None
        return {
            "domain": domain,
            "registrar": registrar,
            "country": country,
            "creation_date": created.isoformat() if created else None,
            "expiration_date": expires.isoformat() if expires else None,
            "age_days": age_days,
            "queried_at": datetime.now(timezone.utc).isoformat(),
        }

    return await asyncio.to_thread(_run)
