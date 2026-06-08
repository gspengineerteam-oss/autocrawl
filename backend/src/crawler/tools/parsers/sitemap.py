"""Sitemap.xml + robots.txt discovery."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

from ..browsers.httpx_client import fetch


async def fetch_sitemap_urls(site_url: str, *, max_urls: int = 200) -> list[str]:
    """Walk a site's sitemap (incl. sitemap indexes) and return up to N URLs."""
    parsed = urlparse(site_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    candidates = [
        urljoin(base, "/sitemap.xml"),
        urljoin(base, "/sitemap_index.xml"),
        urljoin(base, "/sitemap1.xml"),
    ]
    robots = await fetch(urljoin(base, "/robots.txt"))
    if robots.get("status") == 200:
        for m in re.finditer(r"(?im)^\s*Sitemap:\s*(\S+)", robots.get("html", "")):
            candidates.append(m.group(1).strip())

    seen: set[str] = set()
    found_urls: list[str] = []
    pending = list(dict.fromkeys(candidates))[:5]

    while pending and len(found_urls) < max_urls:
        sm_url = pending.pop(0)
        if sm_url in seen:
            continue
        seen.add(sm_url)
        r = await fetch(sm_url)
        if r.get("status") != 200 or not r.get("html"):
            continue
        try:
            root = ElementTree.fromstring(r["html"])
        except Exception:  # noqa: BLE001
            continue
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        # nested sitemap
        for sm in root.findall(".//sm:sitemap/sm:loc", ns):
            if sm.text and sm.text.strip() not in seen:
                pending.append(sm.text.strip())
        for url_el in root.findall(".//sm:url/sm:loc", ns):
            if url_el.text:
                u = url_el.text.strip()
                if u and u not in found_urls:
                    found_urls.append(u)
                    if len(found_urls) >= max_urls:
                        break
    return found_urls
