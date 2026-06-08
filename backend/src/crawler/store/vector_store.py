"""ChromaDB vendor vector store — semantic dedup of vendors across runs.

Each vendor is embedded as `"{name} | {domain} | {tagline}"` using OpenAI's
embeddings model and stored in a single Chroma collection. Before enrichment
we look up by vector similarity; if cosine ≥ 0.92, the vendor is considered
a duplicate and the new sighting is merged into the existing record.
"""

from __future__ import annotations

import asyncio
from typing import Any

from ..config import get_settings
from ..observability.logger import get_logger
from ..tools.llm.openai_client import embed_many, embed_one

_log = get_logger(__name__)
_CLIENT: Any | None = None
_COLLECTION: Any | None = None
_LOCK = asyncio.Lock()
_COLLECTION_NAME = "vendors"


async def _probe_dim_mismatch(client: Any, coll: Any) -> bool:
    """Returns True iff the collection has rows with a vector dimension that
    doesn't match the active embedding model. Used to auto-wipe stale Chroma
    state when we switch embedding providers (e.g. embeddinggemma 768-dim →
    qwen3-embedding 4096-dim, or OpenAI 1536-dim → any local model)."""
    try:
        count = await asyncio.to_thread(coll.count)
        if count == 0:
            return False
        # Compute a probe embedding with the CURRENT model and compare dim.
        probe = await embed_one("dim probe")
        current_dim = len(probe)
        sample = await asyncio.to_thread(coll.peek, 1)
        existing = sample.get("embeddings") or []
        if not existing or not existing[0]:
            return False
        existing_dim = len(existing[0])
        if existing_dim != current_dim:
            _log.warning(
                "chroma.dim_mismatch",
                existing_dim=existing_dim,
                current_dim=current_dim,
                action="wipe_and_recreate",
            )
            return True
        return False
    except Exception as e:  # noqa: BLE001
        _log.debug("chroma.probe_failed", error=str(e))
        return False


async def _get_collection() -> Any:
    global _CLIENT, _COLLECTION
    async with _LOCK:
        if _COLLECTION is not None:
            return _COLLECTION
        try:
            import chromadb  # type: ignore

            settings = get_settings()
            try:
                _CLIENT = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
                _CLIENT.heartbeat()
            except Exception as e:  # noqa: BLE001
                _log.info("chroma.http_unavailable_using_persistent", error=str(e))
                persist_dir = settings.data_dir / "vector_db"
                persist_dir.mkdir(parents=True, exist_ok=True)
                _CLIENT = chromadb.PersistentClient(path=str(persist_dir))
            _COLLECTION = _CLIENT.get_or_create_collection(
                _COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
            )

            # Auto-recover from embedding dim mismatch (provider switch).
            if await _probe_dim_mismatch(_CLIENT, _COLLECTION):
                try:
                    _CLIENT.delete_collection(_COLLECTION_NAME)
                except Exception as e:  # noqa: BLE001
                    _log.warning("chroma.delete_failed", error=str(e))
                _COLLECTION = _CLIENT.get_or_create_collection(
                    _COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
                )
                _log.info("chroma.recreated_with_new_dim")

            return _COLLECTION
        except Exception as e:  # noqa: BLE001
            _log.error("chroma.unavailable", error=str(e))
            raise


def _vendor_doc(name: str, domain: str, tagline: str | None = None) -> str:
    parts = [name.strip(), domain.strip().lower()]
    if tagline:
        parts.append(tagline.strip())
    return " | ".join(parts)


async def add_vendor(*, vendor_id: str, name: str, domain: str, tagline: str | None = None, payload: dict | None = None) -> None:
    coll = await _get_collection()
    doc = _vendor_doc(name, domain, tagline)
    emb = await embed_one(doc)
    metadata = {"domain": domain.lower(), "name": name, "tagline": tagline or ""}
    if payload:
        metadata.update({k: str(v)[:1000] for k, v in payload.items() if v is not None})
    await asyncio.to_thread(
        coll.upsert,
        ids=[vendor_id],
        embeddings=[emb],
        documents=[doc],
        metadatas=[metadata],
    )


async def add_many(items: list[dict]) -> None:
    """items: [{vendor_id, name, domain, tagline?, payload?}]"""
    if not items:
        return
    coll = await _get_collection()
    docs = [_vendor_doc(i["name"], i["domain"], i.get("tagline")) for i in items]
    embs = await embed_many(docs)
    ids = [i["vendor_id"] for i in items]
    metas = [
        {
            "domain": i["domain"].lower(),
            "name": i["name"],
            "tagline": i.get("tagline") or "",
            **{k: str(v)[:1000] for k, v in (i.get("payload") or {}).items() if v is not None},
        }
        for i in items
    ]
    await asyncio.to_thread(coll.upsert, ids=ids, embeddings=embs, documents=docs, metadatas=metas)


async def is_duplicate(*, name: str, domain: str, threshold: float = 0.92) -> tuple[bool, dict | None]:
    """Returns (is_dup, existing_metadata_or_None)."""
    coll = await _get_collection()
    doc = _vendor_doc(name, domain)
    emb = await embed_one(doc)
    res = await asyncio.to_thread(coll.query, query_embeddings=[emb], n_results=3)
    if not res or not res.get("ids") or not res["ids"][0]:
        return False, None
    distances = res.get("distances", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    if not distances or not metas:
        return False, None
    # Chroma cosine distance = 1 - cosine_similarity, so similarity = 1 - distance
    best_sim = 1.0 - distances[0]
    if best_sim >= threshold:
        return True, metas[0]
    # Domain exact match always wins, even if name is different
    for m in metas:
        if m.get("domain", "").lower() == domain.lower():
            return True, m
    return False, None
