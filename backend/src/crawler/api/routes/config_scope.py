"""User-editable scope/blacklist configuration.

Routes:
  GET    /api/config/scope                  list all rules (filterable)
  POST   /api/config/scope                  create or upsert a rule
  PATCH  /api/config/scope/{id}             toggle enabled / edit notes
  DELETE /api/config/scope/{id}             hard-delete (yaml_default rejected)
  GET    /api/config/scope/prompt           current scope-classifier system prompt
  PUT    /api/config/scope/prompt           replace prompt (empty body = reset to default)
  POST   /api/config/scope/suggest          ask the LLM for candidate rules

Every mutation:
  1. Commits the DB write.
  2. Calls bump_scope_version() so other processes invalidate their cache.
  3. Calls scope_cache.refresh_now() so THIS process serves the new state on
     the very next read (zero in-process latency).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.repositories import scope_repo
from ...observability.logger import get_logger
from ...store.redis_queue import bump_scope_version
from ...tools.llm.cloud_router import chat_structured
from ...tools.llm.openai_client import chat
from ...tools.scope_cache import (
    SCOPE_PROMPT_KEY,
    get_effective_scope_prompt_async,
    refresh_now,
)
from ..deps import get_db

_log = get_logger(__name__)
router = APIRouter(prefix="/config/scope", tags=["config"])


class RuleCreate(BaseModel):
    kind: str = Field(..., description="One of scope_repo.VALID_KINDS")
    value: str = Field(..., min_length=1, max_length=500)
    source: str = Field(default="user")
    enabled: bool = Field(default=True)
    notes: str | None = None
    extra: dict[str, Any] | None = None


class RuleUpdate(BaseModel):
    enabled: bool | None = None
    notes: str | None = None


class PromptUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class SuggestRequest(BaseModel):
    kind: str = Field(..., description="What kind of rule to suggest")
    hint: str = Field(..., min_length=1, max_length=500)
    max_suggestions: int = Field(default=8, ge=1, le=20)


class SuggestedRule(BaseModel):
    value: str
    reason: str = ""
    confidence: float = Field(default=0.6, ge=0.0, le=1.0)


class _SuggestionList(BaseModel):
    suggestions: list[SuggestedRule] = Field(default_factory=list)


async def _bump_and_refresh() -> None:
    """Bump global version + force-refresh the in-process snapshot."""
    await bump_scope_version()
    await refresh_now()


@router.get("")
async def list_rules(
    kind: str | None = Query(default=None),
    source: str | None = Query(default=None),
    enabled: bool | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await scope_repo.list_rules(session, kind=kind, source=source, enabled=enabled)
    return {
        "items": [scope_repo.orm_to_dict(r) for r in rows],
        "total": len(rows),
        "valid_kinds": sorted(scope_repo.VALID_KINDS),
    }


@router.post("", status_code=201)
async def create_rule(
    body: RuleCreate, session: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    if body.kind not in scope_repo.VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"invalid kind: {body.kind}")
    if body.source not in scope_repo.VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"invalid source: {body.source}")
    if body.source == "yaml_default":
        # yaml_default is reserved for the auto-import path
        raise HTTPException(status_code=400, detail="source=yaml_default is reserved")

    try:
        row = await scope_repo.upsert_rule(
            session,
            kind=body.kind,
            value=body.value,
            source=body.source,
            enabled=body.enabled,
            notes=body.notes,
            extra=body.extra,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await session.commit()
    await _bump_and_refresh()
    return scope_repo.orm_to_dict(row)


@router.patch("/{rule_id}")
async def update_rule(
    rule_id: str, body: RuleUpdate, session: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    existing = await scope_repo.get_by_id(session, rule_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="rule not found")

    if body.enabled is not None:
        existing = await scope_repo.toggle_rule(session, rule_id, enabled=body.enabled)
    if body.notes is not None:
        existing = await scope_repo.update_notes(session, rule_id, body.notes)

    await session.commit()
    await _bump_and_refresh()
    return scope_repo.orm_to_dict(existing)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: str, session: AsyncSession = Depends(get_db)) -> None:
    try:
        deleted = await scope_repo.delete_rule(session, rule_id)
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    if not deleted:
        raise HTTPException(status_code=404, detail="rule not found")

    await session.commit()
    await _bump_and_refresh()


@router.get("/prompt")
async def get_prompt(session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    stored = await scope_repo.get_prompt(session, SCOPE_PROMPT_KEY)
    effective = await get_effective_scope_prompt_async()
    return {
        "key": SCOPE_PROMPT_KEY,
        "content": effective,
        "is_custom": stored is not None,
        "updated_at": stored.updated_at.isoformat() if stored else None,
    }


@router.put("/prompt")
async def set_prompt(
    body: PromptUpdate, session: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    row = await scope_repo.set_prompt(session, SCOPE_PROMPT_KEY, body.content)
    await session.commit()
    await _bump_and_refresh()
    return {
        "key": row.key,
        "content": row.content,
        "is_custom": True,
        "updated_at": row.updated_at.isoformat(),
    }


@router.delete("/prompt", status_code=204)
async def reset_prompt(session: AsyncSession = Depends(get_db)) -> None:
    """Reset the scope-classifier prompt to the hardcoded default."""
    await scope_repo.delete_prompt(session, SCOPE_PROMPT_KEY)
    await session.commit()
    await _bump_and_refresh()


_SUGGEST_INSTRUCTIONS_BY_KIND: dict[str, str] = {
    "blacklist_domain": (
        "Suggest specific domain names (e.g. 'example.com') that the AutoCrawl "
        "system should BLACKLIST, meaning they must NEVER be treated as a real "
        "vendor. Output bare registrable domains, lowercase, no scheme/path."
    ),
    "whitelist_domain": (
        "Suggest specific domains to FORCE-WHITELIST as legitimate vendors, "
        "overriding any blacklist match. Lowercase, no scheme/path."
    ),
    "scope_keyword_include": (
        "Suggest short keywords/phrases that indicate a vendor IS in scope "
        "(security/defense/cyber/police/surveillance/border)."
    ),
    "scope_keyword_exclude": (
        "Suggest keywords/phrases that indicate a vendor is OUT OF SCOPE "
        "(hospitality, news, academia, generic events)."
    ),
    "seed_topic": (
        "Suggest discovery seed topic names (short snake_case identifier)."
    ),
    "anchor_expo": (
        "Suggest known landmark expos/conferences in the security/defense/cyber "
        "industry. Use the canonical event name, not a slug."
    ),
}


@router.post("/suggest")
async def suggest_rules(
    body: SuggestRequest, session: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    if body.kind not in scope_repo.VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"invalid kind: {body.kind}")

    instructions = _SUGGEST_INSTRUCTIONS_BY_KIND.get(body.kind, "")
    existing = await scope_repo.list_rules(session, kind=body.kind)
    existing_values = sorted({r.value for r in existing})[:200]

    sys = SystemMessage(
        content=(
            "You suggest concrete configuration entries for an OSINT crawler "
            "focused on security / defense / cybersecurity / law-enforcement / "
            "surveillance / border-control vendors.\n\n"
            f"For this request, the user wants entries of kind '{body.kind}'.\n"
            f"{instructions}\n\n"
            "DO NOT include items that already exist in the user's list. Be "
            "specific and high-precision. Skip generic / over-broad entries."
        )
    )
    user = HumanMessage(
        content=(
            f"User hint: {body.hint}\n\n"
            f"Existing entries to AVOID duplicating ({len(existing_values)} total):\n"
            f"{', '.join(existing_values[:80])}\n\n"
            f"Return up to {body.max_suggestions} suggestions. For each, give "
            f"a short reason and your confidence (0.0–1.0)."
        )
    )

    try:
        result = await chat_structured(
            [sys, user], _SuggestionList, local_chat=chat, tier="light"
        )
        suggestions = result.suggestions if isinstance(result, _SuggestionList) else []
    except Exception as e:  # noqa: BLE001
        _log.warning("config_scope.suggest_failed", error=str(e))
        raise HTTPException(status_code=502, detail=f"LLM suggest failed: {e}") from e

    # Deduplicate against existing values (LLM sometimes ignores the instruction)
    seen = {v.lower() for v in existing_values}
    deduped: list[SuggestedRule] = []
    for s in suggestions:
        v = s.value.strip()
        if not v:
            continue
        if v.lower() in seen:
            continue
        seen.add(v.lower())
        deduped.append(
            SuggestedRule(value=v, reason=s.reason or "", confidence=s.confidence)
        )

    return {
        "kind": body.kind,
        "hint": body.hint,
        "suggestions": [s.model_dump() for s in deduped[: body.max_suggestions]],
    }
