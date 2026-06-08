"""End to end test untuk semua search provider yang ada di codebase.

Cara pake.

```bash
docker compose exec crawler python /app/scripts/test_search_providers.py
docker compose exec crawler python /app/scripts/test_search_providers.py "milipol paris 2026"
```

Output. Console table per provider plus file JSON di
`/app/data/test_search_<timestamp>.json` yang berisi raw status, latency,
sample URLs per provider untuk audit.

Yang di test.

- Tier 1. wikipedia, ddg, google_news_rss
- Tier 2. searxng (kalau container up)
- Tier 3. tavily, brave, bing (skip kalau key kosong)
- Tier 4. reddit, hackernews, github_search, arxiv, openalex,
  semantic_scholar, internet_archive, wayback_cdx
- Tier 5. openserp (kalau enabled)
- Tier 6. baidu, naver, yahoo_japan (region detect)

Plus directory scraper.

- conferenceindex, allconferences, eventseye

Plus Jina Reader.

- fetch_clean_markdown sample URL.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

# Pastikan crawler package importable saat run via `docker compose exec crawler`
# yang sudah punya /app/src di PYTHONPATH via pyproject.
sys.path.insert(0, "/app/src")

from crawler.tools.search.base import SearchHit  # noqa: E402


DEFAULT_QUERY = "security defense expo 2026"
SAMPLE_URL_FOR_JINA = "https://en.wikipedia.org/wiki/IDEX_(international_defence_exhibition)"


def _ts_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summarize_hits(hits: list[SearchHit], limit: int = 3) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for h in hits[:limit]:
        out.append({
            "title": (h.title or "")[:120],
            "url": h.url or "",
        })
    return out


async def _time_provider(
    name: str,
    coro_factory: Callable[[], Awaitable[Any]],
    *,
    expected_iterable: bool = True,
) -> dict[str, Any]:
    """Run a provider call, capture status/latency/sample."""
    start = time.monotonic()
    record: dict[str, Any] = {
        "provider": name,
        "started_at": _ts_iso(),
        "status": "unknown",
        "latency_ms": 0,
        "hits_count": 0,
        "sample": [],
        "error": None,
    }
    try:
        result = await coro_factory()
        record["latency_ms"] = round((time.monotonic() - start) * 1000)
        if expected_iterable:
            try:
                hits = list(result) if result else []
            except TypeError:
                hits = []
            record["hits_count"] = len(hits)
            if hits and isinstance(hits[0], SearchHit):
                record["sample"] = _summarize_hits(hits)
            else:
                record["sample"] = [str(x)[:200] for x in hits[:3]]
            if record["hits_count"] > 0:
                record["status"] = "ok"
            else:
                record["status"] = "empty"
        else:
            record["status"] = "ok" if result else "empty"
            if isinstance(result, str):
                record["sample"] = [{"preview": result[:200]}]
                record["hits_count"] = 1 if result else 0
            elif isinstance(result, dict):
                record["sample"] = [{"keys": ", ".join(list(result.keys())[:8])}]
                record["hits_count"] = 1 if result else 0
    except Exception as e:  # noqa: BLE001
        record["latency_ms"] = round((time.monotonic() - start) * 1000)
        record["status"] = "error"
        record["error"] = f"{type(e).__name__}: {str(e)[:240]}"
    return record


async def _run_all(query: str) -> dict[str, Any]:
    results: list[dict[str, Any]] = []

    # Tier 1
    from crawler.tools.search import (
        ddg as p_ddg,
        google_news_rss as p_gnews,
        wikipedia as p_wiki,
    )
    results.append(await _time_provider("wikipedia", lambda: p_wiki.search(query, max_results=10)))
    results.append(await _time_provider("ddg", lambda: p_ddg.search(query, max_results=10)))
    results.append(await _time_provider("google_news_rss", lambda: p_gnews.search(query, max_results=10)))

    # Tier 2
    from crawler.tools.search import searxng as p_searxng
    results.append(await _time_provider("searxng", lambda: p_searxng.search(query, max_results=15)))

    # Tier 3 (key opsional, skip kalau gak aktif tapi tetap rekam status)
    from crawler.tools.search import bing as p_bing
    from crawler.tools.search import brave as p_brave
    from crawler.tools.search import tavily as p_tavily
    results.append(await _time_provider("tavily", lambda: p_tavily.search(query, max_results=10)))
    results.append(await _time_provider("brave", lambda: p_brave.search(query, max_results=10)))
    results.append(await _time_provider("bing", lambda: p_bing.search(query, max_results=10)))

    # Tier 4
    from crawler.tools.search import (
        arxiv as p_arxiv,
        github_search as p_gh,
        hackernews as p_hn,
        internet_archive as p_ia,
        openalex as p_oa,
        reddit as p_reddit,
        semantic_scholar as p_ss,
        wayback_cdx as p_wb,
    )
    results.append(await _time_provider("reddit", lambda: p_reddit.search(query, max_results=10)))
    results.append(await _time_provider("hackernews", lambda: p_hn.search(query, max_results=10)))
    results.append(await _time_provider("github_search", lambda: p_gh.search(query, max_results=10)))
    results.append(await _time_provider("arxiv", lambda: p_arxiv.search(query, max_results=10)))
    results.append(await _time_provider("openalex", lambda: p_oa.search(query, max_results=10)))
    results.append(await _time_provider("semantic_scholar", lambda: p_ss.search(query, max_results=10)))
    results.append(await _time_provider("internet_archive", lambda: p_ia.search(query, max_results=10)))
    results.append(await _time_provider("wayback_cdx", lambda: p_wb.search(query, max_results=10)))

    # Tier 5 OpenSERP
    from crawler.tools.search import openserp as p_openserp
    results.append(await _time_provider("openserp", lambda: p_openserp.search(query, max_results=10)))

    # Tier 6 region engines
    from crawler.tools.search import baidu as p_baidu
    from crawler.tools.search import naver as p_naver
    from crawler.tools.search import yahoo_japan as p_yj
    results.append(await _time_provider("baidu", lambda: p_baidu.search(query, max_results=10)))
    results.append(await _time_provider("naver", lambda: p_naver.search(query, max_results=10)))
    results.append(await _time_provider("yahoo_japan", lambda: p_yj.search(query, max_results=10)))

    # Tier 6 directory scrape
    from crawler.tools.scrapers import (
        allconferences as s_all,
        conferenceindex as s_ci,
        eventseye as s_eye,
    )
    results.append(await _time_provider("conferenceindex", s_ci.list_expo_candidates))
    results.append(await _time_provider("allconferences", s_all.list_expo_candidates))
    results.append(await _time_provider("eventseye", s_eye.list_expo_candidates))

    # Plus Jina Reader (single URL fetch, beda shape jadi expected_iterable=False)
    from crawler.tools.browsers import jina_reader as p_jina
    results.append(
        await _time_provider(
            "jina_reader",
            lambda: p_jina.fetch_clean_markdown(SAMPLE_URL_FOR_JINA, timeout_seconds=20),
            expected_iterable=False,
        )
    )

    return {
        "query": query,
        "ran_at": _ts_iso(),
        "results": results,
        "summary": _build_summary(results),
    }


def _build_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    ok = sum(1 for r in results if r["status"] == "ok")
    empty = sum(1 for r in results if r["status"] == "empty")
    error = sum(1 for r in results if r["status"] == "error")
    total_hits = sum(int(r.get("hits_count") or 0) for r in results)
    avg_latency = round(
        sum(int(r.get("latency_ms") or 0) for r in results) / max(1, total)
    )
    return {
        "total_providers": total,
        "ok": ok,
        "empty": empty,
        "error": error,
        "total_hits": total_hits,
        "avg_latency_ms": avg_latency,
    }


def _print_table(report: dict[str, Any]) -> None:
    print()
    print(f"Query  : {report['query']}")
    print(f"Ran at : {report['ran_at']}")
    print()
    header = f"{'PROVIDER':<22} {'STATUS':<8} {'HITS':>5} {'LAT(ms)':>8}  ERROR / SAMPLE"
    print(header)
    print("-" * len(header))
    for r in report["results"]:
        status = r["status"]
        marker = "[OK]" if status == "ok" else "[..]" if status == "empty" else "[FAIL]"
        err = ""
        if status == "error":
            err = (r.get("error") or "")[:60]
        elif r.get("sample"):
            first = r["sample"][0]
            if isinstance(first, dict):
                err = (first.get("title") or first.get("preview") or first.get("keys") or "")[:60]
        print(
            f"{r['provider']:<22} {marker:<8} {r['hits_count']:>5} {r['latency_ms']:>8}  {err}"
        )
    s = report["summary"]
    print()
    print(
        f"Summary: {s['ok']} ok / {s['empty']} empty / {s['error']} error / "
        f"{s['total_hits']} total hits / avg {s['avg_latency_ms']}ms"
    )


async def main() -> int:
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY

    print(f"\nTesting all search providers with query. {query!r}\n")
    report = await _run_all(query)

    # Tulis JSON ke /app/data (bind-mount ke ./data di host).
    out_dir = Path("/app/data")
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = out_dir / f"test_search_{ts}.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    _print_table(report)
    print(f"\nFull JSON disimpan ke {out_path} (host. ./data/{out_path.name})")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
