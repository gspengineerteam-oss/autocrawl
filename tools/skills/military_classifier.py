from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

_TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "taxonomies" / "military.yaml"


@dataclass(frozen=True)
class ClassifyResult:
    is_military: bool
    score: float
    matched_categories: tuple[str, ...] = field(default_factory=tuple)
    matched_keywords: tuple[str, ...] = field(default_factory=tuple)
    rejected_by: str | None = None

    def to_dict(self) -> dict:
        out: dict = {
            "is_military": self.is_military,
            "score": round(self.score, 4),
            "matched_categories": list(self.matched_categories),
            "matched_keywords": list(self.matched_keywords),
        }
        if self.rejected_by:
            out["rejected_by"] = self.rejected_by
        return out


def _compile_kw(kw: str) -> re.Pattern[str]:
    """Word-boundary pattern with light plural tolerance.

    - Boundary uses `(?:^|[^a-z0-9])` / `(?:[^a-z0-9]|$)` so hyphens/spaces
      cleanly bracket the match (real `\b` is brittle around hyphenated
      compounds like "anti-tank").
    - Optional trailing `s` on single-word keywords so taxonomy stays singular
      ("weapon", "rifle") but matches realistic plural prose
      ("weapons manufacturer", "rifles"). Multi-word keywords skip the
      tolerance because pluralizing them is brittle ("main battle tanks"
      vs "main battle tank" — the former is rare enough to skip).
    """
    norm = kw.lower().strip()
    if not norm:
        return re.compile(r"(?!x)x")  # never matches
    escaped = re.escape(norm)
    # Add optional trailing 's' for single-token keywords (no internal whitespace
    # or hyphen). Excludes already-plural ("arms") and short tokens (≤2 chars
    # like "ew", "c2", "c4") where pluralization would be wrong.
    is_single_word = (" " not in norm) and ("-" not in norm)
    if is_single_word and len(norm) > 2 and not norm.endswith("s"):
        escaped = f"{escaped}s?"
    return re.compile(rf"(?:^|[^a-z0-9]){escaped}(?:[^a-z0-9]|$)", re.IGNORECASE)


@lru_cache(maxsize=1)
def _load_taxonomy(path: str = str(_TAXONOMY_PATH)) -> dict:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not data or "categories" not in data:
        raise ValueError(f"taxonomy at {path} missing 'categories'")
    return data


@lru_cache(maxsize=1)
def _compiled_taxonomy(path: str = str(_TAXONOMY_PATH)) -> dict:
    """Pre-compile regex patterns per keyword so the 28k reclassify pass
    doesn't rebuild ~200 patterns per vendor (would be O(28k * 200) compiles).
    """
    tax = _load_taxonomy(path)
    out: dict = {
        "min_match_score": float(tax.get("min_match_score", 0.10)),
        "hard_reject_below_score": float(tax.get("hard_reject_below_score", 0.0)),
        "weak_signal_score": float(tax.get("weak_signal_score", 0.40)),
        # Cap denominator so specialist vendors don't look weak. With cap=4.0
        # and weight=1.0 per category, a single-category specialist scores
        # 0.25 (25%) instead of 1/12 = 0.083 (8%). A comprehensive prime
        # touching 4+ categories caps at 1.0 (100%).
        "max_practical_weight": float(tax.get("max_practical_weight", 4.0)),
        "explicit_military_context": [
            _compile_kw(k) for k in (tax.get("explicit_military_context") or [])
        ],
        "negative_keywords_global": [
            kw.lower().strip()
            for kw in (tax.get("negative_keywords_global") or [])
            if kw and kw.strip()
        ],
        "categories": {},
    }
    for cat_name, cat_def in (tax.get("categories") or {}).items():
        out["categories"][cat_name] = {
            "weight": float(cat_def.get("weight", 1.0)),
            "keywords": [
                (kw.lower().strip(), _compile_kw(kw))
                for kw in (cat_def.get("keywords") or [])
                if kw and kw.strip()
            ],
            "negative_context": [
                kw.lower().strip()
                for kw in (cat_def.get("negative_context") or [])
                if kw and kw.strip()
            ],
        }
    return out


def _normalize(text: str) -> str:
    return (text or "").lower()


def classify(text: str | list[str], *, taxonomy_path: str | None = None) -> ClassifyResult:
    if isinstance(text, list):
        text = " ".join(str(t) for t in text if t)
    haystack = _normalize(text)
    if not haystack.strip():
        return ClassifyResult(is_military=False, score=0.0)

    tax = _compiled_taxonomy(taxonomy_path) if taxonomy_path else _compiled_taxonomy()

    # Global negative — abort entire classification. Substring match (rakus)
    # intentional: civilian scopes like "cosmetic skincare brand" should never
    # qualify even if a coincidental keyword hits.
    for neg in tax["negative_keywords_global"]:
        if neg in haystack:
            return ClassifyResult(
                is_military=False, score=0.0, rejected_by=f"global_negative:{neg}"
            )

    matched_cats: list[str] = []
    matched_kws: list[str] = []
    weight_sum = 0.0
    total_weight = 0.0

    for cat_name, cat_def in tax["categories"].items():
        weight = cat_def["weight"]
        total_weight += weight
        keywords = cat_def["keywords"]
        cat_hit = False
        cat_hit_kw: str | None = None
        for kw_norm, pattern in keywords:
            if pattern.search(haystack):
                cat_hit = True
                cat_hit_kw = kw_norm
                break
        if not cat_hit:
            continue
        # Category-level negative context: if any negative phrase is present
        # in the same haystack, the positive hit was likely incidental.
        neg_hit: str | None = None
        for neg in cat_def["negative_context"]:
            if neg in haystack:
                neg_hit = neg
                break
        if neg_hit is not None:
            continue
        matched_cats.append(cat_name)
        matched_kws.append(cat_hit_kw or "")
        weight_sum += weight

    # Snowglobe 2026-05-25 rescale: divide weight_sum by `max_practical_weight`
    # (default 4.0) instead of `total_weight` (12.0). Specialist vendor with
    # 1 weighted category → 25% instead of 8%. Comprehensive defense prime
    # (≥4 categories) caps at 100%. Numbers match operator intuition: this
    # vendor is a [N×25%] military supplier.
    cap = tax["max_practical_weight"]
    score = min(1.0, weight_sum / cap) if cap > 0 else 0.0
    hard_reject = tax["hard_reject_below_score"]
    weak_signal = tax["weak_signal_score"]
    is_military = len(matched_cats) >= 1 and score >= hard_reject

    # Two-pass: weak single-category hit needs explicit military context to
    # survive. Stops e.g. lone "drone" or "shield" hit from flagging a
    # consumer brand without any military prose anywhere.
    if is_military and len(matched_cats) <= 1 and score < weak_signal:
        has_explicit = any(p.search(haystack) for p in tax["explicit_military_context"])
        if not has_explicit:
            return ClassifyResult(
                is_military=False,
                score=score,
                matched_categories=tuple(matched_cats),
                matched_keywords=tuple(matched_kws),
                rejected_by="weak_signal_no_explicit_military_context",
            )

    return ClassifyResult(
        is_military=is_military,
        score=score,
        matched_categories=tuple(matched_cats),
        matched_keywords=tuple(matched_kws),
    )


def reload_taxonomy() -> None:
    _load_taxonomy.cache_clear()
    _compiled_taxonomy.cache_clear()
