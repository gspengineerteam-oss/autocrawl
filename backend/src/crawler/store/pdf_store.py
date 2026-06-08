"""PDF storage: download, dedup via SHA256, write metadata sidecar.

Layout:
  data/pdfs/
    _index.json              # {url: {expo_id, path, sha256, downloaded_at, size}}
    <expo_id>/
      <safe_name>.pdf        # raw PDF bytes
      <safe_name>.meta.json  # full metadata
      <safe_name>.pages.jsonl  # one line per page after extraction (written by pdf_extractor)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from ..config import get_settings
from ..observability.logger import get_logger
from ..observability.metrics import errors_total
from ..tools.browsers.binary_fetcher import fetch_pdf

_log = get_logger(__name__)
_INDEX_LOCK = asyncio.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename(url: str, max_len: int = 100) -> str:
    name = urlparse(url).path.rsplit("/", 1)[-1] or "brochure.pdf"
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    if not name.lower().endswith(".pdf"):
        name = name + ".pdf"
    if len(name) > max_len:
        stem = name[: max_len - 4]
        name = stem + ".pdf"
    return name


def _pdf_dir(expo_id: str) -> Path:
    settings = get_settings()
    p = settings.data_dir / "pdfs" / expo_id
    p.parent.mkdir(parents=True, exist_ok=True)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _index_path() -> Path:
    return get_settings().data_dir / "pdfs" / "_index.json"


async def _load_index() -> dict:
    path = _index_path()
    if not path.exists():
        return {}
    try:
        return await asyncio.to_thread(_load_json_blocking, path)
    except Exception:  # noqa: BLE001
        return {}


def _load_json_blocking(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


async def _save_index(index: dict) -> None:
    path = _index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_atomic_write_json, path, index)


def _atomic_write_json(path: Path, payload: Any) -> None:
    body = json.dumps(payload, indent=2, default=str, ensure_ascii=False).encode("utf-8")
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


async def download(pdf_url: str, expo_id: str) -> tuple[Path, str] | None:
    """Download a PDF, dedup via SHA256, return (local_path, sha256).

    Returns None on failure. If the same SHA256 already exists in the index
    (perhaps under a different expo_id or filename), the existing local copy
    is reused and the new (expo_id, url) pairing is appended to the index.
    """
    async with _INDEX_LOCK:
        index = await _load_index()

    if pdf_url in index:
        entry = index[pdf_url]
        local = Path(entry["path"])
        if local.exists():
            _log.info("pdf_store.dedup_hit", url=pdf_url, path=str(local))
            return local, entry["sha256"]

    result = await fetch_pdf(pdf_url)
    if not result.success or not result.data:
        errors_total.labels(stage="pdf_store", category="fetch_failed").inc()
        _log.warning("pdf_store.fetch_failed", url=pdf_url, error=result.error)
        return None

    sha256 = hashlib.sha256(result.data).hexdigest()
    filename = _safe_filename(pdf_url)
    target = _pdf_dir(expo_id) / filename

    # SHA256 dedup: if same hash exists anywhere, link by reference (skip rewrite)
    async with _INDEX_LOCK:
        index = await _load_index()
        for existing_url, entry in index.items():
            if entry.get("sha256") == sha256 and Path(entry.get("path", "")).exists():
                _log.info("pdf_store.sha256_dedup", url=pdf_url, existing=existing_url)
                index[pdf_url] = {
                    **entry,
                    "first_seen_url": existing_url,
                    "expo_ids": sorted(set(entry.get("expo_ids", [entry.get("expo_id", "?")])) | {expo_id}),
                    "added_at": _now_iso(),
                }
                await _save_index(index)
                return Path(entry["path"]), sha256

    await asyncio.to_thread(_write_bytes_atomic, target, result.data)

    meta = {
        "filename": filename,
        "source_url": pdf_url,
        "final_url": result.final_url,
        "expo_id": expo_id,
        "sha256": sha256,
        "size_bytes": len(result.data),
        "content_type": result.content_type,
        "downloaded_at": _now_iso(),
        "fetcher": result.source,
    }
    sidecar = target.with_suffix(target.suffix + ".meta.json")
    await asyncio.to_thread(_atomic_write_json, sidecar, meta)

    async with _INDEX_LOCK:
        index = await _load_index()
        index[pdf_url] = {
            "expo_id": expo_id,
            "expo_ids": [expo_id],
            "path": str(target),
            "sha256": sha256,
            "size_bytes": len(result.data),
            "downloaded_at": meta["downloaded_at"],
        }
        await _save_index(index)

    _log.info("pdf_store.downloaded", url=pdf_url, path=str(target), sha256_prefix=sha256[:12])
    return target, sha256


def _write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        mode="wb", dir=str(path.parent), prefix=".tmp_", suffix=".pdf", delete=False
    )
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        Path(tmp.name).replace(path)
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass


async def write_page_extracts(expo_id: str, pdf_filename: str, pages: list, vendor_refs: list) -> None:
    """Append per-page extraction details to <pdf>.pages.jsonl audit trail."""
    target = _pdf_dir(expo_id) / (pdf_filename + ".pages.jsonl")
    lines: list[str] = []
    for page in pages:
        page_obj = {
            "page": page.page_number,
            "method": page.extraction_method,
            "char_count": page.char_count,
            "table_count": len(page.tables),
            "vendors_found": [
                {"name": r.name, "position": r.provenance[0].position if r.provenance else None}
                for r in vendor_refs
                if r.provenance and r.provenance[0].pdf_filename == pdf_filename and r.provenance[0].page == page.page_number
            ],
        }
        lines.append(json.dumps(page_obj, ensure_ascii=False))
    body = "\n".join(lines).encode("utf-8") + b"\n"
    await asyncio.to_thread(_write_bytes_atomic_text, target, body)


def _write_bytes_atomic_text(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        mode="wb", dir=str(path.parent), prefix=".tmp_", suffix=".jsonl", delete=False
    )
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        Path(tmp.name).replace(path)
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
