"""Atomic JSON report writer + master manifest maintenance.

File layout:
  data/reports/expos/<expo_id>.json
  data/reports/vendors/<domain_slug>.json
  data/reports/master_manifest.json
  data/reports/runs/<run_id>.json
"""

from __future__ import annotations

import asyncio
import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import get_settings
from ..observability.logger import get_logger
from ..schemas import Expo, RunSummary, Vendor

_log = get_logger(__name__)
_FILE_LOCKS: dict[Path, asyncio.Lock] = {}


def _slug(domain: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "_", domain.lower()).strip("_")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _atomic_write(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = _FILE_LOCKS.setdefault(path, asyncio.Lock())
    async with lock:
        await asyncio.to_thread(_atomic_write_blocking, path, data)


def _atomic_write_blocking(path: Path, data: Any) -> None:
    body = json.dumps(data, indent=2, default=str, ensure_ascii=False).encode("utf-8")
    tmp = tempfile.NamedTemporaryFile(
        mode="wb", dir=str(path.parent), prefix=".tmp_", suffix=".json", delete=False
    )
    try:
        tmp.write(body)
        tmp.flush()
        tmp.close()
        Path(tmp.name).replace(path)
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass


def _reports_dir() -> Path:
    return get_settings().data_dir / "reports"


async def write_vendor(vendor: Vendor) -> Path:
    # Unresolved vendors have no domain; fall back to vendor_id so the row
    # still lands on disk under a stable, unique filename.
    slug = _slug(vendor.domain) if vendor.domain else f"unresolved_{vendor.vendor_id}"
    path = _reports_dir() / "vendors" / f"{slug}.json"
    payload = vendor.model_dump(mode="json")
    await _atomic_write(path, payload)
    return path


async def write_expo(expo: Expo, *, vendor_domains: list[str] | None = None) -> Path:
    path = _reports_dir() / "expos" / f"{expo.expo_id}.json"
    payload = expo.model_dump(mode="json")
    payload["vendors"] = sorted(set(vendor_domains or []))
    payload["written_at"] = _now_iso()
    await _atomic_write(path, payload)
    return path


async def write_run_summary(summary: RunSummary) -> Path:
    path = _reports_dir() / "runs" / f"{summary.run_id}.json"
    await _atomic_write(path, summary.model_dump(mode="json"))
    return path


async def update_manifest(*, expo: Expo | None = None, vendor: Vendor | None = None) -> None:
    """Append a small index entry to master_manifest.json. Idempotent."""
    path = _reports_dir() / "master_manifest.json"
    lock = _FILE_LOCKS.setdefault(path, asyncio.Lock())
    async with lock:

        def _read() -> dict:
            if path.exists():
                try:
                    return json.loads(path.read_text(encoding="utf-8"))
                except Exception:  # noqa: BLE001
                    return {}
            return {}

        manifest = await asyncio.to_thread(_read)
        manifest.setdefault("expos", {})
        manifest.setdefault("vendors", {})
        manifest["updated_at"] = _now_iso()

        if expo is not None:
            manifest["expos"][expo.expo_id] = {
                "name": expo.name,
                "official_url": str(expo.official_url) if expo.official_url else None,
                "country": expo.country,
                "discovered_at": expo.discovered_at.isoformat(),
            }
        if vendor is not None:
            manifest["vendors"][vendor.domain] = {
                "name": vendor.company_name,
                "url": str(vendor.canonical_url),
                "expos_seen": vendor.expos_seen,
                "last_enriched_at": vendor.last_enriched_at.isoformat(),
                "confidence": vendor.confidence_score,
            }
        await asyncio.to_thread(_atomic_write_blocking, path, manifest)


async def manifest_vendor_count() -> int:
    """Used by the Phase 2 unlock check."""
    path = _reports_dir() / "master_manifest.json"
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data.get("vendors", {}))
    except Exception:  # noqa: BLE001
        return 0
