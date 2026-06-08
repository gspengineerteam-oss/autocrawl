"""Realtime scope/blacklist cache.

Single source of truth for "what counts as in-scope, what's blacklisted, what
seeds discovery". Merges YAML defaults with the user-overlay from the
`scope_rules` table and exposes both sync getters (for hot paths in the
crawler) and an async refresher (for write handlers + the background poller).

Realtime invariants:

  - API write handler: after committing the mutation, calls bump_scope_version()
    + refresh_now() so the very next read in this process sees the change. UI
    feedback is instant.

  - Cross-process: a background task in each process polls the Redis version
    counter every POLL_SECONDS; on change it refreshes the in-memory snapshot.
    Crawler workers see the new ruleset within POLL_SECONDS of any API write.

  - Redis offline: bump is a no-op; readers still serve the last in-memory
    snapshot but the background task will refresh from DB on every tick (no
    cross-process invalidation possible — local snapshot is correct).
"""

from __future__ import annotations

import asyncio
from typing import Any

from ..config import (
    get_settings,
    load_aggregator_blacklist,
    load_seed_topics,
)
from ..db.engine import get_sessionmaker
from ..db.repositories import scope_repo
from ..observability.logger import get_logger
from ..store.redis_queue import read_scope_version

_log = get_logger(__name__)

POLL_SECONDS = 1.0  # background poll cadence; bump_scope_version on a write
                    # tightens this for the writing process (force-refresh).

# ---- Default scope-classifier system prompt (fallback when DB is empty) ----
_DEFAULT_SCOPE_PROMPT = (
    "You judge whether a company belongs to the security / defense / "
    "cybersecurity / law-enforcement / surveillance / border-control / "
    "critical-infrastructure-protection industry. These are the only "
    "industries IN scope.\n\n"
    "REJECT (out of scope):\n"
    "- Hotels, hospitality, hotel chains, vacation rentals\n"
    "- News organizations, magazines, blogs, editorial publishers\n"
    "- Universities, academic institutions, research conferences\n"
    "- Generic event platforms, ticketing, conference hosts\n"
    "- General consulting firms (unless they specifically serve "
    "  defense/security clients as primary segment)\n"
    "- Banks, real estate, retail, marketing agencies\n\n"
    "ACCEPT (in scope):\n"
    "- Defense manufacturers, military equipment, weapons systems\n"
    "- Cybersecurity software / services / appliances\n"
    "- Police / law enforcement / tactical gear\n"
    "- Surveillance, ISR, drones, biometrics\n"
    "- Border control, customs, immigration tech\n"
    "- Critical-infrastructure security (SCADA, power grid, oil/gas)\n"
    "- Dual-use companies whose security/defense vertical is meaningful\n\n"
    "Be strict. When evidence is weak or the vendor looks like a "
    "tangential venue/sponsor, set is_in_scope=false."
)

SCOPE_PROMPT_KEY = "scope_classifier_system"


# ---------------------------------------------------------------------------
# In-memory snapshot
# ---------------------------------------------------------------------------


class _Snapshot:
    """Holds the merged effective view. Replaced atomically on each refresh."""

    __slots__ = (
        "blacklist",
        "whitelist",
        "scope_keywords_include",
        "scope_keywords_exclude",
        "seed_topics",
        "anchor_expos",
        "scope_prompt",
        "version",
    )

    def __init__(self) -> None:
        self.blacklist: frozenset[str] = frozenset()
        self.whitelist: frozenset[str] = frozenset()
        self.scope_keywords_include: frozenset[str] = frozenset()
        self.scope_keywords_exclude: frozenset[str] = frozenset()
        self.seed_topics: list[dict[str, Any]] = []
        self.anchor_expos: list[str] = []
        self.scope_prompt: str = _DEFAULT_SCOPE_PROMPT
        self.version: int | None = None  # last-seen Redis version, None=unknown


_SNAPSHOT: _Snapshot = _Snapshot()
_REFRESH_LOCK = asyncio.Lock()
_BACKGROUND_TASK: asyncio.Task | None = None
_INITIAL_LOAD_DONE = asyncio.Event()


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


async def _build_snapshot_from_db() -> _Snapshot:
    """Read DB rules + AppPrompt and merge with YAML defaults."""
    settings = get_settings()
    yaml_blacklist = load_aggregator_blacklist(settings.config_dir)
    yaml_topics = load_seed_topics(settings.config_dir)
    yaml_topic_names = {str(t.get("name", "")).strip() for t in yaml_topics.get("topics", [])}
    yaml_anchors = list(yaml_topics.get("anchor_expos", []) or [])

    sm = get_sessionmaker()
    async with sm() as session:
        rules = await scope_repo.list_rules(session, enabled=True)
        prompt_orm = await scope_repo.get_prompt(session, SCOPE_PROMPT_KEY)
        # also need disabled YAML defaults so we can subtract them
        all_rules = await scope_repo.list_rules(session)

    # Index rules by kind for fast bucketing.
    by_kind: dict[str, list[Any]] = {}
    for r in rules:
        by_kind.setdefault(r.kind, []).append(r)

    # Disabled lookup (any source) so we can mask out YAML defaults the user
    # has switched off.
    disabled_by_kind: dict[str, set[str]] = {}
    for r in all_rules:
        if not r.enabled:
            disabled_by_kind.setdefault(r.kind, set()).add(r.value.strip().lower())

    # ---- Blacklist (YAML ∪ user/ai enabled) − disabled ----
    blacklist_set = {d.strip().lower() for d in yaml_blacklist if d}
    for r in by_kind.get("blacklist_domain", []):
        blacklist_set.add(r.value.strip().lower())
    blacklist_set -= disabled_by_kind.get("blacklist_domain", set())

    whitelist_set = {r.value.strip().lower() for r in by_kind.get("whitelist_domain", [])}
    blacklist_set -= whitelist_set  # whitelist always wins

    # ---- Scope keywords (no YAML default — purely user-editable) ----
    kw_in = {r.value.strip().lower() for r in by_kind.get("scope_keyword_include", [])}
    kw_ex = {r.value.strip().lower() for r in by_kind.get("scope_keyword_exclude", [])}

    # ---- Seed topics (YAML ∪ user-added, − disabled) ----
    disabled_topics = disabled_by_kind.get("seed_topic", set())
    merged_topics: list[dict[str, Any]] = []
    for t in yaml_topics.get("topics", []) or []:
        name = str(t.get("name", "")).strip()
        if name and name.lower() in disabled_topics:
            continue
        merged_topics.append(dict(t))
    for r in by_kind.get("seed_topic", []):
        if r.value.strip() in yaml_topic_names:
            continue  # already in YAML, merged above
        extra = r.extra or {}
        merged_topics.append(
            {
                "name": r.value.strip(),
                "label": extra.get("label") or r.value.strip(),
                "keywords": list(extra.get("keywords") or []),
                "regions": list(extra.get("regions") or ["global"]),
                "weight": float(extra.get("weight") or 0.5),
            }
        )

    # ---- Anchor expos (YAML ∪ user-added − disabled) ----
    disabled_anchors = disabled_by_kind.get("anchor_expo", set())
    merged_anchors: list[str] = []
    seen: set[str] = set()
    for a in yaml_anchors:
        if not isinstance(a, str):
            continue
        if a.strip().lower() in disabled_anchors:
            continue
        if a in seen:
            continue
        seen.add(a)
        merged_anchors.append(a)
    for r in by_kind.get("anchor_expo", []):
        if r.value in seen:
            continue
        seen.add(r.value)
        merged_anchors.append(r.value)

    snap = _Snapshot()
    snap.blacklist = frozenset(blacklist_set)
    snap.whitelist = frozenset(whitelist_set)
    snap.scope_keywords_include = frozenset(kw_in)
    snap.scope_keywords_exclude = frozenset(kw_ex)
    snap.seed_topics = merged_topics
    snap.anchor_expos = merged_anchors
    snap.scope_prompt = (prompt_orm.content if prompt_orm else _DEFAULT_SCOPE_PROMPT) or _DEFAULT_SCOPE_PROMPT
    return snap


async def refresh_now() -> _Snapshot:
    """Force a full refresh from DB+YAML and stamp the current Redis version."""
    global _SNAPSHOT
    async with _REFRESH_LOCK:
        try:
            new_snap = await _build_snapshot_from_db()
            new_snap.version = await read_scope_version()
            _SNAPSHOT = new_snap
            _INITIAL_LOAD_DONE.set()
            _log.debug(
                "scope_cache.refreshed",
                version=new_snap.version,
                blacklist=len(new_snap.blacklist),
                topics=len(new_snap.seed_topics),
                anchors=len(new_snap.anchor_expos),
            )
            return new_snap
        except Exception as e:  # noqa: BLE001
            _log.warning("scope_cache.refresh_failed", error=str(e))
            # mark loaded so sync getters don't spin forever even on first error
            _INITIAL_LOAD_DONE.set()
            return _SNAPSHOT


async def _background_poll() -> None:
    """Re-fetch snapshot whenever the Redis version counter moves.

    On Redis-down we still refresh every tick so the snapshot can't drift
    unboundedly when the operator is editing rules without Redis running.
    """
    # Initial load.
    await refresh_now()
    while True:
        try:
            await asyncio.sleep(POLL_SECONDS)
            current_version = await read_scope_version()
            if current_version is None:
                # Redis offline — refresh anyway to stay correct on local mutation.
                await refresh_now()
                continue
            if current_version != _SNAPSHOT.version:
                await refresh_now()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            _log.warning("scope_cache.poll_failed", error=str(e))
            await asyncio.sleep(POLL_SECONDS)


def ensure_background_task() -> None:
    """Idempotent. Spawns the poller on first call inside an asyncio loop."""
    global _BACKGROUND_TASK
    if _BACKGROUND_TASK is not None and not _BACKGROUND_TASK.done():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # no loop yet (e.g. CLI bootstrap) — first await will trigger
    _BACKGROUND_TASK = loop.create_task(_background_poll(), name="scope_cache_poll")


async def stop_background_task() -> None:
    global _BACKGROUND_TASK
    if _BACKGROUND_TASK is None:
        return
    _BACKGROUND_TASK.cancel()
    try:
        await _BACKGROUND_TASK
    except (asyncio.CancelledError, Exception):
        pass
    _BACKGROUND_TASK = None


# ---------------------------------------------------------------------------
# Public getters
# ---------------------------------------------------------------------------


def _snapshot() -> _Snapshot:
    """Return the current snapshot. Spawns the background poller lazily."""
    ensure_background_task()
    return _SNAPSHOT


def get_effective_blacklist() -> frozenset[str]:
    return _snapshot().blacklist


def get_effective_whitelist() -> frozenset[str]:
    return _snapshot().whitelist


def get_effective_scope_keywords() -> tuple[frozenset[str], frozenset[str]]:
    s = _snapshot()
    return s.scope_keywords_include, s.scope_keywords_exclude


def get_effective_seed_topics() -> dict[str, Any]:
    s = _snapshot()
    return {"topics": list(s.seed_topics), "anchor_expos": list(s.anchor_expos)}


def get_effective_scope_prompt() -> str:
    return _snapshot().scope_prompt


async def get_effective_blacklist_async() -> frozenset[str]:
    """Async variant — guarantees the initial load has completed once."""
    if not _INITIAL_LOAD_DONE.is_set():
        await refresh_now()
    return _SNAPSHOT.blacklist


async def get_effective_seed_topics_async() -> dict[str, Any]:
    if not _INITIAL_LOAD_DONE.is_set():
        await refresh_now()
    return {"topics": list(_SNAPSHOT.seed_topics), "anchor_expos": list(_SNAPSHOT.anchor_expos)}


async def get_effective_scope_prompt_async() -> str:
    if not _INITIAL_LOAD_DONE.is_set():
        await refresh_now()
    return _SNAPSHOT.scope_prompt
