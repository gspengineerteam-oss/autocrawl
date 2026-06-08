"""PDF Extractor — turn a PDF URL into a list of ExhibitorRef with provenance.

Pipeline:
  1. Download PDF (pdf_store with SHA256 dedup)
  2. Extract pages (pdf_parser combines PyMuPDF + pdfplumber + Ollama-VLM OCR)
  3. Per-page LLM-driven vendor name extraction
  4. Build ExhibitorRef with full provenance (page, position, method, snippet)
  5. Persist .pages.jsonl audit trail

Same Protocol as `tentimes.py` and `generic.py` — returns `list[ExhibitorRef]`.
"""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel, Field

from ...observability.logger import get_logger
from ...observability.metrics import (
    errors_total,
    pdf_extracted_total,
    pdf_pages_processed_total,
    pdf_vendors_found_total,
)
from ...schemas import ExhibitorRef, SourceProvenance

_log = get_logger(__name__)


class _PdfVendor(BaseModel):
    name: str = Field(description="Company / organization / vendor name as it appears in the PDF")
    position: int = Field(description="1-indexed order on the page", default=1)
    context: str = Field(default="", description="Surrounding 50-100 chars of text around the name")
    table_row: int | None = Field(default=None, description="If extracted from a table, the row index (0-indexed)")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class _PdfPageVendors(BaseModel):
    vendors: list[_PdfVendor] = Field(default_factory=list)


# Document-level classification. Run on first 1-2 pages BEFORE any per-page
# extraction so academic-paper / terms-conditions / agenda-only PDFs never
# burn LLM turns on per-page extraction (and never pollute the vendor list
# with author names, ToC entries, or repeated page headers).
class _PdfKind(BaseModel):
    kind: str = Field(
        description=(
            "One of: exhibitor_list (company directory / sponsor list / vendor index), "
            "brochure (event marketing with vendor mentions), "
            "academic_paper (research paper, conference proceedings, abstract book, "
            "citation list, author bios), "
            "agenda_only (program / schedule / session list with no vendor index), "
            "terms_conditions (legal / T&C / privacy policy), "
            "venue_guide (floor plan / room capacity / facility map only, no vendors), "
            "unknown (genuinely unclear — proceed with extraction)."
        )
    )
    reason: str = Field(default="", description="One short sentence explaining the classification.")


# These kinds are skipped entirely — return [] from `list_exhibitors`.
_SKIP_KINDS = frozenset({
    "academic_paper",
    "agenda_only",
    "terms_conditions",
    "venue_guide",
})


_NOISE_PATTERNS = re.compile(
    r"^(page\s+\d+|exhibitor\s+list|table\s+of\s+contents|index|appendix|copyright|"
    r"all\s+rights\s+reserved|sponsor|booth\s+\d+|hall\s+[A-Z0-9]+)$",
    re.IGNORECASE,
)

# Venue / facility labels. Catches both leading-keyword forms ("Room 437",
# "Ballroom 1-2", "Hall A") and trailing-keyword forms ("Olympic View Room",
# "Elliott Bay Room", "Terrace Suite", "Signature Room", "Personal
# Consideration Room", "Ballroom Lobby"). Also rejects raw dimension labels
# and bare venue domains.
_VENUE_KEYWORDS = (
    r"room|suite|hall|ballroom|lobby|foyer|theatre|theater|plaza|atrium|"
    r"salon|lounge|gallery|pavilion|terrace|boardroom|board\s+room|"
    r"breakout|classroom|auditorium|banquet|reception|restroom|"
    r"gender\s+neutral\s+restrooms?|registration|coat\s+check|cloakroom|"
    r"green\s+room|signature\s+room|exhibit\s+hall|meeting\s+room|"
    r"conference\s+room"
)
_VENUE_PATTERNS = re.compile(
    r"^("
    # Leading keyword: "Room 437", "Ballroom Lobby", "Reception Hall"
    rf"(?:{_VENUE_KEYWORDS})"
    r"(?:\s+(?:[\w\d\-–&]+|view|lobby|lobbies|suite|room|level|hall|complex)){0,5}"
    r"|"
    # Trailing keyword: "Olympic View Room", "Terrace Suite",
    # "Personal Consideration Room", "Level 4 Meeting Room Lobbies".
    # Up to 5 leading words then one of the venue keywords at the end.
    rf"(?:[\w\d\-–&'.()]+\s+){{1,6}}(?:{_VENUE_KEYWORDS})s?"
    r"(?:\s+(?:lobby|lobbies|complex|suite|hall))?"
    r"|"
    # "Level 4", "Level 3 Meeting Room Lobbies"
    r"level\s+\d+(?:\s+.{0,60})?"
    r"|"
    # Standalone room/suite numbers with optional description:
    # "Room 427", "Room 427-429", "Room 426 (Board Room)"
    r"room\s+\d+(?:[\-–]\d+)?(?:\s*\([^)]+\))?"
    r"|"
    # Dimension labels: "176 x 329", "20'x40'"
    r"\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*['ft]|\s*sqft)?"
    r"|"
    # Bare domain in footer: "wscc.com", "example.org"
    r"[a-z0-9][\w\-]{0,40}\.(?:com|org|net|gov|edu|io|co|us|uk|de|jp|cn|ru|ae)"
    r")$",
    re.IGNORECASE,
)


def _is_noise(name: str) -> bool:
    name = name.strip()
    if len(name) < 3 or len(name) > 200:
        return True
    # Reject CID-encoded font glyph artifacts that survived past pdf_parser
    # (e.g. "(cid:31)(cid:30)(cid:25)" or partials with control chars).
    if "(cid:" in name:
        return True
    # Names with no alphabetic chars at all are almost always numeric / glyph
    # artifacts ("176 x 329", "•", "¥¶§").
    if not any(ch.isalpha() for ch in name):
        return True
    if _NOISE_PATTERNS.match(name):
        return True
    if _VENUE_PATTERNS.match(name):
        return True
    if name.replace(" ", "").replace("x", "").replace("×", "").isdigit():
        return True
    # Names that are mostly punctuation / single chars (e.g. "(", "•").
    alpha_chars = sum(1 for ch in name if ch.isalpha())
    if alpha_chars < 2:
        return True
    # Definition / instruction text typically opens with a bullet or has
    # unusually high punctuation density. Real exhibitor names are short.
    if "•" in name or name.count(":") >= 2:
        return True
    return False


def _vendors_from_table(table: list[list[str | None]]) -> list[_PdfVendor]:
    """Heuristic table-to-vendors extraction.

    Looks for rows where one column appears to be a company name. Skips header
    rows. Confidence is high (0.85) because tables are structured.
    """
    if not table or len(table) < 2:
        return []
    header = [str(c or "").strip().lower() for c in (table[0] or [])]
    name_col_idx: int | None = None
    for i, h in enumerate(header):
        if any(k in h for k in ("company", "exhibitor", "vendor", "organization", "organisation", "name")):
            name_col_idx = i
            break

    out: list[_PdfVendor] = []
    for row_idx, row in enumerate(table[1:], start=1):
        if not row:
            continue
        candidates: list[str] = []
        if name_col_idx is not None and name_col_idx < len(row):
            v = str(row[name_col_idx] or "").strip()
            if v:
                candidates.append(v)
        else:
            # Fallback: pick the cell with the longest alphabetical content
            longest = max(
                (str(c or "").strip() for c in row),
                key=lambda s: len(s) if any(ch.isalpha() for ch in s) else 0,
                default="",
            )
            if longest:
                candidates.append(longest)

        for cand in candidates:
            if not _is_noise(cand):
                out.append(_PdfVendor(
                    name=cand[:200],
                    position=row_idx,
                    context=" | ".join(str(c or "")[:60] for c in row),
                    table_row=row_idx,
                    confidence=0.85,
                ))
                break  # one vendor per row
    return out


async def _classify_pdf_kind(pages: list, *, max_pages: int = 2) -> _PdfKind:
    """Send the first ~max_pages of native text to an LLM to decide whether
    this PDF is worth extracting. Returns `_PdfKind` with `kind` ∈ the
    enumeration; if classification fails or text is too sparse, returns
    `kind="unknown"` (proceed with extraction).

    The single LLM call here saves N-page LLM calls for academic / agenda /
    T&C PDFs that today get parsed and pollute the vendor list with author
    names + page headers.
    """
    from langchain_core.messages import HumanMessage, SystemMessage

    from ..llm.cloud_router import chat_structured
    from ..llm.openai_client import chat

    sample_chunks: list[str] = []
    total = 0
    for p in pages[:max_pages]:
        t = (p.text or "").strip()
        if not t:
            continue
        # Cap each page snippet so the classifier prompt stays small.
        sample_chunks.append(f"[Page {p.page_number}]\n{t[:3500]}")
        total += len(t)
        if total > 8000:
            break

    if total < 200:
        # Not enough text to classify — let downstream LLM extraction handle it.
        return _PdfKind(kind="unknown", reason="too_little_text")

    sample = "\n\n---\n\n".join(sample_chunks)
    sys = SystemMessage(
        content=(
            "You classify PDFs by document KIND. The pipeline that calls you "
            "looks for company/vendor exhibitor lists at trade shows. Given "
            "the first ~2 pages of a PDF, return ONE of these kinds:\n\n"
            "- exhibitor_list: a company directory / sponsor list / vendor "
            "index. Names are typically organizations with booth numbers, "
            "categories, or short product descriptions.\n"
            "- brochure: event marketing material that mentions vendor "
            "names alongside event info (worth extracting).\n"
            "- academic_paper: research paper, conference proceedings, "
            "abstract book, citation list, author bios. KEY SIGNALS: "
            "page headers like '8TH INTERNATIONAL CONFERENCE ON ...', "
            "lists of human author names ('A. Lastname, B. Lastname and "
            "C. Lastname'), table-of-contents entries with page-number "
            "dot leaders ('on Probability Distributions ...... 67-74'), "
            "session info like 'Chairperson: Dr. ...', 'Plenary Lecture "
            "Session', 'Invited Speaker'. SKIP entirely.\n"
            "- agenda_only: program/schedule/session list with NO vendor "
            "index. SKIP.\n"
            "- terms_conditions: legal text, privacy policy, T&C. SKIP.\n"
            "- venue_guide: floor plan / room capacity / facility map "
            "only, no vendors. SKIP.\n"
            "- unknown: genuinely unclear — fallback (extraction proceeds).\n\n"
            "Be strict: when in doubt between exhibitor_list and "
            "academic_paper, lean academic_paper if you see ANY of: human "
            "author lists, ToC dot leaders, 'Volume N Issue M', "
            "'Proceedings of', page-number page headers like "
            "'PAGE N OF M', or session/lecture session labels. False "
            "positives on academic_paper waste 1 LLM call; false negatives "
            "pollute the vendor table with author names.\n\n"
            "OUTPUT: JSON only, no prose."
        )
    )
    user = HumanMessage(content=f"PDF first-pages text:\n\n{sample}")
    try:
        result = await chat_structured(
            [sys, user], _PdfKind, local_chat=chat, tier="light"
        )
        if isinstance(result, _PdfKind):
            return result
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_extractor", category="classify").inc()
        _log.warning("pdf_extractor.classify_failed", error=str(e)[:200])
    return _PdfKind(kind="unknown", reason="classify_error")


async def _extract_vendors_via_llm(page_text: str, page_number: int) -> list[_PdfVendor]:
    """LLM extraction for prose-style pages where there's no clean table."""
    from langchain_core.messages import HumanMessage, SystemMessage

    from ..llm.cloud_router import chat_structured
    from ..llm.openai_client import chat

    if len(page_text.strip()) < 30:
        return []

    sys = SystemMessage(content=(
        "Extract ONLY real company / organization / vendor names from a "
        "trade-show PDF page. Be aggressive about REJECTING noise — when "
        "in doubt, skip. False positives pollute the vendor table; false "
        "negatives only cost one missed name out of hundreds.\n\n"
        "OUTPUT EXACTLY: one entry per *clear* exhibitor company in the "
        "order they appear, 1-indexed `position`, `context` = 50-100 char "
        "window around the name.\n\n"
        "REJECT EVERY ONE OF THESE (return them as empty vendors list):\n"
        "- HUMAN AUTHOR NAMES: e.g. 'Sushanta Pradhan', 'Deepjoy Das, "
        "Rituparna Devi and Subhankar Ghosh', 'B. Roja Reddy and "
        "M. Uttarakumari', 'Matthew Lentz and Manoj Franklin'. Multiple "
        "first-name + last-name patterns separated by commas / 'and' = "
        "academic paper authors, NEVER vendors.\n"
        "- TABLE-OF-CONTENTS ENTRIES with dot leaders or page-number "
        "ranges, e.g. 'on Probability Distributions ......... 67-74', "
        "'3D Map Reconstruction ............ 75-86', 'Network ........ 49-57'.\n"
        "- PAGE HEADERS / RUNNING TITLES that repeat across pages, e.g. "
        "'8TH INTERNATIONAL CONFERENCE ON COMPUTER SCIENCE AND TECHNOLOGY', "
        "'PROCEEDINGS OF ICCSE 2026', 'VOLUME 12 ISSUE 3'.\n"
        "- SESSION / TRACK LABELS: 'Plenary Lecture Session', "
        "'Invited Speaker Presentation Session', 'Chairperson: Dr. ...', "
        "'Moderator: Prof. ...', 'Panel Discussion'.\n"
        "- ACADEMIC ENTITY-LIKE STRINGS that are not exhibitors: paper "
        "titles, dissertation titles, journal-article titles.\n"
        "- Page numbers, headers, footers, copyright text\n"
        "- Hall / booth / room / suite / ballroom labels (e.g. 'Hall A', "
        "'Booth 312', 'Room 437', 'Ballroom 1-2', 'Olympic View Room', "
        "'Terrace Suite', 'Boardroom', 'Gender Neutral Restrooms')\n"
        "- Venue facility descriptors (Lobby / Foyer / Reception / "
        "'Coat Check' / 'Registration')\n"
        "- Dimensions / capacities ('176 x 329', '8\\' x 18\\'', '30 sqft')\n"
        "- Bare domains in footers (e.g. 'wscc.com' alone — UNLESS it's "
        "explicitly listed as one of many vendor websites)\n"
        "- Bullet-led definition or instruction text\n"
        "- Glyph corruption like '(cid:31)' — never extract these\n"
        "- Single-letter, single-word, or all-numeric strings (real "
        "company names are typically 2+ words OR include 'Inc/Corp/LLC/"
        "Ltd/GmbH/Co/Group/Solutions/Systems/Technologies/Industries/...')\n\n"
        "ENTIRE-PAGE BAIL: if MORE THAN HALF of the candidates on this "
        "page would be human author names, ToC entries, or repeated page "
        "headers, the page is academic — return `{\"vendors\": []}` "
        "regardless of any individual extraction.\n\n"
        "Same bail for: venue floor plan / room capacity chart / facility "
        "guide / agenda / program / terms-and-conditions / citation list.\n\n"
        "OUTPUT RULE: JSON only matching the schema. NEVER prose, "
        "NEVER markdown fences."
    ))
    user = HumanMessage(content=f"Page {page_number} text:\n\n{page_text[:12000]}")
    try:
        result = await chat_structured(
            [sys, user], _PdfPageVendors, local_chat=chat, tier="light"
        )
        if isinstance(result, _PdfPageVendors):
            cleaned: list[_PdfVendor] = []
            for v in result.vendors:
                if not _is_noise(v.name):
                    cleaned.append(v)
            return cleaned
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_extractor", category="llm_extract").inc()
        _log.warning("pdf_extractor.llm_failed", page=page_number, error=str(e))
    return []


async def list_exhibitors(pdf_url: str, expo_id: str) -> list[ExhibitorRef]:
    """Download PDF, extract vendor refs with full provenance."""
    from ...store import pdf_store
    from ..parsers.pdf_parser import extract_pages

    download_result = await pdf_store.download(pdf_url, expo_id)
    if download_result is None:
        return []
    pdf_path, sha256 = download_result

    pages = await extract_pages(pdf_path)
    if not pages:
        _log.info("pdf_extractor.no_pages", pdf=pdf_path.name, expo_id=expo_id)
        await _persist_pdf_row(
            pdf_url=pdf_url,
            pdf_path=pdf_path,
            expo_id=expo_id,
            sha256=sha256,
            page_count=0,
            vendors_found=0,
        )
        return []
    pdf_extracted_total.inc()
    for page in pages:
        pdf_pages_processed_total.labels(method=page.extraction_method).inc()

    # NEW: doc-level LLM gate. Before burning N-page LLM calls on per-page
    # extraction, classify the whole PDF from its first 1-2 pages. Academic
    # papers / agendas / T&C PDFs short-circuit here and never get parsed.
    kind_result = await _classify_pdf_kind(pages)
    if kind_result.kind in _SKIP_KINDS:
        _log.info(
            "pdf_extractor.skipped_by_kind",
            pdf=pdf_path.name, expo_id=expo_id,
            kind=kind_result.kind, reason=kind_result.reason[:160],
        )
        await _persist_pdf_row(
            pdf_url=pdf_url,
            pdf_path=pdf_path,
            expo_id=expo_id,
            sha256=sha256,
            page_count=len(pages),
            vendors_found=0,
        )
        return []
    _log.info(
        "pdf_extractor.classified",
        pdf=pdf_path.name, kind=kind_result.kind,
        reason=kind_result.reason[:120],
    )

    refs: list[ExhibitorRef] = []
    for page in pages:
        # Heuristic table extraction is now ADVISORY ONLY — it seeds candidates
        # but every output goes through the LLM extractor for validation.
        # Previously the table path bypassed LLM entirely and pulled author
        # names + page headers from academic-paper-shaped layouts.
        vendors_table: list[_PdfVendor] = []
        for table in page.tables:
            vendors_table.extend(_vendors_from_table(table))

        # Always run LLM on the page text. The classifier kept us off pure
        # noise PDFs; on the surviving PDFs we still need LLM filtering to
        # drop per-page noise (page headers, footnotes, single-author lines).
        page_vendors = await _extract_vendors_via_llm(page.text, page.page_number)

        # Merge: union by lowercased name. Table candidates that the LLM
        # also chose get the higher confidence (0.85); LLM-only get 0.5.
        # Table candidates the LLM REJECTED are dropped — we trust the LLM
        # filter since it has full page context.
        llm_names = {v.name.lower() for v in page_vendors}
        for tv in vendors_table:
            if tv.name.lower() in llm_names:
                # Bump confidence on the matching LLM-emitted vendor.
                for pv in page_vendors:
                    if pv.name.lower() == tv.name.lower():
                        pv.confidence = max(pv.confidence, tv.confidence)
                        if not pv.table_row:
                            pv.table_row = tv.table_row
                        break

        for position, v in enumerate(page_vendors, start=1):
            try:
                refs.append(ExhibitorRef(
                    expo_id=expo_id,
                    name=v.name,
                    raw_url=None,
                    aggregator_domain=None,
                    short_description=v.context,
                    booth=None,
                    provenance=[SourceProvenance(
                        type="pdf",
                        url=pdf_url,
                        pdf_filename=pdf_path.name,
                        pdf_sha256=sha256,
                        page=page.page_number,
                        position=position,
                        extraction_method=page.extraction_method if not v.table_row else "pdfplumber_table",
                        confidence=v.confidence,
                        context_snippet=v.context[:300] if v.context else None,
                    )],
                ))
            except Exception as e:  # noqa: BLE001
                _log.debug("pdf_extractor.invalid_ref", error=str(e), name=v.name[:80])

    try:
        await pdf_store.write_page_extracts(expo_id, pdf_path.name, pages, refs)
    except Exception as e:  # noqa: BLE001
        _log.debug("pdf_extractor.audit_write_failed", error=str(e))

    pdf_vendors_found_total.inc(len(refs))
    _log.info(
        "pdf_extractor.vendors_found",
        expo_id=expo_id,
        pdf=pdf_path.name,
        pages=len(pages),
        vendors=len(refs),
    )
    await _persist_pdf_row(
        pdf_url=pdf_url,
        pdf_path=pdf_path,
        expo_id=expo_id,
        sha256=sha256,
        page_count=len(pages),
        vendors_found=len(refs),
    )
    return refs


async def _persist_pdf_row(
    *,
    pdf_url: str,
    pdf_path: Path,
    expo_id: str,
    sha256: str,
    page_count: int,
    vendors_found: int,
) -> None:
    """Idempotent upsert of PDF metadata into Postgres pdfs table.

    Errors here must NOT break the extraction flow, so we swallow exceptions
    after logging. The on-disk audit trail remains the source-of-truth backup.
    """
    from datetime import datetime, timezone
    from json import loads

    from ...db.engine import get_sessionmaker
    from ...db.repositories import pdf_repo

    sidecar = Path(str(pdf_path) + ".meta.json")
    size_bytes = 0
    downloaded_at = datetime.now(timezone.utc)
    try:
        if sidecar.exists():
            meta = loads(sidecar.read_text(encoding="utf-8"))
            size_bytes = int(meta.get("size_bytes") or 0)
            ts = meta.get("downloaded_at")
            if ts:
                downloaded_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception as e:  # noqa: BLE001
        _log.debug("pdf_extractor.sidecar_read_failed", error=str(e))

    if size_bytes == 0:
        try:
            size_bytes = pdf_path.stat().st_size
        except Exception:  # noqa: BLE001
            pass

    sessionmaker = get_sessionmaker()
    effective_expo_id: str | None = expo_id

    try:
        from sqlalchemy import select

        from ...db.models import ExpoORM

        async with sessionmaker() as scout:
            exists = (
                await scout.execute(select(ExpoORM.expo_id).where(ExpoORM.expo_id == expo_id))
            ).scalar_one_or_none()
            if exists is None:
                effective_expo_id = None
                _log.debug(
                    "pdf_extractor.expo_not_yet_persisted",
                    pdf=pdf_path.name,
                    expo_id=expo_id,
                )
    except Exception as e:  # noqa: BLE001
        _log.debug("pdf_extractor.expo_check_failed", error=str(e))

    try:
        async with sessionmaker() as session:
            try:
                await pdf_repo.upsert(
                    session,
                    filename=pdf_path.name,
                    source_url=pdf_url,
                    expo_id=effective_expo_id,
                    sha256=sha256,
                    size_bytes=size_bytes,
                    page_count=page_count,
                    vendors_found=vendors_found,
                    downloaded_at=downloaded_at,
                    meta={
                        "audit_path": str(pdf_path.parent / "_index.json"),
                        "intended_expo_id": expo_id,
                    },
                )
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="pdf_extractor", category="db_persist").inc()
        _log.warning(
            "pdf_extractor.db_persist_failed",
            pdf=pdf_path.name,
            expo_id=expo_id,
            error=str(e)[:200],
        )
