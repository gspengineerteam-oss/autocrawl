"""Bulk-enqueue vendors from Postgres into the agentic enrich stream.

After the ChatGPT bulk import (13k vendor in DB but mostly unenriched), we
need to feed those vendors into `agentic:enrich:queue` so the parallel enrich
workers actually process them.

Order: bottom-up by first_enriched_at DESC. Rationale (user request 2026-05-21):
the most recently added vendors (which came from the ChatGPT import) should
be enriched first because they're the freshest pool we want to bring online
quickly. Pre-existing vendors that have been in the DB longer can wait.

Default selection criteria:
- status='unresolved' (no domain yet, needs resolve hop)
- status='enriched' with non-empty enrichment_gap (has domain but missing
  contacts/socials/products — gap fill via Jina or grounded extract)

Usage from inside autocrawl-crawler container:
    python /app/scripts/seed_enrich_from_db.py --limit 1000
    python /app/scripts/seed_enrich_from_db.py --status unresolved --limit 9999
    python /app/scripts/seed_enrich_from_db.py --gap-only --limit 500
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import desc, select  # noqa: E402

from agentic_crawler.enrich_queue import EnrichTask, make_task_id, publish  # noqa: E402
from crawler.db.models import VendorORM  # noqa: E402
from crawler.db.session import get_session  # noqa: E402


async def fetch_targets(
    *,
    limit: int,
    status_filter: str | None,
    gap_only: bool,
    skip_source_tag: str | None = None,
) -> list[VendorORM]:
    """Pull vendor rows for enqueueing. Bottom-up = newest first_enriched_at."""
    async with get_session() as session:
        stmt = select(VendorORM)
        if status_filter:
            stmt = stmt.where(VendorORM.status == status_filter)
        if gap_only:
            from sqlalchemy import func

            stmt = stmt.where(func.jsonb_array_length(VendorORM.enrichment_gap) > 0)
        stmt = stmt.order_by(desc(VendorORM.first_enriched_at)).limit(limit)
        rows = list((await session.execute(stmt)).scalars().all())
        if skip_source_tag:
            rows = [
                v for v in rows
                if skip_source_tag not in (v.source_tags or [])
            ]
        return rows


def vendor_to_task(v: VendorORM) -> EnrichTask:
    # Find best expo association (first one for now)
    expo_id = ""
    if v.expos_seen:
        expo_id = v.expos_seen[0]
    # Country hint from address country if available
    country = None
    if isinstance(v.address, dict):
        country = v.address.get("country")
    elif v.registrar_country:
        country = v.registrar_country
    # Product hint
    product = None
    if v.products:
        product = ", ".join(v.products[:3])
    elif v.description:
        product = v.description[:200]
    hint_url = v.canonical_url or (f"https://{v.domain}" if v.domain else None)
    return EnrichTask(
        task_id=make_task_id(v.company_name, expo_id),
        vendor_name=v.company_name,
        hint_url=hint_url,
        expo_id=expo_id or f"reseed-{v.vendor_id[:8]}",
        country_hint=country,
        product_hint=product,
        source_query="bulk_reseed_2026_05_21",
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk enqueue vendors into enrich queue")
    parser.add_argument("--limit", type=int, default=500, help="Max vendors to enqueue")
    parser.add_argument(
        "--status",
        choices=["unresolved", "enriched", "enrich_failed", "any"],
        default="unresolved",
        help="Filter by vendor status; 'any' = no filter",
    )
    parser.add_argument(
        "--gap-only", action="store_true",
        help="Only enqueue vendors with non-empty enrichment_gap",
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't actually publish")
    parser.add_argument(
        "--source-tag-only",
        default=None,
        help="Only enqueue vendors whose source_tags contains this value (e.g. 'source:chatgpt_database')",
    )
    args = parser.parse_args()

    status = None if args.status == "any" else args.status
    rows = await fetch_targets(
        limit=args.limit,
        status_filter=status,
        gap_only=args.gap_only,
    )

    if args.source_tag_only:
        rows = [
            r for r in rows
            if args.source_tag_only in (r.source_tags or [])
        ]

    print(f"Fetched {len(rows)} vendors (status={args.status}, gap_only={args.gap_only}, source_filter={args.source_tag_only})")
    if not rows:
        print("Nothing to enqueue.")
        return

    print("Sample (top 5):")
    for v in rows[:5]:
        print(f"  - {v.company_name[:60]} | domain={v.domain or '-'} | status={v.status} | first_enriched={v.first_enriched_at.isoformat()}")

    if args.dry_run:
        print(f"DRY RUN: would enqueue {len(rows)} tasks")
        return

    published = 0
    failed = 0
    for v in rows:
        try:
            task = vendor_to_task(v)
            entry_id = await publish(task)
            if entry_id:
                published += 1
            else:
                failed += 1
            if published % 100 == 0 and published > 0:
                print(f"PROGRESS {published}/{len(rows)} published")
        except Exception as e:  # noqa: BLE001
            failed += 1
            if failed < 10:
                print(f"FAIL {v.company_name[:60]}: {str(e)[:160]}")

    print(f"\nDONE published={published} failed={failed} total={len(rows)}")


if __name__ == "__main__":
    asyncio.run(main())
