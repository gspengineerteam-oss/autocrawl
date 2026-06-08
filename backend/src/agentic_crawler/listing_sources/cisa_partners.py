"""P4 — CISA Cyber Information Sharing & Collaboration Partners source.

CISA (US Cybersecurity and Infrastructure Security Agency) maintains a
public list of organizations participating in the AIS (Automated Indicator
Sharing) and ECS (Enhanced Cybersecurity Services) programs. These are
verified cybersecurity vendors, MSSPs, and federal/state coordination
centers — a high-quality seed set.

We fetch via Jina Reader (markdown-cleaned) since the actual CISA page
is JS-heavy and brittle to parse with bare HTML.

Rate: monthly, 1st day at 04:00 UTC. CISA updates the list infrequently.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from crawler.observability.logger import get_logger
from crawler.tools.browsers.jina_reader import fetch_clean_markdown

from ..enrich_queue import EnrichTask, make_task_id, publish

_log = get_logger(__name__)

# Public CISA partner pages. Names are illustrative — the actual published
# program rosters change names occasionally. Falls back gracefully if the
# page 404s.
CISA_PAGES: tuple[tuple[str, str], ...] = (
    (
        "https://www.cisa.gov/topics/cybersecurity-best-practices/information-sharing/ais",
        "cisa-ais",
    ),
    (
        "https://www.cisa.gov/resources-tools/services/free-cybersecurity-services-and-tools",
        "cisa-free-tools",
    ),
)

# Markdown link pattern that survives Jina's cleaning.
_LINK_RE = re.compile(r"\[([^\]]{2,80})\]\((https?://[^\s)]+)\)")

# CISA pages link out to many resources; only treat the link as a vendor
# candidate when the host is NOT a CISA/government domain.
_GOV_HOSTS_SUFFIX: tuple[str, ...] = (
    ".gov", ".mil", ".cisa.gov",
)

_REJECT_HOSTS: frozenset[str] = frozenset({
    "github.com", "twitter.com", "x.com", "linkedin.com",
    "youtube.com", "facebook.com",
})


def _is_vendor_host(host: str) -> bool:
    if not host:
        return False
    if host in _REJECT_HOSTS:
        return False
    return not any(host.endswith(s) for s in _GOV_HOSTS_SUFFIX)


async def run_cisa_partners_pull() -> dict[str, int]:
    counts: dict[str, int] = {}
    for page_url, tag in CISA_PAGES:
        try:
            markdown = await fetch_clean_markdown(page_url, timeout_seconds=30)
        except Exception as e:  # noqa: BLE001
            _log.warning(
                "listing.cisa.fetch_failed",
                url=page_url, error=str(e)[:160],
            )
            counts[tag] = 0
            continue
        if not markdown:
            counts[tag] = 0
            continue

        seen_hosts: set[str] = set()
        pushed = 0
        for m in _LINK_RE.finditer(markdown):
            name = m.group(1).strip()
            url = m.group(2).strip().rstrip(").,;:'\"")
            try:
                host = (urlparse(url).hostname or "").lower()
            except Exception:  # noqa: BLE001
                continue
            if host.startswith("www."):
                host = host[4:]
            if not _is_vendor_host(host):
                continue
            if host in seen_hosts:
                continue
            seen_hosts.add(host)
            task = EnrichTask(
                task_id=make_task_id(name, tag),
                vendor_name=name,
                hint_url=url,
                expo_id=f"cisa:{tag}",
                country_hint="United States",
                product_hint=None,
                source_query=f"cisa_partners:{tag}",
            )
            try:
                entry = await publish(task)
                if entry:
                    pushed += 1
            except Exception as e:  # noqa: BLE001
                _log.debug(
                    "listing.cisa.publish_failed",
                    tag=tag, vendor=name[:60], error=str(e)[:120],
                )
        counts[tag] = pushed
        _log.info("listing.cisa.page_done", tag=tag, pushed=pushed)

    total = sum(counts.values())
    _log.info(
        "listing.cisa.run_complete",
        total_pushed=total, by_tag=counts,
    )
    return counts


__all__ = ["run_cisa_partners_pull", "CISA_PAGES"]
