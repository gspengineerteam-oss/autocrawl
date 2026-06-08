"""S2 Jina-first listing tier for exhibitor discovery.

For seeds that point at expo listing pages, fetches Jina markdown for the
seed URL plus 6 common "exhibitor list" sub-paths in parallel and parses
the markdown for repeating vendor patterns. When the harvest yields >=
`agentic_jina_listing_min_candidates` candidates with both name and
domain, the agent skips Browser-Use entirely.

Cuts the 800+ second "scroll-extract-scroll" loop the Browser-Use agent
falls into on expo sites. Median per seed: under 60 seconds vs 800+ for
Browser-Use, with zero bot-ban surface since Jina fetches server-side.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import urlparse

from crawler.observability.logger import get_logger
from crawler.tools.browsers.jina_reader import fetch_clean_markdown

_log = get_logger(__name__)

_DEFAULT_PATHS: tuple[str, ...] = (
    "/exhibitors", "/exhibitor-list", "/sponsors",
    "/partners", "/companies", "/who-attends",
)

_MIN_MARKDOWN_LEN = 200

_LINK_LIST_RE = re.compile(
    r"(?:^|\n)\s*(?:[-*+]|\d+\.)\s+\[([^\]]{2,120})\]\(((?:https?:)?//[^\s)]+)\)",
    re.MULTILINE,
)
_HEADING_NAME_RE = re.compile(
    r"(?:^|\n)#{2,4}\s+([A-Z][^\n#]{2,120})",
    re.MULTILINE,
)
_BOOTH_RE = re.compile(
    r"\bBooth\s*[:#]?\s*([A-Z0-9\-]{2,15})", re.IGNORECASE,
)
_AGGREGATOR_HOST_HINTS: frozenset[str] = frozenset({
    "twitter.com", "x.com", "facebook.com", "instagram.com",
    "linkedin.com", "youtube.com", "tiktok.com", "pinterest.com",
    "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
    "wikipedia.org", "amazon.com", "alibaba.com", "indiamart.com",
    "made-in-china.com", "globalsources.com", "tradeindia.com",
})

_NAV_PATH_SEGMENTS: frozenset[str] = frozenset({
    "sessions", "session", "agenda", "program", "schedule",
    "speakers", "speaker", "tracks", "track", "topics", "topic",
    "tags", "tag", "categories", "category", "search", "press",
    "news", "blog", "media", "registration", "register", "tickets",
    "login", "account", "cart", "checkout", "faq", "policy", "terms",
})

_NAV_QUERY_KEYS: frozenset[str] = frozenset({
    "track", "tracks", "topic", "topics", "tag", "tags",
    "session_id", "session", "speaker_id", "category", "filter",
})


def _looks_like_internal_nav(seed_host: str, link_url: str) -> bool:
    """Return True when the link is internal navigation on the seed host
    (track filter, session detail, speaker profile, etc.), not an external
    exhibitor link. Catches the Enterprise Connect false-positive pattern
    where session-track URLs were treated as exhibitor links."""
    if not link_url or not seed_host:
        return False
    try:
        p = urlparse(link_url if link_url.startswith("http") else f"https://{link_url}")
    except Exception:  # noqa: BLE001
        return False
    h = (p.hostname or "").lower()
    if h.startswith("www."):
        h = h[4:]
    s = seed_host.lower()
    if s.startswith("www."):
        s = s[4:]
    same_root = False
    if h == s:
        same_root = True
    else:
        h_root = ".".join(h.split(".")[-2:]) if h.count(".") >= 1 else h
        s_root = ".".join(s.split(".")[-2:]) if s.count(".") >= 1 else s
        if h_root and h_root == s_root:
            same_root = True
    if not same_root:
        return False
    segs = [seg for seg in (p.path or "").lower().split("/") if seg]
    if segs and segs[0] in _NAV_PATH_SEGMENTS:
        return True
    if any(seg in _NAV_PATH_SEGMENTS for seg in segs[:2]):
        return True
    q = (p.query or "").lower()
    if q:
        for key in _NAV_QUERY_KEYS:
            if f"{key}=" in q or f"{key}[]=" in q:
                return True
    return False


def _strip_md_decoration(name: str) -> str:
    cleaned = re.sub(r"[*_`#]+", "", name).strip()
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned[:120]


_DENY_EXACT: frozenset[str] = frozenset({
    "home", "about", "about us", "contact", "contact us", "menu", "search",
    "login", "logout", "register", "registration", "exhibitor list",
    "exhibitors", "sponsors", "register now", "sign up", "read more",
    "view all", "click here", "show more", "load more", "back to top",
    "skip to main content", "copy to clipboard", "copy link", "share",
    "print", "download", "imprint", "privacy policy", "privacy",
    "privacy statement", "terms", "terms of use", "terms and conditions",
    "terms & conditions", "cookie policy", "cookies", "legal notice",
    "sitemap", "newsletter", "subscribe", "rss", "feed",
    "xing", "facebook", "twitter", "instagram", "youtube", "linkedin",
    "tiktok", "pinterest", "whatsapp", "telegram", "weibo",
    "vk", "line", "wechat", "qq", "kakao",
    "show menu", "open menu", "close menu", "toggle navigation",
    "next", "previous", "back", "skip", "continue",
    "english", "deutsch", "francais", "espanol", "italiano", "portugues",
    "press", "media", "news", "events", "blog", "faq", "support",
    "gallery", "video", "photos", "downloads", "resources",
    "give", "donate", "give now", "donate now", "book hotel", "hotels",
    "welcome guide", "user agreement", "code of conduct", "testimonials",
    "leadership", "partnership opportunities", "submissions",
    "accepted papers", "accepted posters", "co-located events",
    "previous co-located events", "sponsorship", "test of time award",
    "why ndss symposium", "ndss symposium",
    "ai & big data", "digital transformation", "edge computing",
    "iot tech", "cloud transformation", "data centre", "data center",
    "intelligent automation", "machine learning", "cybersecurity",
    "insights & analysis", "post-show reports", "post show reports",
    "market reports", "whitepapers", "editorial", "commentary",
    "conferences", "authors & submission guide",
    "poc pavilion", "charity water", "women in ics security",
    "about defence iq", "about defenceiq",
    "accessibility statement", "advisory board", "advocate",
    "board of directors", "book your stand", "booth size",
    "branding guide & logos", "china pavilion",
    "chapters & field leaders", "afa in action", "afa national convention",
    "air & space forces magazine", "air, space & cyber conference",
    "careers at afa", "closed-door executive roundtables",
    "access control theatre", "best of enterprise connect",
    "exhibit", "sponsor", "visit", "visit us", "visiting warships",
    "delegations", "delegation", "useful information",
    "event programme", "event program", "event info",
    "leadership council", "get involved", "press pass",
    "venue and hotel information", "venue and hotel",
    "connect", "media partners", "media partner", "media coverage",
    "techex north america", "techex global", "techex europe",
    "techex asia", "techex", "techex events", "digital events",
    "networking events", "reminders", "agenda", "schedule",
    "speakers", "speaker", "program", "programme",
    "tickets", "ticket", "registration",
    "exhibitor info", "exhibitor information",
    "show floor", "showfloor", "expo info",
    "general info", "general information",
    "travel info", "travel information",
    "accommodation", "accommodations",
    "covid", "covid-19", "health & safety", "health and safety",
    "diversity", "inclusion", "the team", "our team", "team",
    "history", "mission", "vision", "join us", "follow us",
    "stay connected", "what to expect", "why attend", "who attends",
    "agenda overview", "schedule overview", "event experiences",
    "event app", "event amplification", "special events",
    "collocated events", "co-located events",
    "exhibit & sponsor", "sponsor stem",
})

# Tokens that, when appearing as suffix or in vendor name, signal it is a
# page element rather than a real organization. Catches "Mobile App Guide"
# class garbage from Intersec-style event listings, plus event-series titles
# such as "S4x26 Videos" and "Defence iQ Reports".
_NAME_SUFFIX_DENY: tuple[str, ...] = (
    "mobile app", "app guide", "user guide", "exhibitor guide",
    "press kit", "media kit", "newsletter", "videos", "podcast",
    "campaign", "symposium", "policy", "report", "reports",
    " info", " information", " council", " programme",
    " events", " reminders", " overview", " priorities",
    " coverage", " amplification", " experiences",
    "convention center overview", "convention center",
)

# Prefix patterns that signal an "about X" / "previous X" page block.
_NAME_PREFIX_DENY: tuple[str, ...] = (
    "about ", "previous ", "why ", "what is ", "who is ",
    "all ", "more ", "best of ", "careers at ", "book your ",
    "branding ", "visiting ", "useful ", "event ", "press ",
    "venue ", "join ", "follow ", "stay ", "what to ", "why ",
    "how to ", "back to ", "to home", "register your",
    "exhibit ", "sponsor your", "media ", "los angeles convention",
)

# Event/section titles that look like real names but carry year markers
# or section-only words ("2026 Symposium", "S4x26 Charity"). Also catches
# year-led page titles like "2026 Floorplan", "2027 Floor Plan",
# "2026 Sponsors", "2026 Keynotes", "2026 SATShow Week Recap".
_EVENT_TITLE_PATTERNS = (
    re.compile(r"\b\d{4}\s+(symposium|conference|summit|expo|show|fair)\b", re.I),
    re.compile(r"\b(symposia|symposiums|workshops|tutorials)\b", re.I),
    re.compile(r"\b(s4x|isc|rsac|defcon|blackhat|black hat)\d", re.I),
    re.compile(r"\b(call for papers|call for proposals)\b", re.I),
    re.compile(r"^\d{4}\s+\w+", re.I),
    re.compile(r"\b(floorplan|floor plan|keynotes|keynote)\b", re.I),
    re.compile(r"\b(pavilion|theatre|theater|roundtables?)\b", re.I),
    re.compile(r"\b(week recap|recap|sponsors|advisory board|board of directors)\b", re.I),
    re.compile(r"\b(legislative priorities|teacher of the year|hill program)\b", re.I),
    re.compile(r"\b(letters to|teacher of|strategic advocacy)\b", re.I),
    re.compile(r"\bin action$", re.I),
    re.compile(r"\bmagazine$|\bconference$|\bsymposium$", re.I),
    re.compile(r"^!\[image", re.I),
    re.compile(r"\b(accessibility statement|board of directors|advocate)\b", re.I),
    re.compile(r"['’]s\s+(letters|legislative|strategic|teacher|in action)\b", re.I),
    re.compile(r"\b(booth size|book your stand)\b", re.I),
    re.compile(r"\bchina pavilion\b|\bclosed.door\b", re.I),
)


def _looks_like_org(name: str) -> bool:
    if not name or len(name) < 2:
        return False
    if len(name) > 120:
        return False
    lower = name.lower().strip()
    if lower in _DENY_EXACT:
        return False
    # Word count filter. Real vendor names rarely exceed 6 words; page
    # titles like "Intersec Pulse Latest security, fire and safety news"
    # easily hit 8+.
    words = lower.split()
    if len(words) >= 7:
        return False
    # Suffix patterns that signal page-element strings.
    for suf in _NAME_SUFFIX_DENY:
        if lower.endswith(suf) or f" {suf}" in lower:
            return False
    # Prefix patterns ("About X", "Previous X", "Why X").
    for pref in _NAME_PREFIX_DENY:
        if lower.startswith(pref):
            return False
    # Verb-led UI strings ("Copy ...", "Click ...", "Show ...").
    first = words[0] if words else ""
    if first in {"copy", "click", "show", "hide", "open", "close", "view",
                 "see", "read", "watch", "learn", "explore", "browse",
                 "discover", "get", "visit", "join", "follow", "stay",
                 "register", "exhibit", "sponsor", "download", "subscribe"}:
        return False
    if name.startswith(("http://", "https://", "www.")):
        return False
    # Event/section titles ("2026 Symposium", "S4x26 Videos").
    for pat in _EVENT_TITLE_PATTERNS:
        if pat.search(name):
            return False
    # No alphabetic content (only digits/punct) is not a vendor name.
    if not re.search(r"[A-Za-z]{3,}", name):
        return False
    return True


def _host_of(url: str) -> str | None:
    if not url:
        return None
    u = url.strip()
    if u.startswith("//"):
        u = "https:" + u
    if "://" not in u:
        return None
    try:
        h = (urlparse(u).hostname or "").lower()
        if h.startswith("www."):
            h = h[4:]
        return h or None
    except Exception:  # noqa: BLE001
        return None


def _is_aggregator_host(host: str | None) -> bool:
    if not host:
        return False
    parts = host.split(".")
    if len(parts) < 2:
        return False
    ent = ".".join(parts[-2:])
    return host in _AGGREGATOR_HOST_HINTS or ent in _AGGREGATOR_HOST_HINTS


def _candidates_from_link_list(markdown: str, seed_host: str = "") -> list[dict]:
    out: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()
    for m in _LINK_LIST_RE.finditer(markdown):
        raw_name = _strip_md_decoration(m.group(1))
        url = m.group(2).strip()
        if url.startswith("//"):
            url = "https:" + url
        host = _host_of(url)
        if not _looks_like_org(raw_name):
            continue
        if _is_aggregator_host(host):
            continue
        if seed_host and _looks_like_internal_nav(seed_host, url):
            continue
        key = (raw_name.lower(), host or "")
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        out.append({
            "name": raw_name,
            "url": url if url.startswith("http") else f"https://{host}/" if host else None,
            "domain": host,
        })
    return out


def _candidates_from_headings(markdown: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for m in _HEADING_NAME_RE.finditer(markdown):
        name = _strip_md_decoration(m.group(1))
        if not _looks_like_org(name):
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "url": None, "domain": None})
    return out


def _attach_booth(candidates: list[dict], markdown: str) -> None:
    booths = list(_BOOTH_RE.finditer(markdown))
    if not booths or not candidates:
        return
    positions = [(b.start(), b.group(1)) for b in booths]
    by_name: dict[str, int] = {}
    for m in re.finditer(
        r"([A-Z][A-Za-z0-9 &\.\-/']{2,80})", markdown,
    ):
        by_name.setdefault(m.group(1).lower(), m.start())
    for c in candidates:
        if c.get("booth"):
            continue
        name_pos = by_name.get(c["name"].lower())
        if name_pos is None:
            continue
        nearest = min(
            positions,
            key=lambda p: abs(p[0] - name_pos),
            default=None,
        )
        if nearest and abs(nearest[0] - name_pos) <= 300:
            c["booth"] = nearest[1]


def _merge_candidates(buckets: list[list[dict]]) -> list[dict]:
    merged: dict[str, dict] = {}
    for bucket in buckets:
        for c in bucket:
            key = (c.get("name") or "").lower()
            if not key:
                continue
            existing = merged.get(key)
            if existing is None:
                merged[key] = dict(c)
            else:
                if not existing.get("url") and c.get("url"):
                    existing["url"] = c["url"]
                if not existing.get("domain") and c.get("domain"):
                    existing["domain"] = c["domain"]
                if not existing.get("booth") and c.get("booth"):
                    existing["booth"] = c["booth"]
    return list(merged.values())


async def jina_list_exhibitors(
    seed_url: str,
    seed_name: str,
    *,
    paths: tuple[str, ...] | list[str] = _DEFAULT_PATHS,
    max_concurrent: int = 5,
    fetch_timeout_s: int = 25,
) -> list[dict]:
    """Probe Jina markdown for seed URL plus sub-paths and harvest vendor
    candidates. Returns deduplicated list of `{name, url, domain, booth?}`.

    Empty list means the listing tier missed; caller falls back to
    Browser-Use. Caller decides accept threshold via min_candidates.
    """
    parsed = urlparse(seed_url if seed_url.startswith("http") else f"https://{seed_url}")
    host = (parsed.hostname or "").lower()
    if not host:
        return []
    base = f"https://{host}"
    seed_path = parsed.path.rstrip("/") or ""

    probe_paths: list[str] = []
    if seed_path:
        probe_paths.append(seed_path)
    probe_paths.append("/")
    for p in paths:
        if p not in probe_paths:
            probe_paths.append(p)

    semaphore = asyncio.Semaphore(max_concurrent)

    async def _fetch_one(path: str) -> tuple[str, str | None]:
        target = base + path
        async with semaphore:
            md = await fetch_clean_markdown(target, timeout_seconds=fetch_timeout_s)
        return (path, md)

    results = await asyncio.gather(
        *[_fetch_one(p) for p in probe_paths],
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
        _log.info(
            "jina_listing.no_fetch", seed=seed_name[:60], host=host,
        )
        return []

    buckets: list[list[dict]] = []
    for path, md in valid:
        link_cands = _candidates_from_link_list(md, seed_host=host)
        head_cands = _candidates_from_headings(md)
        candidates = _merge_candidates([link_cands, head_cands])
        _attach_booth(candidates, md)
        if candidates:
            _log.debug(
                "jina_listing.bucket",
                seed=seed_name[:60], path=path, n=len(candidates),
            )
        buckets.append(candidates)

    merged = _merge_candidates(buckets)
    merged = [c for c in merged if (c.get("url") or c.get("domain"))]

    _log.info(
        "jina_listing.parsed",
        seed=seed_name[:60], host=host,
        fetched_paths=len(valid), candidates=len(merged),
    )
    return merged


__all__ = ["jina_list_exhibitors"]
