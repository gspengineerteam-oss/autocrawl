"""Wikipedia article scraper.

Wikipedia articles are NOT aggregator pages — links go to other Wikipedia
articles via /wiki/<title>, not to vendor websites. To extract organizations
mentioned in an article (e.g. participants of the Bilderberg Conference) we:

1. Fetch the article HTML and pull all /wiki/ links from the main content.
2. Filter out Wikipedia infrastructure pages (Category:, File:, Talk:, etc).
3. Batch-query the Wikipedia REST API for each candidate's categories.
4. Classify each candidate as company / organisation / person / other.
5. Emit ExhibitorRef only for company + organisation.

The vendor resolver downstream still rejects wikipedia.org as a vendor
domain (it is in aggregator_blacklist.yaml under "references"), so vendor
URL resolution falls through to name-based search ("AXA" → axa.com).
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import unquote, urljoin, urlparse

import httpx

from ...observability.logger import get_logger
from ...schemas import ExhibitorRef, SourceProvenance
from ..browsers.fetcher import fetch
from ..parsers.html_parser import parse
from ..proxies.rate_limit import acquire as rl_acquire

_log = get_logger(__name__)
AGGREGATOR_DOMAIN = "wikipedia.org"

# Wikipedia REST API endpoint (action API). 50 titles per request max.
_API_BASE = "https://en.wikipedia.org/w/api.php"
_API_BATCH = 50

# Pages we want to skip outright (infrastructure / non-article namespaces).
_SKIP_PREFIXES = (
    "File:", "Image:", "Category:", "Help:", "Portal:", "Wikipedia:",
    "Template:", "Talk:", "User:", "Special:", "Module:", "Draft:",
    "Book:", "MediaWiki:", "TimedText:",
)

# Heuristic regexes on category names → classification.
_RE_COMPANY = re.compile(
    r"\b(compan(?:y|ies)|corporations?|conglomerates?|"
    r"manufacturers?|holdings?|enterprises?|firms?|"
    r"insurers?|brewers?|retailers?|airlines?|automakers?|"
    r"banks?|investment\b|publishers?)\b",
    re.IGNORECASE,
)
_RE_ORG = re.compile(
    r"\b(organi[sz]ations?|institutes?|foundations?|"
    r"think tanks?|universities|agenc(?:y|ies)|councils?|"
    r"associations?|societ(?:y|ies)|ngos?|charities)\b",
    re.IGNORECASE,
)
_RE_PERSON = re.compile(
    r"\b(births|deaths|people|alumni|politicians?|"
    r"executives?|authors?|journalists?|academics?|"
    r"scientists?|economists?|diplomats?|members of)\b",
    re.IGNORECASE,
)
_RE_PLACE = re.compile(
    r"\b(cities|countries|towns|villages|states of|"
    r"provinces|regions of|capitals?|districts of)\b",
    re.IGNORECASE,
)


def matches(url: str) -> bool:
    return AGGREGATOR_DOMAIN in (urlparse(url).netloc or "").lower()


def _is_content_page(title: str) -> bool:
    if not title or len(title) < 2:
        return False
    if title.startswith("#"):
        return False
    return not title.startswith(_SKIP_PREFIXES)


def _extract_wiki_titles(html: str) -> list[str]:
    """Pull every /wiki/<title> link from article body, deduplicated, ordered."""
    if not html:
        return []
    tree = parse(html)
    main = tree.css_first("#mw-content-text") or tree.body
    if main is None:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for a in main.css("a[href]"):
        href = (a.attributes.get("href") or "").strip()
        if not href.startswith("/wiki/"):
            continue
        # Strip /wiki/ prefix and any fragment / query.
        title = href[6:].split("#", 1)[0].split("?", 1)[0]
        title = unquote(title).replace("_", " ")
        if not _is_content_page(title):
            continue
        if title in seen:
            continue
        seen.add(title)
        out.append(title)
    return out


async def _classify_via_api(titles: list[str]) -> dict[str, str]:
    """Batch-query Wikipedia API for category info; classify each title.

    Returns dict[title] = "company" | "organisation" | "person" | "place" | "other".
    """
    result: dict[str, str] = {}
    if not titles:
        return result

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for i in range(0, len(titles), _API_BATCH):
            chunk = titles[i : i + _API_BATCH]
            params = {
                "action": "query",
                "format": "json",
                "prop": "categories",
                "cllimit": "max",
                "titles": "|".join(chunk),
                "redirects": 1,
            }
            try:
                r = await client.get(_API_BASE, params=params, headers={"User-Agent": "AutoCrawler/1.0"})
                r.raise_for_status()
                data = r.json()
            except Exception as e:  # noqa: BLE001
                _log.warning("wikipedia.api_failed", error=str(e), batch_size=len(chunk))
                for t in chunk:
                    result[t] = "other"
                continue

            pages = (data.get("query") or {}).get("pages") or {}
            normalized = {n["from"]: n["to"] for n in (data.get("query") or {}).get("normalized") or []}
            redirects = {r["from"]: r["to"] for r in (data.get("query") or {}).get("redirects") or []}

            api_to_input = {}
            for input_title in chunk:
                resolved = redirects.get(normalized.get(input_title, input_title), normalized.get(input_title, input_title))
                api_to_input[resolved] = input_title

            for _pid, page in pages.items():
                api_title = page.get("title", "")
                input_title = api_to_input.get(api_title, api_title)
                cats = [c.get("title", "") for c in (page.get("categories") or [])]
                cat_blob = " | ".join(cats)
                kind = _classify_by_categories(cat_blob)
                result[input_title] = kind

            for t in chunk:
                result.setdefault(t, "other")

    return result


def _classify_by_categories(cat_blob: str) -> str:
    """Apply heuristic regexes in priority order. Person check first since
    individuals often co-occur with corporate categories (e.g., 'Founders of X')."""
    if not cat_blob:
        return "other"
    if _RE_PERSON.search(cat_blob):
        return "person"
    if _RE_COMPANY.search(cat_blob):
        return "company"
    if _RE_ORG.search(cat_blob):
        return "organisation"
    if _RE_PLACE.search(cat_blob):
        return "place"
    return "other"


def _title_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    if "wikipedia.org" not in (parsed.netloc or "").lower():
        return None
    path = parsed.path or ""
    if not path.startswith("/wiki/"):
        return None
    raw = path[6:].split("#", 1)[0].split("?", 1)[0]
    return unquote(raw).replace("_", " ")


async def list_exhibitors(expo_url: str, expo_id: str) -> list[ExhibitorRef]:
    """Extract organizations / companies linked from a Wikipedia article.

    Two parallel strategies merged:
      1. Internal links (/wiki/...) classified by category heuristic — keeps
         the existing high-recall path.
      2. External links (extlinks API) — direct vendor websites cited by the
         article. These bypass classification and become high-confidence
         exhibitor candidates with their real URL preset (resolver-friendly).
    """
    from ..search import wikipedia as wiki_api

    await rl_acquire(expo_url)
    page = await fetch(expo_url, force_render=False)
    if not page.get("html"):
        _log.warning("wikipedia.empty_html", url=expo_url)
        return []

    titles = _extract_wiki_titles(page["html"])
    _log.info("wikipedia.candidate_titles", expo_id=expo_id, count=len(titles))

    article_title = _title_from_url(expo_url)

    titles = titles[:300]
    classifications = await _classify_via_api(titles) if titles else {}

    extlinks_urls: list[str] = []
    if article_title:
        try:
            extlinks_urls = await wiki_api.extlinks(article_title, limit=100)
        except Exception as e:  # noqa: BLE001
            _log.debug("wikipedia.extlinks_failed", title=article_title, error=str(e))

    refs: list[ExhibitorRef] = []
    seen_names: set[str] = set()
    seen_urls: set[str] = set()

    for title, kind in classifications.items():
        if kind not in {"company", "organisation"}:
            continue
        if title in seen_names:
            continue
        seen_names.add(title)
        wiki_url = urljoin("https://en.wikipedia.org/wiki/", title.replace(" ", "_"))
        try:
            refs.append(
                ExhibitorRef(
                    expo_id=expo_id,
                    name=title[:200],
                    raw_url=wiki_url,
                    aggregator_domain=AGGREGATOR_DOMAIN,
                    provenance=[
                        SourceProvenance(
                            type="aggregator",
                            url=wiki_url,
                            extraction_method=f"wikipedia_link_{kind}",
                            confidence=0.85 if kind == "company" else 0.70,
                        )
                    ],
                )
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("wikipedia.invalid_ref", title=title, error=str(e))

    for url in extlinks_urls:
        host = (urlparse(url).netloc or "").lower()
        if not host or "wikipedia.org" in host or "wikimedia.org" in host:
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        name = host.split(":")[0]
        try:
            refs.append(
                ExhibitorRef(
                    expo_id=expo_id,
                    name=name[:200],
                    raw_url=url,
                    aggregator_domain=AGGREGATOR_DOMAIN,
                    provenance=[
                        SourceProvenance(
                            type="aggregator",
                            url=expo_url,
                            extraction_method="wikipedia_extlinks",
                            confidence=0.90,
                        )
                    ],
                )
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("wikipedia.extlink_invalid_ref", url=url, error=str(e))

    _log.info(
        "wikipedia.exhibitors_extracted",
        expo_id=expo_id,
        candidates=len(titles),
        extlinks=len(extlinks_urls),
        kept=len(refs),
    )
    return refs


__all__ = ["AGGREGATOR_DOMAIN", "list_exhibitors", "matches"]


# Convenience wrapper for tests / debug — synchronous-ish call site.
async def classify_titles(titles: list[str]) -> dict[str, str]:
    return await _classify_via_api(titles)


# Allow direct invocation for ad-hoc smoke testing.
if __name__ == "__main__":  # pragma: no cover
    import sys

    async def _main() -> None:
        url = sys.argv[1] if len(sys.argv) > 1 else "https://en.wikipedia.org/wiki/2026_Bilderberg_Conference"
        refs = await list_exhibitors(url, "wiki-test")
        for r in refs:
            print(f"{r.name} → {r.raw_url}")

    asyncio.run(_main())
