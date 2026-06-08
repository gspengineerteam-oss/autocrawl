"""Lesson archive — per-run human-readable + raw-thinking dumps.

Layout:
    data/agentic_lessons/
    ├── success/2026-05-07_isc-west_iscwest.com__a3f1/
    │   ├── thinking.md          ← 30-line operator narrative
    │   ├── thinking.raw.md      ← every Browser-Use Agent log line, in order
    │   ├── result.json          ← extracted vendors
    │   ├── meta.json            ← seed_name/query/mode/urls/elapsed/...
    │   └── screenshots/         ← per-step PNGs (when Browser-Use writes them)
    └── failure/2026-05-07_acme-expo_acme.com__captcha__a3f1/
        ├── thinking.md
        ├── thinking.raw.md
        ├── failure_reason.json  ← {category, detail, raw_error}
        ├── meta.json
        └── screenshots/

Failure categories (canonical 8): 404, 403, captcha, image_only, paywall,
parse_failed, timeout, empty_result.

The archive is purely additive — `record_success`/`record_failure` in
`KnowledgeStore` still drive blacklist + warm-start replay. Lessons let the
operator read *why* a seed failed without scraping Loki, and let the next
pass reconstruct the blacklist after a knowledge.json wipe via
`load_failure_lessons`.
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from crawler.observability.logger import get_logger
from crawler.tools.url_utils import canonical_domain

_log = get_logger(__name__)


_VALID_CATEGORIES = {
    "404",
    "403",
    "captcha",
    "image_only",
    "paywall",
    "parse_failed",
    "timeout",
    "empty_result",
    # Phase 4 bail reasons
    "empty_page",          # SPA didn't load / page literally empty
    "no_selector_match",   # extract_by_selector tried 3 selectors, all 0 hits
    "wrong_domain",        # agent landed on aggregator/press-release/unrelated site
    "no_domain",           # search_vendor returned 0 candidates
    "formality",           # agent visited but data was generic landing page
}


def categorize_failure(error_or_bail: str | None) -> str:
    """Map a freeform error / bail string to one of the canonical categories.

    Order matters: the most specific patterns come first so `'http_404'`
    resolves to `404` before falling through to `parse_failed`.
    """
    if not error_or_bail:
        return "empty_result"
    s = error_or_bail.strip().lower()
    if s in _VALID_CATEGORIES:
        return s
    # Patterns ordered specific → general.
    if "404" in s or "not found" in s or "page gone" in s or "http_404" in s:
        return "404"
    if "403" in s or "forbidden" in s or "access denied" in s or "http_403" in s:
        return "403"
    if "captcha" in s or "challenge" in s or "cloudflare" in s or "bot detect" in s:
        return "captcha"
    if "paywall" in s or "login" in s or "subscribe" in s or "registration required" in s:
        return "paywall"
    if "timeout" in s or "timed out" in s:
        return "timeout"
    if "image_only" in s or "image only" in s or "no list" in s:
        return "image_only"
    # Phase 4 bail patterns — match BEFORE the generic "empty" catch-all so
    # `empty_page` doesn't get demoted to `empty_result`.
    if "empty_page" in s or "did not load" in s or "page is empty" in s or "still loading" in s:
        return "empty_page"
    if "no_selector_match" in s or "selector" in s and "no match" in s:
        return "no_selector_match"
    if "wrong_domain" in s or "wrong domain" in s or "not the vendor" in s:
        return "wrong_domain"
    if "no_domain" in s or "no candidate" in s or "no domain" in s:
        return "no_domain"
    if "formality" in s:
        return "formality"
    if "extracted_zero_vendors" in s or "empty" in s:
        return "empty_result"
    if "parse" in s or "json" in s or "decode" in s:
        return "parse_failed"
    return "empty_result"


def _slugify(text: str, max_len: int = 40) -> str:
    """Filesystem-safe slug: lowercase, alphanum + hyphen, trimmed."""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:max_len] or "unknown"


def _render_takeaway(status: str, category: str | None, n_vendors: int) -> str:
    """One-line operator-actionable takeaway. Threaded into thinking.md so
    the operator doesn't have to read all 30 raw steps to know what to do
    next with this domain."""
    if status == "success":
        return f"Success — {n_vendors} new vendors. Selector worked; cache for domain reuse."
    if category in {"captcha", "403"}:
        return f"Blocked ({category}). Domain is being auto-blacklisted for the cooldown window."
    if category == "image_only":
        return "Page lacks a structured list. Consider a URL-pattern filter to deprioritize this path."
    if category == "404":
        return "Dead URL. Preflight should have caught this — check whether HEAD probe was bypassed."
    if category == "paywall":
        return "Login/registration wall. Skip until we have credentials or a public mirror."
    if category == "timeout":
        return "Agent ran out of time. Either bump AGENTIC_TASK_TIMEOUT or trim max_actions."
    if category == "parse_failed":
        return "Agent emitted unparseable JSON. Check raw_output in meta.json for the malformed payload."
    return "Empty result with no clear cause. Eyeball thinking.raw.md for the agent's reasoning."


def _render_thinking_md(
    *,
    seed: Any,
    agent_result: Any,
    elapsed_s: float,
    raw_steps: list[dict],
    status: str,
    failure_category: str | None,
    failure_detail: str | None,
    domain: str,
    archived_at: datetime,
    lesson_id: str,
) -> str:
    """30-line human-readable narrative. Reads top-down: header → context →
    outcome → first-5 + last-3 step messages → takeaway."""
    n_vendors = len(getattr(agent_result, "exhibitors", []) or [])
    mode = "discovery" if "discovery" in (seed.tags or []) else (
        "anchor" if "from_anchor" in (seed.tags or []) else (
            "from_knowledge" if "from_knowledge" in (seed.tags or []) else "direct"
        )
    )
    lines: list[str] = []
    lines.append(f"# {seed.name}")
    lines.append("")
    lines.append(f"- **Status:** `{status}`")
    if status == "failure" and failure_category:
        lines.append(f"- **Failure category:** `{failure_category}`")
        if failure_detail:
            lines.append(f"- **Failure detail:** `{failure_detail[:200]}`")
    lines.append(f"- **Date:** {archived_at.strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(f"- **Domain:** `{domain or '—'}`")
    lines.append(f"- **Elapsed:** {elapsed_s:.1f}s")
    lines.append(f"- **Steps used:** {getattr(agent_result, 'n_steps', None) or 'n/a'}")
    lines.append(f"- **Lesson ID:** `{lesson_id}`")
    lines.append("")
    lines.append("## Source seed")
    lines.append(f"- **Mode:** {mode}")
    if getattr(seed, "source_query", None):
        lines.append(f"- **Query:** `{seed.source_query}`")
    lines.append(f"- **Initial URL:** {seed.url}")
    final_url = getattr(agent_result, "final_url", None)
    if final_url and final_url != seed.url:
        lines.append(f"- **Final URL:** {final_url}")
    if getattr(seed, "tags", None):
        lines.append(f"- **Tags:** {', '.join(seed.tags)}")
    lines.append("")
    lines.append("## Outcome")
    lines.append(f"- Vendors extracted: **{n_vendors}**")
    bail = getattr(agent_result, "bail_reason", None)
    if bail:
        lines.append(f"- Bail reason: `{bail}`")
    err = getattr(agent_result, "error", None)
    if err:
        lines.append(f"- Error: `{err[:200]}`")
    lines.append("")
    lines.append("## Decision trail (compressed)")
    if raw_steps:
        # First 5 + last 3 step messages so the trail stays readable for long runs.
        head = raw_steps[:5]
        tail = raw_steps[-3:] if len(raw_steps) > 8 else []
        for r in head:
            msg = (r.get("message") or "").strip().replace("\n", " ")[:200]
            lines.append(f"- step {r.get('step')}: {msg}")
        if tail:
            lines.append("- ...")
            for r in tail:
                msg = (r.get("message") or "").strip().replace("\n", " ")[:200]
                lines.append(f"- step {r.get('step')}: {msg}")
    else:
        lines.append("_No raw thoughts captured (Browser-Use logger silent for this run)._")
    lines.append("")
    lines.append("## Takeaway")
    lines.append(f"> {_render_takeaway(status, failure_category, n_vendors)}")
    lines.append("")
    return "\n".join(lines)


def _render_thinking_raw(raw_steps: list[dict]) -> str:
    """Dump every captured Browser-Use Agent log record in order — full
    Eval/Memory/Goal/Action lines so the operator can replay the agent's
    reasoning verbatim when thinking.md isn't enough."""
    if not raw_steps:
        return "_Raw thoughts unavailable for this run — Browser-Use's logger emitted no records._\n"
    out: list[str] = []
    for r in raw_steps:
        ts = r.get("ts", "")
        step = r.get("step", "?")
        msg = r.get("message", "")
        out.append(f"## Step {step} — {ts}")
        out.append("")
        out.append("```")
        out.append(msg)
        out.append("```")
        out.append("")
    return "\n".join(out)


def _serialize_exhibitors(agent_result: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for exh in getattr(agent_result, "exhibitors", []) or []:
        try:
            if hasattr(exh, "model_dump"):
                out.append(exh.model_dump())
            elif hasattr(exh, "dict"):
                out.append(exh.dict())
            else:
                out.append({"name": getattr(exh, "name", str(exh))})
        except Exception:  # noqa: BLE001
            continue
    return out


async def archive_lesson(
    *,
    seed: Any,
    agent_result: Any,
    elapsed_s: float,
    raw_steps: list[dict],
    status: str,
    failure_category: str | None = None,
    failure_detail: str | None = None,
    archive_recordings: bool = True,
    lessons_dir: Path | None = None,
) -> Path | None:
    """Write a complete lesson dir for this run. Returns the dir path on
    success, None if archival itself fails (logged but non-fatal — the run
    succeeded/failed regardless of whether we wrote a lesson)."""
    if lessons_dir is None:
        from .config import get_agentic_settings

        lessons_dir = get_agentic_settings().lessons_dir

    archived_at = datetime.now(timezone.utc)
    domain = canonical_domain(seed.url) if getattr(seed, "url", None) else ""
    if not domain:
        domain = "unknown-domain"
    lesson_id = uuid.uuid4().hex[:6]
    date_part = archived_at.strftime("%Y-%m-%d")
    name_part = _slugify(seed.name, 30)
    domain_part = _slugify(domain, 40)

    if status == "success":
        bucket = "success"
        dir_name = f"{date_part}_{name_part}_{domain_part}__{lesson_id}"
    else:
        bucket = "failure"
        cat = failure_category or "empty_result"
        dir_name = f"{date_part}_{name_part}_{domain_part}__{cat}__{lesson_id}"

    lesson_dir = Path(lessons_dir) / bucket / dir_name
    try:
        await asyncio.to_thread(lesson_dir.mkdir, parents=True, exist_ok=True)
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.lesson_mkdir_failed", path=str(lesson_dir), error=str(e))
        return None

    # ---- thinking.md / thinking.raw.md ------------------------------------
    try:
        thinking_md = _render_thinking_md(
            seed=seed,
            agent_result=agent_result,
            elapsed_s=elapsed_s,
            raw_steps=raw_steps,
            status=status,
            failure_category=failure_category,
            failure_detail=failure_detail,
            domain=domain,
            archived_at=archived_at,
            lesson_id=lesson_id,
        )
        await asyncio.to_thread(
            (lesson_dir / "thinking.md").write_text, thinking_md, encoding="utf-8"
        )
        raw_md = _render_thinking_raw(raw_steps or [])
        await asyncio.to_thread(
            (lesson_dir / "thinking.raw.md").write_text, raw_md, encoding="utf-8"
        )
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.lesson_thinking_write_failed", error=str(e))

    # ---- meta.json --------------------------------------------------------
    try:
        meta: dict[str, Any] = {
            "lesson_id": lesson_id,
            "seed_name": seed.name,
            "expo_id": getattr(seed, "expo_id", None),
            "query": getattr(seed, "source_query", None),
            "mode": (
                "discovery" if "discovery" in (seed.tags or [])
                else "anchor" if "from_anchor" in (seed.tags or [])
                else "from_knowledge" if "from_knowledge" in (seed.tags or [])
                else "direct"
            ),
            "tags": list(seed.tags or []),
            "initial_url": seed.url,
            "final_url": getattr(agent_result, "final_url", None),
            "domain": domain,
            "elapsed_s": round(elapsed_s, 2),
            "n_vendors": len(getattr(agent_result, "exhibitors", []) or []),
            "n_steps": getattr(agent_result, "n_steps", None),
            "status": status,
            "failure_category": failure_category,
            "failure_detail": failure_detail,
            "bail_reason": getattr(agent_result, "bail_reason", None),
            "archived_at": archived_at.isoformat(),
        }
        await asyncio.to_thread(
            (lesson_dir / "meta.json").write_text,
            json.dumps(meta, indent=2, default=str),
            encoding="utf-8",
        )
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.lesson_meta_write_failed", error=str(e))

    # ---- result.json or failure_reason.json -------------------------------
    try:
        if status == "success":
            payload = {"exhibitors": _serialize_exhibitors(agent_result)}
            await asyncio.to_thread(
                (lesson_dir / "result.json").write_text,
                json.dumps(payload, indent=2, ensure_ascii=False, default=str),
                encoding="utf-8",
            )
        else:
            payload = {
                "category": failure_category,
                "detail": failure_detail,
                "raw_error": getattr(agent_result, "error", None),
                "raw_output_preview": (getattr(agent_result, "raw_output", None) or "")[:500],
            }
            await asyncio.to_thread(
                (lesson_dir / "failure_reason.json").write_text,
                json.dumps(payload, indent=2, default=str),
                encoding="utf-8",
            )
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.lesson_payload_write_failed", error=str(e))

    # ---- screenshots ------------------------------------------------------
    rec_dir = getattr(agent_result, "recordings_dir", None)
    if rec_dir and Path(rec_dir).exists():
        try:
            target = lesson_dir / "screenshots"
            # Move = recordings_dir disappears (disk-bounded by retention);
            # Copy = original retained for diagnostic tooling that scans it.
            if archive_recordings:
                await asyncio.to_thread(shutil.move, str(rec_dir), str(target))
            else:
                await asyncio.to_thread(
                    shutil.copytree, str(rec_dir), str(target), dirs_exist_ok=True
                )
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.lesson_screenshots_skipped", error=str(e)[:120])

    _log.info(
        "agentic.lesson_archived",
        path=str(lesson_dir),
        status=status,
        category=failure_category,
    )
    return lesson_dir


@dataclass
class FailureLesson:
    """One row read back from a `failure/*/meta.json` file. Lets the scheduler
    replay blacklist decisions on startup without re-running the failed seed."""

    lesson_dir: Path
    domain: str
    category: str
    archived_at: datetime
    expo_name: str


async def load_failure_lessons(
    lessons_dir: Path, lookback_days: int
) -> list[FailureLesson]:
    """Walk `failure/` and return all FailureLesson rows within lookback. Used
    by the scheduler at pass start to rebuild the blacklist after a wipe."""
    failure_root = Path(lessons_dir) / "failure"
    if not failure_root.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(0, lookback_days))
    out: list[FailureLesson] = []
    try:
        children = await asyncio.to_thread(list, failure_root.iterdir())
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.lessons_scan_failed", error=str(e))
        return []
    for child in children:
        if not child.is_dir():
            continue
        meta_path = child / "meta.json"
        if not meta_path.exists():
            continue
        try:
            raw = await asyncio.to_thread(meta_path.read_text, encoding="utf-8")
            meta = json.loads(raw)
        except Exception:  # noqa: BLE001
            continue
        archived_raw = meta.get("archived_at")
        try:
            archived_at = datetime.fromisoformat(str(archived_raw))
            if archived_at.tzinfo is None:
                archived_at = archived_at.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            continue
        if archived_at < cutoff:
            continue
        domain = (meta.get("domain") or "").strip()
        category = (meta.get("failure_category") or "").strip()
        if not domain or not category:
            continue
        out.append(
            FailureLesson(
                lesson_dir=child,
                domain=domain,
                category=category,
                archived_at=archived_at,
                expo_name=str(meta.get("seed_name") or ""),
            )
        )
    return out


async def render_listing_past_attempts(
    lessons_dir: Path,
    seed_name: str,
    *,
    max_n: int = 3,
    lookback_days: int = 14,
) -> str:
    """Build a compact "PAST ATTEMPTS" block for the Browser Use prompt.

    Walks `failure/`, filters by exact seed_name match (case-insensitive),
    returns the N most recent failed attempts formatted as one line each.
    Empty string when no usable history exists, so the caller can just
    concatenate it without guarding.

    Why
    ---
    Without this, the agent repeats the same dead URL/selector combo every
    scheduler pass and burns 18 vision steps on a known-empty page. With it,
    the agent gets "you already tried X and got Y, pick a different angle"
    embedded in the system prompt.
    """
    if not seed_name or max_n <= 0:
        return ""
    failure_root = Path(lessons_dir) / "failure"
    if not failure_root.exists():
        return ""
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, lookback_days))
    try:
        children = await asyncio.to_thread(list, failure_root.iterdir())
    except Exception:  # noqa: BLE001
        return ""

    name_norm = seed_name.strip().lower()
    rows: list[tuple[datetime, dict[str, Any]]] = []
    for child in children:
        if not child.is_dir():
            continue
        meta_path = child / "meta.json"
        if not meta_path.exists():
            continue
        try:
            raw = await asyncio.to_thread(meta_path.read_text, encoding="utf-8")
            meta = json.loads(raw)
        except Exception:  # noqa: BLE001
            continue
        if (meta.get("seed_name") or "").strip().lower() != name_norm:
            continue
        archived_raw = meta.get("archived_at")
        try:
            archived_at = datetime.fromisoformat(str(archived_raw))
            if archived_at.tzinfo is None:
                archived_at = archived_at.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            continue
        if archived_at < cutoff:
            continue
        rows.append((archived_at, meta))

    if not rows:
        return ""
    rows.sort(key=lambda r: r[0], reverse=True)
    rows = rows[:max_n]

    lines: list[str] = [
        f"PAST ATTEMPTS for this seed (last {len(rows)} failures, avoid repeating):"
    ]
    for _, meta in rows:
        url = (meta.get("final_url") or meta.get("initial_url") or "?")[:120]
        bail = (meta.get("bail_reason") or meta.get("failure_category") or "unknown")[:40]
        n_v = meta.get("n_vendors") or 0
        detail = (meta.get("failure_detail") or "")[:60]
        line = f"  tried {url} -> bail={bail} vendors={n_v}"
        if detail:
            line += f" detail={detail}"
        lines.append(line)
    lines.append(
        "Pick a different sub-path or selector strategy. Do NOT re-open the URLs above."
    )
    return "\n".join(lines)


async def prune_old_lessons(lessons_dir: Path, retention_days: int) -> int:
    """Delete lesson dirs whose meta.json.archived_at is older than retention.
    Returns count pruned. Bounded disk under N seeds * passes for O(retention)
    growth instead of O(forever)."""
    root = Path(lessons_dir)
    if not root.exists() or retention_days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    pruned = 0
    for bucket in ("success", "failure"):
        bucket_dir = root / bucket
        if not bucket_dir.exists():
            continue
        try:
            children = await asyncio.to_thread(list, bucket_dir.iterdir())
        except Exception:  # noqa: BLE001
            continue
        for child in children:
            if not child.is_dir():
                continue
            meta_path = child / "meta.json"
            archived_at: datetime | None = None
            if meta_path.exists():
                try:
                    raw = await asyncio.to_thread(meta_path.read_text, encoding="utf-8")
                    meta = json.loads(raw)
                    archived_raw = meta.get("archived_at")
                    archived_at = datetime.fromisoformat(str(archived_raw))
                    if archived_at.tzinfo is None:
                        archived_at = archived_at.replace(tzinfo=timezone.utc)
                except Exception:  # noqa: BLE001
                    archived_at = None
            if archived_at is None:
                # Fall back to the dir's mtime so orphaned (no meta.json)
                # lessons still get pruned at the boundary.
                try:
                    mtime = child.stat().st_mtime
                    archived_at = datetime.fromtimestamp(mtime, tz=timezone.utc)
                except Exception:  # noqa: BLE001
                    continue
            if archived_at < cutoff:
                try:
                    await asyncio.to_thread(shutil.rmtree, str(child))
                    pruned += 1
                except Exception as e:  # noqa: BLE001
                    _log.debug("agentic.lesson_prune_failed", path=str(child), error=str(e))
    if pruned:
        _log.info("agentic.lessons_pruned", count=pruned, retention_days=retention_days)
    return pruned
