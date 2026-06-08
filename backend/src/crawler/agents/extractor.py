"""Extractor agent — turn an Expo into a list of ExhibitorRefs.

Routes to the correct site-specific scraper via the registry.
"""

from __future__ import annotations

from ..observability.logger import get_logger
from ..observability.metrics import exhibitors_extracted_total
from ..schemas import ExhibitorRef, Expo
from ..tools.scrapers.registry import list_exhibitors

_log = get_logger(__name__)


async def extract_exhibitors(expo: Expo) -> list[ExhibitorRef]:
    target = expo.aggregator_url or expo.official_url
    if not target:
        _log.debug("extractor.no_url", expo_id=expo.expo_id)
        return []
    refs = await list_exhibitors(str(target), expo.expo_id)
    if refs:
        exhibitors_extracted_total.labels(aggregator=refs[0].aggregator_domain).inc(len(refs))
    return refs
