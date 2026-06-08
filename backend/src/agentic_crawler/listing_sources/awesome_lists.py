"""P4 — Awesome lists vendor source.

Pulls curated vendor lists from GitHub "awesome-*" repositories. Each
repo's README is a markdown file with bullet entries like:

    - [Vendor Name](https://vendor.com) - description

We parse those bullets, dedupe by domain, and push each one into the
agentic enrich queue. The enrich worker then resolves contact info via
the Jina fast-path or browser_use fallback.

Why curated lists: they're peer-reviewed, scoped to specific verticals
(cybersecurity, OSINT, IoT security, etc), and stable over time. Adds
diversity to the seed corpus beyond expo aggregator pages.

Rate: weekly Monday 03:00 UTC. Run is idempotent — dedup_agent rejects
duplicate domains downstream so re-running is cheap.
"""

from __future__ import annotations

import re
from typing import Iterable
from urllib.parse import urlparse

import httpx

from crawler.observability.logger import get_logger

from ..enrich_queue import EnrichTask, make_task_id, publish

_log = get_logger(__name__)

# Curated awesome-list repos. Format: (repo_full_name, raw_readme_url, tag).
# `tag` lands on the provenance + expo_id so downstream filtering can
# distinguish sources.
AWESOME_REPOS: tuple[tuple[str, str, str], ...] = (
    (
        "Hack-with-Github/Awesome-Hacking",
        "https://raw.githubusercontent.com/Hack-with-Github/Awesome-Hacking/master/README.md",
        "awesome-hacking",
    ),
    (
        "sbilly/awesome-security",
        "https://raw.githubusercontent.com/sbilly/awesome-security/master/README.md",
        "awesome-security",
    ),
    (
        "paralax/awesome-honeypots",
        "https://raw.githubusercontent.com/paralax/awesome-honeypots/master/README.md",
        "awesome-honeypots",
    ),
    (
        "jivoi/awesome-osint",
        "https://raw.githubusercontent.com/jivoi/awesome-osint/master/README.md",
        "awesome-osint",
    ),
    (
        "pe3zx/awesome-iot-security",
        "https://raw.githubusercontent.com/pe3zx/awesome-iot-security/master/README.md",
        "awesome-iot-security",
    ),
)

# Strict bullet pattern: "- [Name](https://url) - description" or
# "* [Name](https://url): description". Anchors at line start so we don't
# pick up inline links inside paragraphs.
_BULLET_RE = re.compile(
    r"^\s*[-*]\s+\[([^\]]{2,80})\]\(\s*(https?://[^\s)]+)\s*\)",
    re.MULTILINE,
)

# Reject domains that are obviously not company sites — these flood the
# awesome lists with GitHub/blog/wiki links that shouldn't be enriched
# as if they were vendors.
_REJECT_HOSTS: frozenset[str] = frozenset({
    "github.com", "gitlab.com", "bitbucket.org",
    "twitter.com", "x.com", "linkedin.com", "facebook.com",
    "youtube.com", "youtu.be", "vimeo.com",
    "wikipedia.org", "medium.com", "dev.to",
    "stackoverflow.com", "reddit.com",
    "google.com", "docs.google.com",
    "amazon.com", "amazon.co.uk",
    "raw.githubusercontent.com",
})


def _registrable_host(url: str) -> str | None:
    try:
        h = (urlparse(url).hostname or "").lower()
    except Exception:  # noqa: BLE001
        return None
    if not h:
        return None
    if h.startswith("www."):
        h = h[4:]
    return h


def _is_reject(host: str) -> bool:
    if host in _REJECT_HOSTS:
        return True
    # Strip subdomain — reject `subdomain.github.com` etc.
    parts = host.split(".")
    if len(parts) >= 2:
        registrable = ".".join(parts[-2:])
        if registrable in _REJECT_HOSTS:
            return True
    return False


def _parse_readme(markdown: str) -> Iterable[tuple[str, str]]:
    """Yield (name, url) pairs from awesome-list markdown."""
    seen_hosts: set[str] = set()
    for m in _BULLET_RE.finditer(markdown):
        name = m.group(1).strip()
        url = m.group(2).strip().rstrip(").,;:'\"")
        if not name or not url or len(name) < 2:
            continue
        host = _registrable_host(url)
        if not host or _is_reject(host):
            continue
        if host in seen_hosts:
            continue
        seen_hosts.add(host)
        yield (name, url)


async def _fetch_readme(client: httpx.AsyncClient, raw_url: str) -> str | None:
    try:
        r = await client.get(raw_url, timeout=30.0, follow_redirects=True)
        if r.status_code != 200:
            _log.warning(
                "listing.awesome.fetch_non_200",
                url=raw_url, status=r.status_code,
            )
            return None
        return r.text
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "listing.awesome.fetch_failed",
            url=raw_url, error=str(e)[:160],
        )
        return None


async def run_awesome_lists_pull() -> dict[str, int]:
    """Fetch all configured awesome lists, parse vendors, push to queue.

    Returns per-repo counts of pushed candidates for observability.
    Idempotent — dedup happens downstream during enrich, so re-running
    is safe (most pushes will be skipped by dedup_agent.check_and_merge).
    """
    counts: dict[str, int] = {}
    async with httpx.AsyncClient() as client:
        for repo, raw_url, tag in AWESOME_REPOS:
            markdown = await _fetch_readme(client, raw_url)
            if not markdown:
                counts[tag] = 0
                continue
            pushed = 0
            for name, url in _parse_readme(markdown):
                task = EnrichTask(
                    task_id=make_task_id(name, tag),
                    vendor_name=name,
                    hint_url=url,
                    expo_id=f"awesome_list:{tag}",
                    country_hint=None,
                    product_hint=None,
                    source_query=f"awesome_list:{repo}",
                )
                try:
                    entry = await publish(task)
                    if entry:
                        pushed += 1
                except Exception as e:  # noqa: BLE001
                    _log.debug(
                        "listing.awesome.publish_failed",
                        repo=repo, vendor=name[:60], error=str(e)[:120],
                    )
            counts[tag] = pushed
            _log.info(
                "listing.awesome.repo_done",
                repo=repo, pushed=pushed,
            )
    total = sum(counts.values())
    _log.info(
        "listing.awesome.run_complete",
        total_pushed=total, by_repo=counts,
    )
    return counts


__all__ = ["run_awesome_lists_pull", "AWESOME_REPOS"]
