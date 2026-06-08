import httpx

from tools.skills.catalog_finder import (
    _has_catalog_content,
    _scan_homepage_links,
    discover,
)

FIXTURE_HOME = """
<html>
<body>
<a href="/about">About</a>
<a href="/products">Our Products</a>
<a href="/katalog">Download Katalog</a>
<a href="/files/brochure-2025.pdf">Brochure 2025</a>
<a href="https://cdn.example.com/datasheet.pdf">Datasheet PDF</a>
<a href="/news">News</a>
</body>
</html>
"""

# Snowglobe 2026-05-25 — fixtures for content-sniff validation.
FIXTURE_REAL_CATALOG = """
<html><body>
<ul class="product-grid">
  <li class="product-card"><h3>Tactical Helmet MK-7</h3><span class="price">$ 450</span><span>SKU: TH-MK7-001</span></li>
  <li class="product-card"><h3>Body Armor Type IV</h3><span class="price">$ 1,200</span><span>SKU: BA-IV-002</span></li>
  <li class="product-card"><h3>Plate Carrier</h3><span class="price">$ 380</span><span>SKU: PC-PRO-003</span></li>
</ul>
</body></html>
"""

FIXTURE_FAKE_PRODUCTS = """
<html><body>
<h1>Our Products</h1>
<p>We make great things. Contact us for more info.</p>
<a href="/contact">Contact</a>
</body></html>
"""

FIXTURE_PDF_CATALOG_LINK = """
<html><body>
<h1>Resources</h1>
<a href="/files/product-catalog.pdf">Download our catalog</a>
</body></html>
"""


class _StubTransport(httpx.BaseTransport):
    """Stub that lets each path return a custom body so we can test content
    sniff vs bare-200."""

    def __init__(self, home_html: str, path_bodies: dict[str, str] | None = None):
        self._home = home_html
        self._paths = path_bodies or {}

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        path = httpx.URL(url).path
        if request.method == "HEAD":
            # PDF probes still HEAD — accept any path ending in .pdf
            if url.lower().endswith(".pdf"):
                return httpx.Response(200, request=request)
            return httpx.Response(405, request=request)
        # GET — homepage vs explicit path
        if path in ("/", ""):
            return httpx.Response(200, text=self._home, request=request)
        body = self._paths.get(path)
        if body is None:
            return httpx.Response(404, request=request)
        return httpx.Response(200, text=body, request=request)


def test_has_catalog_content_accepts_product_cards():
    assert _has_catalog_content(FIXTURE_REAL_CATALOG) is True


def test_has_catalog_content_rejects_bare_marketing_page():
    assert _has_catalog_content(FIXTURE_FAKE_PRODUCTS) is False


def test_has_catalog_content_accepts_pdf_catalog_link():
    assert _has_catalog_content(FIXTURE_PDF_CATALOG_LINK) is True


def test_has_catalog_content_rejects_empty():
    assert _has_catalog_content("") is False


def test_scan_homepage_links_finds_catalog_text_and_pdf():
    client = httpx.Client(transport=_StubTransport(FIXTURE_HOME))
    refs = _scan_homepage_links("https://acme.test", client)
    urls = {r.url for r in refs}
    assert any("brochure-2025.pdf" in u for u in urls)
    assert any("/katalog" in u for u in urls)
    assert any("/products" in u for u in urls)
    pdf_refs = [r for r in refs if r.kind == "pdf"]
    assert len(pdf_refs) >= 1


def test_discover_rejects_bare_200_products_page():
    # /products returns 200 but body has no product cards / prices / SKUs.
    # Old behavior: ACCEPTED. New behavior: REJECTED via content sniff.
    client = httpx.Client(transport=_StubTransport(
        home_html="<html><body><p>marketing</p></body></html>",
        path_bodies={"/products": FIXTURE_FAKE_PRODUCTS},
    ))
    result = discover("acme.test", client=client)
    html_refs = [r for r in result.refs if r.kind == "html"]
    assert all("/products" not in r.url for r in html_refs), \
        "bare /products page must be rejected by content sniff"


def test_discover_accepts_real_catalog_page():
    client = httpx.Client(transport=_StubTransport(
        home_html="<html><body></body></html>",
        path_bodies={"/products": FIXTURE_REAL_CATALOG},
    ))
    result = discover("acme.test", client=client)
    assert any("/products" in r.url and r.kind == "html" for r in result.refs)


def test_discover_empty_domain():
    result = discover("")
    assert result.base_url == ""
    assert result.catalog_count == 0


def test_discover_handles_unreachable_host():
    class _FailTransport(httpx.BaseTransport):
        def handle_request(self, request):
            raise httpx.ConnectError("nope", request=request)

    client = httpx.Client(transport=_FailTransport())
    result = discover("nowhere.invalid", client=client)
    assert result.catalog_count == 0
