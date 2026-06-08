"""Re-probe catalog signals against the upgraded catalog_finder.

Snowglobe 2026-05-25 (Tier 3): legacy `catalog_count` was set via bare-200
HEAD probe — lipstick shops with `/products` route would qualify. The new
`catalog_finder.discover()` fetches body and requires real catalog signals
(product cards, ≥3 prices, ≥2 SKUs, or named PDF link).

This script:
  1. Resets `catalog_count` and `catalog_refs` for every vendor.
  2. Re-probes vendors with `has_website=True` (skip the rest — no website,
     no catalog).
  3. Persists fresh counts.

Idempotent. Safe to re-run. Concurrent probes capped via asyncio.Semaphore.

Usage:
    python backend/scripts/revalidate_catalogs.py --dry-run
    python backend/scripts/revalidate_catalogs.py --limit 100
    python backend/scripts/revalidate_catalogs.py --concurrency 16
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent))

from sqlalchemy import func, select, text  # noqa: E402

from crawler.db.engine import get_sessionmaker  # noqa: E402
from crawler.db.models import VendorORM  # noqa: E402

from tools.skills import catalog_finder  # noqa: E402


async def reset_all(session) -> int:
    res = await session.execute(text(
        "UPDATE vendors SET catalog_count = 0, catalog_refs = '[]'::jsonb "
        "WHERE catalog_count > 0 OR jsonb_array_length(catalog_refs) > 0"
    ))
    await session.commit()
    return int(res.rowcount or 0)


async def _probe_one(vendor_id: str, domain: str) -> tuple[str, list[dict], int]:
    # catalog_finder.discover is sync (httpx.Client). Run in thread to avoid
    # blocking the event loop with parallel network calls.
    def _go() -> tuple[list[dict], int]:
        result = catalog_finder.discover(domain)
        refs = [r.to_dict() for r in result.refs]
        return refs, result.catalog_count
    refs, count = await asyncio.to_thread(_go)
    return vendor_id, refs, count


async def run(*, dry_run: bool, limit: int, concurrency: int, categories: list[str] | None = None) -> dict:
    sm = get_sessionmaker()
    stats: dict = {
        "scanned": 0,
        "probed": 0,
        "with_catalog": 0,
        "without_catalog": 0,
        "errors": 0,
        "total_candidates": 0,
        "filter_categories": [],
    }

    if not dry_run:
        async with sm() as session:
            cleared = await reset_all(session)
            print(f"reset catalog_count=0/catalog_refs=[] on {cleared} rows")

    async with sm() as session:
        # Only re-probe vendors with a real website AND visible (not hidden
        # off_scope — no point probing catalogs we'll hide anyway).
        if categories:
            # JSONB ?| against text[] literal. Categories are operator-supplied
            # but limited to YAML-defined slugs (alphanumeric + underscore), so
            # we sanitize then inline as ARRAY[...] to dodge asyncpg's text[]
            # parameter encoding quirks.
            import re as _re
            safe = [c for c in categories if _re.fullmatch(r"[a-z0-9_]+", c)]
            if not safe:
                rows = []
            else:
                arr_lit = "ARRAY[" + ",".join(f"'{c}'" for c in safe) + "]"
                sql = text(f"""
                    SELECT vendor_id, domain FROM vendors
                    WHERE has_website = TRUE
                      AND hidden = FALSE
                      AND military_categories ?| {arr_lit}
                      {("LIMIT :lim" if limit > 0 else "")}
                """)
                params: dict = {}
                if limit > 0:
                    params["lim"] = limit
                rows = (await session.execute(sql, params)).all()
        else:
            stmt = select(VendorORM.vendor_id, VendorORM.domain).where(
                VendorORM.has_website == True,  # noqa: E712
                VendorORM.hidden == False,      # noqa: E712
            )
            if limit > 0:
                stmt = stmt.limit(limit)
            rows = (await session.execute(stmt)).all()
        stats["total_candidates"] = len(rows)
        stats["filter_categories"] = list(categories or [])

    if not rows:
        return stats

    sem = asyncio.Semaphore(max(1, concurrency))

    async def _bounded(vid: str, dom: str):
        async with sem:
            try:
                return await _probe_one(vid, dom)
            except Exception as e:  # noqa: BLE001
                print(f"[error] {vid} {dom}: {str(e)[:120]}", file=sys.stderr)
                stats["errors"] += 1
                return vid, [], 0

    tasks = [_bounded(str(vid), dom) for vid, dom in rows if dom]
    chunk = 100
    results: list[tuple[str, list[dict], int]] = []
    for i in range(0, len(tasks), chunk):
        batch = tasks[i : i + chunk]
        out = await asyncio.gather(*batch)
        results.extend(out)
        stats["probed"] += len(out)
        print(f"probed {stats['probed']}/{len(tasks)}")

    if not dry_run:
        async with sm() as session:
            for vid, refs, count in results:
                stats["scanned"] += 1
                if count > 0:
                    stats["with_catalog"] += 1
                else:
                    stats["without_catalog"] += 1
                if not refs and count == 0:
                    # No change vs reset — skip update.
                    continue
                await session.execute(
                    text(
                        "UPDATE vendors SET catalog_refs = CAST(:refs AS jsonb), "
                        "catalog_count = :count WHERE vendor_id = :vid"
                    ),
                    {"refs": __import__("json").dumps(refs), "count": count, "vid": vid},
                )
            await session.commit()
    else:
        for _, refs, count in results:
            stats["scanned"] += 1
            if count > 0:
                stats["with_catalog"] += 1
            else:
                stats["without_catalog"] += 1

    return stats


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Revalidate vendor catalogs with content sniff.")
    p.add_argument("--dry-run", action="store_true", help="report only, no writes")
    p.add_argument("--limit", type=int, default=0, help="cap total vendors probed (0=no cap)")
    p.add_argument("--concurrency", type=int, default=12, help="max parallel HTTP probes")
    p.add_argument(
        "--categories",
        type=str,
        default="",
        help="Comma-separated military_categories filter (e.g. 'weapons,missiles_rockets,c4isr_electronics'). Empty = all visible.",
    )
    args = p.parse_args(argv)
    cats = [c.strip() for c in (args.categories or "").split(",") if c.strip()]
    stats = asyncio.run(run(dry_run=args.dry_run, limit=args.limit, concurrency=args.concurrency, categories=cats))
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] catalog revalidate stats:")
    for k, v in stats.items():
        print(f"  {k:>18}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
