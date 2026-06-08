"""Dedup agent — checks if a vendor URL is already known.

Uses the vector store; on hit, the existing vendor is updated to add the
new expo_id to its `expos_seen` list (without re-running enrichment).
"""

from __future__ import annotations

from ..observability.logger import get_logger
from ..observability.metrics import dedup_hits_total
from ..schemas import VendorURL
from ..store.vector_store import is_duplicate
from ..tools.url_utils import canonical_domain

_log = get_logger(__name__)


async def check_and_merge(vendor_url: VendorURL) -> bool:
    """Returns True if the vendor is a duplicate (caller should skip enrichment)."""
    domain = canonical_domain(str(vendor_url.canonical_url))
    name = vendor_url.exhibitor_name
    is_dup, existing = await is_duplicate(name=name, domain=domain)
    if not is_dup:
        return False
    dedup_hits_total.inc()
    _log.info("dedup_hit", domain=domain, vendor_name=name, existing=existing)
    return True
