"""ChromaDB specialty vector index — semantic search vendors by what they DO.

Separate from `vector_store.py` which keys vendors by `name | domain | tagline`
(for cross-run dedup). This index keys by SPECIALTY signal:

    document = "{products list} | {industries list} | {description first 300}"

That makes semantic search like "OT/ICS security vendors in EU" or
"forensic biometrics enrollment" actually work — embedding aligns to what
the company does, not what its URL looks like.

Use cases:
1. Resolve hop hint: given an unresolved candidate name, fetch the 5
   semantically-closest enriched vendors, take their domain TLD distribution
   as a country / TLD prior for the resolver.
2. Frontend Atlas semantic search bar (future).
3. Labs Fusion suggestion engine: cluster vendors by specialty embedding,
   propose merges within cluster.

Collection is created lazily on first call. Uses the same Chroma client as
`vector_store.py` (singleton in process). Embeddings come from the same
provider as `embed_one` / `embed_many` (Ollama / OpenAI / etc.).
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
_COLLECTION_NAME = "vendor_specialty"


class EmbeddingUnavailable(RuntimeError):
    """Raised by search_by_specialty when the embedding backend (Ollama)
    is unreachable, so the caller can fall back to lexical search instead
    of silently returning an empty result set. add_specialty /
    add_many_specialties still swallow embed errors because backfill is
    best-effort, but a user-facing query MUST be able to signal degraded
    mode."""


async def _get_collection() -> Any:
    global _CLIENT, _COLLECTION
    async with _LOCK:
        if _COLLECTION is not None:
            return _COLLECTION
        import chromadb  # type: ignore

        settings = get_settings()
        try:
            _CLIENT = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
            _CLIENT.heartbeat()
        except Exception as e:  # noqa: BLE001
            _log.info("specialty_index.http_unavailable_using_persistent", error=str(e))
            persist_dir = settings.data_dir / "vector_db"
            persist_dir.mkdir(parents=True, exist_ok=True)
            _CLIENT = chromadb.PersistentClient(path=str(persist_dir))
        _COLLECTION = _CLIENT.get_or_create_collection(
            _COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
        )
        return _COLLECTION


# Expand military taxonomy slugs into representative keywords so embeddings
# of category labels actually carry weight against operator query intent.
# Mirrors tools/taxonomies/military.yaml — kept inline to avoid loading the
# taxonomy on every doc build (called per row during 28k backfill).
_MIL_CAT_EXPAND: dict[str, str] = {
    "weapons": "weapons firearm rifle pistol shotgun sniper assault machine gun",
    "ammunition": "ammunition cartridge bullet propellant explosive munition warhead",
    "missiles_rockets": "missile rocket guided munition atgm manpads cruise ballistic mlrs anti-tank anti-aircraft",
    "vehicles_armor": "tank apc armored personnel carrier ifv mrap combat vehicle military vehicle humvee",
    "protection_armor": "body armor ballistic kevlar plate carrier bulletproof helmet tactical vest shield",
    "c4isr_electronics": "radar sigint comint elint electronic warfare jammer sonar thermal night vision c4isr drone uav surveillance reconnaissance",
    "naval": "naval warship frigate corvette destroyer submarine torpedo amphibious",
    "aerospace_military": "fighter jet military aircraft combat helicopter mil aviation airborne radar",
    "cyber_defense": "cyber defense offensive cyber military cyber signals intelligence",
    "cbrn": "cbrn chemical biological radiological nuclear gas mask decontamination hazmat",
    "training_services": "military training tactical sniper swat law enforcement",
    "defense_industrial": "defense contractor defence industry military manufacturer",
}


def _specialty_doc(
    products: list[str] | None,
    industries: list[str] | None,
    description: str | None,
    domain_of_interest: list[str] | None = None,
    *,
    company_name: str | None = None,
    military_categories: list[str] | None = None,
    tagline: str | None = None,
) -> str:
    """Build the document string for embedding.

    Snowglobe 2026-05-25: lead with company_name + military_categories so
    name-only queries ("SAAB", "ROKETSAN") and taxonomy queries ("tank",
    "missile", "uav") both retrieve. military_categories are the labels
    the classifier wrote (e.g. ["weapons", "vehicles_armor"]) — they map
    directly onto operator query intent.

    Also: ensure the doc is never empty for a vendor with just a name,
    so the 30k catalog is fully searchable.
    """
    parts: list[str] = []
    if company_name and company_name.strip():
        parts.append(f"company: {company_name.strip()[:200]}")
    if military_categories:
        # Expand each category slug to representative keywords so taxonomy
        # queries like "tank" / "uav" hit vendors tagged via vehicles_armor /
        # c4isr_electronics. Slugs alone (e.g. "vehicles armor") are too
        # weak a signal for shallow embedding models.
        kws = " ".join(
            _MIL_CAT_EXPAND.get(c, c.replace("_", " "))
            for c in military_categories
            if c
        )
        if kws:
            parts.append(f"military scope: {kws}")
    if products:
        joined = ", ".join(p.strip() for p in products if p and isinstance(p, str))
        if joined:
            parts.append(f"products: {joined[:400]}")
    if industries:
        joined = ", ".join(i.strip() for i in industries if i and isinstance(i, str))
        if joined:
            parts.append(f"industries: {joined[:200]}")
    if domain_of_interest:
        joined = ", ".join(d.strip() for d in domain_of_interest if d and isinstance(d, str))
        if joined:
            parts.append(f"focus: {joined[:200]}")
    if tagline and tagline.strip():
        parts.append(tagline.strip()[:200])
    if description:
        parts.append(description.strip()[:300])
    return " | ".join(parts) if parts else ""


async def add_specialty(
    *,
    vendor_id: str,
    company_name: str,
    domain: str | None,
    products: list[str] | None,
    industries: list[str] | None,
    description: str | None,
    domain_of_interest: list[str] | None = None,
    country: str | None = None,
) -> bool:
    """Upsert a vendor into the specialty index. Returns False if the
    document is empty (no signal to embed)."""
    doc = _specialty_doc(
        products,
        industries,
        description,
        domain_of_interest,
        company_name=company_name,
    )
    if not doc:
        return False
    coll = await _get_collection()
    try:
        emb = await embed_one(doc)
    except Exception as e:  # noqa: BLE001
        _log.debug("specialty_index.embed_failed", vendor_id=vendor_id, error=str(e)[:120])
        return False
    metadata = {
        "company_name": company_name or "",
        "domain": (domain or "").lower(),
        "country": (country or "")[:60],
        "hidden": False,  # live path always indexes visible vendors
        "scope": 0.0,
    }
    await asyncio.to_thread(
        coll.upsert,
        ids=[vendor_id],
        embeddings=[emb],
        documents=[doc],
        metadatas=[metadata],
    )
    return True


async def add_many_specialties(items: list[dict]) -> int:
    """Bulk upsert. Each item: {vendor_id, company_name, domain, products,
    industries, description, domain_of_interest?, country?}. Returns count
    actually written (empty docs skipped)."""
    if not items:
        return 0
    docs: list[str] = []
    ids: list[str] = []
    metas: list[dict] = []
    for it in items:
        doc = _specialty_doc(
            it.get("products"),
            it.get("industries"),
            it.get("description"),
            it.get("domain_of_interest"),
            company_name=it.get("company_name"),
            military_categories=it.get("military_categories"),
            tagline=it.get("tagline"),
        )
        if not doc:
            continue
        docs.append(doc)
        ids.append(str(it["vendor_id"]))
        metas.append({
            "company_name": str(it.get("company_name") or "")[:300],
            "domain": str(it.get("domain") or "").lower(),
            "country": str(it.get("country") or "")[:60],
            "hidden": bool(it.get("hidden", False)),
            "scope": float(it.get("scope_match_score") or 0.0),
        })
    if not docs:
        return 0
    coll = await _get_collection()
    try:
        embs = await embed_many(docs)
    except Exception as e:  # noqa: BLE001
        _log.warning("specialty_index.embed_many_failed", count=len(docs), error=str(e)[:160])
        return 0
    await asyncio.to_thread(coll.upsert, ids=ids, embeddings=embs, documents=docs, metadatas=metas)
    return len(docs)


async def search_by_specialty(
    query: str,
    *,
    n_results: int = 5,
    country_filter: str | None = None,
    include_hidden: bool = False,
) -> list[dict]:
    """Search vendors by free-form specialty query.

    Snowglobe: `hidden=true` vendors excluded by default via Chroma metadata
    filter so the candidate pool returned to the API is already visible-only.
    Operator opt-in `include_hidden=true` lifts the filter (full 30k catalog).

    Returns list of {vendor_id, company_name, domain, country, similarity}
    sorted by similarity desc.
    """
    if not query or not query.strip():
        return []
    coll = await _get_collection()
    try:
        emb = await embed_one(query.strip())
    except Exception as e:  # noqa: BLE001
        _log.debug("specialty_index.query_embed_failed", error=str(e)[:120])
        raise EmbeddingUnavailable(str(e)[:200]) from e
    filters: list[dict] = []
    if not include_hidden:
        filters.append({"hidden": False})
    if country_filter:
        filters.append({"country": country_filter})
    if not filters:
        where = None
    elif len(filters) == 1:
        where = filters[0]
    else:
        where = {"$and": filters}
    res = await asyncio.to_thread(
        coll.query, query_embeddings=[emb], n_results=max(1, n_results), where=where,
    )
    if not res or not res.get("ids") or not res["ids"][0]:
        return []
    ids = res["ids"][0]
    metas = res.get("metadatas", [[]])[0] or []
    dists = res.get("distances", [[]])[0] or []
    out: list[dict] = []
    for vid, meta, dist in zip(ids, metas, dists):
        out.append({
            "vendor_id": vid,
            "company_name": meta.get("company_name", ""),
            "domain": meta.get("domain", ""),
            "country": meta.get("country", ""),
            "similarity": round(1.0 - float(dist), 4),
        })
    return out


__all__ = [
    "EmbeddingUnavailable",
    "add_specialty",
    "add_many_specialties",
    "search_by_specialty",
]
