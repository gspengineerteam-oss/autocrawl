"""S1 Jina Reader fast-path for vendor enrichment.

Fetches `https://r.jina.ai/{url}` for a vendor's homepage plus 3 common
contact sub-paths in parallel and runs regex extraction over the returned
markdown. When Jina (paid tier) returns clean content with email or phone
plus a vendor-name signal, we bypass the static scraper and Browser-Use
entirely. Target time per vendor: under 15 seconds vs 180-400 seconds for
the agent path.

Reuses StaticScrapeResult dataclass from `static_scraper` so the existing
`_persist_static_scrape_result` codepath can ingest the result unchanged.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import urlparse

from crawler.observability.logger import get_logger
from crawler.schemas import Address
from crawler.tools.browsers.jina_reader import fetch_clean_markdown

from .static_scraper import (
    StaticScrapeResult,
    _COUNTRY_NAMES,
    _EMAIL_BLACKLIST,
    _EMAIL_RE,
    _PHONE_RE,
    _normalize_domain,
    _vendor_tokens,
)

_log = get_logger(__name__)

_DEFAULT_PATHS: tuple[str, ...] = ("/", "/about", "/contact", "/contact-us")
_MIN_MARKDOWN_LEN = 200


def _jina_proxy_url(target: str) -> str:
    from urllib.parse import quote

    return f"https://r.jina.ai/{quote(target, safe=':/?&=#')}"


def _extract_emails_md(text: str) -> list[str]:
    found: set[str] = set()
    for m in _EMAIL_RE.finditer(text):
        e = m.group(0).lower()
        if e in _EMAIL_BLACKLIST:
            continue
        if any(e.endswith(suf) for suf in (".png", ".jpg", ".gif", ".svg", ".webp")):
            continue
        found.add(e)
    return sorted(found)


def _extract_phones_md(text: str) -> list[str]:
    found: set[str] = set()
    for m in _PHONE_RE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if 8 <= len(digits) <= 15:
            found.add(m.group(0).strip())
    return sorted(found)


_ADDRESS_HINT_RE = re.compile(
    r"\b\d{1,5}\s+[A-Za-z][A-Za-z0-9\.\-\s]{3,80},\s*[A-Za-z\s]{2,50}(?:,\s*[A-Za-z\s]{2,40})?",
)


def _extract_address_md(text: str) -> Address | None:
    m = _ADDRESS_HINT_RE.search(text)
    if not m:
        return None
    raw = m.group(0).strip()
    if len(raw) > 500:
        raw = raw[:500]
    return Address(raw=raw)


_SOCIAL_PATTERNS: dict[str, re.Pattern[str]] = {
    "linkedin": re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:company|in|school)/[A-Za-z0-9_\-\.%]+", re.I),
    "twitter": re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/[A-Za-z0-9_]{1,30}(?:[/?#]|$)", re.I),
    "facebook": re.compile(r"https?://(?:[a-z]{2,3}\.|www\.)?facebook\.com/(?!sharer|share)[A-Za-z0-9_\-\.]{2,60}", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:c/|channel/|user/|@)[A-Za-z0-9_\-]+", re.I),
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/[A-Za-z0-9_\.]{2,40}", re.I),
    "github": re.compile(r"https?://(?:www\.)?github\.com/[A-Za-z0-9_\-]{1,40}(?:[/?#]|$)", re.I),
}


def _extract_social_links_md(text: str) -> dict[str, str]:
    """First URL per platform wins. Strips trailing punctuation/query."""
    out: dict[str, str] = {}
    for platform, pat in _SOCIAL_PATTERNS.items():
        m = pat.search(text)
        if not m:
            continue
        raw = m.group(0)
        raw = raw.rstrip(").,;:'\"!?>")
        if "?" in raw:
            raw = raw.split("?", 1)[0]
        if "#" in raw:
            raw = raw.split("#", 1)[0]
        if len(raw) > 240:
            continue
        out[platform] = raw
    return out


_FOUNDED_RE = re.compile(
    r"(?:founded|established|since|est\.?|incorporated|launched)\s+(?:in\s+)?(\d{4})",
    re.I,
)


def _extract_founded_year_md(text: str) -> int | None:
    import datetime as _dt
    current = _dt.datetime.utcnow().year
    for m in _FOUNDED_RE.finditer(text):
        try:
            y = int(m.group(1))
        except ValueError:
            continue
        if 1800 < y <= current + 1:
            return y
    return None


_EMPLOYEE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"team\s+of\s+(?:over\s+|more\s+than\s+)?(\d{1,5})\s+(?:people|professionals|experts|engineers|employees)", re.I),
    re.compile(r"(\d{1,5})\+?\s+(?:employees|team\s+members|staff|professionals)\b", re.I),
    re.compile(r"(?:over|more\s+than)\s+(\d{1,5})\s+(?:employees|team\s+members)\b", re.I),
)


def _extract_employee_count_md(text: str) -> int | None:
    for pat in _EMPLOYEE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        try:
            n = int(m.group(1))
        except ValueError:
            continue
        if 1 <= n <= 100000:
            return n
    return None


_TECH_WHITELIST: frozenset[str] = frozenset({
    "react", "vue", "angular", "svelte", "next.js", "nuxt", "remix",
    "node.js", "express", "fastapi", "django", "flask", "rails", "laravel",
    "spring", "spring boot", "asp.net", "dotnet", ".net core",
    "python", "javascript", "typescript", "golang", "rust", "java",
    "kotlin", "swift", "ruby", "php", "scala", "elixir",
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra",
    "kafka", "rabbitmq", "snowflake", "bigquery", "databricks",
    "aws", "gcp", "azure", "cloudflare", "kubernetes", "docker", "terraform",
    "graphql", "grpc", "rest api", "websocket",
    "tensorflow", "pytorch", "langchain", "openai", "anthropic",
})

_TECH_LINE_RE = re.compile(r"\b([A-Za-z][A-Za-z0-9.+#\-]{1,18})\b")


def _extract_tech_stack_md(text: str) -> list[str]:
    found: set[str] = set()
    lowered = text.lower()
    for tok in _TECH_WHITELIST:
        if tok in lowered:
            found.add(tok)
    return sorted(found)


def _extract_country_md(text: str, address: Address | None) -> str | None:
    if address and address.country:
        return address.country
    haystack = text.lower()
    tail = haystack[-4000:] if len(haystack) > 4000 else haystack
    for name, canonical in _COUNTRY_NAMES.items():
        if name in tail:
            return canonical
    return None


def _extract_description_md(markdown: str) -> str | None:
    lines = markdown.splitlines()
    saw_h1 = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("# "):
            saw_h1 = True
            continue
        if not saw_h1:
            continue
        if stripped.startswith(("#", "-", "*", "|", "[", "!", "`")):
            continue
        if 60 <= len(stripped) <= 500:
            return stripped
    return None


def _signal_count(markdown: str) -> int:
    return (
        len(_extract_emails_md(markdown))
        + len(_extract_phones_md(markdown))
    )


def _completeness_score(
    emails: list[str],
    phones: list[str],
    address: Address | None,
    description: str | None,
    socials: dict[str, str] | None = None,
    founded_year: int | None = None,
    tech_stack: list[str] | None = None,
    employee_count: int | None = None,
) -> float:
    # P3 (iter 12) rebalance — adds 4 new fields. Old weights de-prioritized
    # to make headroom; threshold full bumped 0.6->0.65 and partial
    # 0.4->0.45 in config so existing accepts remain comparable.
    score = 0.0
    if emails:
        score += 0.25
    if phones:
        score += 0.20
    if address is not None:
        score += 0.15
    if description:
        score += 0.15
    if socials:
        score += 0.10
    if founded_year:
        score += 0.05
    if tech_stack:
        score += 0.05
    if employee_count:
        score += 0.05
    return min(1.0, score)


async def fetch_and_parse_vendor(
    domain_url: str,
    vendor_hint: str,
    *,
    paths: tuple[str, ...] | list[str] = _DEFAULT_PATHS,
    max_concurrent: int = 5,
    fetch_timeout_s: int = 25,
) -> tuple[StaticScrapeResult | None, float]:
    """Fetch Jina markdown for `domain_url` + sub-paths, parse, score.

    Returns (StaticScrapeResult, completeness_score). The result is None
    when the vendor-name guard fails or no contact signal is present.
    Caller decides whether to accept based on score threshold.
    """
    domain = _normalize_domain(domain_url)
    if not domain:
        return (None, 0.0)
    base = f"https://{domain}"

    semaphore = asyncio.Semaphore(max_concurrent)

    async def _fetch_one(path: str) -> tuple[str, str | None]:
        target = base + path
        async with semaphore:
            md = await fetch_clean_markdown(target, timeout_seconds=fetch_timeout_s)
        return (path, md)

    results = await asyncio.gather(
        *[_fetch_one(p) for p in paths],
        return_exceptions=True,
    )

    valid: list[tuple[str, str]] = []
    for r in results:
        if isinstance(r, BaseException):
            continue
        path, md = r
        if md and len(md) >= _MIN_MARKDOWN_LEN:
            valid.append((path, md))

    if not valid:
        _log.debug("jina_extract.no_fetch", domain=domain)
        return (None, 0.0)

    concat = "\n\n".join(md for _, md in valid).lower()
    tokens = _vendor_tokens(vendor_hint)
    if tokens:
        # P3 — tighter guard: require token to appear 3x (was 2). Reduces
        # false-accept when Jina returns a generic catalog/aggregator page
        # that happens to mention the vendor once in a list.
        token_hits = sum(1 for t in tokens if concat.count(t) >= 3)
        if token_hits == 0:
            _log.info(
                "jina_extract.guard_failed",
                domain=domain, vendor=vendor_hint[:60],
                tokens=tokens[:5],
            )
            return (None, 0.0)

    best_path, best_md = max(valid, key=lambda x: _signal_count(x[1]))
    full_text = "\n\n".join(md for _, md in valid)

    emails = _extract_emails_md(full_text)
    phones = _extract_phones_md(full_text)
    address = _extract_address_md(full_text)
    country = _extract_country_md(full_text, address)
    description = _extract_description_md(best_md)
    socials = _extract_social_links_md(full_text)
    founded_year = _extract_founded_year_md(full_text)
    employee_count = _extract_employee_count_md(full_text)
    tech_stack = _extract_tech_stack_md(full_text)

    score = _completeness_score(
        emails, phones, address, description,
        socials=socials, founded_year=founded_year,
        tech_stack=tech_stack, employee_count=employee_count,
    )

    if not (emails or phones):
        _log.info(
            "jina_extract.weak_signal",
            domain=domain, vendor=vendor_hint[:60],
            fetched_paths=len(valid), score=score,
        )
        return (None, score)

    result = StaticScrapeResult(
        domain=urlparse(base).hostname or domain,
        source_url=_jina_proxy_url(base + best_path),
        emails=emails,
        phones=phones,
        address=address,
        country=country,
        description=description,
        socials=socials,
        founded_year=founded_year,
        employee_count=employee_count,
        tech_stack=tech_stack,
    )
    _log.info(
        "jina_extract.parsed",
        domain=domain, vendor=vendor_hint[:60],
        emails=len(emails), phones=len(phones),
        has_address=address is not None, country=country,
        socials=len(socials), founded_year=founded_year,
        employee_count=employee_count, tech_stack=len(tech_stack),
        score=score, best_path=best_path,
    )
    return (result, score)


__all__ = ["fetch_and_parse_vendor"]
