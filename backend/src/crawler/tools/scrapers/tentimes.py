"""Scraper for 10times.com — the richest source of security/defense expo exhibitor lists."""

from __future__ import annotations

from urllib.parse import urljoin

from ...observability.logger import get_logger
from ...schemas import ExhibitorRef, SourceProvenance
from ..browsers.fetcher import fetch
from ..parsers.html_parser import parse
from ..proxies.rate_limit import acquire as rl_acquire
from ..url_utils import canonical_domain

_log = get_logger(__name__)
AGGREGATOR_DOMAIN = "10times.com"


def matches(url: str) -> bool:
    return canonical_domain(url) == AGGREGATOR_DOMAIN


async def list_exhibitors(expo_url: str, expo_id: str) -> list[ExhibitorRef]:
    """Return a flat list of exhibitor refs scraped from a 10times expo page.

    10times uses a few patterns; we try the most reliable selectors and
    fall back to broad anchor-text heuristics.
    """
    await rl_acquire(expo_url)
    primary = await fetch(expo_url, force_render=True)
    if not primary.get("html"):
        return []

    out: list[ExhibitorRef] = []
    seen: set[str] = set()

    # Try common variants — exhibitors page may be at /exhibitors or have an "Exhibitors" tab
    pages_to_check = [primary]
    if "/exhibitors" not in expo_url.rstrip("/"):
        await rl_acquire(expo_url)
        ex_page = await fetch(expo_url.rstrip("/") + "/exhibitors", force_render=True)
        if ex_page.get("html"):
            pages_to_check.append(ex_page)

    for page in pages_to_check:
        tree = parse(page["html"])
        # 10times exhibitor cards (multiple historical layouts)
        cards = tree.css(
            "a.exhibitor-name, "
            ".exhibitor-card a, "
            ".exhibitorlisting a, "
            ".companyName a, "
            "li.exhibitor a"
        )
        for a in cards:
            href = (a.attributes.get("href") or "").strip()
            if not href:
                continue
            absolute = href if href.startswith("http") else urljoin(page["url"] or expo_url, href)
            if "/company/" not in absolute and "/exhibitor/" not in absolute:
                continue
            name = a.text(strip=True)
            if not name or len(name) < 2:
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            try:
                out.append(
                    ExhibitorRef(
                        expo_id=expo_id,
                        name=name[:200],
                        raw_url=absolute,
                        aggregator_domain=AGGREGATOR_DOMAIN,
                        provenance=[SourceProvenance(type="aggregator", url=absolute, extraction_method="tentimes_html")],
                    )
                )
            except Exception as e:  # noqa: BLE001
                _log.debug("tentimes.invalid_exhibitor", error=str(e), url=absolute)

    _log.info("tentimes.exhibitors_extracted", expo_id=expo_id, count=len(out))
    return out
