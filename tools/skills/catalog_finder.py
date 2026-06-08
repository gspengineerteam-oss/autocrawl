from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx

# Snowglobe 2026-05-25 — content sniff patterns. A "real" catalog page
# should hit ≥1 of these signals or we don't accept it as a catalog hit.
# Pre-compiled at module load to avoid per-request regex compilation.
_PRODUCT_CARD_RE = re.compile(
    r"(<(?:li|div|article)[^>]*class=\"[^\"]*(?:product|item)[^\"]*\")|"
    r"(itemtype=\"https?://schema\.org/Product\")|"
    r"(data-product[-_]?id\s*=)",
    re.IGNORECASE,
)
_PRICE_RE = re.compile(
    r"(?:Rp\.?\s*\d[\d.,]*|USD\s*\d[\d.,]*|IDR\s*\d[\d.,]*|\$\s*\d{2,}[\d.,]*|€\s*\d[\d.,]*|£\s*\d[\d.,]*)",
    re.IGNORECASE,
)
_SKU_RE = re.compile(
    r"(\bSKU\s*[:#]\s*\w+|\bModel\s*[:#]\s*\w+|\bPart\s*(?:No|Number|#)\s*[:#]?\s*\w+|"
    r"\bMK[-\s]?\d+|\bType\s+[A-Z0-9]{2,})",
    re.IGNORECASE,
)
_PDF_CATALOG_RE = re.compile(
    r"href=\"([^\"]+(?:catalog|catalogue|brochure|brosur|datasheet|spec[\s_-]?sheet|product[\s_-]?list)[^\"]*\.pdf)\"",
    re.IGNORECASE,
)

CATALOG_PATHS = [
    "/catalog",
    "/catalogue",
    "/katalog",
    "/products",
    "/produk",
    "/brochure",
]

CATALOG_LINK_TEXT_RE = re.compile(
    r"\b(catalogs?|catalogues?|kataloge?|brosur|brochures?|datasheets?|spec[\s\-]?sheets?|products?|produk|portfolios?|downloads?|solutions?)\b",
    re.IGNORECASE,
)

PDF_LINK_RE = re.compile(r'href=["\']([^"\']+\.pdf)["\']', re.IGNORECASE)
ANCHOR_RE = re.compile(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</a>', re.IGNORECASE)

_DEFAULT_TIMEOUT = 4.0   # tuned for 1-shot revalidate over 600+ domains
_MAX_BODY_BYTES = 200_000  # cap body read at 200KB for content sniff
_DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 AutocrawlSkillCatalog/1.0"
)


@dataclass(frozen=True)
class CatalogRef:
    url: str
    label: str
    kind: str  # "html" | "pdf"

    def to_dict(self) -> dict:
        return {"url": self.url, "label": self.label, "kind": self.kind}


@dataclass(frozen=True)
class CatalogDiscoverResult:
    base_url: str
    refs: tuple[CatalogRef, ...] = field(default_factory=tuple)

    @property
    def catalog_count(self) -> int:
        return len(self.refs)

    def to_dict(self) -> dict:
        return {
            "base_url": self.base_url,
            "catalog_count": self.catalog_count,
            "refs": [r.to_dict() for r in self.refs],
        }


def _normalize_base(domain_or_url: str) -> str:
    raw = (domain_or_url or "").strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _has_catalog_content(body: str) -> bool:
    """Return True only if the page body shows real catalog signals.

    Snowglobe 2026-05-25: replaces "any 200 OK counts" with content sniff —
    repeated product cards, ≥3 price tokens, ≥2 SKU/model tokens, or a
    catalog-named PDF link. Stops lipstick shop's `/products` from passing.
    """
    if not body:
        return False
    if _PRODUCT_CARD_RE.search(body):
        return True
    if _PDF_CATALOG_RE.search(body):
        return True
    if len(_PRICE_RE.findall(body)) >= 3:
        return True
    if len(_SKU_RE.findall(body)) >= 2:
        return True
    return False


def _fetch_body(url: str, client: httpx.Client) -> tuple[int, str]:
    """GET with body cap. Returns (status_code, truncated_body). On error
    returns (0, "")."""
    try:
        with client.stream(
            "GET", url, follow_redirects=True, timeout=_DEFAULT_TIMEOUT
        ) as resp:
            if resp.status_code >= 400:
                return resp.status_code, ""
            chunks: list[bytes] = []
            total = 0
            for chunk in resp.iter_bytes(chunk_size=16_384):
                chunks.append(chunk)
                total += len(chunk)
                if total >= _MAX_BODY_BYTES:
                    break
            raw = b"".join(chunks)
            try:
                return resp.status_code, raw.decode("utf-8", errors="ignore")
            except Exception:  # noqa: BLE001
                return resp.status_code, ""
    except httpx.HTTPError:
        return 0, ""


def _probe_paths(base: str, client: httpx.Client) -> list[CatalogRef]:
    found: list[CatalogRef] = []
    for path in CATALOG_PATHS:
        url = urljoin(base + "/", path.lstrip("/"))
        # PDFs: HEAD/status alone is authoritative — URL pattern is enough.
        if url.lower().endswith(".pdf"):
            try:
                resp = client.head(url, follow_redirects=True, timeout=_DEFAULT_TIMEOUT)
                if 200 <= resp.status_code < 300:
                    found.append(CatalogRef(url=str(resp.url), label=path.strip("/"), kind="pdf"))
            except httpx.HTTPError:
                continue
            continue
        # HTML paths: fetch body, require catalog content signal. Skip
        # bare-200 pages that don't show product cards / price / SKU /
        # downloadable spec PDF link.
        status, body = _fetch_body(url, client)
        if not (200 <= status < 300):
            continue
        if not _has_catalog_content(body):
            continue
        found.append(CatalogRef(url=url, label=path.strip("/"), kind="html"))
    return found


def _scan_homepage_links(base: str, client: httpx.Client) -> list[CatalogRef]:
    found: list[CatalogRef] = []
    try:
        resp = client.get(base, follow_redirects=True, timeout=_DEFAULT_TIMEOUT)
        if resp.status_code >= 400:
            return found
        html = resp.text
    except httpx.HTTPError:
        return found

    seen: set[str] = set()
    for match in ANCHOR_RE.finditer(html):
        href, inner = match.group(1), match.group(2)
        text = re.sub(r"<[^>]+>", "", inner).strip()
        target = href.lower()
        is_pdf = target.endswith(".pdf")
        text_match = bool(CATALOG_LINK_TEXT_RE.search(text))
        if not (is_pdf or text_match):
            continue
        absolute = urljoin(base + "/", href)
        if absolute in seen:
            continue
        seen.add(absolute)
        kind = "pdf" if is_pdf else "html"
        label = text or ("pdf" if is_pdf else "link")
        found.append(CatalogRef(url=absolute, label=label[:80], kind=kind))

    for match in PDF_LINK_RE.finditer(html):
        absolute = urljoin(base + "/", match.group(1))
        if absolute in seen:
            continue
        seen.add(absolute)
        found.append(CatalogRef(url=absolute, label="pdf", kind="pdf"))

    return found


def discover(
    domain_or_url: str,
    *,
    timeout: float = _DEFAULT_TIMEOUT,
    user_agent: str = _DEFAULT_UA,
    client: httpx.Client | None = None,
) -> CatalogDiscoverResult:
    base = _normalize_base(domain_or_url)
    if not base:
        return CatalogDiscoverResult(base_url="")

    owns_client = client is None
    if owns_client:
        client = httpx.Client(
            timeout=timeout,
            headers={"User-Agent": user_agent},
            verify=False,
        )
    try:
        refs = []
        refs.extend(_probe_paths(base, client))
        refs.extend(_scan_homepage_links(base, client))
        deduped: dict[str, CatalogRef] = {}
        for ref in refs:
            if ref.url not in deduped:
                deduped[ref.url] = ref
        return CatalogDiscoverResult(base_url=base, refs=tuple(deduped.values()))
    finally:
        if owns_client and client is not None:
            client.close()
