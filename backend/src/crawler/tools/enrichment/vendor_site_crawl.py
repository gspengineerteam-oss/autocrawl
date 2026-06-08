"""Crawl a vendor's own site to gather enrichment-ready text + structured data.

Pages we care about: /, /about, /contact, /team, /products, /leadership,
/imprint, /privacy. Plus whatever sitemap.xml advertises.

Returns a dict suitable for handing to the LLM merge step.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urljoin

from ...config import get_settings
from ...observability.logger import get_logger
from ..browsers.fetcher import fetch
from ..discovery.katana import discover_urls as katana_discover
from ..parsers.email_harvester import (
    harvest_emails,
    harvest_phones,
    harvest_socials,
)
from ..parsers.html_parser import text as html_text
from ..parsers.schema_org import extract_all, find_open_graph
from ..parsers.sitemap import fetch_sitemap_urls
from ..proxies.rate_limit import acquire as rl_acquire
from .logo_extractor import extract_logo
from .tech_stack import detect as detect_tech_stack

_log = get_logger(__name__)

_PRIORITY_PATHS = (
    "/",
    "/about",
    "/about-us",
    "/company",
    "/contact",
    "/contact-us",
    "/team",
    "/leadership",
    "/products",
    "/services",
    "/solutions",
    "/imprint",
    "/legal",
    "/privacy",
)

_SITEMAP_INTERESTING = (
    "about",
    "company",
    "contact",
    "team",
    "leadership",
    "product",
    "service",
    "solution",
    "imprint",
)


async def crawl_vendor_site(
    canonical_site_url: str,
    *,
    max_pages: int = 12,
) -> dict:
    pages_to_fetch: list[str] = []
    base = canonical_site_url.rstrip("/")
    for p in _PRIORITY_PATHS:
        pages_to_fetch.append(urljoin(base + "/", p.lstrip("/")))

    sitemap_urls = await fetch_sitemap_urls(canonical_site_url, max_urls=80)
    for u in sitemap_urls:
        if any(k in u.lower() for k in _SITEMAP_INTERESTING) and u not in pages_to_fetch:
            pages_to_fetch.append(u)
        if len(pages_to_fetch) >= max_pages * 2:
            break

    settings = get_settings()
    if settings.enable_katana and len(pages_to_fetch) < max_pages * 2:
        budget = (max_pages * 2) - len(pages_to_fetch)
        kat = await katana_discover(
            canonical_site_url,
            max_urls=min(settings.katana_max_urls, budget),
            timeout=settings.katana_timeout_seconds,
        )
        if kat.success and kat.urls:
            existing = set(pages_to_fetch)
            added = 0
            for u in kat.urls:
                if u in existing:
                    continue
                pages_to_fetch.append(u)
                existing.add(u)
                added += 1
                if len(pages_to_fetch) >= max_pages * 2:
                    break
            _log.info(
                "vendor_site_crawl.katana_merged",
                site=canonical_site_url,
                katana_returned=len(kat.urls),
                added=added,
                total_frontier=len(pages_to_fetch),
            )

    seen: set[str] = set()
    fetched: list[dict] = []

    async def _fetch_one(url: str) -> dict | None:
        if url in seen:
            return None
        seen.add(url)
        await rl_acquire(url)
        r = await fetch(url, force_render=False)
        if not r.get("html"):
            return None
        return r

    sem = asyncio.Semaphore(5)

    async def _bounded(url: str) -> dict | None:
        async with sem:
            return await _fetch_one(url)

    results = await asyncio.gather(*(_bounded(u) for u in pages_to_fetch[:max_pages]), return_exceptions=True)
    for r in results:
        if isinstance(r, dict):
            fetched.append(r)

    if not fetched:
        return {"site_url": canonical_site_url, "pages": []}

    combined_text = " \n ".join(html_text(p["html"])[:8000] for p in fetched)[:60000]

    organization_data: list[dict] = []
    open_graph: dict = {}
    for p in fetched:
        bundle = extract_all(p["html"], p.get("url") or canonical_site_url)
        for it in bundle["json_ld"]:
            if isinstance(it, dict):
                t = it.get("@type")
                t_norm = (t if isinstance(t, list) else [t]) if t else []
                if any(str(x).lower() in {"organization", "corporation", "company", "localbusiness"} for x in t_norm):
                    organization_data.append(it)
        if not open_graph:
            og = find_open_graph(p["html"], p.get("url") or canonical_site_url)
            if og:
                open_graph = og

    homepage = fetched[0]
    logo_url = extract_logo(
        homepage.get("html", ""),
        homepage.get("url") or canonical_site_url,
        organization_data,
    )
    tech_stack: list[str] = []
    for p in fetched[:3]:
        for tag in detect_tech_stack(p.get("html", ""), p.get("headers")):
            if tag not in tech_stack:
                tech_stack.append(tag)

    return {
        "site_url": canonical_site_url,
        "pages": [{"url": p.get("url"), "status": p.get("status"), "len": len(p.get("html", ""))} for p in fetched],
        "combined_text_excerpt": combined_text,
        "organization_jsonld": organization_data,
        "open_graph": open_graph,
        "emails": harvest_emails(combined_text),
        "phones": harvest_phones(combined_text)[:10],
        "socials": harvest_socials(combined_text),
        "logo_url": logo_url,
        "tech_stack": tech_stack,
    }
