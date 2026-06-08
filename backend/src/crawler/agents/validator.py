"""Validator — sanity-check enriched Vendor before persisting.

Returns (is_valid, completeness_score, issues). Threshold is configurable
via VENDOR_COMPLETENESS_THRESHOLD (default 0.10).
"""

from __future__ import annotations

from ..config import get_settings
from ..observability.logger import get_logger
from ..schemas import Vendor

_log = get_logger(__name__)


def _score(vendor: Vendor) -> float:
    weights = {
        "company_name": 0.15,
        "description": 0.10,
        "products": 0.10,
        "address": 0.10,
        "contacts": 0.15,
        "socials": 0.10,
        "domain_age_days": 0.05,
        "registrar": 0.05,
        "first_seen_wayback": 0.05,
        "founded_year": 0.05,
        "industries": 0.05,
        "tagline": 0.05,
    }
    s = 0.0
    s += weights["company_name"] if vendor.company_name else 0
    s += weights["description"] if vendor.description else 0
    s += weights["products"] if vendor.products else 0
    s += weights["address"] if vendor.address else 0
    s += weights["contacts"] if vendor.contacts else 0
    socials_filled = any([
        vendor.socials.linkedin, vendor.socials.twitter, vendor.socials.facebook,
        vendor.socials.youtube, vendor.socials.instagram, vendor.socials.github,
    ])
    s += weights["socials"] if socials_filled else 0
    s += weights["domain_age_days"] if vendor.domain_age_days else 0
    s += weights["registrar"] if vendor.registrar else 0
    s += weights["first_seen_wayback"] if vendor.first_seen_wayback else 0
    s += weights["founded_year"] if vendor.founded_year else 0
    s += weights["industries"] if vendor.industries else 0
    s += weights["tagline"] if vendor.tagline else 0
    return round(s, 4)


def validate(vendor: Vendor) -> tuple[bool, float, list[str]]:
    issues: list[str] = []
    if not vendor.domain:
        issues.append("missing_domain")
    if vendor.domain and "." not in vendor.domain:
        issues.append("invalid_domain")
    if not vendor.company_name:
        issues.append("missing_company_name")
    completeness = _score(vendor)
    threshold = get_settings().vendor_completeness_threshold
    is_valid = not issues and completeness >= threshold
    if not is_valid:
        _log.info(
            "validator.rejected",
            domain=vendor.domain,
            issues=issues,
            completeness=completeness,
            threshold=threshold,
        )
    return is_valid, completeness, issues
