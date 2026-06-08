"""Hard URL-level dedup gate for the snowglobe reset (rule 1, 2026-05-25).

Rationale: Chroma cosine dedup (knowledge.py:383) catches semantic dupes but
runs after extraction. We want to short-circuit BEFORE the agent burns a
Browser-Use session on a URL we already enriched. Exact canonical_url match
in Postgres `vendors` table is authoritative — if it's there, skip.

Also exposes a name+domain helper that combines exact URL match with the
existing Chroma fuzzy check, returning at the first hit.
"""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

import structlog
from sqlalchemy import select

from crawler.db.engine import get_sessionmaker
from crawler.db.models import VendorORM

from .knowledge import AgenticKnowledgeStore

_log = structlog.get_logger(__name__)


def _normalize_url(url: str | None) -> str | None:
    if not url:
        return None
    raw = str(url).strip()
    if not raw:
        return None
    try:
        parts = urlsplit(raw if raw.startswith(("http://", "https://")) else "https://" + raw)
        netloc = parts.netloc.lower().lstrip("www.")
        path = parts.path.rstrip("/") or "/"
        return urlunsplit((parts.scheme.lower() or "https", netloc, path, "", ""))
    except Exception:  # noqa: BLE001
        return raw.lower()


async def url_already_reached(canonical_url: str | None) -> bool:
    """True if Postgres vendors already has this canonical_url (or its
    normalized variant). Skips work that's already been done."""
    norm = _normalize_url(canonical_url)
    if not norm:
        return False
    try:
        async with get_sessionmaker()() as session:
            stmt = select(VendorORM.vendor_id).where(VendorORM.canonical_url == canonical_url)
            row = (await session.execute(stmt)).scalar_one_or_none()
            if row is not None:
                return True
            stmt2 = select(VendorORM.vendor_id).where(VendorORM.canonical_url.ilike(norm))
            row2 = (await session.execute(stmt2)).scalar_one_or_none()
            return row2 is not None
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.dedup_pg_check_failed", error=str(e))
        return False


async def was_reached(
    name: str,
    canonical_url: str | None = None,
    *,
    knowledge_store: AgenticKnowledgeStore | None = None,
) -> bool:
    """Combined hard+soft dedup. Hard URL match wins. Falls back to Chroma
    fuzzy match on name+domain."""
    if await url_already_reached(canonical_url):
        return True
    if knowledge_store is None:
        return False
    domain = None
    if canonical_url:
        try:
            domain = urlsplit(
                canonical_url if canonical_url.startswith(("http://", "https://")) else "https://" + canonical_url
            ).netloc.lower().lstrip("www.")
        except Exception:  # noqa: BLE001
            domain = None
    try:
        return await knowledge_store.is_vendor_seen(name, domain)
    except Exception as e:  # noqa: BLE001
        _log.debug("agentic.dedup_chroma_check_failed", error=str(e))
        return False
