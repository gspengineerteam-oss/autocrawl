"""24/7 scheduler loop. Iterates through seeds at a configured interval.

Independent from the base crawler's APScheduler — uses its own Redis lock
key (`autocrawl:agentic_active_run`) so two producers can't accidentally
serialize on the same lock. If Redis is unavailable, falls back to in-process
locking only (safe for single-replica deployments).

Graceful shutdown: SIGTERM (sent by `docker compose stop`) and SIGINT (Ctrl-C)
flip an asyncio Event. The scheduler checks it between seeds AND between
passes, so the worst-case shutdown latency is one in-flight Browser-Use task
(capped at AGENTIC_TASK_TIMEOUT seconds, default 300). The Redis lock is
released cleanly so the next start doesn't have to fight a stale lock.
"""

from __future__ import annotations

import asyncio
import json
import random
import signal
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from crawler.observability.logger import get_logger
from crawler.store.redis_queue import get_redis

from .config import get_agentic_settings
from .preflight import passes_preflight
from .runner import run_seed
from .seeds import apply_knowledge_to_seeds, load_seeds

_log = get_logger(__name__)

def _lock_key() -> str:
    """Per-hostname lock so two `agentic-a` / `agentic-b` containers can run
    listing passes simultaneously without fighting for one global lock.
    Each container's hostname is unique; same-host re-entries (rare) still
    serialize via NX semantics."""
    import os
    import socket

    host = os.environ.get("HOSTNAME") or socket.gethostname() or "default"
    return f"autocrawl:agentic_active_run:{host}"


_LOCK_TTL_SECONDS = 60 * 60 * 6  # 6 hours, longer than any realistic seed batch

# Heartbeat file path. Docker HEALTHCHECK probes the mtime: if older than
# 10 minutes (or missing), the container is marked unhealthy and the
# external watchdog (or docker-compose restart) recovers it. Writing
# after every pass means a zombie loop can be detected within one
# interval + healthcheck retries.
_HEARTBEAT_PATH = "/tmp/agentic_heartbeat"


def _write_heartbeat() -> None:
    try:
        with open(_HEARTBEAT_PATH, "w") as f:
            f.write(str(int(__import__("time").time())))
    except OSError as e:
        _log.debug("agentic.heartbeat_write_failed", error=str(e)[:120])

# Module-level shutdown gate. Set by signal handlers; consulted by the loop
# between seeds + between passes.
_shutdown_event: asyncio.Event | None = None


def _ensure_event() -> asyncio.Event:
    global _shutdown_event
    if _shutdown_event is None:
        _shutdown_event = asyncio.Event()
    return _shutdown_event


def _install_signal_handlers() -> None:
    """Wire SIGTERM/SIGINT to set the shutdown event.

    `loop.add_signal_handler` is the right primitive for asyncio (signal.signal
    blocks the event loop). Falls back silently on Windows where it's not
    implemented — there, only `agentic-crawl stop` (Redis flag) works.
    """
    event = _ensure_event()
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    def _set(sig_name: str) -> None:
        if not event.is_set():
            _log.info("agentic.shutdown_signal", signal=sig_name)
            event.set()

    for sig, name in ((signal.SIGTERM, "SIGTERM"), (signal.SIGINT, "SIGINT")):
        try:
            loop.add_signal_handler(sig, _set, name)
        except (NotImplementedError, RuntimeError):
            # Windows / non-main thread — operator can still trigger stop via
            # the Redis flag (`agentic-crawl stop` CLI sets it).
            pass


async def _try_acquire_lock() -> bool:
    client = await get_redis()
    if client is None:
        return True  # single-process mode without Redis — own lock
    payload = json.dumps({"started_at": datetime.now(timezone.utc).isoformat()})
    return bool(await client.set(_lock_key(), payload, ex=_LOCK_TTL_SECONDS, nx=True))


async def _release_lock() -> None:
    client = await get_redis()
    if client is not None:
        try:
            await client.delete(_lock_key())
        except Exception:  # noqa: BLE001
            pass


async def _is_remote_stop_requested() -> bool:
    """External kill switch: any client setting `autocrawl:agentic_stop_requested`
    in Redis triggers a graceful shutdown without needing shell access to the
    container. The `agentic-crawl stop` CLI uses this path.
    """
    client = await get_redis()
    if client is None:
        return False
    try:
        return bool(await client.get("autocrawl:agentic_stop_requested"))
    except Exception:  # noqa: BLE001
        return False


async def _clear_remote_stop_flag() -> None:
    client = await get_redis()
    if client is None:
        return
    try:
        await client.delete("autocrawl:agentic_stop_requested")
    except Exception:  # noqa: BLE001
        pass


async def _run_preflight(seeds: list[Any]) -> tuple[list[Any], dict[str, int]]:
    """Run `passes_preflight` against every seed in parallel; return the
    survivors plus a count-by-reason of what got dropped."""
    if not seeds:
        return [], {}
    results = await asyncio.gather(
        *(passes_preflight(s) for s in seeds), return_exceptions=True
    )
    kept: list[Any] = []
    dropped: dict[str, int] = {}
    for seed, r in zip(seeds, results, strict=True):
        if isinstance(r, BaseException):
            # Treat exception as fail-open — let agent try.
            kept.append(seed)
            continue
        ok, reason = r
        if ok:
            kept.append(seed)
        else:
            dropped[reason] = dropped.get(reason, 0) + 1
    return kept, dropped


async def _filter_dead_yaml_seeds(seeds: list[Any]) -> tuple[list[Any], dict[str, Any]]:
    """Drop YAML seeds with N+ recent `empty_result` lessons. Curiosity bypass
    lets a small fraction retry in case the page got fixed since last attempt.

    Without this, hourly passes burn ~3 minutes per seed on permanently broken
    pages (UMEX-style JS-only exhibitor lists with no extractable structure).
    Quarantine emerges from the strike-window itself: stop trying for the
    window duration → strikes age out → seed re-eligible naturally.
    """
    s = get_agentic_settings()
    if s.dead_seed_strikes <= 0:
        return seeds, {"dropped": 0, "quarantined": []}
    try:
        from .lessons import load_failure_lessons
    except ImportError:
        return seeds, {"dropped": 0, "quarantined": []}
    try:
        # Convert hours to days (rounded up) since loader works in days.
        lookback_days = max(1, (s.dead_seed_recent_window_hours + 23) // 24)
        failures = await load_failure_lessons(s.lessons_dir, lookback_days=lookback_days)
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.dead_seed_load_failed", error=str(e)[:160])
        return seeds, {"dropped": 0, "quarantined": []}
    if not failures:
        return seeds, {"dropped": 0, "quarantined": []}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=s.dead_seed_recent_window_hours)
    strikes_by_seed: dict[str, int] = defaultdict(int)
    for f in failures:
        if f.category != "empty_result":
            continue
        if not f.expo_name or f.archived_at < cutoff:
            continue
        strikes_by_seed[f.expo_name.strip().lower()] += 1

    kept: list[Any] = []
    quarantined: list[str] = []
    bypassed: list[str] = []
    for seed in seeds:
        key = (getattr(seed, "name", "") or "").strip().lower()
        n = strikes_by_seed.get(key, 0)
        if n < s.dead_seed_strikes:
            kept.append(seed)
            continue
        if random.random() < s.dead_seed_curiosity:
            kept.append(seed)
            bypassed.append(seed.name)
            continue
        quarantined.append(seed.name)
    return kept, {"dropped": len(quarantined), "quarantined": quarantined, "bypassed": bypassed}


async def _seed_blacklist_from_lessons() -> None:
    """Replay recent failure lessons into the blacklist. Lets the scheduler
    self-rebuild domain priors after a knowledge.json wipe — the lesson
    archive becomes the source of truth for 'this domain is blocked'."""
    s = get_agentic_settings()
    try:
        from .knowledge import KnowledgeStore
        from .lessons import load_failure_lessons, prune_old_lessons
    except ImportError:
        return
    try:
        await prune_old_lessons(s.lessons_dir, s.lessons_retention_days)
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.lessons_prune_failed", error=str(e))
    try:
        # Reuse the same lookback window used by discovery — 30 days strikes
        # a balance between stale-decision avoidance and forgetting too fast.
        failures = await load_failure_lessons(s.lessons_dir, lookback_days=30)
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.lessons_load_failed", error=str(e))
        return
    if not failures:
        return
    store = await KnowledgeStore.load()
    rebuilt = 0
    for f in failures:
        if f.category not in {"captcha", "403", "image_only"}:
            continue
        if store.is_blacklisted(f.domain):
            continue
        await store.mark_blacklist(f.domain, f"lesson:{f.category}")
        rebuilt += 1
    if rebuilt:
        await store.save()
        _log.info("agentic.lessons_blacklist_rebuilt", added=rebuilt)


async def _run_one_pass(event: asyncio.Event) -> None:
    s = get_agentic_settings()
    # Prime blacklist from recent failure lessons before loading seeds — this
    # way blacklist drops in `apply_knowledge_to_seeds` see the lesson-derived
    # entries on the very first pass after a knowledge.json wipe.
    await _seed_blacklist_from_lessons()
    seeds = load_seeds(s.seeds_yaml)

    # Mode C — autonomous discovery. Generates fresh seeds from the topic
    # taxonomy via LLM expand → multi-engine search → URL scoring. Concatenated
    # with the YAML-driven seeds; preflight handles drop-on-404 below.
    discovered: list[Any] = []
    if s.discovery_enabled:
        try:
            from .discovery import discover_new_seeds

            discovered = await discover_new_seeds()
        except Exception as e:  # noqa: BLE001
            _log.warning("agentic.discovery_failed", error=str(e)[:200])
            discovered = []
        if discovered:
            _log.info("agentic.discovery_seeds_added", count=len(discovered))
            seeds = list(seeds) + list(discovered)

    if not seeds:
        _log.info("agentic.scheduler_no_seeds", path=str(s.seeds_yaml))
        return

    # Apply self-learning knowledge — direct-URL replacement for known-good
    # expos, drop seeds whose domain is currently blacklisted.
    seeds = await apply_knowledge_to_seeds(seeds)
    if not seeds:
        _log.info("agentic.scheduler_all_seeds_filtered")
        return

    # Phase 3.1 — cross-twin sharding. With two `agentic-a` / `agentic-b`
    # twin containers loading the same YAML, we shard the seed list per
    # pass so each twin processes a DIFFERENT subset. Pass timestamp is
    # folded into the hash so shard membership reshuffles every pass —
    # twin A might own shotshow.org this pass, defenceiq.com next pass.
    # Both twins still cover the full seed pool over time, just never
    # the same seeds in the same pass.
    if s.agentic_shard_total > 1:
        import hashlib
        from datetime import datetime, timezone

        pass_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        shard_idx = max(0, s.agentic_shard_index) % s.agentic_shard_total

        def _own(seed_obj: Any) -> bool:
            key = f"{seed_obj.name}|{pass_bucket}".encode("utf-8")
            h = int.from_bytes(hashlib.md5(key).digest()[:4], "big")
            return (h % s.agentic_shard_total) == shard_idx

        before = len(seeds)
        seeds = [seed for seed in seeds if _own(seed)]
        _log.info(
            "agentic.scheduler_shard_filter",
            shard_index=shard_idx,
            shard_total=s.agentic_shard_total,
            pass_bucket=pass_bucket,
            kept=len(seeds),
            dropped=before - len(seeds),
        )
        if not seeds:
            _log.info("agentic.scheduler_all_seeds_other_shards")
            return

    # Dead-seed quarantine — drop YAML seeds that have N+ `empty_result`
    # lessons in the recent window. UMEX-style permanently broken pages
    # otherwise burn ~3 min/pass forever. Curiosity bypass keeps the door
    # open in case the page structure was fixed.
    seeds, dead_info = await _filter_dead_yaml_seeds(seeds)
    if dead_info["dropped"] or dead_info.get("bypassed"):
        _log.info(
            "agentic.scheduler_dead_seeds_filtered",
            dropped=dead_info["dropped"],
            quarantined=dead_info["quarantined"][:10],
            bypassed=dead_info.get("bypassed", []),
        )
    if not seeds:
        _log.info("agentic.scheduler_all_seeds_quarantined")
        return

    # Preflight HEAD probe — only enforced for seeds tagged `discovery`. Drops
    # 404s, non-HTML, sub-threshold pages before they hit the agent loop. Mode
    # A+B seeds pass through unchanged (preserves existing behavior).
    seeds, dropped_reasons = await _run_preflight(seeds)
    if not seeds:
        _log.info("agentic.scheduler_all_seeds_dropped_preflight", reasons=dropped_reasons)
        return
    if dropped_reasons:
        _log.info("agentic.scheduler_preflight_dropped", reasons=dropped_reasons)

    if not await _try_acquire_lock():
        _log.info("agentic.scheduler_locked_skip")
        return

    try:
        totals = {"resolved": 0, "enriched": 0, "dedup_skipped": 0, "rejected": 0, "failed": 0}
        # Parallel execution — N seeds run their own Chromium concurrently.
        # Each Browser-Use Agent spawns a separate browser process via
        # Playwright; under a single Xvfb display they tile / overlap in
        # noVNC so the operator sees all workspaces at once.
        parallelism = max(1, s.parallel_seeds)
        sem = asyncio.Semaphore(parallelism)
        _log.info(
            "agentic.scheduler_pass_started",
            seeds=len(seeds),
            parallelism=parallelism,
        )

        async def _run_bounded(seed: Any) -> dict[str, int]:
            async with sem:
                # Re-check shutdown state at the slot — a long queue would
                # otherwise keep launching new Chromium even after SIGTERM.
                if event.is_set() or await _is_remote_stop_requested():
                    return {"resolved": 0, "enriched": 0, "dedup_skipped": 0, "rejected": 0, "failed": 0}
                try:
                    return await run_seed(seed)
                except Exception as e:  # noqa: BLE001
                    _log.warning(
                        "agentic.scheduler_seed_crashed",
                        seed=seed.name,
                        error=str(e)[:200],
                    )
                    return {"resolved": 0, "enriched": 0, "dedup_skipped": 0, "rejected": 0, "failed": 1}

        results = await asyncio.gather(
            *(_run_bounded(seed) for seed in seeds),
            return_exceptions=False,
        )
        for counts in results:
            for k, v in counts.items():
                totals[k] = totals.get(k, 0) + v
        _log.info("agentic.scheduler_pass_done", seeds=len(seeds), **totals)
    finally:
        await _release_lock()


async def _try_acquire_listing_lock(key: str, ttl_seconds: int) -> bool:
    """NX lock to ensure only one twin runs a listing source per cadence
    window. TTL is set to the cadence minus a safety margin so the next
    window can re-acquire. Returns True when this caller wins the slot.
    Fail-open when Redis is unreachable so single-replica deploys still
    run the source (only one process exists anyway)."""
    client = await get_redis()
    if client is None:
        return True
    try:
        payload = json.dumps({"at": datetime.now(timezone.utc).isoformat()})
        return bool(await client.set(key, payload, ex=ttl_seconds, nx=True))
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.listing_lock_failed", key=key, error=str(e)[:120])
        return False


async def _maybe_run_awesome(now_utc: datetime) -> None:
    """Trigger awesome_lists pull weekly on Monday between 03:00-03:59 UTC.
    Redis NX lock with TTL 6 days prevents double-runs across the twin."""
    s = get_agentic_settings()
    if not getattr(s, "agentic_listing_source_awesome_enabled", True):
        return
    if now_utc.weekday() != 0 or now_utc.hour != 3:
        return
    if not await _try_acquire_listing_lock(
        "autocrawl:listing:awesome:last_run", ttl_seconds=6 * 24 * 3600
    ):
        return
    try:
        from .listing_sources.awesome_lists import run_awesome_lists_pull

        _log.info("agentic.listing_awesome_started")
        counts = await run_awesome_lists_pull()
        _log.info("agentic.listing_awesome_done", counts=counts)
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.listing_awesome_failed", error=str(e)[:200])


async def _maybe_run_cisa(now_utc: datetime) -> None:
    """Trigger cisa_partners pull monthly on day-1 between 04:00-04:59 UTC.
    Redis NX lock with TTL 27 days prevents double-runs across the twin."""
    s = get_agentic_settings()
    if not getattr(s, "agentic_listing_source_cisa_enabled", True):
        return
    if now_utc.day != 1 or now_utc.hour != 4:
        return
    if not await _try_acquire_listing_lock(
        "autocrawl:listing:cisa:last_run", ttl_seconds=27 * 24 * 3600
    ):
        return
    try:
        from .listing_sources.cisa_partners import run_cisa_partners_pull

        _log.info("agentic.listing_cisa_started")
        counts = await run_cisa_partners_pull()
        _log.info("agentic.listing_cisa_done", counts=counts)
    except Exception as e:  # noqa: BLE001
        _log.warning("agentic.listing_cisa_failed", error=str(e)[:200])


async def _listing_sources_ticker(event: asyncio.Event) -> None:
    """Wake every 5 min, dispatch any listing source whose cron window is
    open. Cheap when no source is due — just a wall-clock check + a Redis
    GET on the NX lock keys."""
    while not event.is_set():
        try:
            now_utc = datetime.now(timezone.utc)
            await _maybe_run_awesome(now_utc)
            await _maybe_run_cisa(now_utc)
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.listing_ticker_error", error=str(e)[:160])
        try:
            await asyncio.wait_for(event.wait(), timeout=300)
        except asyncio.TimeoutError:
            continue


async def run_forever() -> None:
    """Main entry point used by `agentic-crawl schedule` (docker CMD).

    On graceful shutdown (SIGTERM or remote stop flag), exits the loop, lets
    the runtime drain in-flight tasks, and returns cleanly. The container then
    stops without leaking Chromium subprocesses or stuck Redis locks.
    """
    s = get_agentic_settings()
    event = _ensure_event()
    _install_signal_handlers()

    if not s.enabled:
        _log.info("agentic.scheduler_disabled", env="AGENTIC_ENABLED=false")
        # Wait on the event instead of `sleep(forever)` so SIGTERM exits cleanly.
        await event.wait()
        _log.info("agentic.scheduler_exited_idle")
        return

    interval = max(1, s.run_interval_minutes) * 60
    _log.info("agentic.scheduler_started", interval_seconds=interval, vision=s.use_vision)

    # Boot-time heartbeat: first scheduler pass can take 30+ min on cold
    # expo pages. Without this, healthcheck reports `unhealthy` for the
    # entire window, which would trip the external watchdog into a needless
    # restart. We're alive the moment run_forever() begins.
    _write_heartbeat()

    # Clear any stale remote-stop flag from a previous run.
    await _clear_remote_stop_flag()

    # Boot-time auto-reset of OUR-hostname's stale state. When a container
    # gets force-recreated mid-run, the previous process leaves: (a) its
    # per-host scheduler lock set, blocking the new pass with
    # `scheduler_locked_skip` for hours, and (b) llm_queue counters
    # incremented but never decremented because the holding tasks died
    # before releasing. The next acquirer sees counter at cap and waits
    # until acquire timeout, then falls back to local sem — slow first
    # pass. Both are safe to clear here because we're the ONLY process
    # on this hostname allowed to set them.
    try:
        await _release_lock()
    except Exception:  # noqa: BLE001
        pass
    try:
        from crawler.store.redis_queue import get_redis as _gr

        client = await _gr()
        if client is not None:
            for k in (
                "llm:concurrency:vision",
                "llm:concurrency:heavy",
                "llm:concurrency:light",
                "llm:concurrency:tiny",
            ):
                try:
                    await client.set(k, 0)
                except Exception:  # noqa: BLE001
                    pass
            holder_keys = []
            async for hk in client.scan_iter(match="llm:concurrency:*:holder:*"):
                holder_keys.append(hk)
            if holder_keys:
                try:
                    await client.delete(*holder_keys)
                except Exception:  # noqa: BLE001
                    pass
            _log.info(
                "agentic.boot_reset",
                lock_cleared=True,
                llm_counters_reset=4,
                llm_holders_cleared=len(holder_keys),
            )
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.boot_reset_failed", error=str(e)[:160])

    # Phase 5 — 24h watchdog. Browser-Use 0.12.6 CDP cascade silently
    # degrades chromium stability after ~4-12h sustained run. Self-exit
    # at this hour mark forces docker `restart: unless-stopped` to spawn
    # a fresh process tree. Disabled if self_restart_hours <= 0.
    import time as _time
    self_restart_seconds = max(0.0, s.self_restart_hours) * 3600
    boot_ts = _time.time()

    # Background heartbeat ticker. The post-pass heartbeat (below) alone is
    # not enough — first listing pass on cold expo pages can take 30+ min,
    # which exceeds the healthcheck 10-min stale threshold and would mark
    # the container `unhealthy` while it's actually working hard. Tick once
    # per 60s so the heartbeat file's mtime stays fresh even during long
    # passes. The ticker exits when the shutdown event fires.
    async def _heartbeat_ticker() -> None:
        while not event.is_set():
            _write_heartbeat()
            try:
                await asyncio.wait_for(event.wait(), timeout=60)
            except asyncio.TimeoutError:
                continue

    heartbeat_task = asyncio.create_task(_heartbeat_ticker())

    # P4 — curated listing source ticker. Wakes every 5 min, checks UTC
    # wall clock against cron windows, and triggers awesome_lists (weekly
    # Mon 03:00) and cisa_partners (monthly day-1 04:00). Cross-twin
    # de-dup uses a Redis NX lock with TTL slightly shorter than the
    # cadence so the next window can re-acquire. Falls back to local-only
    # gating when Redis is unreachable.
    listing_task = asyncio.create_task(_listing_sources_ticker(event))

    while not event.is_set():
        try:
            await _run_one_pass(event)
        except Exception as e:  # noqa: BLE001
            _log.exception("agentic.scheduler_pass_failed", error=str(e))

        _write_heartbeat()

        if event.is_set():
            break
        if await _is_remote_stop_requested():
            _log.info("agentic.scheduler_remote_stop")
            event.set()
            break

        # 24h watchdog — exit cleanly so docker restart-unless-stopped
        # respawns a fresh container with new chromium subprocess tree.
        if self_restart_seconds > 0 and (_time.time() - boot_ts) >= self_restart_seconds:
            _log.warning(
                "agentic.scheduler_self_restart",
                uptime_hours=round((_time.time() - boot_ts) / 3600, 2),
                reason="cdp_cascade_prevention",
            )
            event.set()
            break

        # Interruptible sleep — SIGTERM during the inter-pass pause exits fast.
        try:
            await asyncio.wait_for(event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass  # interval elapsed, continue to next pass

    heartbeat_task.cancel()
    listing_task.cancel()
    for t in (heartbeat_task, listing_task):
        try:
            await t
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass

    await _release_lock()
    await _clear_remote_stop_flag()
    _log.info("agentic.scheduler_stopped")
    # Hard exit via os._exit so the asyncio.gather(return_exceptions=True)
    # in cli.py cannot swallow the SystemExit and leave sibling tasks
    # (enrich, product) keeping the event loop alive. os._exit bypasses
    # Python cleanup and sends exit code 1 directly to the kernel —
    # docker `restart: unless-stopped` then respawns the container.
    _log.warning("agentic.scheduler_hard_exit", exit_code=1)
    import os as _os
    _os._exit(1)
