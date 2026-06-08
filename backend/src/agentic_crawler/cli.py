"""Typer CLI for the agentic crawler.

Commands:
  agentic-crawl run [--seed-name X] — one-shot, single seed (or all if omitted)
  agentic-crawl schedule           — 24/7 loop (foreground, used as docker CMD)
  agentic-crawl seeds              — print loaded seeds for inspection
"""

from __future__ import annotations

import asyncio

import typer
from rich.console import Console
from rich.table import Table

from crawler.observability.logger import configure_logging

from .agent_trace_publisher import install as install_agent_trace_publisher
from .config import get_agentic_settings
from .runner import run_seed
from .scheduler import run_forever
from .seeds import load_seeds

app = typer.Typer(help="Agentic browser crawler — AI-driven sibling to the base crawler.")
console = Console()


@app.command()
def run(
    seed_name: str = typer.Option(None, help="Run only the seed with this exact name; omit = run all"),
) -> None:
    """One-shot run (manual trigger)."""
    configure_logging()
    install_agent_trace_publisher()
    s = get_agentic_settings()
    seeds = load_seeds(s.seeds_yaml)
    if seed_name:
        seeds = [s for s in seeds if s.name == seed_name]
    if not seeds:
        console.print(f"[yellow]No seeds matched (yaml={s.seeds_yaml}).[/yellow]")
        raise typer.Exit(1)

    async def _run() -> None:
        totals = {"resolved": 0, "enriched": 0, "dedup_skipped": 0, "rejected": 0, "failed": 0}
        for seed in seeds:
            counts = await run_seed(seed)
            for k, v in counts.items():
                totals[k] += v

        table = Table(title=f"Agentic run — {len(seeds)} seed(s)")
        table.add_column("Stage")
        table.add_column("Count", justify="right")
        for k, v in totals.items():
            table.add_row(k, str(v))
        console.print(table)

    asyncio.run(_run())


@app.command()
def schedule() -> None:
    """Foreground 24/7 scheduler loop. Used as the docker container CMD."""
    configure_logging()
    install_agent_trace_publisher()
    asyncio.run(run_forever())


@app.command()
def combined() -> None:
    """Run BOTH the listing scheduler AND the enrich worker in one process.

    Used as the CMD for `agentic-a` / `agentic-b` twin containers in the
    Phase 3 deployment topology — each container hosts 2 listing workers
    plus 2 enrich workers, all rendering to the same Xvfb display so
    noVNC shows them tiled together. Two containers × 4 chromium = 8
    chromium total; per-VNC operator sees a balanced mix of both pools.

    Listing lock is now per-hostname (see scheduler._lock_key) so the
    twin container's listing scheduler runs in parallel without fighting
    for one global lock.
    """
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        import os
        from .enrich_worker import run_workers_forever
        from .product_backfill_worker import run_forever as product_run_forever

        # Three long-running coroutines, single event loop. Phase 5 added
        # the product backfill worker to drain `agentic:product_backfill:queue`
        # — populated by enrich_worker post-persist hook + manual seed CLI.
        # All three share the same event loop / signal handlers so SIGTERM
        # shuts everything down cleanly.
        listing_enabled = os.getenv("AGENTIC_LISTING_ENABLED", "true").lower() != "false"
        tasks_list = []
        if listing_enabled:
            tasks_list.append(asyncio.create_task(run_forever()))
        else:
            # Scheduler doesn't run when listing is disabled, but the Docker
            # HEALTHCHECK probes /tmp/agentic_heartbeat. Start a minimal ticker
            # so the container doesn't stay permanently unhealthy.
            from .scheduler import _write_heartbeat

            async def _heartbeat_only() -> None:
                _write_heartbeat()
                while True:
                    try:
                        await asyncio.sleep(60)
                        _write_heartbeat()
                    except asyncio.CancelledError:
                        break

            tasks_list.append(asyncio.create_task(_heartbeat_only()))
        tasks_list.append(asyncio.create_task(run_workers_forever()))
        # parallel=None lets product_run_forever read AGENTIC_PRODUCT_BACKFILL_PARALLEL
        # from agentic settings. Default still 4 per the schema.
        tasks_list.append(asyncio.create_task(product_run_forever(parallel=None)))
        # Phase 2 — backfill drainer republishes non-enriched vendors back into
        # the enrich queue. Gated by AGENTIC_BACKFILL_ENABLED so combined-mode
        # containers without enrich pool capacity can opt out.
        backfill_enabled = os.getenv("AGENTIC_BACKFILL_ENABLED", "true").lower() != "false"
        if backfill_enabled:
            from .backfill_drainer import run_forever as backfill_run_forever
            tasks_list.append(asyncio.create_task(backfill_run_forever()))
        tasks = tuple(tasks_list)
        try:
            # NOTE: do NOT use return_exceptions=True here. A previous version
            # did, which silently swallowed scheduler SystemExit and let the
            # two sibling tasks keep the event loop alive — container stayed
            # "healthy" with a dead scheduler loop. Now any task crash or exit
            # propagates and cancels the rest, so docker restart-unless-stopped
            # can respawn the container.
            await asyncio.gather(*tasks)
        except BaseException:
            for t in tasks:
                if not t.done():
                    t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

    asyncio.run(_run())


@app.command()
def seeds() -> None:
    """Print the loaded seed list (useful to verify YAML before scheduling)."""
    configure_logging()
    install_agent_trace_publisher()
    s = get_agentic_settings()
    items = load_seeds(s.seeds_yaml)
    table = Table(title=f"Agentic seeds — {s.seeds_yaml}")
    table.add_column("Name")
    table.add_column("URL")
    table.add_column("Expo ID")
    table.add_column("Tags")
    for it in items:
        table.add_row(it.name, it.url, it.expo_id or "—", ",".join(it.tags) or "—")
    console.print(table)
    if not items:
        console.print("[yellow]No seeds loaded. Add entries to the YAML.[/yellow]")


@app.command()
def discover() -> None:
    """Mode C dry run — generate discovery seeds, print them, exit. No crawl.

    Operator workflow: enable AGENTIC_DISCOVERY_ENABLED=true, run this command
    to preview which URLs Mode C wants to add to the queue this pass. Adjust
    AGENTIC_DISCOVERY_URL_SCORE_THRESHOLD if the output is too noisy / sparse.
    """
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from .discovery import discover_new_seeds

        seeds = await discover_new_seeds()
        table = Table(title=f"Discovery preview — {len(seeds)} seed(s)")
        table.add_column("Name", overflow="fold")
        table.add_column("URL", overflow="fold")
        table.add_column("Source query", overflow="fold")
        table.add_column("Tags")
        for seed in seeds:
            table.add_row(
                seed.name[:60],
                seed.url[:80],
                (seed.source_query or "—")[:60],
                ",".join(seed.tags) or "—",
            )
        console.print(table)
        if not seeds:
            s = get_agentic_settings()
            if not s.discovery_enabled:
                console.print(
                    "[yellow]Discovery disabled. Set AGENTIC_DISCOVERY_ENABLED=true.[/yellow]"
                )
            else:
                console.print(
                    "[yellow]Discovery returned 0 seeds — try lowering "
                    "AGENTIC_DISCOVERY_URL_SCORE_THRESHOLD or check Ollama / "
                    "search-engine connectivity.[/yellow]"
                )

    asyncio.run(_run())


enrich_app = typer.Typer(help="Phase 3 enrich-pool subcommands.")
app.add_typer(enrich_app, name="enrich")


@enrich_app.command("worker")
def enrich_worker_cmd() -> None:
    """Run the enrich-pool consumer process foreground.

    Used as the CMD for a separate `agentic-enrich-worker` docker service.
    Pulls EnrichTasks from `agentic:enrich:queue` and runs Browser-Use
    agents that search → visit → extract → persist via reporter.
    """
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from .enrich_worker import run_workers_forever

        await run_workers_forever()

    asyncio.run(_run())


@enrich_app.command("enqueue")
def enrich_enqueue_cmd(
    vendor: str = typer.Option(..., help="Vendor display name."),
    hint_url: str = typer.Option(None, "--hint-url", help="Optional hint URL."),
    expo_id: str = typer.Option("manual-test", "--expo-id"),
    country: str = typer.Option(None, "--country"),
    product: str = typer.Option(None, "--product"),
) -> None:
    """Manual enqueue helper for smoke testing the queue end-to-end."""
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from .enrich_queue import EnrichTask, make_task_id, publish

        task = EnrichTask(
            task_id=make_task_id(vendor, expo_id),
            vendor_name=vendor,
            hint_url=hint_url,
            expo_id=expo_id,
            country_hint=country,
            product_hint=product,
            source_query=None,
            lesson_id_of_listing=None,
        )
        entry_id = await publish(task)
        if entry_id:
            console.print(
                f"[green]enqueued[/green] vendor=[bold]{vendor}[/bold] "
                f"task_id={task.task_id} entry_id={entry_id}"
            )
        else:
            console.print("[red]enqueue failed — Redis unreachable[/red]")
            raise typer.Exit(1)

    asyncio.run(_run())


@enrich_app.command("depth")
def enrich_depth_cmd() -> None:
    """Show the current XLEN of `agentic:enrich:queue`."""
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from .enrich_queue import depth

        n = await depth()
        console.print(f"agentic:enrich:queue depth = [bold]{n}[/bold]")

    asyncio.run(_run())


# Phase 5 — Product catalog backfill subcommands.
product_app = typer.Typer(help="Phase 5 product-catalog enrichment.")
app.add_typer(product_app, name="product-backfill")


@product_app.command("worker")
def product_backfill_worker_cmd(
    parallel: int = typer.Option(
        4, "--parallel", help="Concurrent async tasks per process."
    ),
) -> None:
    """Drain `agentic:product_backfill:queue`. Long-running."""
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from .product_backfill_worker import run_forever

        await run_forever(parallel=parallel)

    asyncio.run(_run())


@product_app.command("seed")
def product_backfill_seed_cmd(
    only_with_products: bool = typer.Option(
        True, "--only-with-products/--all",
        help="Only enqueue vendors with non-empty products list (recommended).",
    ),
    skip_already_enriched: bool = typer.Option(
        True, "--skip-already-enriched/--reprocess",
        help="Skip vendors that already have products_detailed populated.",
    ),
    limit: int = typer.Option(
        0, help="Cap number of enqueued tasks (0 = no cap).",
    ),
) -> None:
    """Scan vendors table → enqueue eligible vendor_ids to backfill queue."""
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from sqlalchemy import select, func, text
        from crawler.db.models import VendorORM
        from crawler.db.session import get_session
        from . import product_backfill_queue

        async with get_session() as session:
            stmt = select(VendorORM.vendor_id, VendorORM.company_name)
            if only_with_products:
                stmt = stmt.where(
                    func.jsonb_array_length(VendorORM.products) > 0
                )
            if skip_already_enriched:
                stmt = stmt.where(
                    func.jsonb_array_length(VendorORM.products_detailed) == 0
                )
            stmt = stmt.order_by(VendorORM.last_enriched_at.desc())
            if limit > 0:
                stmt = stmt.limit(limit)
            rows = (await session.execute(stmt)).all()

        if not rows:
            console.print("[yellow]no eligible vendors found[/yellow]")
            return

        n_pub = 0
        n_skip = 0
        for vendor_id, name in rows:
            entry_id = await product_backfill_queue.publish_vendor(
                vendor_id, source="backfill"
            )
            if entry_id:
                n_pub += 1
            else:
                n_skip += 1
        console.print(
            f"[green]enqueued[/green] {n_pub} vendor(s); "
            f"skipped {n_skip}; total scanned {len(rows)}"
        )

    asyncio.run(_run())


@product_app.command("depth")
def product_backfill_depth_cmd() -> None:
    """Show XLEN of the product backfill queue."""
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from .product_backfill_queue import queue_depth

        n = await queue_depth()
        console.print(
            f"agentic:product_backfill:queue depth = [bold]{n}[/bold]"
        )

    asyncio.run(_run())


@app.command("backfill-specialty")
def backfill_specialty(
    page_size: int = typer.Option(
        500, help="Vendors per Postgres page; also the Chroma upsert batch size.",
    ),
    only_missing: bool = typer.Option(
        True, "--only-missing/--reindex",
        help="Skip vendors already present in the vendor_specialty collection.",
    ),
    limit: int = typer.Option(
        0, help="Cap total vendors processed across all pages (0 = no cap).",
    ),
) -> None:
    """Backfill the ChromaDB `vendor_specialty` collection from Postgres.

    One-shot maintenance command. The on-going feed lives in
    `enrich_worker._index_specialty_safe` so this is only needed once
    after the collection schema is introduced (or after a Chroma reset).
    Pages through vendors 500 at a time, diffs against the collection
    via `coll.get(ids=...)`, and bulk-upserts via `embed_many` so we get
    one Ollama batch per page instead of one per vendor.
    """
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from sqlalchemy import select
        from crawler.db.models import VendorORM
        from crawler.db.session import get_session
        from crawler.store.specialty_index import _get_collection, add_many_specialties

        coll = await _get_collection()
        offset = 0
        total_seen = 0
        total_upserted = 0
        total_skipped = 0
        while True:
            async with get_session() as session:
                # Snowglobe 2026-05-25 revised: index SEMUA vendor (including
                # hidden off-scope). API search filters visibility at query
                # time via ?include_hidden, so operator can opt to search the
                # full 30k katalog when needed. Indexing everything = no need
                # to reindex when scope flag flips.
                stmt = (
                    select(
                        VendorORM.vendor_id,
                        VendorORM.company_name,
                        VendorORM.domain,
                        VendorORM.products,
                        VendorORM.industries,
                        VendorORM.description,
                        VendorORM.domain_of_interest,
                        VendorORM.registrar_country,
                        VendorORM.address,
                        VendorORM.military_categories,
                        VendorORM.tagline,
                        VendorORM.hidden,
                        VendorORM.scope_match_score,
                    )
                    .order_by(VendorORM.scope_match_score.desc().nulls_last())
                    .limit(page_size)
                    .offset(offset)
                )
                rows = (await session.execute(stmt)).all()
            if not rows:
                break

            if only_missing:
                ids_in_page = [str(r[0]) for r in rows]
                try:
                    existing = await asyncio.to_thread(coll.get, ids=ids_in_page)
                    existing_ids = set(existing.get("ids") or [])
                except Exception:  # noqa: BLE001
                    existing_ids = set()
            else:
                existing_ids = set()

            items: list[dict] = []
            for r in rows:
                vid = str(r[0])
                if vid in existing_ids:
                    total_skipped += 1
                    continue
                addr = r[8]
                country = None
                if isinstance(addr, dict):
                    country = addr.get("country") or None
                items.append({
                    "vendor_id": vid,
                    "company_name": r[1] or "",
                    "domain": r[2],
                    "products": list(r[3] or []),
                    "industries": list(r[4] or []),
                    "description": r[5],
                    "domain_of_interest": list(r[6] or []),
                    "country": country or r[7] or None,
                    "military_categories": list(r[9] or []),
                    "tagline": r[10],
                    "hidden": bool(r[11]),
                    "scope_match_score": float(r[12] or 0.0),
                })

            written = await add_many_specialties(items) if items else 0
            total_upserted += written
            total_seen += len(rows)
            console.print(
                f"[cyan]page[/cyan] offset={offset} rows={len(rows)} "
                f"upserted={written} skipped_existing={len(rows) - len(items)} "
                f"total_upserted={total_upserted}"
            )

            offset += page_size
            if limit and total_seen >= limit:
                break
            if len(rows) < page_size:
                break

        console.print(
            f"[green]done[/green] seen={total_seen} upserted={total_upserted} "
            f"skipped_existing={total_skipped}"
        )

    asyncio.run(_run())


@app.command()
def reset(
    locks: bool = typer.Option(True, help="Clear scheduler per-host locks."),
    llm: bool = typer.Option(True, help="Reset llm:concurrency:* counters."),
    pel: bool = typer.Option(False, help="Reclaim and ack ALL pending enrich queue entries (destructive)."),
    queue: bool = typer.Option(False, help="DROP entire enrich queue (very destructive)."),
) -> None:
    """One-shot Redis cleanup helper.

    Common workflow after `docker compose restart agentic-*`:

        agentic-crawl reset

    Clears stale scheduler locks (so next pass doesn't `scheduler_locked_skip`)
    and resets LLM-queue counters (so containers that died mid-acquire don't
    leave the cap permanently wedged).

    Add --pel to also force-ack every entry sitting in the enrich-queue
    Pending Entries List (use when consumers from a previous container
    generation are gone and tasks are blocked behind XAUTOCLAIM idle).

    Add --queue to nuke the entire enrich-queue stream (rare — only when
    you want a totally fresh start).
    """
    configure_logging()
    install_agent_trace_publisher()

    async def _run() -> None:
        from crawler.store.redis_queue import get_redis

        client = await get_redis()
        if client is None:
            console.print("[red]Redis unreachable.[/red]")
            raise typer.Exit(1)

        cleared: dict[str, int] = {}

        if locks:
            keys = []
            async for k in client.scan_iter(match="autocrawl:agentic_active_run:*"):
                keys.append(k)
            if keys:
                await client.delete(*keys)
            cleared["locks"] = len(keys)

        if llm:
            tier_keys = [
                "llm:concurrency:vision",
                "llm:concurrency:heavy",
                "llm:concurrency:light",
                "llm:concurrency:tiny",
            ]
            for k in tier_keys:
                await client.set(k, 0)
            holder_keys = []
            async for k in client.scan_iter(match="llm:concurrency:*:holder:*"):
                holder_keys.append(k)
            if holder_keys:
                await client.delete(*holder_keys)
            cleared["llm_counters"] = len(tier_keys)
            cleared["llm_holders"] = len(holder_keys)

        if pel:
            from .enrich_queue import CONSUMER_GROUP, STREAM_NAME

            try:
                pending = await client.xpending(STREAM_NAME, CONSUMER_GROUP)
                count = pending[0] if isinstance(pending, (list, tuple)) else 0
                if count and count > 0:
                    # Pull all pending entry IDs and XACK them.
                    entries = await client.xpending_range(
                        STREAM_NAME, CONSUMER_GROUP, "-", "+", count,
                    )
                    ids = [e["message_id"] for e in entries] if entries else []
                    if ids:
                        await client.xack(STREAM_NAME, CONSUMER_GROUP, *ids)
                    cleared["pel_acked"] = len(ids)
                else:
                    cleared["pel_acked"] = 0
            except Exception as e:  # noqa: BLE001
                console.print(f"[yellow]PEL clear skipped: {e}[/yellow]")
                cleared["pel_acked"] = -1

        if queue:
            from .enrich_queue import STREAM_NAME

            try:
                length = await client.xlen(STREAM_NAME)
                await client.delete(STREAM_NAME)
                cleared["queue_dropped"] = int(length)
            except Exception as e:  # noqa: BLE001
                console.print(f"[yellow]queue drop skipped: {e}[/yellow]")
                cleared["queue_dropped"] = -1

        console.print("[green]Reset complete.[/green]")
        for k, v in cleared.items():
            console.print(f"  {k}: {v}")

    asyncio.run(_run())


@app.command()
def stop() -> None:
    """Set the remote-stop flag in Redis. The running scheduler picks it up
    between seeds (or between passes during sleep) and exits cleanly. Worst
    case latency: one in-flight Browser-Use task (~AGENTIC_TASK_TIMEOUT seconds).

    Use this when you can't reach the container directly (e.g. agent stuck on
    a runaway seed and you want to stop without `docker compose kill`).
    """
    configure_logging()
    install_agent_trace_publisher()

    async def _set_flag() -> None:
        from crawler.store.redis_queue import get_redis

        client = await get_redis()
        if client is None:
            console.print("[red]Redis unreachable — cannot set remote-stop flag.[/red]")
            console.print("[yellow]Use `docker compose stop agentic-crawler` instead.[/yellow]")
            raise typer.Exit(1)
        await client.set("autocrawl:agentic_stop_requested", "1", ex=600)
        console.print("[green]Remote-stop flag set.[/green] Scheduler will exit on next check (≤5 min).")

    asyncio.run(_set_flag())


if __name__ == "__main__":
    app()
