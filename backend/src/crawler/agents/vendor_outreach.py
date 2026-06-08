"""Vendor outreach agent — generates two artifacts via LLM (Ollama-compatible
through the shared `chat()` client):

  1. ``draft_vendor_email``     — bilingual industrial-invitation email draft.
                                   Persisted by the API layer into
                                   ``VendorEmailDraftORM`` keyed by
                                   ``(vendor_id, language)``.

  2. ``generate_dossier_content`` — structured PDF content (overview,
                                     scope sections, mermaid diagram source,
                                     pros/cons summary) consumed by the
                                     frontend pdf-lib + mermaid renderer.

Both functions are async, return Pydantic models, and rely on the existing
``chat()`` heavy-tier path with structured output. No new dependency added.
"""

from __future__ import annotations

import time
from typing import Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ..observability.logger import get_logger
from ..observability.metrics import errors_total, request_duration_seconds
from ..schemas import EmailDraftPayload
from ..tools.llm.cloud_router import chat_structured
from ..tools.llm.openai_client import chat

_log = get_logger(__name__)

Language = Literal["en", "id"]


# ----------------------------------------------------------------------
# Email draft
# ----------------------------------------------------------------------

_EMAIL_SYS_EN = (
    "You write concise, professional industrial-invitation outreach emails "
    "to potential vendor partners. Tone: institutional, courteous, precise — "
    "the kind of email a procurement / partnerships lead at a technical "
    "organization would send. Structure: 3-4 short paragraphs.\n"
    "  1. Brief greeting + who we are + why we're reaching out (one sentence).\n"
    "  2. Why this specific vendor caught our attention (cite their focus, "
    "products, or industry alignment).\n"
    "  3. What we want to explore — the project scope and our domain of "
    "interest. State concretely what kind of collaboration we propose.\n"
    "  4. A direct ask: schedule a 30-minute discovery call.\n"
    "Avoid hype, avoid emojis. Subject line should be specific and reference "
    "the alignment, not generic 'partnership opportunity'. Output Pydantic "
    "EmailDraftPayload with subject and body."
)

_EMAIL_SYS_ID = (
    "Anda menulis email undangan industrial yang ringkas dan profesional "
    "untuk vendor yang berpotensi menjadi mitra. Tone: institusional, "
    "sopan, presisi — seperti email yang ditulis pemimpin pengadaan / "
    "kemitraan dari organisasi teknis. Struktur: 3-4 paragraf pendek.\n"
    "  1. Salam pembuka + perkenalan singkat siapa kami + mengapa kami "
    "menghubungi (satu kalimat).\n"
    "  2. Mengapa vendor ini secara spesifik menarik perhatian kami "
    "(kutip fokus, produk, atau keselarasan industri mereka).\n"
    "  3. Apa yang ingin kami eksplorasi — ruang lingkup proyek dan "
    "domain minat kami. Sebutkan secara konkret bentuk kolaborasi.\n"
    "  4. Ajakan langsung: menjadwalkan diskusi 30 menit.\n"
    "Hindari hype, hindari emoji. Subject line harus spesifik mengacu "
    "keselarasan, bukan generik 'peluang kemitraan'. Output Pydantic "
    "EmailDraftPayload dengan subject dan body."
)


def _vendor_brief(v: dict[str, Any]) -> str:
    """One-shot summary of the vendor for the LLM prompt."""
    parts: list[str] = []
    name = v.get("company_name") or v.get("domain") or "Unknown vendor"
    parts.append(f"Name: {name}")
    if v.get("domain"):
        parts.append(f"Domain: {v['domain']}")
    if v.get("registrar_country"):
        parts.append(f"Country: {v['registrar_country']}")
    industries = v.get("industries") or []
    if industries:
        parts.append(f"Industries: {', '.join(industries[:6])}")
    doi = v.get("domain_of_interest") or []
    if doi:
        parts.append(f"Scope tags: {', '.join(doi[:6])}")
    if v.get("focus_summary"):
        parts.append(f"Focus: {v['focus_summary'][:600]}")
    if v.get("description"):
        parts.append(f"Description: {v['description'][:500]}")
    products = v.get("products_detailed") or []
    if products:
        names = [p.get("name", "") for p in products[:4] if p.get("name")]
        if names:
            parts.append(f"Top products: {', '.join(names)}")
    return "\n".join(parts)


def _our_context_default(language: Language) -> str:
    """Fallback context when the operator hasn't provided a custom blurb."""
    if language == "id":
        return (
            "Kami sebuah konsorsium teknologi yang membangun pemetaan ekosistem "
            "industrial — fokus pada pertahanan, energi, infrastruktur kritis, "
            "manufaktur lanjutan, dan elektronik. Kami mengevaluasi vendor untuk "
            "potensi kolaborasi pengadaan, kemitraan riset, dan integrasi rantai "
            "pasok jangka panjang."
        )
    return (
        "We're a technology consortium mapping the industrial ecosystem — "
        "focused on defense, energy, critical infrastructure, advanced "
        "manufacturing, and electronics. We evaluate vendors for "
        "procurement collaboration, research partnerships, and long-term "
        "supply-chain integration."
    )


async def draft_vendor_email(
    *,
    vendor: dict[str, Any],
    language: Language = "en",
    our_context: str | None = None,
) -> EmailDraftPayload:
    """Generate one industrial-invitation email draft for a vendor.

    Caller is responsible for persisting the result via
    ``vendor_email_draft_repo.upsert``. We don't write the DB here so the
    function stays composable for previewing without saving.
    """
    started = time.monotonic()
    sys_text = _EMAIL_SYS_EN if language == "en" else _EMAIL_SYS_ID
    ctx = our_context or _our_context_default(language)
    try:
        sys = SystemMessage(content=sys_text)
        user = HumanMessage(content=(
            f"--- VENDOR PROFILE ---\n{_vendor_brief(vendor)}\n\n"
            f"--- OUR CONTEXT (we = the sender) ---\n{ctx}\n\n"
            "Write the outreach email now. Subject + body fields only."
        ))
        result = await chat_structured(
            [sys, user], EmailDraftPayload, local_chat=chat, tier="heavy"
        )
        if result is None:
            raise RuntimeError("vendor_outreach.email returned no parseable result")
        _log.info(
            "vendor_outreach.email_ok",
            vendor_id=vendor.get("vendor_id"),
            language=language,
        )
        return result
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="vendor_outreach", category="email_failed").inc()
        _log.warning(
            "vendor_outreach.email_failed",
            vendor_id=vendor.get("vendor_id"),
            language=language,
            error=str(e)[:300],
        )
        raise
    finally:
        request_duration_seconds.labels(tool="vendor_email").observe(time.monotonic() - started)


# ----------------------------------------------------------------------
# Dossier content (frontend renders to PDF via pdf-lib + mermaid)
# ----------------------------------------------------------------------


class DossierSection(BaseModel):
    """A titled prose section in the vendor dossier PDF."""

    heading: str = Field(..., description="Short section heading")
    body: str = Field(..., description="Plain-text paragraph(s); no markdown")


class DossierProsCons(BaseModel):
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)


class GraphNode(BaseModel):
    """One node in the structured business-scope graph."""

    id: str = Field(..., description="Stable ASCII id, e.g. 'V', 'H1', 'D2'")
    label: str = Field(..., description="Short display label (1-3 words)")
    kind: Literal["root", "capability", "domain", "product"] = Field(
        default="capability",
        description="Visual role — root=center vendor, capability=mid layer, "
                    "domain=served sector, product=specific offering",
    )


class GraphEdge(BaseModel):
    """Directed edge `source` → `target`. Field names chosen for LLM
    schema-emit safety (avoiding Python keyword `from`)."""

    source: str = Field(..., description="Origin node id")
    target: str = Field(..., description="Destination node id")


class BusinessGraph(BaseModel):
    """Structured directed graph for vendor business-scope diagram.

    Replaces the old `mermaid_diagram: str` field. Frontend uses dagre
    auto-layout + pure pdf-lib primitives to render — no SVG, no canvas
    rasterization, no browser-rendering quirks.
    """

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class DossierContent(BaseModel):
    """Structured content the frontend assembles into a PDF.

    The business_graph is NOT in this schema — it's built deterministically
    by the frontend from vendor_meta (products_detailed + domain_of_interest).
    Keeping LLM scope narrow improves emission reliability significantly.
    """

    title: str = Field(..., description="Vendor name as headline")
    subtitle: str = Field(..., description="One-line positioning")
    overview: str = Field(
        ..., description="2-4 sentence executive summary of the vendor"
    )
    sections: list[DossierSection] = Field(
        default_factory=list,
        description="Sections covering domain of interest, products, focus",
    )
    pros_cons: DossierProsCons = Field(default_factory=DossierProsCons)
    closing_note: str = Field(
        default="",
        description="One-line caveat or recommendation, optional",
    )


_DOSSIER_SYS_EN = (
    "You produce structured intelligence dossier content describing a "
    "vendor's industrial profile. Output strict Pydantic DossierContent.\n\n"
    "Required: title, subtitle (one-line positioning), overview "
    "(2-4 sentences executive summary), sections (4 items covering company "
    "overview, domain of interest, product scope, focus areas), pros_cons "
    "(3-5 items each from a procurement perspective), closing_note "
    "(optional 1-line recommendation).\n\n"
    "Keep prose tight — institutional brief, not marketing copy. Plain "
    "ASCII or Latin-1 only — no emojis, no curly quotes, no math symbols.\n"
)

_DOSSIER_SYS_ID = (
    "Anda menghasilkan konten dosir intelijen terstruktur yang "
    "mendeskripsikan profil industrial sebuah vendor. SEMUA TEKS DALAM "
    "BAHASA INDONESIA — title, subtitle, overview, section heading + body, "
    "pros/cons, closing note. JANGAN gunakan istilah Inggris kecuali nama "
    "produk/teknologi yang memang istilah baku (misal: 'CCTV', 'firewall', "
    "'GPS').\n\n"
    "Output Pydantic DossierContent yang ketat.\n"
    "Wajib: title (nama vendor), subtitle (satu-baris positioning), "
    "overview (2-4 kalimat executive summary), sections (4 item mencakup "
    "ringkasan perusahaan, domain minat, ruang lingkup produk, area fokus), "
    "pros_cons (3-5 item masing-masing dari perspektif pengadaan), "
    "closing_note (rekomendasi opsional 1 baris).\n\n"
    "Prosa padat — brief institusional, bukan teks pemasaran. Hanya ASCII "
    "atau Latin-1 — tanpa emoji, kutip melengkung, simbol matematika.\n"
)


async def generate_dossier_content(
    *,
    vendor: dict[str, Any],
    language: Language = "en",
) -> DossierContent:
    """Generate structured vendor dossier content for the PDF download.

    The returned object is JSON-serializable; the frontend pdf-lib + mermaid
    pipeline reads it and builds the actual PDF client-side.
    """
    started = time.monotonic()
    sys_text = _DOSSIER_SYS_EN if language == "en" else _DOSSIER_SYS_ID
    try:
        sys = SystemMessage(content=sys_text)
        user = HumanMessage(content=(
            f"--- VENDOR PROFILE ---\n{_vendor_brief(vendor)}\n\n"
            "Produce the full DossierContent now."
        ))
        result = await chat_structured(
            [sys, user], DossierContent, local_chat=chat, tier="heavy"
        )
        if result is None:
            raise RuntimeError("vendor_outreach.dossier returned no parseable result")
        _log.info(
            "vendor_outreach.dossier_ok",
            vendor_id=vendor.get("vendor_id"),
            language=language,
            sections=len(result.sections),
        )
        return result
    except Exception as e:  # noqa: BLE001
        errors_total.labels(stage="vendor_outreach", category="dossier_failed").inc()
        _log.warning(
            "vendor_outreach.dossier_failed",
            vendor_id=vendor.get("vendor_id"),
            language=language,
            error=str(e)[:300],
        )
        raise
    finally:
        request_duration_seconds.labels(tool="vendor_dossier").observe(time.monotonic() - started)
