"""HTML utilities used across scrapers."""

from __future__ import annotations

from typing import Any

from selectolax.parser import HTMLParser

from ..url_utils import canonical_domain, canonical_url, is_aggregator_or_excluded


def parse(html: str) -> HTMLParser:
    return HTMLParser(html or "")


def text(html: str) -> str:
    if not html:
        return ""
    return parse(html).text(separator=" ", strip=True)


def all_links(html: str, *, base_url: str | None = None) -> list[dict[str, str]]:
    """Returns [{href, text, rel}] for every <a> tag with absolute href."""
    from urllib.parse import urljoin

    out: list[dict[str, str]] = []
    if not html:
        return out
    tree = parse(html)
    for a in tree.css("a[href]"):
        href = (a.attributes.get("href") or "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        if base_url:
            href = urljoin(base_url, href)
        out.append(
            {
                "href": href,
                "text": (a.text(strip=True) or "")[:200],
                "rel": (a.attributes.get("rel") or "").strip(),
            }
        )
    return out


def outbound_candidates(
    html: str,
    *,
    base_url: str,
    aggregator_domain: str,
) -> list[dict[str, Any]]:
    """Return outbound candidate links suitable for vendor URL resolution.

    Excludes:
      - same-domain links (the aggregator itself)
      - blacklisted domains (social, utilities, search engines)
      - mailto / tel / javascript / fragments
    """
    from urllib.parse import urlparse

    base_dom = canonical_domain(aggregator_domain or base_url)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for link in all_links(html, base_url=base_url):
        href = link["href"]
        scheme = (urlparse(href).scheme or "").lower()
        if scheme not in ("http", "https"):
            continue
        dom = canonical_domain(href)
        if not dom or dom == base_dom:
            continue
        if is_aggregator_or_excluded(href):
            continue
        cu = canonical_url(href)
        if cu in seen:
            continue
        seen.add(cu)
        out.append(
            {
                "url": cu,
                "domain": dom,
                "anchor_text": link["text"],
                "rel": link["rel"],
            }
        )
    return out


def find_visit_website_links(html: str, *, base_url: str) -> list[str]:
    """Heuristic: anchors whose text/rel screams 'real vendor site'."""
    cues = (
        "visit website",
        "visit site",
        "official website",
        "official site",
        "company website",
        "go to website",
        "company url",
        "homepage",
    )
    hits: list[str] = []
    for link in all_links(html, base_url=base_url):
        anchor = (link["text"] or "").lower()
        rel = (link["rel"] or "").lower()
        if any(c in anchor for c in cues) or "noopener" in rel and any(c in anchor for c in cues):
            hits.append(link["href"])
    return hits
