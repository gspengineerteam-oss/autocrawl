"""Typer CLI for AutoCrawler.

Commands:
  crawl run        — single end-to-end run
  crawl schedule   — start the 24/7 scheduler (foreground)
  crawl report     — print summary stats
  crawl health     — quick connectivity check
  crawl backfill   — re-process a specific topic
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .config import get_settings
from .observability.logger import configure_logging, get_logger
from .schemas import CrawlMode

app = typer.Typer(help="AutoCrawler — 24/7 expo → vendor enrichment.")
console = Console()
_log = get_logger(__name__)


def _resolve_mode(mode: str | None) -> CrawlMode:
    if not mode:
        return get_settings().mode
    try:
        return CrawlMode(mode)
    except ValueError:
        typer.echo(f"Unknown mode: {mode}. Use one of: dev, normal, aggressive.", err=True)
        raise typer.Exit(1) from None


@app.command()
def run(
    mode: str = typer.Option(None, help="dev | normal | aggressive (overrides .env)"),
    metrics_port: int = typer.Option(0, help="If > 0, expose /metrics on this port for the run"),
) -> None:
    """One-shot end-to-end run."""
    configure_logging()
    selected = _resolve_mode(mode)
    if metrics_port > 0:
        from .observability.metrics import start_metrics_server

        start_metrics_server(metrics_port)

    from .graph import run_once

    summary = asyncio.run(run_once(mode=selected))
    table = Table(title=f"Run {summary.run_id}")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for k, v in summary.model_dump(mode="json").items():
        table.add_row(str(k), str(v))
    console.print(table)


@app.command()
def schedule(
    metrics_port: int = typer.Option(8080, help="Prometheus /metrics port"),
) -> None:
    """Start the 24/7 scheduler (foreground)."""
    from .scheduler import main_async

    asyncio.run(main_async(metrics_port=metrics_port))


@app.command()
def report() -> None:
    """Print a summary of vendors collected so far."""
    settings = get_settings()
    manifest_path: Path = settings.data_dir / "reports" / "master_manifest.json"
    if not manifest_path.exists():
        console.print("[yellow]No manifest yet. Run `crawl run` first.[/yellow]")
        raise typer.Exit(0)
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    n_vendors = len(data.get("vendors", {}))
    n_expos = len(data.get("expos", {}))
    threshold = settings.phase_2_vendor_threshold
    pct = (n_vendors / threshold * 100) if threshold else 0.0

    table = Table(title="AutoCrawler Status")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    table.add_row("Vendors enriched (manifest)", str(n_vendors))
    table.add_row("Expos discovered (manifest)", str(n_expos))
    table.add_row("Phase 2 threshold", str(threshold))
    table.add_row("Phase 2 progress", f"{pct:.1f} %")
    table.add_row("Phase 2 unlocked", str(n_vendors >= threshold))
    table.add_row("Updated at", data.get("updated_at", "—"))
    console.print(table)


@app.command()
def health() -> None:
    """Quick connectivity check on dependencies."""

    async def _run() -> dict:
        out: dict[str, str] = {}
        # Redis
        try:
            from .store.redis_queue import get_redis

            r = await get_redis()
            out["redis"] = "ok" if r is not None else "unavailable"
        except Exception as e:  # noqa: BLE001
            out["redis"] = f"error: {e}"
        # Chroma
        try:
            from .store.vector_store import _get_collection

            await _get_collection()
            out["chroma"] = "ok"
        except Exception as e:  # noqa: BLE001
            out["chroma"] = f"error: {e}"
        # OpenAI
        try:
            from .tools.llm.openai_client import embed_one

            v = await embed_one("ping")
            out["openai"] = f"ok (vec dim {len(v)})"
        except Exception as e:  # noqa: BLE001
            out["openai"] = f"error: {e}"
        # Firecrawl
        try:
            from .tools.firecrawl.client import budget_low

            low = await budget_low()
            out["firecrawl"] = f"ok (budget_low={low})"
        except Exception as e:  # noqa: BLE001
            out["firecrawl"] = f"error: {e}"
        return out

    configure_logging()
    res = asyncio.run(_run())
    table = Table(title="Health Check")
    table.add_column("Service")
    table.add_column("Status")
    for k, v in res.items():
        table.add_row(k, v)
    console.print(table)


@app.command()
def backfill(
    topic: str = typer.Argument(..., help="Topic name from config/seed_topics.yaml"),
    mode: str = typer.Option("normal", help="dev | normal | aggressive"),
) -> None:
    """Re-run discovery for a single topic."""
    configure_logging()
    selected = _resolve_mode(mode)
    console.print(f"[cyan]Backfilling topic[/cyan] {topic!r} in mode {selected.value}")
    from .graph import run_once

    summary = asyncio.run(run_once(mode=selected))
    console.print(json.dumps(summary.model_dump(mode="json"), indent=2))


@app.command(name="pdf-test")
def pdf_test(
    pdf_url: str = typer.Argument(..., help="Direct URL to a PDF brochure"),
    expo_id: str = typer.Option("manual-test", help="Expo ID slug for storage layout"),
) -> None:
    """Download a PDF, extract vendor names, print results. No graph execution."""
    configure_logging()

    async def _run() -> None:
        from .tools.scrapers.pdf_extractor import list_exhibitors

        refs = await list_exhibitors(pdf_url, expo_id)
        if not refs:
            console.print("[yellow]No vendors extracted.[/yellow]")
            return

        table = Table(title=f"Vendors extracted from {pdf_url}")
        table.add_column("#", justify="right")
        table.add_column("Page", justify="right")
        table.add_column("Pos", justify="right")
        table.add_column("Method")
        table.add_column("Name")
        table.add_column("Context", overflow="fold")
        for i, r in enumerate(refs, start=1):
            p = r.provenance[0] if r.provenance else None
            table.add_row(
                str(i),
                str(p.page) if p and p.page else "-",
                str(p.position) if p and p.position else "-",
                p.extraction_method if p else "-",
                r.name,
                (r.short_description or "")[:80],
            )
        console.print(table)
        console.print(f"[green]Total:[/green] {len(refs)} vendor refs")

    asyncio.run(_run())


@app.command(name="reset-state")
def reset_state(
    clear_pdfs: bool = typer.Option(False, "--clear-pdfs", help="Hapus juga cache PDF di data/pdfs/"),
    clear_logs: bool = typer.Option(False, "--clear-logs", help="Hapus log JSONL di logs/"),
    yes: bool = typer.Option(False, "-y", "--yes", help="Skip confirmation prompt"),
) -> None:
    """Bersihkan pekerjaan sisa sebelum run baru.

    Default (aman, idempotent):
      - Hapus lock Redis: autocrawl:active_run, taskclaim:*, discovery:recent_queries
      - SQL: tutup runs yang finished_at IS NULL dengan notes='manual_reset'
      - SQL: balikin exhibitor_refs status resolving/enriching -> extracted

    File JSON di data/reports tidak disentuh (source of truth). Volume Postgres,
    vector_db, dan PDF cache juga dipertahankan kecuali flag --clear-pdfs/--clear-logs.
    """
    configure_logging()
    settings = get_settings()

    summary_table = Table(title="Reset state — akan dijalankan")
    summary_table.add_column("Action")
    summary_table.add_column("Target")
    summary_table.add_row("Redis DEL", "autocrawl:active_run")
    summary_table.add_row("Redis DEL", "autocrawl:agentic_active_run")
    summary_table.add_row("Redis DEL", "autocrawl:agentic_stop_requested")
    summary_table.add_row("Redis SCAN+DEL", "taskclaim:*")
    summary_table.add_row("Redis DEL", "discovery:recent_queries")
    summary_table.add_row("Postgres UPDATE", "runs SET finished_at=NOW() WHERE finished_at IS NULL")
    summary_table.add_row(
        "Postgres UPDATE",
        "exhibitor_refs SET status='extracted' WHERE status IN ('resolving','enriching')",
    )
    if clear_pdfs:
        summary_table.add_row("rm -rf", str(settings.data_dir / "pdfs"))
    if clear_logs:
        summary_table.add_row("rm", f"{settings.log_dir}/*.jsonl")
    console.print(summary_table)

    if not yes:
        if not typer.confirm("Lanjutkan?", default=False):
            console.print("[yellow]Dibatalkan.[/yellow]")
            raise typer.Exit(0)

    async def _run() -> None:
        from sqlalchemy import text as _text
        from redis.asyncio import from_url

        results: dict[str, int | str] = {}

        # ---- Redis ----
        try:
            client = from_url(settings.redis_url, decode_responses=True)
            try:
                deleted_active = await client.delete("autocrawl:active_run")
                deleted_agentic_active = await client.delete("autocrawl:agentic_active_run")
                deleted_agentic_stop = await client.delete("autocrawl:agentic_stop_requested")
                deleted_recent = await client.delete("discovery:recent_queries")
                claim_count = 0
                async for key in client.scan_iter("taskclaim:*", count=200):
                    await client.delete(key)
                    claim_count += 1
                results["redis.active_run"] = int(deleted_active)
                results["redis.agentic_active_run"] = int(deleted_agentic_active)
                results["redis.agentic_stop_requested"] = int(deleted_agentic_stop)
                results["redis.recent_queries"] = int(deleted_recent)
                results["redis.taskclaim_keys"] = claim_count
            finally:
                await client.aclose()
        except Exception as e:  # noqa: BLE001
            results["redis.error"] = str(e)[:120]

        # ---- Postgres ----
        try:
            from .db.engine import get_sessionmaker

            sm = get_sessionmaker()
            async with sm() as session:
                runs_closed = await session.execute(
                    _text(
                        "UPDATE runs SET finished_at = NOW(), notes = 'manual_reset' "
                        "WHERE finished_at IS NULL"
                    )
                )
                refs_reset = await session.execute(
                    _text(
                        "UPDATE exhibitor_refs SET status = 'extracted', "
                        "failure_category = NULL, failure_reason = NULL "
                        "WHERE status IN ('resolving', 'enriching')"
                    )
                )
                await session.commit()
                results["db.runs_closed"] = runs_closed.rowcount or 0
                results["db.refs_reset"] = refs_reset.rowcount or 0
        except Exception as e:  # noqa: BLE001
            results["db.error"] = str(e)[:120]

        # ---- Filesystem (opt-in) ----
        if clear_pdfs:
            import shutil

            pdf_dir = settings.data_dir / "pdfs"
            try:
                if pdf_dir.exists():
                    shutil.rmtree(pdf_dir)
                pdf_dir.mkdir(parents=True, exist_ok=True)
                results["fs.pdfs_cleared"] = "ok"
            except Exception as e:  # noqa: BLE001
                results["fs.pdfs_error"] = str(e)[:120]

        if clear_logs:
            removed = 0
            try:
                for p in settings.log_dir.glob("*.jsonl"):
                    p.unlink(missing_ok=True)
                    removed += 1
                results["fs.logs_removed"] = removed
            except Exception as e:  # noqa: BLE001
                results["fs.logs_error"] = str(e)[:120]

        out = Table(title="Reset state — hasil")
        out.add_column("Step")
        out.add_column("Result", justify="right")
        for k, v in results.items():
            out.add_row(k, str(v))
        console.print(out)

    asyncio.run(_run())


db_app = typer.Typer(help="Database commands.")
app.add_typer(db_app, name="db")


@db_app.command("migrate")
def db_migrate() -> None:
    """Create database tables (idempotent, uses Base.metadata.create_all)."""
    configure_logging()
    from .db.engine import init_db

    asyncio.run(init_db())
    console.print("[green]Database migration completed.[/green]")


@db_app.command("import-json")
def db_import_json() -> None:
    """Import existing JSON reports into Postgres."""
    configure_logging()
    from datetime import datetime, timezone

    from .db.engine import get_sessionmaker, init_db
    from .db.repositories import expo_repo, run_repo, vendor_repo
    from .schemas import Expo, RunSummary, Vendor

    settings = get_settings()
    reports = settings.data_dir / "reports"

    async def _run() -> None:
        await init_db()
        sm = get_sessionmaker()
        imported = {"vendors": 0, "expos": 0, "runs": 0, "errors": 0}

        for path in (reports / "vendors").glob("*.json"):
            async with sm() as session:
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    trail = data.get("source_trail") or []
                    legacy_tags: list[str] = []
                    structured_trail: list[dict] = []
                    for entry in trail:
                        if isinstance(entry, str):
                            legacy_tags.append(entry)
                        elif isinstance(entry, dict):
                            structured_trail.append(entry)
                    if legacy_tags:
                        existing_tags = list(data.get("source_tags") or [])
                        merged = existing_tags + [t for t in legacy_tags if t not in existing_tags]
                        data["source_tags"] = merged
                    data["source_trail"] = structured_trail
                    vendor = Vendor.model_validate(data)
                    await vendor_repo.upsert(session, vendor)
                    await session.commit()
                    imported["vendors"] += 1
                except Exception as exc:
                    await session.rollback()
                    imported["errors"] += 1
                    console.print(f"[red]vendor failed[/red] {path.name}: {str(exc)[:120]}")

        for path in (reports / "expos").glob("*.json"):
            async with sm() as session:
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    vendor_domains = data.pop("vendors", []) or []
                    if "vendor_domains" in data:
                        vendor_domains = data.pop("vendor_domains") or vendor_domains
                    expo = Expo.model_validate(data)
                    await expo_repo.upsert(session, expo, vendor_domains=vendor_domains)
                    await session.commit()
                    imported["expos"] += 1
                except Exception as exc:
                    await session.rollback()
                    imported["errors"] += 1
                    console.print(f"[red]expo failed[/red] {path.name}: {str(exc)[:120]}")

        for path in (reports / "runs").glob("*.json"):
            async with sm() as session:
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    started = data.get("started_at")
                    if isinstance(started, str):
                        data["started_at"] = datetime.fromisoformat(started.replace("Z", "+00:00"))
                    finished = data.get("finished_at")
                    if isinstance(finished, str):
                        data["finished_at"] = datetime.fromisoformat(finished.replace("Z", "+00:00"))
                    if data.get("started_at") is None:
                        # legacy daily summaries (summary_YYYY-MM-DD.json) carry a
                        # `date` field instead of started_at; promote it.
                        date_str = data.get("date")
                        if isinstance(date_str, str):
                            data["started_at"] = datetime.fromisoformat(date_str + "T00:00:00+00:00")
                        else:
                            data["started_at"] = datetime.now(timezone.utc)
                    if not data.get("run_id"):
                        # synthesize a stable id from filename + started_at so the
                        # row is idempotent across re-imports.
                        ts = data["started_at"]
                        data["run_id"] = f"legacy-{path.stem}-{ts.strftime('%Y%m%d')}"
                    summary = RunSummary.model_validate(data)
                    await run_repo.upsert(session, summary)
                    await session.commit()
                    imported["runs"] += 1
                except Exception as exc:
                    await session.rollback()
                    imported["errors"] += 1
                    console.print(f"[red]run failed[/red] {path.name}: {str(exc)[:120]}")

        table = Table(title="Import results")
        table.add_column("Kind")
        table.add_column("Count", justify="right")
        for k, v in imported.items():
            table.add_row(k, str(v))
        console.print(table)

    asyncio.run(_run())


@app.command(name="translate-vendors")
def translate_vendors_cmd(
    limit: int = typer.Option(0, help="Max vendors to translate (0 = all)"),
    force: bool = typer.Option(False, help="Re-translate even if already at target language"),
    dry_run: bool = typer.Option(False, help="Print what would change without writing"),
) -> None:
    """Translate vendor text fields in Postgres to the configured TARGET_LANGUAGE."""
    configure_logging()
    from sqlalchemy import select

    from .db.engine import get_sessionmaker, init_db
    from .db.models import VendorORM
    from .db.repositories import vendor_repo
    from .schemas import Vendor
    from .tools.llm.translator import translate_vendor_fields

    settings = get_settings()
    if not settings.translation_enabled:
        console.print("[yellow]TRANSLATION_ENABLED=false. Set it true and retry.[/yellow]")
        raise typer.Exit(1)

    target = settings.target_language.lower()

    async def _run() -> None:
        await init_db()
        sm = get_sessionmaker()
        async with sm() as session:
            stmt = select(VendorORM)
            if not force:
                stmt = stmt.where((VendorORM.language_code != target) | (VendorORM.language_code.is_(None)))
            if limit > 0:
                stmt = stmt.limit(limit)
            rows = list((await session.execute(stmt)).scalars().all())

        console.print(f"[cyan]Found {len(rows)} vendor(s) needing translation → {target}[/cyan]")
        ok, fail, skipped = 0, 0, 0
        for orm in rows:
            try:
                payload = vendor_repo.orm_to_dict(orm)
                payload.pop("first_seen_wayback", None)
                payload.pop("first_enriched_at", None)
                payload.pop("last_enriched_at", None)
                payload.pop("translated_at", None)
                vendor = Vendor.model_validate(payload)
                before = vendor.description
                await translate_vendor_fields(vendor)
                if vendor.description == before and vendor.language_code != target:
                    skipped += 1
                    continue
                if dry_run:
                    console.print(
                        f"  [dim]{vendor.domain}[/dim] desc:"
                        f" {(vendor.description or '')[:80]!r}"
                    )
                    ok += 1
                    continue
                async with sm() as ses2:
                    await vendor_repo.upsert(ses2, vendor)
                    await ses2.commit()
                ok += 1
                console.print(f"  [green]✓[/green] {vendor.domain}")
            except Exception as exc:  # noqa: BLE001
                fail += 1
                console.print(f"  [red]✗[/red] {orm.domain}: {str(exc)[:120]}")

        table = Table(title="Translation results")
        table.add_column("Metric")
        table.add_column("Count", justify="right")
        table.add_row("translated", str(ok))
        table.add_row("skipped", str(skipped))
        table.add_row("failed", str(fail))
        console.print(table)

    asyncio.run(_run())


@app.command(name="wiki-test")
def wiki_test_cmd(
    wiki_url: str = typer.Argument(..., help="Wikipedia article URL (e.g. en.wikipedia.org/wiki/2026_Bilderberg_Conference)"),
    expo_id: str = typer.Option("wiki-test", help="Expo ID slug for tagging"),
) -> None:
    """Test the Wikipedia scraper on a single article URL. No DB writes."""
    configure_logging()

    async def _run() -> None:
        from .tools.scrapers.wikipedia import list_exhibitors

        refs = await list_exhibitors(wiki_url, expo_id)
        if not refs:
            console.print("[yellow]No organizations / companies extracted.[/yellow]")
            return

        table = Table(title=f"Organizations from {wiki_url}")
        table.add_column("#", justify="right")
        table.add_column("Name")
        table.add_column("Wikipedia URL", overflow="fold")
        table.add_column("Method")
        table.add_column("Confidence", justify="right")
        for i, r in enumerate(refs, start=1):
            p = r.provenance[0] if r.provenance else None
            table.add_row(
                str(i),
                r.name,
                str(r.raw_url) if r.raw_url else "-",
                p.extraction_method if p else "-",
                f"{p.confidence:.2f}" if p and p.confidence is not None else "-",
            )
        console.print(table)
        console.print(f"[green]Total:[/green] {len(refs)} refs")

    asyncio.run(_run())


@app.command(name="api-serve")
def api_serve(
    host: str = typer.Option("0.0.0.0", help="Bind host"),
    port: int = typer.Option(8081, help="Bind port"),
    reload: bool = typer.Option(False, help="Auto reload"),
) -> None:
    """Run the FastAPI service."""
    import uvicorn

    uvicorn.run("crawler.api:app", host=host, port=port, reload=reload, proxy_headers=True)


@app.command(name="backfill-pdfs")
def backfill_pdfs() -> None:
    """Walk data/pdfs/<expo>/ and insert every PDF into the pdfs table.

    Idempotent — re-runs are safe due to SHA256 dedup in pdf_repo.upsert.
    Reads the per-file `.meta.json` sidecar for size/timestamp; falls back
    to filesystem stat if the sidecar is missing.
    """
    configure_logging()
    asyncio.run(_backfill_pdfs_impl())


async def _backfill_pdfs_impl() -> None:
    """Backfill walk pdfs root, insert per-PDF in fresh session.

    Two FK realities we handle:
    - `pdfs.expo_id` has FK to `expos.expo_id`. If the expo isn't in DB
      (typical when JSON imports were never done), we set expo_id=None
      so the row still lands.
    - One bad row poisons a SQLAlchemy session. We use a fresh session
      per PDF so failures stay isolated.
    """
    import hashlib
    from datetime import datetime, timezone

    from sqlalchemy import select

    from .db.engine import dispose_engine, get_sessionmaker
    from .db.models import ExpoORM
    from .db.repositories import pdf_repo

    settings = get_settings()
    pdfs_root: Path = settings.data_dir / "pdfs"

    if not pdfs_root.exists():
        console.print(f"[yellow]No pdfs directory at {pdfs_root}[/yellow]")
        return

    sessionmaker = get_sessionmaker()

    async with sessionmaker() as scout:
        rows = (await scout.execute(select(ExpoORM.expo_id))).scalars().all()
        known_expos: set[str] = set(rows)
    console.print(f"[dim]known expos in DB: {len(known_expos)}[/dim]")

    inserted = 0
    orphaned = 0
    failed = 0

    for expo_dir in sorted(pdfs_root.iterdir()):
        if not expo_dir.is_dir():
            continue
        dir_expo_id = expo_dir.name

        for pdf_file in sorted(expo_dir.glob("*.pdf")):
            sidecar = pdf_file.with_suffix(pdf_file.suffix + ".meta.json")
            meta: dict = {}
            if sidecar.exists():
                try:
                    meta = json.loads(sidecar.read_text(encoding="utf-8"))
                except Exception:  # noqa: BLE001
                    meta = {}

            source_url = meta.get("source_url") or f"file://{pdf_file}"
            sha256 = meta.get("sha256")
            if not sha256:
                sha256 = hashlib.sha256(pdf_file.read_bytes()).hexdigest()

            size_bytes = int(meta.get("size_bytes") or pdf_file.stat().st_size)
            ts = meta.get("downloaded_at")
            downloaded_at = datetime.now(timezone.utc)
            if ts:
                try:
                    downloaded_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except Exception:  # noqa: BLE001
                    pass

            effective_expo_id: str | None = dir_expo_id
            if dir_expo_id not in known_expos:
                effective_expo_id = None
                orphaned += 1

            async with sessionmaker() as session:
                try:
                    await pdf_repo.upsert(
                        session,
                        filename=pdf_file.name,
                        source_url=source_url,
                        expo_id=effective_expo_id,
                        sha256=sha256,
                        size_bytes=size_bytes,
                        page_count=int(meta.get("page_count") or 0),
                        vendors_found=int(meta.get("vendors_found") or 0),
                        downloaded_at=downloaded_at,
                        meta={
                            "backfilled": True,
                            "dir_expo_id": dir_expo_id,
                            "source_meta": meta,
                        },
                    )
                    await session.commit()
                    inserted += 1
                    if inserted % 25 == 0:
                        console.print(f"[dim]committed {inserted} PDFs so far[/dim]")
                except Exception as exc:  # noqa: BLE001
                    await session.rollback()
                    failed += 1
                    console.print(f"[red]failed {pdf_file.name}: {str(exc)[:160]}[/red]")

    await dispose_engine()

    table = Table(title="PDF Backfill")
    table.add_column("Result")
    table.add_column("Count", justify="right")
    table.add_row("Inserted / Updated", str(inserted))
    table.add_row("Orphaned (expo not in DB, expo_id=null)", str(orphaned))
    table.add_row("Failed", str(failed))
    console.print(table)


@app.command(name="reprocess-pdfs")
def reprocess_pdfs(
    expo_id: str = typer.Option(None, "--expo-id", help="Reprocess PDFs only for this expo"),
    limit: int = typer.Option(0, "--limit", help="Max PDFs to reprocess (0 = no limit)"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Print what would happen, no DB writes"),
    skip_existing: bool = typer.Option(True, "--skip-existing/--all", help="Skip PDFs already showing vendors_found > 0"),
    only_failed: bool = typer.Option(False, "--only-failed", help="Re-resolve refs with status=resolve_failed (no PDF walk)"),
    from_status: str = typer.Option("", "--from-status", help="Process refs from a specific status (e.g. extracted, resolve_failed). Skips PDF walk."),
    concurrency: int = typer.Option(0, "--concurrency", help="Override max concurrent ref processing (default = settings.crawl4ai_max_concurrent)"),
) -> None:
    """Re-extract vendors from existing PDFs and feed through resolve+enrich pipeline.

    Idempotent: pdf_store.download() returns cached path, list_exhibitors()
    re-parses the on-disk PDF and rewrites .pages.jsonl. Each ref is upserted
    to exhibitor_refs (audit table) and then put through the standalone
    resolve+enrich+persist path.
    """
    configure_logging()
    asyncio.run(_reprocess_pdfs_impl(
        expo_id=expo_id,
        limit=limit,
        dry_run=dry_run,
        skip_existing=skip_existing,
        only_failed=only_failed,
        from_status=from_status or None,
        concurrency=concurrency,
    ))


async def _reprocess_pdfs_impl(
    *,
    expo_id: str | None,
    limit: int,
    dry_run: bool,
    skip_existing: bool,
    only_failed: bool,
    from_status: str | None,
    concurrency: int,
) -> None:
    from sqlalchemy import select

    from .db.engine import dispose_engine, get_sessionmaker, init_db
    from .db.models import ExpoORM
    from .db.repositories import exhibitor_ref_repo as ref_repo
    from .orchestrator.standalone import process_ref

    settings = get_settings()
    sm = get_sessionmaker()

    try:
        await init_db()
    except Exception as e:  # noqa: BLE001
        console.print(f"[red]init_db failed: {str(e)[:200]}[/red]")
        raise typer.Exit(1) from None

    cap = concurrency if concurrency > 0 else max(1, int(settings.crawl4ai_max_concurrent))
    sem = asyncio.Semaphore(cap)
    console.print(f"[dim]concurrency: {cap}[/dim]")

    counters = {
        "processed": 0,
        "extracted": 0,
        "resolved": 0,
        "enriched": 0,
        "dedup_skipped": 0,
        "resolve_failed": 0,
        "enrich_failed": 0,
        "validation_rejected": 0,
        "scope_rejected": 0,
        "skipped_pdfs": 0,
        "failed_pdfs": 0,
    }

    async def _bump(outcome_status: str) -> None:
        if outcome_status in counters:
            counters[outcome_status] += 1

    async def _run_with_sem(ref) -> None:
        async with sem:
            try:
                outcome = await process_ref(ref)
                await _bump(outcome.status)
            except Exception as e:  # noqa: BLE001
                console.print(f"[red]process_ref crashed for {ref.name[:60]}: {str(e)[:160]}[/red]")

    target_status: str | None = None
    if only_failed:
        target_status = "resolve_failed"
    elif from_status:
        target_status = from_status

    if target_status:
        offset = 0
        page_size = 100
        total_target = 0
        async with sm() as session:
            total_target = await ref_repo.count_total(session, status=target_status)
        if total_target == 0:
            console.print(f"[yellow]no refs with status={target_status}[/yellow]")
            await dispose_engine()
            return
        cap_total = limit if limit > 0 else total_target
        console.print(f"[cyan]processing up to {cap_total} refs with status={target_status}[/cyan]")

        retried = 0
        while retried < cap_total:
            async with sm() as session:
                rows = await ref_repo.list_by_status(
                    session, status=target_status, limit=page_size, offset=offset
                )
            if not rows:
                break
            tasks = []
            for orm in rows:
                if retried >= cap_total:
                    break
                retried += 1
                tasks.append(asyncio.create_task(_retry_one_with_sem(sem, orm.ref_id, _bump, dry_run)))
            await asyncio.gather(*tasks, return_exceptions=True)
            # Re-list from offset 0 each time since rows transition out of target status
            offset = 0
            console.print(f"[dim]processed {retried}/{cap_total}[/dim]")

        await dispose_engine()
        _print_reprocess_table(counters, mode=f"status={target_status}")
        return

    pdfs_root: Path = settings.data_dir / "pdfs"
    if not pdfs_root.exists():
        console.print(f"[yellow]No pdfs directory at {pdfs_root}[/yellow]")
        await dispose_engine()
        return

    async with sm() as scout:
        rows = (await scout.execute(select(ExpoORM.expo_id))).scalars().all()
        known_expos: set[str] = set(rows)
    console.print(f"[dim]known expos in DB: {len(known_expos)}[/dim]")

    from .tools.scrapers import pdf_extractor as pdf_extractor_mod

    for expo_dir in sorted(pdfs_root.iterdir()):
        if not expo_dir.is_dir():
            continue
        dir_expo_id = expo_dir.name
        if expo_id and dir_expo_id != expo_id:
            continue
        if dir_expo_id not in known_expos:
            console.print(f"[yellow]skipping orphan dir {dir_expo_id} (expo not in DB)[/yellow]")
            continue

        for pdf_file in sorted(expo_dir.glob("*.pdf")):
            if limit > 0 and counters["processed"] >= limit:
                break

            sidecar = pdf_file.with_suffix(pdf_file.suffix + ".meta.json")
            meta: dict = {}
            if sidecar.exists():
                try:
                    meta = json.loads(sidecar.read_text(encoding="utf-8"))
                except Exception:  # noqa: BLE001
                    meta = {}
            source_url = meta.get("source_url") or f"file://{pdf_file}"

            if skip_existing:
                async with sm() as session:
                    from sqlalchemy import select as _sel

                    from .db.models import PdfORM

                    existing = (
                        await session.execute(_sel(PdfORM).where(PdfORM.filename == pdf_file.name))
                    ).scalar_one_or_none()
                    if existing is not None and existing.vendors_found > 0:
                        counters["skipped_pdfs"] += 1
                        continue

            counters["processed"] += 1
            console.print(f"[cyan]reprocessing[/cyan] {dir_expo_id}/{pdf_file.name}")

            try:
                refs = await pdf_extractor_mod.list_exhibitors(source_url, dir_expo_id)
            except Exception as e:  # noqa: BLE001
                counters["failed_pdfs"] += 1
                console.print(f"[red]extraction failed {pdf_file.name}: {str(e)[:160]}[/red]")
                continue

            counters["extracted"] += len(refs)
            console.print(f"[green]extracted {len(refs)} refs from {pdf_file.name}[/green]")

            if dry_run or not refs:
                continue

            tasks = [asyncio.create_task(_run_with_sem(r)) for r in refs]
            await asyncio.gather(*tasks, return_exceptions=True)

        if limit > 0 and counters["processed"] >= limit:
            break

    await dispose_engine()
    _print_reprocess_table(counters, mode="walk-pdfs")


async def _retry_one_with_sem(sem, ref_id: str, bumper, dry_run: bool) -> None:
    async with sem:
        if dry_run:
            return
        try:
            from .orchestrator.standalone import process_ref_by_id

            outcome = await process_ref_by_id(ref_id)
            if outcome is not None:
                await bumper(outcome.status)
        except Exception as e:  # noqa: BLE001
            console.print(f"[red]retry crashed {ref_id}: {str(e)[:160]}[/red]")


def _print_reprocess_table(counters: dict, *, mode: str) -> None:
    table = Table(title=f"PDF Reprocess Summary ({mode})")
    table.add_column("Metric")
    table.add_column("Count", justify="right")
    for k in [
        "processed",
        "extracted",
        "resolved",
        "enriched",
        "dedup_skipped",
        "resolve_failed",
        "enrich_failed",
        "validation_rejected",
        "scope_rejected",
        "skipped_pdfs",
        "failed_pdfs",
    ]:
        table.add_row(k, str(counters.get(k, 0)))
    console.print(table)


if __name__ == "__main__":
    app()
