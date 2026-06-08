"""Repository for ScopeRuleORM + AppPromptORM.

Handles the user-overlay layer on top of YAML defaults. Hard-delete is
blocked for source='yaml_default' rows — those can only be toggled off so
the UI stays transparent (the user sees every rule that's still in YAML).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import asc, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AppPromptORM, ScopeRuleORM


VALID_KINDS: frozenset[str] = frozenset(
    {
        "blacklist_domain",
        "whitelist_domain",
        "scope_keyword_include",
        "scope_keyword_exclude",
        "seed_topic",
        "anchor_expo",
    }
)

VALID_SOURCES: frozenset[str] = frozenset({"yaml_default", "user", "ai_suggested"})


def orm_to_dict(orm: ScopeRuleORM) -> dict[str, Any]:
    return {
        "id": orm.id,
        "kind": orm.kind,
        "value": orm.value,
        "source": orm.source,
        "enabled": bool(orm.enabled),
        "notes": orm.notes,
        "extra": orm.extra or {},
        "created_at": orm.created_at.isoformat() if orm.created_at else None,
        "updated_at": orm.updated_at.isoformat() if orm.updated_at else None,
    }


async def list_rules(
    session: AsyncSession,
    *,
    kind: str | None = None,
    source: str | None = None,
    enabled: bool | None = None,
) -> list[ScopeRuleORM]:
    stmt = select(ScopeRuleORM)
    if kind:
        stmt = stmt.where(ScopeRuleORM.kind == kind)
    if source:
        stmt = stmt.where(ScopeRuleORM.source == source)
    if enabled is not None:
        stmt = stmt.where(ScopeRuleORM.enabled == enabled)
    stmt = stmt.order_by(asc(ScopeRuleORM.kind), asc(ScopeRuleORM.value))
    return list((await session.execute(stmt)).scalars().all())


async def get_by_id(session: AsyncSession, rule_id: str) -> ScopeRuleORM | None:
    return await session.get(ScopeRuleORM, rule_id)


async def upsert_rule(
    session: AsyncSession,
    *,
    kind: str,
    value: str,
    source: str = "user",
    enabled: bool = True,
    notes: str | None = None,
    extra: dict[str, Any] | None = None,
) -> ScopeRuleORM:
    if kind not in VALID_KINDS:
        raise ValueError(f"invalid kind: {kind}")
    if source not in VALID_SOURCES:
        raise ValueError(f"invalid source: {source}")

    norm_value = value.strip()
    if not norm_value:
        raise ValueError("value must not be empty")

    stmt = select(ScopeRuleORM).where(
        ScopeRuleORM.kind == kind, ScopeRuleORM.value == norm_value
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        existing = ScopeRuleORM(
            id=str(uuid.uuid4()),
            kind=kind,
            value=norm_value,
            source=source,
            enabled=enabled,
            notes=notes,
            extra=extra or {},
        )
        session.add(existing)
    else:
        existing.enabled = enabled
        if notes is not None:
            existing.notes = notes
        if extra is not None:
            existing.extra = extra
        # never downgrade source — yaml_default always sticks
        if existing.source != "yaml_default" and source != existing.source:
            existing.source = source
    await session.flush()
    return existing


async def bulk_seed_yaml_defaults(
    session: AsyncSession,
    rules: list[tuple[str, str, dict[str, Any] | None]],
) -> int:
    """Insert YAML-default rules if missing. Idempotent. Returns inserted count.

    Each rule is (kind, value, extra). Existing rows are NOT modified — even if
    the user has disabled a yaml_default row, we leave their preference alone.
    """
    if not rules:
        return 0

    rows = [
        {
            "id": str(uuid.uuid4()),
            "kind": kind,
            "value": value.strip(),
            "source": "yaml_default",
            "enabled": True,
            "notes": None,
            "extra": extra or {},
        }
        for kind, value, extra in rules
        if value and value.strip()
    ]
    if not rows:
        return 0

    is_postgres = session.bind is not None and session.bind.dialect.name.startswith("postgres")
    if is_postgres:
        stmt = pg_insert(ScopeRuleORM).values(rows)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_scope_rule_kind_value")
        result = await session.execute(stmt)
        await session.flush()
        return int(getattr(result, "rowcount", 0) or 0)

    # SQLite / generic fallback — check existence per row.
    inserted = 0
    for row in rows:
        exists = (
            await session.execute(
                select(ScopeRuleORM.id).where(
                    ScopeRuleORM.kind == row["kind"], ScopeRuleORM.value == row["value"]
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            session.add(ScopeRuleORM(**row))
            inserted += 1
    await session.flush()
    return inserted


async def toggle_rule(session: AsyncSession, rule_id: str, *, enabled: bool) -> ScopeRuleORM:
    existing = await session.get(ScopeRuleORM, rule_id)
    if existing is None:
        raise NoResultFound(f"scope rule not found: {rule_id}")
    existing.enabled = enabled
    await session.flush()
    return existing


async def delete_rule(session: AsyncSession, rule_id: str) -> bool:
    """Hard-delete. Refuses to delete yaml_default rows — those are toggle-only."""
    existing = await session.get(ScopeRuleORM, rule_id)
    if existing is None:
        return False
    if existing.source == "yaml_default":
        raise PermissionError("yaml_default rules cannot be deleted; toggle enabled=false instead")
    await session.execute(delete(ScopeRuleORM).where(ScopeRuleORM.id == rule_id))
    await session.flush()
    return True


async def update_notes(session: AsyncSession, rule_id: str, notes: str | None) -> ScopeRuleORM:
    existing = await session.get(ScopeRuleORM, rule_id)
    if existing is None:
        raise NoResultFound(f"scope rule not found: {rule_id}")
    existing.notes = notes
    await session.flush()
    return existing


# ---------------------------------------------------------------------------
# AppPrompt — key/value store for editable LLM system prompts
# ---------------------------------------------------------------------------


async def get_prompt(session: AsyncSession, key: str) -> AppPromptORM | None:
    return await session.get(AppPromptORM, key)


async def set_prompt(session: AsyncSession, key: str, content: str) -> AppPromptORM:
    existing = await session.get(AppPromptORM, key)
    if existing is None:
        existing = AppPromptORM(key=key, content=content)
        session.add(existing)
    else:
        existing.content = content
    await session.flush()
    return existing


async def delete_prompt(session: AsyncSession, key: str) -> bool:
    existing = await session.get(AppPromptORM, key)
    if existing is None:
        return False
    await session.execute(delete(AppPromptORM).where(AppPromptORM.key == key))
    await session.flush()
    return True
