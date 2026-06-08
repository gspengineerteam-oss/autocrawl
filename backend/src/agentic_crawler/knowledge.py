"""Persistent self-learning store for the agentic crawler.

Two tiers of memory:

  Tier 1 — JSON at `data/agentic_knowledge.json`
    Human-readable. Source of truth for: per-expo memory (successful URLs,
    vendors seen, run stats) and the global domain blacklist. Loaded once at
    startup, atomically written after each task.

  Tier 2 — Chroma collection `agentic_vendors_seen`
    Vector index for fuzzy vendor dedup across runs and language variants.
    Embeds via `qwen3-embedding:8b` (the same model the base crawler uses for
    its own dedup), 4096-dim. Cosine ≥ threshold = "already seen".

The store is single-process by design — single replica of agentic-crawler,
atomic-rename writes prevent corruption, no locking layer.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from crawler.observability.logger import get_logger
from crawler.tools.llm.openai_client import embed_one
from crawler.tools.url_utils import canonical_domain

from .config import get_agentic_settings

_log = get_logger(__name__)

_COLLECTION_NAME = "agentic_vendors_seen"


# ---------------------------------------------------------------------------
# Pydantic models — JSON schema
# ---------------------------------------------------------------------------


class FailedUrl(BaseModel):
    url: str
    reason: str
    count: int = 1
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExpoMemory(BaseModel):
    expo_name: str
    successful_urls: list[str] = Field(default_factory=list)
    failed_urls: list[FailedUrl] = Field(default_factory=list)
    vendors_seen: list[str] = Field(default_factory=list)
    runs: int = 0
    last_run_at: datetime | None = None
    avg_extraction_time_s: float | None = None


class DomainBlacklist(BaseModel):
    domain: str
    fail_count: int = 0
    last_error: str = ""
    blacklist_until: datetime | None = None


class DiscoveryAttempt(BaseModel):
    """One row in the discovery audit trail. Lets the next pass cheaply check
    'have we tried this query→domain pair recently?' before re-queueing it."""

    query: str
    domain: str
    picked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    outcome: Literal["queued", "success", "failure", "filtered"] = "queued"


class AgenticKnowledge(BaseModel):
    expos: dict[str, ExpoMemory] = Field(default_factory=dict)
    blacklist: dict[str, DomainBlacklist] = Field(default_factory=dict)
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Discovery (Mode C) state — empty by default so existing JSON files load
    # without migration. Bounded to 1000 entries via sliding-window drop.
    discovery_history: list[DiscoveryAttempt] = Field(default_factory=list)
    # Round-robin pointer over the topic taxonomy. Advances by N each pass so
    # over time the full taxonomy gets exercised even when per-pass slice is
    # smaller than total topic count.
    discovery_topic_cursor: int = 0


# ---------------------------------------------------------------------------
# Chroma collection helper
# ---------------------------------------------------------------------------


_chroma_collection: Any = None
_chroma_lock = asyncio.Lock()


async def _get_vendors_collection() -> Any:
    """Lazily create / fetch the `agentic_vendors_seen` Chroma collection.

    Mirrors the dim-mismatch auto-recovery in `crawler.store.vector_store` so
    a model swap (qwen3-embedding:8b → other) wipes the index transparently
    on next startup.
    """
    global _chroma_collection
    async with _chroma_lock:
        if _chroma_collection is not None:
            return _chroma_collection
        try:
            import chromadb  # type: ignore

            from crawler.config import get_settings as _get_crawler_settings

            settings = _get_crawler_settings()
            try:
                client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
                client.heartbeat()
            except Exception as e:  # noqa: BLE001
                _log.info("agentic.chroma_http_unavailable_using_persistent", error=str(e))
                persist_dir = settings.data_dir / "vector_db"
                persist_dir.mkdir(parents=True, exist_ok=True)
                client = chromadb.PersistentClient(path=str(persist_dir))

            coll = client.get_or_create_collection(
                _COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
            )

            # Auto-detect dim mismatch (model swap) and recreate.
            count = await asyncio.to_thread(coll.count)
            if count > 0:
                probe = await embed_one("dim probe")
                current_dim = len(probe)
                sample = await asyncio.to_thread(coll.peek, 1)
                existing = sample.get("embeddings")
                # Chroma returns embeddings as numpy ndarray; can't use
                # truthy `if existing[0]` because numpy arrays raise
                # "truth value ambiguous". Probe via len() guard instead.
                first_vec = None
                try:
                    if existing is not None and len(existing) > 0:
                        first_vec = existing[0]
                except Exception:  # noqa: BLE001
                    first_vec = None
                if first_vec is not None and len(first_vec) != current_dim:
                    _log.warning(
                        "agentic.vendors_collection_dim_mismatch",
                        existing_dim=len(first_vec),
                        current_dim=current_dim,
                        action="wipe_and_recreate",
                    )
                    try:
                        client.delete_collection(_COLLECTION_NAME)
                    except Exception:  # noqa: BLE001
                        pass
                    coll = client.get_or_create_collection(
                        _COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
                    )

            _chroma_collection = coll
            return _chroma_collection
        except Exception as e:  # noqa: BLE001
            _log.error("agentic.chroma_unavailable", error=str(e))
            raise


def _vendor_doc_text(name: str, domain: str | None) -> str:
    """Build the embedding text for a vendor row. Same shape as base crawler
    so identical strings hash to identical vectors when caches overlap."""
    parts = [name.strip()]
    if domain:
        parts.append(domain.strip().lower())
    return " | ".join(parts)


# ---------------------------------------------------------------------------
# KnowledgeStore — public API
# ---------------------------------------------------------------------------


class KnowledgeStore:
    """Async-safe wrapper over the JSON file + Chroma collection."""

    _instance: "KnowledgeStore | None" = None
    _instance_lock = asyncio.Lock()

    def __init__(self, knowledge: AgenticKnowledge) -> None:
        self._knowledge = knowledge

    @classmethod
    async def load(cls) -> "KnowledgeStore":
        """Load (or initialize) the singleton store. Reads JSON file if exists,
        else creates an empty knowledge base."""
        async with cls._instance_lock:
            if cls._instance is not None:
                return cls._instance
            path = get_agentic_settings().knowledge_path
            if path.exists():
                try:
                    raw = path.read_text(encoding="utf-8")
                    knowledge = AgenticKnowledge.model_validate_json(raw)
                    _log.info(
                        "agentic.knowledge_loaded",
                        path=str(path),
                        expos=len(knowledge.expos),
                        blacklist=len(knowledge.blacklist),
                    )
                except Exception as e:  # noqa: BLE001
                    _log.warning(
                        "agentic.knowledge_corrupt_resetting",
                        path=str(path),
                        error=str(e),
                    )
                    knowledge = AgenticKnowledge()
            else:
                _log.info("agentic.knowledge_init", path=str(path))
                knowledge = AgenticKnowledge()
                path.parent.mkdir(parents=True, exist_ok=True)
            cls._instance = cls(knowledge)
            return cls._instance

    async def save(self) -> None:
        """Atomic write — tempfile + rename so a kill mid-write can't corrupt."""
        path = get_agentic_settings().knowledge_path
        self._knowledge.saved_at = datetime.now(timezone.utc)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        body = self._knowledge.model_dump_json(indent=2)
        await asyncio.to_thread(tmp.write_text, body, encoding="utf-8")
        # `Path.replace` is atomic on POSIX and Windows when the target's
        # parent directory hosts both files.
        await asyncio.to_thread(os.replace, str(tmp), str(path))

    # ---- expo memory ------------------------------------------------------

    def get_expo(self, name: str) -> ExpoMemory | None:
        return self._knowledge.expos.get(name)

    async def record_success(
        self,
        expo_name: str,
        url: str,
        vendor_names: list[str],
        elapsed_s: float,
    ) -> None:
        mem = self._knowledge.expos.get(expo_name) or ExpoMemory(expo_name=expo_name)
        # Move this URL to the front of successful_urls (most recent first).
        if url in mem.successful_urls:
            mem.successful_urls.remove(url)
        mem.successful_urls.insert(0, url)
        # Cap to 5 most recent successful URLs.
        mem.successful_urls = mem.successful_urls[:5]
        # Append vendor names, dedup string-equal.
        existing = set(mem.vendors_seen)
        for n in vendor_names:
            n = n.strip()
            if n and n not in existing:
                mem.vendors_seen.append(n)
                existing.add(n)
        mem.runs += 1
        mem.last_run_at = datetime.now(timezone.utc)
        # Running average of extraction time.
        if mem.avg_extraction_time_s is None:
            mem.avg_extraction_time_s = elapsed_s
        else:
            mem.avg_extraction_time_s = (
                (mem.avg_extraction_time_s * (mem.runs - 1)) + elapsed_s
            ) / mem.runs
        self._knowledge.expos[expo_name] = mem

    async def record_failure(self, expo_name: str, url: str, reason: str) -> None:
        mem = self._knowledge.expos.get(expo_name) or ExpoMemory(expo_name=expo_name)
        # Update or append to failed_urls.
        for fu in mem.failed_urls:
            if fu.url == url:
                fu.count += 1
                fu.reason = reason
                fu.last_seen = datetime.now(timezone.utc)
                break
        else:
            mem.failed_urls.append(FailedUrl(url=url, reason=reason))
        # Cap to 20 most-recent failures.
        mem.failed_urls = sorted(mem.failed_urls, key=lambda f: f.last_seen, reverse=True)[:20]
        mem.last_run_at = datetime.now(timezone.utc)
        self._knowledge.expos[expo_name] = mem

    # ---- blacklist --------------------------------------------------------

    async def mark_blacklist(
        self, domain: str, reason: str, days: int | None = None
    ) -> None:
        s = get_agentic_settings()
        days = days if days is not None else s.blacklist_days
        bl = self._knowledge.blacklist.get(domain) or DomainBlacklist(domain=domain)
        bl.fail_count += 1
        bl.last_error = reason[:200]
        if bl.fail_count >= s.blacklist_fail_threshold:
            bl.blacklist_until = datetime.now(timezone.utc) + timedelta(days=days)
            _log.info(
                "agentic.domain_blacklisted",
                domain=domain,
                until=bl.blacklist_until.isoformat(),
                fail_count=bl.fail_count,
            )
        self._knowledge.blacklist[domain] = bl

    def is_blacklisted(self, domain: str) -> bool:
        bl = self._knowledge.blacklist.get(domain)
        if bl is None or bl.blacklist_until is None:
            return False
        return datetime.now(timezone.utc) < bl.blacklist_until

    def should_skip_blacklisted(self, domain: str) -> bool:
        """Combined check: blacklisted AND we don't randomly want to retry it.
        Returns True = skip this seed.
        """
        if not self.is_blacklisted(domain):
            return False
        s = get_agentic_settings()
        if random.random() < s.blacklist_curiosity:
            _log.info("agentic.curiosity_retry", domain=domain)
            return False
        return True

    # ---- discovery (Mode C) ----------------------------------------------

    def was_recently_tried(
        self, query: str, domain: str, lookback_days: int
    ) -> bool:
        """True if (query, domain) appeared in discovery_history within the
        lookback window. Linear scan over ≤1000 rows — fine for per-seed check.
        """
        if not query or not domain:
            return False
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(0, lookback_days))
        q = query.strip().lower()
        d = domain.strip().lower()
        for att in self._knowledge.discovery_history:
            if att.picked_at < cutoff:
                continue
            if att.query.strip().lower() == q and att.domain.strip().lower() == d:
                return True
        return False

    async def record_discovery_attempt(
        self,
        query: str,
        domain: str,
        outcome: Literal["queued", "success", "failure", "filtered"],
    ) -> None:
        """Append a discovery attempt and persist. Trims to 1000 most-recent."""
        if not query or not domain:
            return
        self._knowledge.discovery_history.append(
            DiscoveryAttempt(query=query, domain=domain, outcome=outcome)
        )
        # Sliding-window cap — keep last 1000 entries.
        if len(self._knowledge.discovery_history) > 1000:
            self._knowledge.discovery_history = self._knowledge.discovery_history[-1000:]
        await self.save()

    async def next_discovery_topics(
        self, n: int, total_topics: int
    ) -> tuple[int, int]:
        """Advance the round-robin cursor by `n` and persist. Returns
        (start, end) indices the caller should slice the topic list with.
        """
        if total_topics <= 0 or n <= 0:
            return 0, 0
        start = self._knowledge.discovery_topic_cursor % total_topics
        end = start + min(n, total_topics)
        self._knowledge.discovery_topic_cursor = end % max(1, total_topics)
        await self.save()
        return start, end

    # ---- vector dedup -----------------------------------------------------

    async def is_vendor_seen(
        self, name: str, domain: str | None = None
    ) -> bool:
        """True if a near-duplicate is already in the Chroma index."""
        if not name or not name.strip():
            return False
        try:
            coll = await _get_vendors_collection()
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.vendor_dedup_unavailable", error=str(e))
            return False  # fail-open: if Chroma down, assume not seen
        text = _vendor_doc_text(name, domain)
        try:
            vec = await embed_one(text)
            res = await asyncio.to_thread(
                coll.query, query_embeddings=[vec], n_results=1
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.vendor_dedup_query_failed", error=str(e))
            return False
        distances = res.get("distances") or [[]]
        if not distances or not distances[0]:
            return False
        # Chroma cosine distance = 1 - cosine_similarity. Threshold is on
        # similarity, so flip: similar if distance <= (1 - threshold).
        threshold = get_agentic_settings().vendor_dedup_threshold
        max_distance = 1.0 - threshold
        nearest_dist = float(distances[0][0])
        if nearest_dist <= max_distance and not math.isnan(nearest_dist):
            return True
        return False

    async def record_vendor_seen(
        self, name: str, domain: str | None, expo_name: str
    ) -> None:
        if not name or not name.strip():
            return
        try:
            coll = await _get_vendors_collection()
        except Exception:  # noqa: BLE001
            return
        text = _vendor_doc_text(name, domain)
        try:
            vec = await embed_one(text)
            doc_id = f"{(domain or 'unknown').lower()}::{name.strip().lower()[:120]}"
            await asyncio.to_thread(
                coll.upsert,
                ids=[doc_id],
                embeddings=[vec],
                documents=[text],
                metadatas=[{"name": name, "domain": domain or "", "expo": expo_name}],
            )
        except Exception as e:  # noqa: BLE001
            _log.debug("agentic.vendor_dedup_upsert_failed", error=str(e))


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def is_blocking_error(message: str) -> bool:
    """Heuristic — does this error message indicate a site-level block worth
    blacklisting the domain over (vs a transient network glitch)?"""
    if not message:
        return False
    m = message.lower()
    return any(
        p in m
        for p in (
            "captcha",
            "cloudflare",
            "403",
            "forbidden",
            "rate limit",
            "blocked",
            "bot detect",
            "access denied",
            "challenge",
        )
    )


def domain_of(url: str) -> str:
    """Wrapper around `canonical_domain` that returns "" on parse failure
    instead of raising."""
    try:
        return canonical_domain(url) or ""
    except Exception:  # noqa: BLE001
        return ""
