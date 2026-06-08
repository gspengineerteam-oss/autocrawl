"""URL canonicalization & domain classification.

Critical for the vendor URL resolver: we must normalize URLs aggressively
so the same vendor doesn't appear under multiple keys (`xldefense.com`,
`www.xldefense.com`, `https://xldefense.com/?utm=...` all → `xldefense.com`).
"""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import tldextract

from ..config import get_aggregator_blacklist

_TRACKING_PARAM_RX = re.compile(
    r"^(utm_|gclid|fbclid|mc_eid|mc_cid|_hsenc|_hsmi|hsCtaTracking|ref|src|source|campaign)",
    re.IGNORECASE,
)

_PARKING_HINTS = (
    "domain is for sale",
    "buy this domain",
    "this domain is parked",
    "godaddy.com",
    "sedo.com",
    "hugedomains.com",
    "afternic.com",
)


def strip_tracking(url: str) -> str:
    """Remove utm_*, gclid, fbclid, etc. from query string."""
    try:
        parsed = urlparse(url)
    except Exception:  # noqa: BLE001
        return url
    if not parsed.query:
        return url
    cleaned = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=False) if not _TRACKING_PARAM_RX.match(k)]
    return urlunparse(parsed._replace(query=urlencode(cleaned)))


def canonical_domain(url_or_domain: str) -> str:
    """Returns the registered domain (eTLD+1), lowercase, no www., no scheme."""
    if not url_or_domain:
        return ""
    raw = url_or_domain.strip()
    if "://" not in raw and not raw.startswith("//"):
        raw = "http://" + raw
    parsed = urlparse(raw)
    host = (parsed.netloc or parsed.path or "").split("@")[-1].split(":")[0].strip().lower()
    ext = tldextract.extract(host)
    if ext.domain and ext.suffix:
        return f"{ext.domain}.{ext.suffix}"
    return host.lstrip(".")


def canonical_url(url: str) -> str:
    """Lowercase scheme/host, strip default ports, strip tracking params, drop fragment."""
    if not url:
        return ""
    parsed = urlparse(url.strip())
    scheme = (parsed.scheme or "https").lower()
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if (scheme == "http" and host.endswith(":80")) or (scheme == "https" and host.endswith(":443")):
        host = host.rsplit(":", 1)[0]
    path = parsed.path or "/"
    cleaned_q = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=False) if not _TRACKING_PARAM_RX.match(k)]
    return urlunparse((scheme, host, path, "", urlencode(cleaned_q), ""))


def is_aggregator_or_excluded(url_or_domain: str) -> bool:
    """True if the URL's registered domain is in the aggregator/social/utility blacklist.

    A URL that returns True must NEVER be treated as a vendor identity.
    """
    domain = canonical_domain(url_or_domain)
    if not domain:
        return True
    blacklist = get_aggregator_blacklist()
    if domain in blacklist:
        return True
    # also catch subdomain-only matches in the blacklist (rare but defensive)
    parts = domain.split(".")
    for i in range(len(parts) - 1):
        if ".".join(parts[i:]) in blacklist:
            return True
    return False


def looks_like_parking_page(html: str) -> bool:
    if not html:
        return False
    needle = html.lower()
    return any(hint in needle for hint in _PARKING_HINTS)
