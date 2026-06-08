"""Combined PDF parser: PyMuPDF (native text) + pdfplumber (tables) + VLM OCR (scanned).

Strategy:
  1. PyMuPDF.get_text("text") → fast native extraction
  2. pdfplumber.extract_tables() → structured table cells
  3. If native text is sparse (< THRESHOLD chars) → render page to PNG and
     send it to Ollama's `/api/chat` with a vision model (default gemma4:e4b)

Replaces the old Surya OCR fallback. Surya needed external model-weight
downloads (~500MB) and PyTorch — for our environment where Ollama is already
serving multimodal models on the LAN, the VLM approach gives comparable OCR
quality with zero extra dependencies, no weight downloads, and one less
process competing for GPU memory.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ...config import get_settings
from ...observability.logger import get_logger
from ...observability.metrics import errors_total

_log = get_logger(__name__)

# Pages with fewer native chars than this triggers OCR fallback.
_OCR_TEXT_THRESHOLD = 80
# A page emitting this many `(cid:NNN)` placeholders is using an embedded
# font without a ToUnicode CMap — PyMuPDF can't decode it, so the "text"
# is meaningless garbage like `(cid:31)(cid:30)(cid:25)`. We treat these
# pages as scanned and route them through the VLM OCR path.
_OCR_CID_THRESHOLD = 3


@dataclass
class PageContent:
    """Structured representation of one PDF page."""

    page_number: int
    text: str
    tables: list[list[list[str | None]]] = field(default_factory=list)
    extraction_method: str = "pymupdf"  # "pymupdf" | "pdfplumber_table" | "vlm_ocr"
    char_count: int = 0
    width: float | None = None
    height: float | None = None
    layout_blocks: list[dict] = field(default_factory=list)


def _looks_like_scanned(native_text: str, page: Any) -> bool:
    stripped = native_text.strip()
    if len(stripped) < _OCR_TEXT_THRESHOLD:
        return True
    # CID-glyph corruption: PDF uses an embedded font whose ToUnicode CMap
    # is missing or broken. PyMuPDF emits literal `(cid:NN)` placeholders
    # that pass the length threshold but carry zero usable signal. Treat as
    # scanned so the VLM OCR path can recover the text from the rendered
    # page image.
    if native_text.count("(cid:") >= _OCR_CID_THRESHOLD:
        return True
    return False


async def extract_pages(pdf_path: Path) -> list[PageContent]:
    """Extract all pages from a PDF. Returns one PageContent per page."""
    return await asyncio.to_thread(_extract_pages_blocking, pdf_path)


def _extract_pages_blocking(pdf_path: Path) -> list[PageContent]:
    pages: list[PageContent] = []
    settings = get_settings()
    ocr_enabled = settings.ocr_enabled

    try:
        import pymupdf  # type: ignore
    except ImportError:
        try:
            import fitz as pymupdf  # type: ignore
        except ImportError as e:
            _log.warning("pdf_parser.pymupdf_unavailable", error=str(e))
            return pages

    try:
        import pdfplumber  # type: ignore
    except ImportError:
        pdfplumber = None  # type: ignore

    try:
        mu_doc = pymupdf.open(pdf_path)
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_parser", category="pymupdf_open").inc()
        _log.warning("pdf_parser.open_failed", path=str(pdf_path), error=str(e))
        return pages

    plumber_doc = None
    if pdfplumber is not None:
        try:
            plumber_doc = pdfplumber.open(pdf_path)
        except Exception as e:  # noqa: BLE001
            _log.debug("pdf_parser.pdfplumber_open_failed", error=str(e))

    try:
        for i, mu_page in enumerate(mu_doc, start=1):
            try:
                native_text = mu_page.get_text("text") or ""
            except Exception:  # noqa: BLE001
                native_text = ""

            tables: list[list[list[str | None]]] = []
            if plumber_doc is not None and i - 1 < len(plumber_doc.pages):
                try:
                    raw = plumber_doc.pages[i - 1].extract_tables() or []
                    tables = [[[c for c in row] for row in t] for t in raw]
                except Exception:  # noqa: BLE001
                    pass

            method = "pymupdf"
            text = native_text
            if ocr_enabled and _looks_like_scanned(native_text, mu_page):
                ocr_text = _vlm_ocr_page_blocking(mu_page)
                if ocr_text and len(ocr_text) > len(native_text):
                    text = ocr_text
                    method = "vlm_ocr"

            rect = getattr(mu_page, "rect", None)
            width = float(rect.width) if rect is not None else None
            height = float(rect.height) if rect is not None else None

            pages.append(PageContent(
                page_number=i,
                text=text,
                tables=tables,
                extraction_method=method,
                char_count=len(text),
                width=width,
                height=height,
            ))
    finally:
        with _suppress():
            mu_doc.close()
        if plumber_doc is not None:
            with _suppress():
                plumber_doc.close()

    _log.info("pdf_parser.extracted", path=str(pdf_path), pages=len(pages))
    return pages


def _vlm_ocr_page_blocking(mu_page: Any) -> str:
    """Render PyMuPDF page to PNG, send to Ollama vision endpoint, return text.

    Uses the same Ollama instance that serves the base crawler's chat LLM,
    so no extra infra is needed. The model (default `gemma4:e4b`) reads the
    rendered page image and returns the verbatim text — Gemma 4 docs flag
    that high visual-token budgets are best for OCR, but that's a model-
    side concern; our prompt just asks for raw text.
    """
    settings = get_settings()
    try:
        import httpx
    except ImportError as e:
        _log.warning("pdf_parser.httpx_unavailable", error=str(e))
        return ""

    try:
        pix = mu_page.get_pixmap(dpi=settings.ocr_render_dpi)
        png_bytes = pix.tobytes("png")
    except Exception as e:  # noqa: BLE001
        _log.debug("pdf_parser.render_failed", error=str(e))
        return ""

    import base64

    img_b64 = base64.b64encode(png_bytes).decode("ascii")

    base_url = (settings.llm_base_url or "http://ollama:11434").rstrip("/")
    payload = {
        "model": settings.ocr_vlm_model,
        "messages": [
            {
                "role": "user",
                "content": (
                    "Extract every visible text element from this PDF page "
                    "verbatim — preserve reading order, keep table cells "
                    "separated by ' | ', use newlines between rows / sections. "
                    "Do NOT summarize, translate, or omit anything. Output "
                    "plain text only — no markdown, no commentary."
                ),
                "images": [img_b64],
            }
        ],
        "stream": False,
        "options": {
            # Deterministic-ish OCR — we want verbatim text, not creative
            # paraphrasing. Sampling temperature near zero suppresses
            # hallucination tendencies for small VLMs.
            "temperature": 0.0,
            "top_p": 0.95,
        },
    }

    try:
        with httpx.Client(timeout=settings.ocr_page_timeout) as client:
            resp = client.post(f"{base_url}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_parser", category="vlm_ocr").inc()
        _log.warning("pdf_parser.ocr_failed", error=str(e)[:200])
        return ""

    msg = (data.get("message") or {}).get("content") or ""
    return msg.strip()


class _suppress:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return True
