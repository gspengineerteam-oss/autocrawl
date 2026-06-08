"""Text sanitation helpers.

Strip punctuation we never want in vendor-facing copy. Em-dash, en-dash,
unicode hyphens, and semicolons leak in from LLM output and translation
post-processing. Replace them with regular hyphens or commas so the
frontend renders predictable ASCII.
"""

from __future__ import annotations

_PUNCT_REPLACEMENTS: list[tuple[str, str]] = [
    ("—", "-"),
    ("–", "-"),
    ("‐", "-"),
    ("‑", "-"),
    ("−", "-"),
    (";", ","),
]


def sanitize_punctuation(value: str | None) -> str | None:
    if value is None:
        return None
    out = value
    for src, dst in _PUNCT_REPLACEMENTS:
        if src in out:
            out = out.replace(src, dst)
    return out


def sanitize_list(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    return [sanitize_punctuation(v) or "" for v in values]
