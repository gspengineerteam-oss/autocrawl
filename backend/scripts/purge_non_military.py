"""Soft-purge existing non-military vendors.

Snowglobe reset (2026-05-25, rule 2/3/4): classify every vendor against the
military taxonomy in `tools/taxonomies/military.yaml`. Vendors that don't
match get `hidden=True`, `hidden_reason='off_scope'`. Vendors that do match
get `is_military_scope=True`, `military_categories=[...]`, `scope_match_score`
populated. Soft purge only — nothing is deleted.

Idempotent: re-running on the same DB only changes rows whose classification
diverges from current state.

Usage:
    python backend/scripts/purge_non_military.py --dry-run
    python backend/scripts/purge_non_military.py            # commit changes
    python backend/scripts/purge_non_military.py --reset    # clear hidden=off_scope first
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent))  # so `tools` import works

from sqlalchemy import func, select, update  # noqa: E402

from crawler.db.engine import get_sessionmaker  # noqa: E402
from crawler.db.models import VendorORM  # noqa: E402
from tools.skills import military_classifier  # noqa: E402


def _vendor_haystack(orm: VendorORM) -> str:
    parts: list[str] = []
    for attr in ("company_name", "tagline", "description", "focus_summary"):
        val = getattr(orm, attr, None)
        if val:
            parts.append(str(val))
    for attr in ("products", "industries", "domain_of_interest", "tech_stack"):
        val = getattr(orm, attr, None) or []
        if isinstance(val, list):
            parts.extend(str(x) for x in val if x)
    pd = getattr(orm, "products_detailed", None) or []
    if isinstance(pd, list):
        for p in pd:
            if isinstance(p, dict):
                if p.get("name"):
                    parts.append(str(p["name"]))
                if p.get("summary"):
                    parts.append(str(p["summary"]))
    return " | ".join(parts)


async def _reset_off_scope_flags() -> int:
    sm = get_sessionmaker()
    async with sm() as session:
        stmt = (
            update(VendorORM)
            .where(VendorORM.hidden_reason == "off_scope")
            .values(hidden=False, hidden_reason=None)
        )
        res = await session.execute(stmt)
        await session.commit()
        return int(res.rowcount or 0)


async def _iter_vendors(session, batch: int = 500):
    offset = 0
    while True:
        stmt = select(VendorORM).order_by(VendorORM.vendor_id).offset(offset).limit(batch)
        rows = (await session.execute(stmt)).scalars().all()
        if not rows:
            return
        for r in rows:
            yield r
        offset += len(rows)


async def run(*, dry_run: bool) -> dict:
    sm = get_sessionmaker()
    now = datetime.now(timezone.utc)
    stats = {
        "scanned": 0,
        "newly_hidden": 0,
        "newly_unhidden": 0,
        "scope_unchanged": 0,
        "no_text": 0,
        "would_change": 0,
    }
    async with sm() as session:
        total_q = await session.execute(select(func.count()).select_from(VendorORM))
        stats["total_rows"] = int(total_q.scalar_one() or 0)
        async for orm in _iter_vendors(session):
            stats["scanned"] += 1
            text = _vendor_haystack(orm)
            if not text.strip():
                stats["no_text"] += 1
                continue
            cls = military_classifier.classify(text)
            new_hidden = not cls.is_military
            new_reason = "off_scope" if new_hidden else (
                None if (orm.hidden_reason == "off_scope") else orm.hidden_reason
            )
            changed = (
                bool(orm.hidden) != new_hidden
                or (orm.hidden_reason or None) != new_reason
                or bool(orm.is_military_scope) != cls.is_military
                or abs(float(orm.scope_match_score or 0.0) - float(cls.score)) > 1e-4
                or list(orm.military_categories or []) != list(cls.matched_categories)
            )
            if not changed:
                stats["scope_unchanged"] += 1
                continue
            stats["would_change"] += 1
            if cls.is_military and orm.hidden and (orm.hidden_reason in (None, "off_scope")):
                stats["newly_unhidden"] += 1
            if (not cls.is_military) and (not orm.hidden):
                stats["newly_hidden"] += 1
            if not dry_run:
                orm.hidden = new_hidden
                orm.hidden_reason = new_reason
                orm.is_military_scope = bool(cls.is_military)
                orm.military_categories = list(cls.matched_categories)
                orm.scope_match_score = float(cls.score)
                orm.classified_at = now
        if not dry_run:
            await session.commit()
    return stats


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Soft purge non-military vendors.")
    p.add_argument("--dry-run", action="store_true", help="report only, no writes")
    p.add_argument(
        "--reset",
        action="store_true",
        help="clear hidden=off_scope flag before reclassifying",
    )
    args = p.parse_args(argv)

    if args.reset:
        cleared = asyncio.run(_reset_off_scope_flags())
        print(f"reset off_scope flag on {cleared} rows")

    stats = asyncio.run(run(dry_run=args.dry_run))
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] military soft-purge stats:")
    for k, v in stats.items():
        print(f"  {k:>18}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
