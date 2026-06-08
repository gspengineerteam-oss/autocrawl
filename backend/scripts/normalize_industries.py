"""Backfill the industries whitelist normalizer over existing vendors.

Snowglobe 2026-05-25 (Tier 2 sweep): existing 28k rows carry raw LLM/imported
industries tags that we no longer trust. This script rewrites each vendor's
`industries` column to the canonical-only subset via
`industries_normalizer.normalize_industries()`.

Idempotent — re-running on already-clean rows is a no-op (only writes when
the canonical set differs from current).

Usage:
    python backend/scripts/normalize_industries.py --dry-run
    python backend/scripts/normalize_industries.py
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent))

from sqlalchemy import func, select  # noqa: E402

from crawler.db.engine import get_sessionmaker  # noqa: E402
from crawler.db.models import VendorORM  # noqa: E402

from agentic_crawler.industries_normalizer import normalize_industries  # noqa: E402


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
    stats = {
        "scanned": 0,
        "would_change": 0,
        "empty_before": 0,
        "empty_after": 0,
        "shrunk_to_zero": 0,
        "total_rows": 0,
    }
    async with sm() as session:
        total = (await session.execute(select(func.count()).select_from(VendorORM))).scalar_one() or 0
        stats["total_rows"] = int(total)
        async for orm in _iter_vendors(session):
            stats["scanned"] += 1
            current = list(orm.industries or [])
            if not current:
                stats["empty_before"] += 1
            normalized = normalize_industries(current)
            if not normalized:
                stats["empty_after"] += 1
            if list(current) != normalized:
                stats["would_change"] += 1
                if current and not normalized:
                    stats["shrunk_to_zero"] += 1
                if not dry_run:
                    orm.industries = normalized
        if not dry_run:
            await session.commit()
    return stats


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Normalize vendor industries against whitelist.")
    p.add_argument("--dry-run", action="store_true", help="report only, no writes")
    args = p.parse_args(argv)
    stats = asyncio.run(run(dry_run=args.dry_run))
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] industries normalize stats:")
    for k, v in stats.items():
        print(f"  {k:>18}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
