"""Aggregator scraper protocol & shared helpers.

A scraper takes an aggregator URL (an expo's exhibitor list page) and
returns a list of `ExhibitorRef`. Each scraper is small and site-specific
because every aggregator has its own DOM. They MUST NOT try to resolve the
real vendor URL — that is the resolver agent's job.
"""

from __future__ import annotations

from typing import Protocol

from ...schemas import ExhibitorRef
from ..url_utils import canonical_domain


class AggregatorScraper(Protocol):
    aggregator_domain: str

    def matches(self, url: str) -> bool: ...

    async def list_exhibitors(self, expo_url: str, expo_id: str) -> list[ExhibitorRef]: ...


def domain_from_url(url: str) -> str:
    return canonical_domain(url)
