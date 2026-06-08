"""Snowglobe Phase 2 — one-shot backfill of `enrichment_completeness` on
currently-visible vendors.

After 0044_enrichment_completeness.sql ships, the new column defaults to 0.0
for every existing row. New enrich passes will populate it organically via
`scope_gate.apply_scope_and_signals()`, but in the meantime the frontend will
show every visible vendor at "Data 0%" — including known military primes that
should sit at 60-90%. This script reads each visible row, runs the same
deterministic `compute_enrichment_completeness()` formula against the stored
fields, and writes the result back.

Pure DB read-then-write — no scraping, no LLM calls. Safe to re-run.

Usage:
    python backend/scripts/backfill_enrichment_completeness.py --dry-run
    python backend/scripts/backfill_enrichment_completeness.py --batch 500
    python backend/scripts/backfill_enrichment_completeness.py --include-hidden
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import select, text  # noqa: E402

from agentic_crawler.scope_gate import compute_enrichment_completeness  # noqa: E402
from crawler.db.models import VendorORM  # noqa: E402
from crawler.db.repositories.vendor_repo import orm_to_dict  # noqa: E402
from crawler.db.session import get_session  # noqa: E402
from crawler.schemas import Vendor  # noqa: E402


def _hydrate(orm: VendorORM) -> Vendor | None:
    try:
        d = orm_to_dict(orm)
        # orm_to_dict serializes datetimes/urls to strings/iso — Vendor accepts
        # both. AnyHttpUrl will reject malformed values; in that case drop the
        # row from the backfill (its old completeness stays at column default).
        return Vendor(**d)
    except Exception:  # noqa: BLE001
        return None


async def run(*, dry_run: bool, batch: int, include_hidden: bool, limit: int) -> dict[str, int]:
    stats = {"scanned": 0, "updated": 0, "skipped_invalid": 0, "unchanged": 0}

    async with get_session() as session:
        stmt = select(VendorORM)
        if not include_hidden:
            stmt = stmt.where(VendorORM.hidden == False)  # noqa: E712
        # Stable order so re-runs hit the same prefix when --limit is small.
        stmt = stmt.order_by(VendorORM.vendor_id.asc())
        if limit > 0:
            stmt = stmt.limit(limit)
        rows: list[VendorORM] = list((await session.execute(stmt)).scalars().all())

    print(f"[backfill] candidates: {len(rows)} (include_hidden={include_hidden}, limit={limit or 'no cap'})")
    if not rows:
        return stats

    # Compute first (no session held), then write in batches.
    updates: list[tuple[str, float]] = []
    for orm in rows:
        stats["scanned"] += 1
        v = _hydrate(orm)
        if v is None:
            stats["skipped_invalid"] += 1
            continue
        new_score = compute_enrichment_completeness(v)
        old_score = float(getattr(orm, "enrichment_completeness", 0.0) or 0.0)
        if abs(new_score - old_score) < 1e-4:
            stats["unchanged"] += 1
            continue
        updates.append((orm.vendor_id, new_score))

    print(f"[backfill] computed: {len(updates)} rows need update, {stats['unchanged']} unchanged, {stats['skipped_invalid']} invalid")

    if dry_run:
        # Show a representative sample so the operator can sanity-check the
        # formula before committing 20K writes.
        for vid, score in updates[:10]:
            print(f"  would set {vid} -> {score:.3f}")
        if len(updates) > 10:
            print(f"  ... + {len(updates) - 10} more")
        print("[DRY RUN] no writes performed.")
        return stats

    # Write in batched UPDATEs. UNNEST keeps the parameter count low and lets
    # postgres do the join itself.
    update_sql = text(
        """
        UPDATE vendors AS v
           SET enrichment_completeness = u.score
          FROM (SELECT UNNEST(CAST(:ids AS uuid[])) AS vid,
                       UNNEST(CAST(:scores AS double precision[])) AS score) u
         WHERE v.vendor_id::uuid = u.vid
        """
    )

    async with get_session() as session:
        for i in range(0, len(updates), batch):
            chunk = updates[i : i + batch]
            ids = [vid for vid, _ in chunk]
            scores = [s for _, s in chunk]
            try:
                await session.execute(update_sql, {"ids": ids, "scores": scores})
                await session.commit()
            except Exception as e:  # noqa: BLE001
                # Fallback: per-row UPDATEs if uuid[] cast misbehaves (vendor_id
                # is stored as String(36) — array cast may need adjustment per
                # postgres version).
                await session.rollback()
                if i == 0:
                    print(f"[backfill] batched cast failed ({str(e)[:120]}); falling back to per-row")
                for vid, score in chunk:
                    await session.execute(
                        text("UPDATE vendors SET enrichment_completeness = :s WHERE vendor_id = :v"),
                        {"s": score, "v": vid},
                    )
                await session.commit()
            stats["updated"] += len(chunk)
            print(f"  written: {stats['updated']}/{len(updates)}")

    return stats


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="Compute only; show sample; no writes")
    p.add_argument("--batch", type=int, default=500, help="Rows per UPDATE batch (default 500)")
    p.add_argument("--include-hidden", action="store_true",
                   help="Also backfill hidden vendors (off by default — they'll re-compute on next enrich)")
    p.add_argument("--limit", type=int, default=0, help="Cap total rows scanned (0 = no cap)")
    args = p.parse_args()

    stats = asyncio.run(run(
        dry_run=args.dry_run,
        batch=args.batch,
        include_hidden=args.include_hidden,
        limit=args.limit,
    ))
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"\n[{mode}] backfill_enrichment_completeness:")
    for k, v in stats.items():
        print(f"  {k:>18}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
