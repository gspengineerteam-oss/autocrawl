"""Industries whitelist normalizer.

Snowglobe 2026-05-25: stop trusting raw LLM `industries[]` output. Pipeline:
  LLM proposes → normalizer drops deny-listed + maps synonyms → only canonical
  tags persist. Canonical tags = small fixed vocabulary surfaced in UI badges.

Wired into `enrich_worker._process_one` right before `apply_scope_and_signals`
so the classifier haystack already sees cleaned industries.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

def _resolve_whitelist_path() -> Path:
    """Find industries_whitelist.yaml across known layouts.

    Container: bind-mounted at /app/tools/taxonomies/.
    Local dev (Windows host): repo root has tools/ alongside backend/.
    Try paths in order, return first that exists.
    """
    here = Path(__file__).resolve()
    candidates = [
        # Container: /app/src/agentic_crawler/ → /app/tools/...
        here.parent.parent.parent / "tools" / "taxonomies" / "industries_whitelist.yaml",
        # Local dev: backend/src/agentic_crawler/ → repo root tools/
        here.parent.parent.parent.parent / "tools" / "taxonomies" / "industries_whitelist.yaml",
        # Env override
        Path("/app/tools/taxonomies/industries_whitelist.yaml"),
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]  # fall back; loader will raise FileNotFoundError clearly


_WHITELIST_PATH = _resolve_whitelist_path()


@lru_cache(maxsize=1)
def _load_whitelist(path: str = str(_WHITELIST_PATH)) -> dict:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    canonical = {str(c).strip().lower() for c in (data.get("canonical") or [])}
    synonyms_raw = data.get("synonyms") or {}
    synonyms: dict[str, str] = {}
    for k, v in synonyms_raw.items():
        k_norm = str(k).strip().lower()
        v_norm = str(v).strip().lower()
        if k_norm and v_norm in canonical:
            synonyms[k_norm] = v_norm
    deny_list = [str(d).strip().lower() for d in (data.get("deny_list") or []) if d]
    return {
        "canonical": canonical,
        "synonyms": synonyms,
        "deny_list": deny_list,
    }


def reload_whitelist() -> None:
    _load_whitelist.cache_clear()


def normalize_industries(raw: list[str] | None) -> list[str]:
    """Drop deny-listed entries, map synonyms to canonical, dedup order-preserving.

    Returns only entries that map to a known canonical tag. Anything else
    (hallucinated "aerospace", generic "manufacturing") is silently dropped.
    """
    if not raw:
        return []
    wl = _load_whitelist()
    canonical = wl["canonical"]
    synonyms = wl["synonyms"]
    deny_list = wl["deny_list"]

    out: list[str] = []
    seen: set[str] = set()
    for tag in raw:
        if not isinstance(tag, str):
            continue
        t = tag.strip().lower()
        if not t:
            continue
        # 1) Exact canonical hit short-circuits before deny check, so
        #    canonical tags that happen to contain a deny substring
        #    (e.g. "defense_industrial" contains "industrial") still pass.
        if t in canonical:
            mapped = t
        # 2) Exact synonym hit.
        elif t in synonyms:
            mapped = synonyms[t]
        else:
            # 3) Deny-list substring check — catches "commercial aerospace",
            #    "aviation services", "general manufacturing", etc.
            if any(deny in t for deny in deny_list):
                continue
            # 4) Multi-word synonym contained in longer phrase
            #    (e.g., "defense industry" inside "european defense industry leader").
            mapped_candidate: str | None = None
            for syn_key, syn_val in synonyms.items():
                if syn_key in t:
                    mapped_candidate = syn_val
                    break
            if mapped_candidate is None:
                continue
            mapped = mapped_candidate
        if mapped in seen:
            continue
        seen.add(mapped)
        out.append(mapped)
    return out
