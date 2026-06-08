"""Phase 4 PR 3 — Deterministic HTTP contact-page scraper.

Tries common contact/about URLs against a vendor domain via httpx +
BeautifulSoup before spawning Browser-Use. ~30-40% of vendors with known
domain have static (Wix/Squarespace/static-HTML) contact pages where
agentic enrichment is overkill — this path returns full structured
contact data in ~3 seconds vs ~4 minutes for a Browser-Use agent run.

Used by `enrich_worker._process_one` as a pre-pass (PR 3) and as a
fallback after agent failure (PR 4). Vendor-name match guard prevents
false positives where a templated/cached page contains a different
company's email.
"""

from __future__ import annotations

import asyncio
import random
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from crawler.observability.logger import get_logger
from crawler.schemas import Address

_log = get_logger(__name__)


# Realistic Chrome 124 UA strings; rotated per-request to reduce simple UA
# rate-limiting. Not stealth — we're not pretending to be a person, we're
# just being polite about not looking like requests/python-default.
_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def _chrome_headers() -> dict[str, str]:
    return {
        "User-Agent": random.choice(_UAS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Ch-Ua": '"Chromium";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }


# 2026-05-21: trimmed 12 -> 5 paths. Pengamatan tick 6: most paths return
# 404, wasting 8-15s per vendor in redirect chains. Keep only the highest-
# hit-rate paths plus homepage fallback. Gemini grounded extract covers any
# missed catalog/about info via Google search anyway.
_CANDIDATE_PATHS = (
    "/contact",
    "/contact-us",
    "/about",
    "/about-us",
    "/",  # homepage footer fallback
)


# Email regex — RFC 5322 simplified. Excludes obvious noise (image filenames
# like .png@2x, common boilerplate like "name@example.com").
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_EMAIL_BLACKLIST = frozenset({
    "name@example.com", "you@example.com", "email@example.com",
    "user@example.com", "info@example.com", "your@email.com",
})

# International phone — covers +N{1,3} country code with separators.
# Loose enough to catch "+1 (415) 555-1234" and "+44-20-1234-5678", strict
# enough to avoid matching dollar amounts or product codes.
_PHONE_RE = re.compile(r"\+\d{1,3}[\s\-\.\(\)]*\d{1,4}[\s\-\.\(\)]*\d{1,4}[\s\-\.\(\)]*\d{1,9}")


# ISO country names + 2-letter codes for postal-address country detection.
# Not exhaustive — covers top 60 vendor-source countries from overnight run.
_COUNTRY_NAMES = {
    "united states": "USA", "usa": "USA", "u.s.a.": "USA", "u.s.": "USA",
    "united kingdom": "United Kingdom", "uk": "United Kingdom", "england": "United Kingdom",
    "germany": "Germany", "deutschland": "Germany",
    "france": "France", "italy": "Italy", "italia": "Italy",
    "spain": "Spain", "españa": "Spain",
    "netherlands": "Netherlands", "the netherlands": "Netherlands",
    "belgium": "Belgium", "switzerland": "Switzerland",
    "sweden": "Sweden", "norway": "Norway", "denmark": "Denmark",
    "finland": "Finland", "poland": "Poland", "austria": "Austria",
    "ireland": "Ireland", "portugal": "Portugal", "greece": "Greece",
    "czech republic": "Czech Republic", "czechia": "Czech Republic",
    "turkey": "Turkey", "türkiye": "Turkey",
    "russia": "Russia", "ukraine": "Ukraine",
    "china": "China", "p.r.c.": "China", "people's republic of china": "China",
    "japan": "Japan", "south korea": "South Korea", "korea": "South Korea",
    "india": "India", "singapore": "Singapore", "malaysia": "Malaysia",
    "thailand": "Thailand", "indonesia": "Indonesia", "vietnam": "Vietnam",
    "philippines": "Philippines", "australia": "Australia", "new zealand": "New Zealand",
    "canada": "Canada", "mexico": "Mexico", "brazil": "Brazil",
    "argentina": "Argentina", "chile": "Chile", "colombia": "Colombia",
    "uae": "UAE", "united arab emirates": "UAE", "saudi arabia": "Saudi Arabia",
    "israel": "Israel", "qatar": "Qatar", "kuwait": "Kuwait",
    "south africa": "South Africa", "egypt": "Egypt", "nigeria": "Nigeria",
    "morocco": "Morocco", "kenya": "Kenya",
    "taiwan": "Taiwan", "hong kong": "Hong Kong",
}


@dataclass
class StaticScrapeResult:
    domain: str
    source_url: str
    emails: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)
    address: Address | None = None
    country: str | None = None
    description: str | None = None
    # P3 (iter 12) — wider extract: surface 4 schema fields previously left
    # empty on the entire fast-path. Optional/empty defaults keep the
    # static_scraper code path unchanged; jina_extract populates them.
    socials: dict[str, str] = field(default_factory=dict)
    founded_year: int | None = None
    employee_count: int | None = None
    tech_stack: list[str] = field(default_factory=list)

    @property
    def has_contact(self) -> bool:
        return bool(self.emails or self.phones)


def _normalize_domain(d: str) -> str:
    """Strip protocol, www., trailing slash. Returns bare hostname."""
    if not d:
        return ""
    if "://" in d:
        try:
            d = urlparse(d).hostname or ""
        except Exception:  # noqa: BLE001
            return ""
    d = d.strip().lower().rstrip("/")
    if d.startswith("www."):
        d = d[4:]
    return d


def _vendor_tokens(name: str) -> list[str]:
    """Tokenize vendor name; drop common stopwords + short tokens."""
    stop = {"inc", "ltd", "llc", "corp", "co", "gmbh", "sa", "ag",
            "the", "and", "of", "for"}
    toks = re.findall(r"[a-zA-Z0-9]+", name.lower())
    return [t for t in toks if len(t) >= 3 and t not in stop]


def _page_matches_vendor(soup: BeautifulSoup, vendor_name: str) -> bool:
    """Guard: page title or h1 must contain at least one vendor-name token.
    Prevents extracting boilerplate emails from templated/cached pages that
    don't actually represent this vendor."""
    tokens = _vendor_tokens(vendor_name)
    if not tokens:
        return True  # no tokens to match — fail open
    haystacks: list[str] = []
    if soup.title and soup.title.string:
        haystacks.append(soup.title.string.lower())
    for tag in soup.find_all(["h1", "h2"]):
        text = tag.get_text(strip=True).lower()
        if text:
            haystacks.append(text)
    # Also check meta og:site_name and meta description.
    for meta_name in ("og:site_name", "og:title", "application-name"):
        m = soup.find("meta", attrs={"property": meta_name}) or soup.find(
            "meta", attrs={"name": meta_name}
        )
        if m and m.get("content"):
            haystacks.append(str(m.get("content")).lower())
    blob = " ".join(haystacks)
    return any(tok in blob for tok in tokens)


def _extract_emails(soup: BeautifulSoup, raw_html: str) -> list[str]:
    found: set[str] = set()
    # mailto: hrefs are highest signal.
    for a in soup.find_all("a", href=True):
        href = str(a.get("href", ""))
        if href.startswith("mailto:"):
            addr = href[7:].split("?")[0].strip()
            if "@" in addr:
                found.add(addr.lower())
    # Regex over visible text (cheaper false-positive surface than full HTML).
    visible = soup.get_text(" ", strip=True)
    for m in _EMAIL_RE.finditer(visible):
        e = m.group(0).lower()
        if e in _EMAIL_BLACKLIST:
            continue
        if any(e.endswith(suf) for suf in (".png", ".jpg", ".gif", ".svg")):
            continue
        found.add(e)
    return sorted(found)


def _extract_phones(soup: BeautifulSoup, raw_html: str) -> list[str]:
    found: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = str(a.get("href", ""))
        if href.startswith("tel:"):
            num = href[4:].strip()
            if num:
                found.add(num)
    # Regex on visible text — but require "+" prefix to reduce false positive.
    visible = soup.get_text(" ", strip=True)
    for m in _PHONE_RE.finditer(visible):
        digits_only = re.sub(r"\D", "", m.group(0))
        if 8 <= len(digits_only) <= 15:
            found.add(m.group(0).strip())
    return sorted(found)


def _extract_address(soup: BeautifulSoup) -> Address | None:
    """Pull schema.org PostalAddress or fall back to <address> tag."""
    # Schema.org JSON-LD first (richest signal).
    import json as _json

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = _json.loads(script.string or "")
        except Exception:  # noqa: BLE001
            continue
        if isinstance(data, list):
            for d in data:
                addr = _addr_from_jsonld(d)
                if addr:
                    return addr
        elif isinstance(data, dict):
            addr = _addr_from_jsonld(data)
            if addr:
                return addr
    # <address> HTML tag fallback.
    addr_tag = soup.find("address")
    if addr_tag:
        raw = addr_tag.get_text(" ", strip=True)
        if raw and len(raw) > 10:
            return Address(raw=raw[:500])
    return None


def _addr_from_jsonld(data: dict) -> Address | None:
    if not isinstance(data, dict):
        return None
    # Top-level Organization/LocalBusiness with address field.
    addr_val = data.get("address")
    if isinstance(addr_val, dict) and addr_val.get("@type") in {
        "PostalAddress", "Place"
    } | {None}:
        return Address(
            street=addr_val.get("streetAddress"),
            city=addr_val.get("addressLocality"),
            region=addr_val.get("addressRegion"),
            country=addr_val.get("addressCountry"),
            postal_code=addr_val.get("postalCode"),
            raw=" ".join(
                str(v) for v in [
                    addr_val.get("streetAddress"),
                    addr_val.get("addressLocality"),
                    addr_val.get("addressRegion"),
                    addr_val.get("postalCode"),
                    addr_val.get("addressCountry"),
                ] if v
            ) or None,
        )
    return None


def _extract_country(soup: BeautifulSoup, address: Address | None) -> str | None:
    if address and address.country:
        return address.country
    # Last-resort: scan footer text for known country names.
    footer = soup.find("footer")
    if footer:
        text = footer.get_text(" ", strip=True).lower()
        for name, canonical in _COUNTRY_NAMES.items():
            if name in text:
                return canonical
    return None


def _extract_description(soup: BeautifulSoup) -> str | None:
    m = soup.find("meta", attrs={"name": "description"})
    if m and m.get("content"):
        d = str(m.get("content")).strip()
        if 30 <= len(d) <= 500:
            return d
    m = soup.find("meta", attrs={"property": "og:description"})
    if m and m.get("content"):
        d = str(m.get("content")).strip()
        if 30 <= len(d) <= 500:
            return d
    return None


async def try_static_scrape(
    domain: str,
    vendor_name: str,
    *,
    timeout_seconds: float = 12.0,
    inter_request_delay: float = 1.5,
) -> StaticScrapeResult | None:
    """Probe candidate contact pages on `domain`. Returns first hit with
    email or phone where the page also matches `vendor_name`. Returns None
    if no candidate yields contact info or if all probes fail.

    Per-domain serial probing — single concurrent request to avoid
    triggering Cloudflare/WAF rate limits. ~3-15 seconds per call total.
    """
    domain = _normalize_domain(domain)
    if not domain:
        return None

    base = f"https://{domain}"

    async with httpx.AsyncClient(
        headers=_chrome_headers(),
        timeout=httpx.Timeout(timeout_seconds, connect=8.0),
        follow_redirects=True,
        http2=True,
    ) as client:
        for i, path in enumerate(_CANDIDATE_PATHS):
            url = base + path
            try:
                if i > 0:
                    await asyncio.sleep(inter_request_delay)
                r = await client.get(url)
            except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                _log.debug("static_scraper.probe_failed", url=url, error=str(e)[:120])
                continue
            except Exception as e:  # noqa: BLE001
                _log.debug("static_scraper.probe_error", url=url, error=str(e)[:120])
                continue

            if r.status_code != 200:
                _log.debug("static_scraper.non_200", url=url, status=r.status_code)
                continue

            ctype = r.headers.get("content-type", "").lower()
            if "html" not in ctype:
                continue

            try:
                soup = BeautifulSoup(r.text, "html.parser")
            except Exception as e:  # noqa: BLE001
                _log.debug("static_scraper.parse_failed", url=url, error=str(e)[:120])
                continue

            if not _page_matches_vendor(soup, vendor_name):
                _log.debug(
                    "static_scraper.vendor_mismatch", url=url,
                    vendor=vendor_name[:40],
                )
                continue

            emails = _extract_emails(soup, r.text)
            phones = _extract_phones(soup, r.text)
            address = _extract_address(soup)
            country = _extract_country(soup, address)
            description = _extract_description(soup)

            if emails or phones:
                _log.info(
                    "static_scraper.hit",
                    domain=domain, source_url=url,
                    emails=len(emails), phones=len(phones),
                    has_address=address is not None, country=country,
                )
                return StaticScrapeResult(
                    domain=domain,
                    source_url=str(r.url),
                    emails=emails,
                    phones=phones,
                    address=address,
                    country=country,
                    description=description,
                )

    _log.info("static_scraper.miss", domain=domain, vendor=vendor_name[:40])
    return None
