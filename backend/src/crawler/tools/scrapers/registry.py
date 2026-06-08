"""Routes an aggregator URL to the correct scraper module."""

from __future__ import annotations

from ...observability.logger import get_logger
from ...schemas import ExhibitorRef
from ..url_utils import canonical_domain
from . import generic, tentimes, wikipedia

_log = get_logger(__name__)


_REGISTRY = {
    "10times.com": tentimes,
    "en.wikipedia.org": wikipedia,
    "wikipedia.org": wikipedia,
}


def _pick_scraper(url: str):
    """Match domain or any of its parent suffixes (e.g. de.wikipedia.org → wikipedia)."""
    dom = canonical_domain(url) or ""
    if dom in _REGISTRY:
        return _REGISTRY[dom]
    parts = dom.split(".")
    for i in range(1, len(parts)):
        suffix = ".".join(parts[i:])
        if suffix in _REGISTRY:
            return _REGISTRY[suffix]
    return generic


async def list_exhibitors(expo_url: str, expo_id: str) -> list[ExhibitorRef]:
    """Pick the most specific scraper for the URL's domain.

    Falls back to `generic` if no specialized scraper exists.
    """
    mod = _pick_scraper(expo_url)
    dom = canonical_domain(expo_url)
    _log.info("scraper.routed", aggregator_domain=dom, scraper=mod.__name__, expo_id=expo_id)
    try:
        return await mod.list_exhibitors(expo_url, expo_id)
    except Exception as e:  # noqa: BLE001
        _log.warning("scraper.failed", scraper=mod.__name__, expo_id=expo_id, error=str(e))
        return []
