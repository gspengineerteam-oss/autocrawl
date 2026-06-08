"""Load seed tasks from YAML.

Accepts TWO schemas:

  1. Native explicit form — caller knows the URL + custom task per seed:

        seeds:
          - name: "ISC West 2026"
            url: "https://www.iscwest.com/exhibitor-list"
            task: "Scroll the entire exhibitor list, extract names + booth + URL."
            expo_id: "isc-west-2026"
            tags: ["security"]

  2. Compat form — same shape as crawler.config seed_topics.yaml. Each entry
     under `anchor_expos:` becomes a search-and-extract task automatically:
     the agent opens Google with the event name + year + "exhibitor list",
     clicks the most legit-looking result, and extracts. Lets the user reuse
     a single YAML across both producers.

        topics: [...]            # ignored by agentic crawler (used by base crawler)
        anchor_expos:
          - "ISC West"
          - "Milipol Paris"
          - "中国国际警用装备博览会"
"""

from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from crawler.observability.logger import get_logger

_log = get_logger(__name__)


class AgenticSeed(BaseModel):
    name: str
    url: str
    # Optional — if omitted, a sensible default task is generated assuming the
    # URL points directly at an exhibitor-list page (the typical case for
    # explicit `seeds:` entries). Override only when the page needs custom
    # navigation (e.g. click a tab, expand a section before scroll).
    task: str = ""
    expo_id: str | None = None
    # Free tags for filtering / metrics — e.g. ["niche", "infinite-scroll"].
    tags: list[str] = Field(default_factory=list)
    # Discovery-only — the search query that surfaced this URL. Lets the
    # post-run hook record outcome by (query, domain) so the next pass can
    # avoid retrying the same query→domain pair within a lookback window.
    source_query: str | None = None


# Shared task-tail clause appended to every prompt. Two responsibilities:
#   1. ACTIVE BROWSING — directs the agent to paginate before giving up. A
#      short first page is NOT a bail condition; click Next/More/Load-more
#      controls and accumulate results across pages first.
#   2. BAIL-OUT — when the page is genuinely unworkable, finalize FAST with
#      a categorized `bail_reason` so the lesson archive can group failures
#      (vs. the generic `extracted_zero_vendors`).
_BAIL_OUT_INSTRUCTION = (
    "\n\nACTIVE BROWSING — exhibitor lists usually paginate. Before bailing on "
    "a short or partial first page:\n"
    "  • Look for and click any of: 'Next', 'More', 'Load more', 'Show more', "
    "    page numbers (1 / 2 / 3 ...), arrow icons (›, →, »), or 'View all'.\n"
    "  • Continue paginating until either (a) no further control appears, "
    "    (b) a page repeats results from the previous page, or (c) you've "
    "    accumulated a substantive list. Accumulate names ACROSS pages — "
    "    don't reset between clicks.\n"
    "  • Infinite-scroll lists: keep calling `scroll_until_loaded` until the "
    "    DOM size stops growing.\n"
    "A short first page is NOT a bail condition. Only the categories below "
    "are.\n\n"
    "BAIL-OUT — if the page is genuinely unworkable, finalize FAST instead of "
    "burning turns. Emit done with `{\"exhibitors\": [], \"bail_reason\": "
    "\"<category>\"}` using one of these categories:\n"
    "  - '404'        — title contains 'Page not found' / '404' / 'gone'.\n"
    "  - 'image_only' — page is mostly images / floor-plan PDF embed / "
    "no list-like text AND no pagination control reveals one.\n"
    "  - 'captcha'    — Cloudflare challenge, hCaptcha, reCAPTCHA, or "
    "any 'verify you are human' interstitial.\n"
    "  - 'paywall'    — login wall, registration required, subscription "
    "barrier blocking the list.\n"
    "  - '403'        — server returned access-denied / forbidden.\n"
    "Bail FAST. Don't try multiple workarounds first."
)


def _default_direct_url_task(name: str) -> str:
    """Task prompt for seeds whose URL is already an exhibitor-list page.

    Skips the Bing-pick step; agent goes scroll → bulk-extract → done.
    Keeps the same anti-loop framing as the search-then-extract flavor so
    behavior stays consistent in logs.
    """
    return (
        f"You are on the exhibitor list for '{name}'. "
        f"Plan: (1) call `scroll_until_loaded` ONCE to load the full list. "
        f"(2) Inspect the DOM to find the recurring exhibitor row selector "
        f"(e.g. '.exhibitor-card', 'tr.exhibitor-row', '[data-exhibitor]'). "
        f"(3) Call `extract_by_selector(<selector>)` to bulk-pull names + URLs. "
        f"(4) Emit done with the parsed result.\n\n"
        f"ANTI-LOOP: if your Next-goal repeats, pivot or finalize. Never "
        f"repeat the same goal three times. If the page is a paywall / login "
        f"wall / CAPTCHA, emit done with empty exhibitors and a one-line "
        f"description of the blocker.\n\n"
        f"For each exhibitor extract: company name (required), booth, profile "
        f"URL, country. Skip headers, sponsor banners, ads."
        f"{_BAIL_OUT_INSTRUCTION}"
    )


def _seed_from_anchor_expo(expo_name: str, year: int) -> AgenticSeed | None:
    """Convert one anchor_expos entry into a search-and-extract seed.

    Uses Bing as the search engine — Google is overly aggressive with
    reCAPTCHA challenges against automated browsers, even with stealth.
    Bing's bot-detection threshold is much higher and serves results to
    Playwright-driven Chromium without challenge in the vast majority of
    cases. DuckDuckGo HTML (https://html.duckduckgo.com/html/?q=...) is a
    cleaner alternative if you ever need to swap.
    """
    if not expo_name or len(expo_name) > 200:
        return None
    # Strip parenthetical aliases ("Zhuhai Airshow / China Airshow" → "Zhuhai Airshow"),
    # keep the first stable name segment for slug + display.
    clean = expo_name.split("(")[0].split("/")[0].strip()
    if not clean:
        return None
    query = f"{clean} {year} exhibitor list"
    search_url = "https://www.bing.com/search?q=" + urllib.parse.quote(query)
    task = (
        f"Bing SERP for '{query}'. Plan: (1) pick ONE result — prefer event's "
        f"official site, avoid 10times.com / news / wikipedia. (2) Open it. "
        f"(3) Find exhibitor/sponsor/participant list (click a tab if needed). "
        f"(4) Extract names visible on screen NOW. (5) Scroll ONCE — extract "
        f"newly revealed names. (6) Repeat scroll+extract up to 4 more times "
        f"ONLY if each scroll reveals NEW names. STOP scrolling the moment a "
        f"scroll reveals nothing new — finalize with what you have.\n\n"
        f"ANTI-LOOP: if your previous Next-goal was the same as the current "
        f"one, you are STUCK. Pivot: try a different element, open a new "
        f"page, or emit done with whatever you've extracted. Never repeat the "
        f"same goal three times.\n\n"
        f"For each exhibitor extract: company name (required), booth, profile "
        f"URL, country. Skip headers, sponsor banners, ads. If the page won't "
        f"load or hits a login wall / hCaptcha, emit done with empty "
        f"exhibitors and a one-line description of the blocker."
        f"{_BAIL_OUT_INSTRUCTION}"
    )
    return AgenticSeed(
        name=clean,
        url=search_url,
        task=task,
        # Reporter will slugify name into expo_id when this is None.
        expo_id=None,
        tags=["from_anchor", "search_then_extract"],
    )


def load_seeds(path: Path) -> list[AgenticSeed]:
    """Load seeds from YAML. Both schemas can coexist — `seeds:` direct-URL
    entries run first (fast path, no search step), and any `anchor_expos:`
    NOT already covered by an explicit seed get a Bing search-then-extract
    fallback. Dedup is by case-insensitive expo name.
    """
    if not path.exists():
        _log.info("agentic.seeds_missing", path=str(path))
        return []
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    out: list[AgenticSeed] = []
    seen_names: set[str] = set()

    # Schema 1: explicit `seeds:` — direct URL fast path. Task is optional;
    # missing → auto-fill with the direct-URL default prompt.
    explicit = raw.get("seeds")
    if isinstance(explicit, list):
        for item in explicit:
            if not isinstance(item, dict):
                continue
            try:
                seed = AgenticSeed(**item)
            except Exception as e:  # noqa: BLE001
                _log.warning("agentic.seed_invalid", item=str(item)[:120], error=str(e))
                continue
            if not seed.task.strip():
                seed.task = _default_direct_url_task(seed.name)
            seed.tags = list(seed.tags) + ["direct_url"]
            out.append(seed)
            seen_names.add(seed.name.casefold())

    # Schema 2: `anchor_expos:` fallback — only for expos NOT already seeded
    # explicitly. Each entry becomes a Bing search-then-extract task.
    anchors = raw.get("anchor_expos") or []
    if isinstance(anchors, list):
        year = datetime.now(timezone.utc).year
        for expo_name in anchors:
            seed = _seed_from_anchor_expo(str(expo_name), year)
            if seed is None:
                continue
            if seed.name.casefold() in seen_names:
                continue  # already covered by an explicit direct-URL entry
            out.append(seed)
            seen_names.add(seed.name.casefold())

    if out:
        _log.info(
            "agentic.seeds_loaded",
            count=len(out),
            direct=sum(1 for s in out if "direct_url" in s.tags),
            search=sum(1 for s in out if "search_then_extract" in s.tags),
        )
    else:
        _log.warning(
            "agentic.seeds_yaml_empty_or_unrecognized",
            path=str(path),
            keys=list(raw.keys()),
        )
    return out


async def apply_knowledge_to_seeds(seeds: list[AgenticSeed]) -> list[AgenticSeed]:
    """Rewrite + filter seeds based on accumulated knowledge.

    For each seed:
      - If the expo has a successful URL recorded → replace `url` with that
        direct URL and rewrite `task` to skip the search-and-pick step. The
        task instruction also gets a "vendors already known" preview so the
        agent doesn't waste turns re-emitting them.
      - If the seed's URL domain is blacklisted (and curiosity didn't pick
        it for retry) → drop the seed entirely.

    The blacklist + curiosity logic lives in `KnowledgeStore` so this
    function stays a thin orchestrator.
    """
    # Lazy import to avoid an import cycle at module load time
    # (knowledge → config → seeds is a possible chain elsewhere).
    from .knowledge import KnowledgeStore, domain_of

    store = await KnowledgeStore.load()
    out: list[AgenticSeed] = []
    rewritten = 0
    skipped_blacklist = 0
    for seed in seeds:
        memory = store.get_expo(seed.name)
        if memory and memory.successful_urls:
            best_url = memory.successful_urls[0]
            seen_preview = ", ".join(memory.vendors_seen[:30])
            ellipsis = "…" if len(memory.vendors_seen) > 30 else ""
            seed.url = best_url
            seed.task = (
                f"Already on exhibitor list at {best_url} (succeeded before). "
                f"Plan: (1) extract names visible NOW. (2) Scroll ONCE, "
                f"extract any new names. (3) Repeat up to 4 more times ONLY "
                f"if each scroll reveals NEW names. STOP scrolling the moment "
                f"a scroll reveals nothing new.\n\n"
                f"SKIP these {len(memory.vendors_seen)} known vendors entirely "
                f"(do NOT include in output): {seen_preview}{ellipsis}\n\n"
                f"ANTI-LOOP: if your Next-goal repeats, pivot or finalize. "
                f"Never repeat the same goal three times.\n\n"
                f"For each NEW exhibitor extract: company name (required), "
                f"booth, profile URL, country. If the page no longer shows "
                f"an exhibitor list, emit done with empty exhibitors and a "
                f"one-line description of what you saw instead."
                f"{_BAIL_OUT_INSTRUCTION}"
            )
            seed.tags = list(seed.tags) + ["from_knowledge"]
            rewritten += 1

        domain = domain_of(seed.url)
        if domain and store.should_skip_blacklisted(domain):
            _log.info(
                "agentic.seed_skipped_blacklist", domain=domain, expo=seed.name
            )
            skipped_blacklist += 1
            continue
        out.append(seed)

    _log.info(
        "agentic.knowledge_applied",
        total=len(seeds),
        rewritten_from_knowledge=rewritten,
        skipped_blacklist=skipped_blacklist,
        kept=len(out),
    )
    return out
