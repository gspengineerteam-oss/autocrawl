"""Seed scope_rules with YAML defaults on startup.

Idempotent: only inserts rows that don't already exist (by kind, value).
User toggles + edits are preserved — this never updates existing rows.

Picked up automatically from `init_db()`.
"""

from __future__ import annotations

from typing import Any

from ..config import get_settings, load_aggregator_blacklist, load_seed_topics
from ..observability.logger import get_logger
from .engine import get_sessionmaker
from .repositories import scope_repo

_log = get_logger(__name__)


async def seed_yaml_defaults() -> int:
    """Returns number of rows inserted."""
    settings = get_settings()
    yaml_blacklist = load_aggregator_blacklist(settings.config_dir)
    yaml_topics = load_seed_topics(settings.config_dir)

    rules: list[tuple[str, str, dict[str, Any] | None]] = []

    # blacklist domains
    for domain in yaml_blacklist:
        if domain:
            rules.append(("blacklist_domain", domain.strip().lower(), None))

    # seed topics — keep keywords/regions/weight in extra so the UI/agent
    # can reconstruct the full topic dict.
    for t in yaml_topics.get("topics", []) or []:
        name = str(t.get("name", "")).strip()
        if not name:
            continue
        extra = {
            "label": t.get("label"),
            "keywords": list(t.get("keywords") or []),
            "regions": list(t.get("regions") or []),
            "weight": t.get("weight"),
        }
        rules.append(("seed_topic", name, extra))

    # anchor expos
    for anchor in yaml_topics.get("anchor_expos", []) or []:
        if isinstance(anchor, str) and anchor.strip():
            rules.append(("anchor_expo", anchor.strip(), None))

    if not rules:
        return 0

    sm = get_sessionmaker()
    async with sm() as session:
        try:
            inserted = await scope_repo.bulk_seed_yaml_defaults(session, rules)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    if inserted:
        _log.info("scope_seed.inserted", count=inserted, total_yaml=len(rules))
    return inserted
