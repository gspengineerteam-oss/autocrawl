"""Snowglobe Phase 2 — bring-back wave for the hidden ChatGPT-imported pool.

Background:
The earlier purge soft-hid ~22-25K vendors with `hidden=True, hidden_reason='off_scope'`
(see backend/scripts/purge_non_military.py and 0043_military_scope.sql). Many were
hidden because the classifier ran on seed-only data — no website was ever scraped,
so `industries + products + description` were blank and the keyword classifier
correctly demoted them. With Snowglobe Phase 2 we now have:
  - vision-agent re-enrichment available via `force_vision=True` on EnrichTask
  - thin-data demotion in scope_gate (off_scope_thin_data) that prevents the
    same false positive recurring after re-enrichment

This script does two things in a single staged run:
  1. Restore the hidden rows (UPDATE: hidden=False, classified_at=NULL, ...)
  2. Publish each restored vendor to `agentic:enrich:queue` with force_vision=True
     so the consumer pool routes them straight to the warm qwen3-vl vision agent
     instead of the static/Jina fast-path that produced the original misclassify.

Idempotency: the worker's per-task claim key (enrich:task:<id>:claim) makes
duplicate publishes no-ops. Safe to re-run.

Usage:
    python backend/scripts/restore_hidden_for_reenrich.py --dry-run
    python backend/scripts/restore_hidden_for_reenrich.py --limit 1000 --qps 2
    python backend/scripts/restore_hidden_for_reenrich.py --reason off_scope_thin_data
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import text  # noqa: E402

from agentic_crawler.enrich_queue import EnrichTask, make_task_id, publish  # noqa: E402
from crawler.db.session import get_session  # noqa: E402


_RESTORE_SQL = """
    WITH picked AS (
        SELECT vendor_id
          FROM vendors
         WHERE hidden_reason = :reason
           {url_clause}
         ORDER BY first_enriched_at DESC
         {limit_clause}
    )
    UPDATE vendors v
       SET hidden = FALSE,
           hidden_reason = NULL,
           classified_at = NULL,
           is_military_scope = FALSE,
           scope_match_score = 0.0,
           enrichment_completeness = 0.0,
           military_categories = '[]'::jsonb
      FROM picked p
     WHERE v.vendor_id = p.vendor_id
    RETURNING v.vendor_id, v.company_name, v.canonical_url, v.domain, v.expos_seen, v.address, v.products
"""


def _build_task_for_row(row) -> EnrichTask | None:
    """Translate one restored row (RowMapping) into an EnrichTask with force_vision=True."""
    vendor_id = row["vendor_id"]
    company_name = row["company_name"]
    canonical_url = row["canonical_url"]
    domain = row["domain"]
    expos_seen = row["expos_seen"]
    address = row["address"]
    products = row["products"]

    if not company_name:
        return None
    hint_url = canonical_url or (f"https://{domain}" if domain else None)
    if not hint_url:
        return None

    expo_id = ""
    if isinstance(expos_seen, list) and expos_seen:
        expo_id = str(expos_seen[0])
    if not expo_id:
        expo_id = f"restore-{str(vendor_id)[:8]}"

    country_hint: str | None = None
    if isinstance(address, dict):
        country_hint = address.get("country")

    product_hint: str | None = None
    if isinstance(products, list) and products:
        product_hint = ", ".join(str(p) for p in products[:3])

    return EnrichTask(
        task_id=make_task_id(str(company_name), expo_id),
        vendor_name=str(company_name),
        hint_url=hint_url,
        expo_id=expo_id,
        country_hint=country_hint,
        product_hint=product_hint,
        source_query="snowglobe_phase2_restore",
        force_vision=True,
    )


_PUBLISH_ONLY_SQL = """
    SELECT vendor_id, company_name, canonical_url, domain, expos_seen, address, products
      FROM vendors
     WHERE hidden = FALSE
       AND classified_at IS NULL
       {url_clause}
     ORDER BY first_enriched_at DESC
     {limit_clause}
"""


async def restore_and_enqueue(
    *,
    reason: str,
    limit: int,
    require_url: bool,
    qps: float,
    dry_run: bool,
    publish_only: bool = False,
) -> dict[str, int]:
    stats = {"matched": 0, "restored": 0, "published": 0, "publish_failed": 0, "skipped_no_url": 0}

    url_clause = "AND (canonical_url IS NOT NULL OR has_website = TRUE)" if require_url else ""
    limit_clause = f"LIMIT {int(limit)}" if limit > 0 else ""
    sql = text(
        (_PUBLISH_ONLY_SQL if publish_only else _RESTORE_SQL).format(
            url_clause=url_clause, limit_clause=limit_clause
        )
    )

    if dry_run:
        # Read-only count using the same predicate as the UPDATE / SELECT.
        if publish_only:
            count_sql = text(
                f"""
                SELECT COUNT(*) FROM vendors
                 WHERE hidden = FALSE
                   AND classified_at IS NULL
                   {url_clause}
                """
            )
            params: dict = {}
        else:
            count_sql = text(
                f"""
                SELECT COUNT(*) FROM vendors
                 WHERE hidden_reason = :reason
                   {url_clause}
                """
            )
            params = {"reason": reason}
        async with get_session() as session:
            cnt = (await session.execute(count_sql, params)).scalar_one()
            stats["matched"] = int(cnt)
        mode = "publish (catch-up)" if publish_only else "restore + enqueue"
        print(f"[DRY RUN] would {mode} {stats['matched']} rows "
              f"(reason={reason}, require_url={require_url}, limit={limit or 'no cap'})")
        return stats

    # Live: UPDATE returns the restored rows so we can build EnrichTasks
    # without a second SELECT. In publish-only mode the SELECT just hands
    # back already-restored rows that haven't been re-classified yet.
    rows: list = []
    async with get_session() as session:
        bind_params: dict = {} if publish_only else {"reason": reason}
        result = await session.execute(sql, bind_params)
        rows = list(result.mappings().all())
        if not publish_only:
            await session.commit()
    stats["matched"] = len(rows)
    stats["restored"] = 0 if publish_only else len(rows)
    label = "selected for publish-only" if publish_only else "flipped hidden=FALSE"
    print(f"[restore] {label}: {len(rows)} rows")

    # Publish loop with QPS throttle.
    sleep_per = (1.0 / qps) if qps > 0 else 0.0
    t0 = time.monotonic()
    for i, row in enumerate(rows):
        task = _build_task_for_row(row)
        if task is None:
            stats["skipped_no_url"] += 1
            continue
        try:
            entry_id = await publish(task)
            if entry_id:
                stats["published"] += 1
            else:
                stats["publish_failed"] += 1
        except Exception as e:  # noqa: BLE001
            stats["publish_failed"] += 1
            if stats["publish_failed"] <= 5:
                print(f"  publish FAIL {task.vendor_name[:60]}: {str(e)[:160]}")
        if stats["published"] and stats["published"] % 200 == 0:
            elapsed = time.monotonic() - t0
            rate = stats["published"] / max(elapsed, 1e-6)
            print(f"  progress: published={stats['published']}/{len(rows)} "
                  f"rate={rate:.1f}/s elapsed={elapsed:.0f}s")
        if sleep_per > 0:
            await asyncio.sleep(sleep_per)

    return stats


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reason", default="off_scope",
                   choices=["off_scope", "off_scope_thin_data", "off_scope_weak_signal"],
                   help="hidden_reason to restore (default off_scope)")
    p.add_argument("--limit", type=int, default=1000,
                   help="Max rows to restore in one pass (0 = no cap). Default 1000 for staged rollout.")
    p.add_argument("--no-require-url", action="store_true",
                   help="Restore even rows with no canonical_url/has_website (default OFF — vision agent needs a target)")
    p.add_argument("--qps", type=float, default=4.0,
                   help="Max publish rate to Redis per second. Default 4 = 14400/hr, comfortably under enrich worker drain rate.")
    p.add_argument("--dry-run", action="store_true",
                   help="Count only — do not UPDATE or publish.")
    p.add_argument("--publish-only", action="store_true",
                   help="Skip the UPDATE step; just publish tasks for visible vendors with classified_at IS NULL. "
                        "Use this to catch up the wave after a worker restart killed the publish loop midway.")
    args = p.parse_args()

    require_url = not args.no_require_url
    stats = asyncio.run(restore_and_enqueue(
        reason=args.reason,
        limit=args.limit,
        require_url=require_url,
        qps=args.qps,
        dry_run=args.dry_run,
        publish_only=args.publish_only,
    ))

    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"\n[{mode}] restore_hidden_for_reenrich:")
    for k, v in stats.items():
        print(f"  {k:>18}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
