"""Persistent Chromium profile slot allocator.

Why
---
Browser-Use defaults `user-data-dir` to a random tmp path per Agent
spawn — every run is a brand-new browser with no cookies, no history,
empty cache. That makes the crawler look obviously bot-like (login
walls, captchas, "we don't recognize this device" challenges) and
forfeits Chromium's normal speedups (HTTP cache, prerendered DNS, TLS
session resumption).

This module hands out a small pool of STABLE profile directories under
`agentic_profiles_dir`. Each worker takes a slot when it starts and
returns it when done. Profile dirs persist across runs and across
container rebuilds (path lives under `./data/` bind-mount).

Slot naming: `{role}-{slot_idx}/` so listing-pool slot 0 in container
agentic-a uses `/app/data/agentic_profiles/listing-0/`, and the *same*
slot is reused on the next pass — its previous cookies and history
are still there. With 2 listing + 2 enrich workers per container × 2
twin containers = 8 stable profiles (4 unique slots × 2 hostnames).

Hostname is folded into the path so the two twins don't share a profile
directory (Chromium SQLite locks would fight if they did).
"""

from __future__ import annotations

import asyncio
import os
import socket
from pathlib import Path
from typing import Literal

from crawler.observability.logger import get_logger

from .config import get_agentic_settings

_log = get_logger(__name__)

Role = Literal["listing", "enrich"]

# Per-(role) asyncio.Queue holding the available slot indices. Lazily built
# on first acquire so settings are read after env is fully parsed.
_POOLS: dict[Role, asyncio.Queue[int]] = {}
_POOLS_LOCK = asyncio.Lock()


def _hostname() -> str:
    return os.environ.get("HOSTNAME") or socket.gethostname() or "default"


async def _get_pool(role: Role, capacity: int) -> asyncio.Queue[int]:
    async with _POOLS_LOCK:
        q = _POOLS.get(role)
        if q is None:
            q = asyncio.Queue()
            for i in range(capacity):
                q.put_nowait(i)
            _POOLS[role] = q
        return q


def profile_dir_for(role: Role, slot_idx: int) -> Path:
    """Compute the on-disk profile directory for `(role, slot_idx)`. Stable
    across runs as long as `agentic_profiles_dir` and hostname are stable.

    Browser-Use 0.12.6 has a `_copy_profile()` safeguard
    (`browser_use/browser/profile.py:808`) that detects Chromium and
    copies the user_data_dir to a tmp before launching, EXCEPT when the
    path string contains `browser-use-user-data-dir-`. We embed that
    magic substring in the slot directory name so Chromium writes
    directly into our persistent path — cookies, history, cache survive
    across runs.
    """
    s = get_agentic_settings()
    # Prefix `browser-use-user-data-dir-` triggers Browser-Use's "already
    # a temp dir, skip copy" branch — which is exactly the no-copy-on-launch
    # behaviour we want for our persistent slot.
    slot_name = f"browser-use-user-data-dir-{role}-{slot_idx}"
    base = Path(s.agentic_profiles_dir) / _hostname() / slot_name
    base.mkdir(parents=True, exist_ok=True)
    return base


class _SlotHandle:
    """Async context manager — acquire a slot, get its directory, release on exit."""

    def __init__(self, role: Role, capacity: int) -> None:
        self.role = role
        self.capacity = capacity
        self._slot_idx: int | None = None
        self._pool: asyncio.Queue[int] | None = None

    async def __aenter__(self) -> tuple[int, Path]:
        self._pool = await _get_pool(self.role, self.capacity)
        self._slot_idx = await self._pool.get()
        path = profile_dir_for(self.role, self._slot_idx)
        _log.debug(
            "agentic.profile_slot_acquired",
            role=self.role,
            slot=self._slot_idx,
            path=str(path),
            host=_hostname(),
        )
        return self._slot_idx, path

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._slot_idx is not None and self._pool is not None:
            self._pool.put_nowait(self._slot_idx)
            _log.debug(
                "agentic.profile_slot_released",
                role=self.role,
                slot=self._slot_idx,
            )


def acquire_listing_slot() -> _SlotHandle:
    """`async with acquire_listing_slot() as (slot_idx, profile_dir): ...`"""
    s = get_agentic_settings()
    return _SlotHandle("listing", max(1, s.parallel_seeds))


def acquire_enrich_slot() -> _SlotHandle:
    """`async with acquire_enrich_slot() as (slot_idx, profile_dir): ...`"""
    s = get_agentic_settings()
    return _SlotHandle("enrich", max(1, s.agentic_enrich_parallel))
