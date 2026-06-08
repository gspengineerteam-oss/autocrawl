"""Common search result type."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SearchHit:
    title: str
    url: str
    snippet: str = ""
    source: str = ""


__all__ = ["SearchHit"]
