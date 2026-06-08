"""Phase 5 — Per-product scope-of-interest scorer.

Given a product name + summary + vendor context, ask the LLM to:
1. Score 0-1 how well this product fits the operator's domain of interest
   (defined by `config/seed_topics.yaml` taxonomy).
2. List which seed_topics it matches (>0.4 individual fit).
3. Return a 1-2 sentence rationale (buyer perspective).

Reused by `agentic_crawler.product_enricher` for both live enrichment and
backfill. Lives under `crawler.agents` (not `agentic_crawler`) because the
LLM-judge pattern matches the existing `scope_classifier` and the topic
config is shared infra, not agentic-pool-specific.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import yaml
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ..config import get_settings
from ..observability.logger import get_logger
from ..tools.llm.cloud_router import chat_structured
from ..tools.llm.openai_client import chat

_log = get_logger(__name__)


# Module-level cache: seed_topics loaded once per process. yaml.safe_load is
# cheap but the LLM system-prompt rendering is wasteful to redo per call.
_TOPICS_CACHE: list[dict[str, Any]] | None = None
_SYSTEM_PROMPT_CACHE: str | None = None
_CACHE_LOCK = asyncio.Lock()


class _ProductScopeJudgment(BaseModel):
    """Structured LLM output. Pydantic class for `chat(response_format=...)`."""

    score: float = Field(
        ge=0.0, le=1.0, default=0.0,
        description="Overall fit 0-1: 0 means unrelated, 1 means perfect match for operator's domain.",
    )
    matched_topics: list[str] = Field(
        default_factory=list,
        description="Topic NAMES (lower_snake_case) that this product matches with individual score >= 0.4. Empty list if no match.",
    )
    reason: str = Field(
        default="",
        description="1-2 sentence rationale for the score, from a buyer's procurement perspective.",
    )
    category: str | None = Field(
        default=None,
        description="Operator-friendly bucket label, e.g. 'Armored vehicles', 'CCTV cameras', 'Network firewall'. Single short noun phrase.",
    )


def _topics_path() -> Path:
    """Resolve `config/seed_topics.yaml` from settings.config_dir."""
    s = get_settings()
    return Path(s.config_dir) / "seed_topics.yaml"


def _load_topics_sync() -> list[dict[str, Any]]:
    """Read + parse seed_topics.yaml. Returns the `topics:` list."""
    path = _topics_path()
    if not path.exists():
        _log.warning("product_scope_scorer.topics_yaml_missing", path=str(path))
        return []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "product_scope_scorer.topics_yaml_parse_failed", error=str(e)[:200]
        )
        return []
    topics = data.get("topics") or []
    if not isinstance(topics, list):
        return []
    return [t for t in topics if isinstance(t, dict) and t.get("name")]


def _build_system_prompt(topics: list[dict[str, Any]]) -> str:
    """Compose system prompt enumerating operator's DOI taxonomy. Stable text
    so prompt-caching (when LLM provider supports it) hits across calls."""
    lines = [
        "You are a procurement scope-fit judge. Given a single product offered "
        "by a vendor, score how well it fits the operator's domain of interest.",
        "",
        "OPERATOR'S DOMAIN OF INTEREST — only these topics count as in-scope:",
        "",
    ]
    for t in topics:
        name = t.get("name", "")
        label = t.get("label", name)
        keywords = t.get("keywords") or []
        kw_str = "; ".join(str(k) for k in keywords[:5])
        lines.append(f"- {name} ({label}): {kw_str}")
    lines.extend([
        "",
        "RULES:",
        "1. Score 0-1: 0=unrelated, 0.4=tangentially related, 0.7=clearly relevant, 1.0=perfect fit for THIS operator's procurement.",
        "2. matched_topics: list ONLY topic names where individual fit >= 0.4. Use the `name` field exactly (lower_snake_case).",
        "3. category: short operator-friendly noun phrase (2-4 words) describing the product type (e.g. 'Armored personnel carrier', 'Thermal CCTV camera', 'Network firewall appliance').",
        "4. reason: 1-2 sentences max, written for a procurement officer evaluating purchase fit.",
        "5. If product is consumer goods, hospitality, education, or unrelated to security/defense/law-enforcement/cyber/border/critical-infra → score 0-0.2 and matched_topics=[].",
        "",
        "Respond ONLY with valid JSON matching the schema. No prose, no fences.",
    ])
    return "\n".join(lines)


async def _ensure_cache() -> tuple[list[dict[str, Any]], str]:
    """Lazy load topics + system prompt under a lock. Idempotent."""
    global _TOPICS_CACHE, _SYSTEM_PROMPT_CACHE
    if _TOPICS_CACHE is not None and _SYSTEM_PROMPT_CACHE is not None:
        return _TOPICS_CACHE, _SYSTEM_PROMPT_CACHE
    async with _CACHE_LOCK:
        if _TOPICS_CACHE is None:
            _TOPICS_CACHE = await asyncio.to_thread(_load_topics_sync)
        if _SYSTEM_PROMPT_CACHE is None:
            _SYSTEM_PROMPT_CACHE = _build_system_prompt(_TOPICS_CACHE)
    return _TOPICS_CACHE, _SYSTEM_PROMPT_CACHE


def _valid_topic_names(topics: list[dict[str, Any]]) -> set[str]:
    return {t["name"] for t in topics if t.get("name")}


async def score_product(
    product_name: str,
    *,
    product_summary: str | None = None,
    vendor_name: str | None = None,
    vendor_description: str | None = None,
) -> _ProductScopeJudgment:
    """Score a single product against the DOI taxonomy.

    On LLM error, returns a zeroed judgment with reason='judge_failed' so
    the enrichment pipeline can persist the product anyway (defaults to
    out-of-scope rather than dropping the row)."""
    if not product_name or not product_name.strip():
        return _ProductScopeJudgment(score=0.0, reason="empty product name")

    topics, system_prompt = await _ensure_cache()
    if not topics:
        # No taxonomy configured → out-of-scope by definition.
        return _ProductScopeJudgment(
            score=0.0, reason="seed_topics.yaml empty or missing"
        )

    user_lines = [f"Product: {product_name}"]
    if product_summary:
        user_lines.append(f"Product summary: {product_summary[:500]}")
    if vendor_name:
        user_lines.append(f"Vendor: {vendor_name}")
    if vendor_description:
        user_lines.append(f"Vendor context: {vendor_description[:300]}")
    user_msg = HumanMessage(content="\n".join(user_lines))
    system_msg = SystemMessage(content=system_prompt)

    try:
        result = await chat_structured(
            [system_msg, user_msg],
            _ProductScopeJudgment,
            local_chat=chat,
            tier="light",
        )
    except Exception as e:  # noqa: BLE001
        _log.warning(
            "product_scope_scorer.llm_failed",
            product=product_name[:80], error=str(e)[:200],
        )
        return _ProductScopeJudgment(score=0.0, reason="judge_failed")

    if not isinstance(result, _ProductScopeJudgment):
        return _ProductScopeJudgment(score=0.0, reason="judge_invalid_shape")

    # Filter matched_topics to only those that exist in the taxonomy. LLM
    # sometimes hallucinates topic names — defense in depth.
    valid = _valid_topic_names(topics)
    result.matched_topics = [t for t in result.matched_topics if t in valid]
    return result


async def score_product_simple(
    product_name: str,
    *,
    product_summary: str | None = None,
    vendor_name: str | None = None,
    vendor_description: str | None = None,
) -> tuple[float, str, list[str], str | None]:
    """Convenience wrapper returning (score, reason, matched_topics, category)
    for callers that prefer plain tuples over the Pydantic shape."""
    j = await score_product(
        product_name,
        product_summary=product_summary,
        vendor_name=vendor_name,
        vendor_description=vendor_description,
    )
    return j.score, j.reason, list(j.matched_topics), j.category


# CLI smoke-test entrypoint: `python -m crawler.agents.product_scope_scorer
# --product "Cougar 4x4 MRAP" --description "armored personnel carrier"`
def _main() -> None:
    import argparse
    import json

    parser = argparse.ArgumentParser()
    parser.add_argument("--product", required=True)
    parser.add_argument("--description", default=None)
    parser.add_argument("--vendor", default=None)
    args = parser.parse_args()

    async def _run() -> None:
        j = await score_product(
            args.product,
            product_summary=args.description,
            vendor_name=args.vendor,
        )
        print(json.dumps(j.model_dump(), indent=2, ensure_ascii=False))

    asyncio.run(_run())


if __name__ == "__main__":
    _main()
