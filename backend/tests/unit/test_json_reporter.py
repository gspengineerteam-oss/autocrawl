"""Atomic write race-condition test for json_reporter."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import pytest

from crawler.store.json_reporter import _atomic_write


@pytest.mark.asyncio
async def test_concurrent_writes_dont_corrupt(tmp_path: Path):
    target = tmp_path / "subdir" / "race.json"

    async def _writer(value: int):
        await _atomic_write(target, {"value": value})

    await asyncio.gather(*(_writer(i) for i in range(20)))
    assert target.exists()
    body = json.loads(target.read_text())
    assert "value" in body
    # No leftover .tmp_ files in the target dir
    leftovers = [p for p in target.parent.iterdir() if p.name.startswith(".tmp_")]
    assert leftovers == []


@pytest.mark.asyncio
async def test_atomic_write_creates_parent_dirs(tmp_path: Path):
    target = tmp_path / "deeply" / "nested" / "out.json"
    await _atomic_write(target, {"hello": "world"})
    assert os.path.exists(target)
