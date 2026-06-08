"""LangGraph state definitions.

The `CrawlState` is the single source of truth that flows through the graph.
List fields use `Annotated[..., operator.add]` so that parallel `Send` workers
can append their partial results and LangGraph merges them into the parent
state automatically.
"""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict

from .schemas import (
    CrawlMode,
    ExhibitorRef,
    Expo,
    FailureRecord,
    Vendor,
    VendorURL,
)


class CrawlState(TypedDict, total=False):
    run_id: str
    mode: CrawlMode

    seed_queries: Annotated[list[str], operator.add]
    discovered_expos: Annotated[list[Expo], operator.add]
    pending_exhibitors: Annotated[list[ExhibitorRef], operator.add]
    resolved_vendors: Annotated[list[VendorURL], operator.add]
    enriched_vendors: Annotated[list[Vendor], operator.add]
    failures: Annotated[list[FailureRecord], operator.add]

    # Counters (overwritten, not appended)
    expos_count: int
    exhibitors_count: int
    vendors_resolved_count: int
    vendors_enriched_count: int
    dedup_skipped_count: int

    # Run-scoped flags
    firecrawl_budget_low: bool
    phase_2_unlocked: bool


class WorkerExpoState(TypedDict, total=False):
    """Sub-state for a single fan-out worker that processes one expo."""

    run_id: str
    expo: Expo


class WorkerExhibitorState(TypedDict, total=False):
    """Sub-state for a worker that resolves vendor URL from one exhibitor."""

    run_id: str
    exhibitor: ExhibitorRef


class WorkerVendorState(TypedDict, total=False):
    """Sub-state for a worker that enriches one resolved vendor."""

    run_id: str
    vendor_url: VendorURL
