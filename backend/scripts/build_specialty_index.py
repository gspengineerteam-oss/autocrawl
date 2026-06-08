"""Bulk-build the vendor specialty Chroma index from existing Postgres rows.

Reads all vendors with at least one of products/industries/description, embeds
the specialty document, and upserts into the `vendor_specialty` Chroma
collection in batches.

Usage from inside autocrawl-crawler container:
    python /app/scripts/build_specialty_index.py
    python /app/scripts/build_specialty_index.py --limit 1000 --batch 50
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import or_, select  # noqa: E402

from crawler.db.models import VendorORM  # noqa: E402
from crawler.db.session import get_session  # noqa: E402
from crawler.store.specialty_index import add_many_specialties  # noqa: E402


def vendor_to_item(v: VendorORM) -> dict | None:
    products = v.products or []
    industries = v.industries or []
    desc = (v.description or "").strip()
    if not products and not industries and not desc:
        return None
    country = None
    if isinstance(v.address, dict):
        country = v.address.get("country")
    elif v.registrar_country:
        country = v.registrar_country
    return {
        "vendor_id": v.vendor_id,
        "company_name": v.company_name,
        "domain": v.domain or "",
        "products": products,
        "industries": industries,
        "description": desc,
        "domain_of_interest": getattr(v, "domain_of_interest", []) or [],
        "country": country or "",
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description="Build specialty Chroma index")
    parser.add_argument("--limit", type=int, default=0, help="0 = no limit")
    parser.add_argument("--batch", type=int, default=100, help="Batch size per Chroma upsert")
    parser.add_argument("--status", default="any", choices=["any", "enriched", "unresolved"])
    args = parser.parse_args()

    async with get_session() as session:
        stmt = select(VendorORM)
        if args.status != "any":
            stmt = stmt.where(VendorORM.status == args.status)
        if args.limit:
            stmt = stmt.limit(args.limit)
        rows = list((await session.execute(stmt)).scalars().all())

    print(f"Fetched {len(rows)} vendor rows (status={args.status}, limit={args.limit})")

    items: list[dict] = []
    skipped = 0
    for v in rows:
        it = vendor_to_item(v)
        if it is None:
            skipped += 1
            continue
        items.append(it)

    print(f"Built {len(items)} indexable items (skipped {skipped} with no signal)")

    written = 0
    failed = 0
    for i in range(0, len(items), args.batch):
        chunk = items[i:i + args.batch]
        try:
            n = await add_many_specialties(chunk)
            written += n
            print(f"PROGRESS {min(i + args.batch, len(items))}/{len(items)} written")
        except Exception as e:  # noqa: BLE001
            failed += len(chunk)
            print(f"BATCH_FAIL i={i} size={len(chunk)}: {str(e)[:160]}")

    print(f"\nDONE written={written} failed={failed} total_attempted={len(items)}")


if __name__ == "__main__":
    asyncio.run(main())
