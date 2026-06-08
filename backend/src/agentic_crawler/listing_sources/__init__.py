"""Curated listing sources for the agentic crawler.

Each module here is a self-contained source that returns vendor candidates
and pushes them into the enrich queue. Sources are independent — failure
of one does not affect others. Sources are registered into the scheduler
via cron entries (weekly/monthly cadence) since they are not high-velocity
sources like the live expo crawls.
"""

from __future__ import annotations

__all__: list[str] = []
