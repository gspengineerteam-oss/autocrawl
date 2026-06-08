"""DEPRECATED — ChatGPT database HTML importer.

Quarantined 2026-05-25 sebagai bagian dari snowglobe reset (rule 5: jangan
import dari ChatGPT atau database eksternal lagi). File ini sengaja ga
dihapus biar history extraction logic-nya masih bisa dilihat.

Original purpose: bulk-import ~15-20k vendors dari Google Sheets HTML curated
oleh ChatGPT session sebelumnya. Sekarang udah ga relevan karena pipeline
udah fokus military scope only via tools/skills/military_classifier.

Kalau lo bener-bener mau jalanin lagi, set REVIVE_CHATGPT_IMPORT=1 di env.
"""

from __future__ import annotations

import os
import sys

if os.getenv("REVIVE_CHATGPT_IMPORT", "").lower() not in {"1", "true", "yes"}:
    sys.exit(
        "import_chatgpt_db.py di-quarantine per snowglobe reset 2026-05-25 "
        "(rule 5). Set REVIVE_CHATGPT_IMPORT=1 kalo lo bener bener perlu."
    )

import asyncio  # noqa: E402
import re  # noqa: E402
from datetime import date, datetime, timezone  # noqa: E402
from html.parser import HTMLParser  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Iterator  # noqa: E402

# Add backend src to path when running standalone
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from crawler.db.repositories import expo_repo, vendor_repo  # noqa: E402
from crawler.db.session import get_session  # noqa: E402
from crawler.schemas import Expo, ExpoSource, Vendor  # noqa: E402
from crawler.tools.url_utils import canonical_domain  # noqa: E402


DB_DIR = Path("/app/database")
BATCH_SIZE = 500

# Order matters: ALL EXPO.html parsed first to build the master expo index,
# then monthly + special files contribute vendor rows under each expo.
FILE_ORDER = [
    "ALL EXPO.html",
    "January.html",
    "February.html",
    "March.html",
    "April.html",
    "May.html",
    "June.html",
    "July.html",
    "August.html",
    "September.html",
    "October.html",
    "November.html",
    "December.html",
    "Disaster.html",
    "Uncategorized.html",
    "TBC.html",
]

# Month names found in date strings -> month number for crude date parsing
_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
    "januari": 1, "februari": 2, "maret": 3, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10,
    "november": 11, "desember": 12,
}


class TableExtractor(HTMLParser):
    """Extract rows from Google Sheets HTML export. Each row is a list of
    (text, href) tuples; href is None when the cell has no <a> child."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[tuple[str, str | None]]] = []
        self._row: list[tuple[str, str | None]] = []
        self._cell: list[str] = []
        self._in_td = False
        self._cur_href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag == "td":
            self._in_td = True
            self._cell = []
            self._cur_href = None
        elif tag == "a" and self._in_td:
            for k, v in attrs:
                if k == "href" and v:
                    self._cur_href = v

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self._in_td:
            txt = "".join(self._cell).strip()
            self._row.append((txt, self._cur_href))
            self._in_td = False
        elif tag == "tr":
            if self._row:
                self.rows.append(self._row)

    def handle_data(self, data: str) -> None:
        if self._in_td:
            self._cell.append(data)


def parse_html_table(path: Path) -> list[list[tuple[str, str | None]]]:
    parser = TableExtractor()
    parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
    return parser.rows


def _slugify(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:200] or "unknown"


def _country_from_location(loc: str | None) -> str | None:
    if not loc:
        return None
    parts = [p.strip() for p in loc.split(",") if p.strip()]
    return parts[-1] if parts else None


def _parse_date_range(s: str | None) -> tuple[date | None, date | None]:
    if not s:
        return None, None
    s = s.replace("–", "-").replace("—", "-")
    # Find any 4-digit year
    year_match = re.search(r"(20\d{2})", s)
    year = int(year_match.group(1)) if year_match else 2026
    # Find first month token
    month = None
    s_lower = s.lower()
    for token, num in _MONTH_MAP.items():
        if re.search(rf"\b{token}\b", s_lower):
            month = num
            break
    if month is None:
        return None, None
    # Extract first day digits
    day_match = re.search(r"(\d{1,2})", s)
    day = int(day_match.group(1)) if day_match else 1
    day = max(1, min(28, day))  # clamp to safe range
    try:
        return date(year, month, day), None
    except ValueError:
        return None, None


def is_expo_separator(row: list[tuple[str, str | None]]) -> bool:
    """Expo separator rows have 'NN company' or 'NN companies' in column C3."""
    if len(row) < 4:
        return False
    c3_text = row[3][0] if row[3][0] else ""
    return bool(re.match(r"^\d+\s+compan", c3_text.lower()))


def _expo_id_from_row(row: list[tuple[str, str | None]]) -> str | None:
    if not row or not row[0][0]:
        return None
    return _slugify(row[0][0])


def build_expo_from_separator(row: list[tuple[str, str | None]], source_tag: str) -> Expo:
    name = row[0][0].strip()
    aggregator_url = row[0][1] if len(row) > 0 else None
    date_str = row[1][0] if len(row) > 1 else None
    location = row[2][0] if len(row) > 2 else None
    start_date, end_date = _parse_date_range(date_str)
    return Expo(
        expo_id=_slugify(name),
        name=name,
        source=ExpoSource.AGENTIC,
        aggregator_url=aggregator_url if aggregator_url and aggregator_url.startswith("http") else None,
        official_url=aggregator_url if aggregator_url and aggregator_url.startswith("http") else None,
        location=location,
        country=_country_from_location(location),
        start_date=start_date,
        end_date=end_date,
        topics=[],
        discovered_at=datetime.now(timezone.utc),
        discovery_query=f"chatgpt_database:{source_tag}",
        raw_metadata={"source_file": source_tag, "raw_date": date_str},
    )


def build_vendor_from_row(
    row: list[tuple[str, str | None]],
    expo: Expo | None,
    source_file: str,
) -> Vendor | None:
    """Build a Vendor from a non-separator row. Skip rows without a name."""
    if not row or not row[0][0]:
        return None
    name = row[0][0].strip()
    if not name or len(name) < 2:
        return None
    # Skip header rows (Event/Date/Location boilerplate)
    if name.lower() in {"event", "company", "date", "location", "relevansi"}:
        return None

    raw_url = row[0][1]
    domain = None
    canonical_url = None
    if raw_url and raw_url.startswith(("http://", "https://")):
        # Reject URLs whose host contains spaces (encoded or not) — those are
        # really vendor NAMES mis-linked as URLs by the source spreadsheet.
        host_part = raw_url.split("//", 1)[-1].split("/", 1)[0]
        if " " not in host_part and "%20" not in host_part and "." in host_part:
            try:
                domain = canonical_domain(raw_url)
                if domain and " " not in domain:
                    canonical_url = raw_url
                else:
                    domain = None
            except Exception:  # noqa: BLE001
                domain = None

    booth = row[1][0] if len(row) > 1 and row[1][0] else None
    description = row[2][0] if len(row) > 2 and row[2][0] else None
    score_str = row[3][0] if len(row) > 3 and row[3][0] else None
    rank_label = row[4][0] if len(row) > 4 and row[4][0] else None
    product = row[5][0] if len(row) > 5 and row[5][0] else None

    # ChatGPT score is usually 0-10; normalize to 0-1.
    confidence = 0.0
    if score_str:
        try:
            raw = float(score_str)
            confidence = min(max(raw / 10.0 if raw > 1 else raw, 0.0), 1.0)
        except ValueError:
            confidence = 0.0

    # Status policy:
    #   - URL + description >= 50 chars -> enriched with gap flagged
    #   - URL only OR description only -> unresolved (worker can re-resolve)
    #   - neither -> unresolved
    has_desc = bool(description and len(description) > 50)
    if domain and has_desc:
        status = "enriched"
        gap = ["contacts", "socials", "address", "products"]
    else:
        status = "unresolved"
        gap = []

    source_tags = ["source:chatgpt_database", f"file:{source_file}"]
    if rank_label:
        source_tags.append(f"chatgpt_rank:{rank_label.strip()}")
    if booth:
        source_tags.append(f"booth:{booth.strip()}")

    products_list = [product.strip()] if product else []
    expos_seen = [expo.expo_id] if expo else []

    try:
        vendor = Vendor(
            status=status,
            domain=domain,
            company_name=name,
            canonical_url=canonical_url,
            description=description,
            products=products_list,
            expos_seen=expos_seen,
            confidence_score=confidence,
            enrichment_gap=gap,
            source_tags=source_tags,
        )
    except Exception:  # noqa: BLE001 — Pydantic validation, skip bad rows
        return None
    return vendor


def chunked(seq: list, n: int) -> Iterator[list]:
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


async def main() -> None:
    if not DB_DIR.exists():
        print(f"ERROR: /app/database not mounted. Found nothing at {DB_DIR}")
        sys.exit(1)

    expo_index: dict[str, Expo] = {}
    # Use dict keyed by (domain or name+source) so we dedupe within this run
    # before hitting the DB. Postgres upsert handles cross-run dedupe.
    vendor_buffer: list[Vendor] = []
    vendor_dedup_key: set[str] = set()

    stats = {"files_seen": 0, "rows_total": 0, "vendors_built": 0, "expos_built": 0}

    for fname in FILE_ORDER:
        path = DB_DIR / fname
        if not path.exists():
            print(f"SKIP {fname} (missing)")
            continue
        stats["files_seen"] += 1
        rows = parse_html_table(path)
        stats["rows_total"] += len(rows)
        print(f"PARSE {fname}: {len(rows)} rows")

        current_expo: Expo | None = None
        for row in rows:
            if is_expo_separator(row):
                expo = build_expo_from_separator(row, source_tag=fname)
                if expo.expo_id not in expo_index:
                    expo_index[expo.expo_id] = expo
                    stats["expos_built"] += 1
                current_expo = expo_index[expo.expo_id]
                continue
            vendor = build_vendor_from_row(row, expo=current_expo, source_file=fname)
            if vendor is None:
                continue
            key = vendor.domain or f"name:{vendor.company_name.lower()}"
            if key in vendor_dedup_key:
                continue
            vendor_dedup_key.add(key)
            vendor_buffer.append(vendor)
            stats["vendors_built"] += 1

    print(f"\nPARSE DONE: {stats}\n")
    print(f"Upserting {len(expo_index)} expos + {len(vendor_buffer)} vendors")

    # Phase 1: expos
    async with get_session() as session:
        for expo in expo_index.values():
            try:
                await expo_repo.upsert(session, expo)
            except Exception as e:  # noqa: BLE001
                print(f"EXPO_FAIL {expo.expo_id}: {e}")
        await session.commit()
    print(f"DONE expos upsert ({len(expo_index)})")

    # Phase 2: vendors in batches
    inserted = 0
    failed = 0
    for chunk in chunked(vendor_buffer, BATCH_SIZE):
        async with get_session() as session:
            for v in chunk:
                try:
                    await vendor_repo.upsert(session, v)
                    inserted += 1
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    if failed < 10:
                        print(f"VENDOR_FAIL {v.company_name[:60]}: {str(e)[:200]}")
            await session.commit()
        print(f"PROGRESS {inserted}/{len(vendor_buffer)} (failed={failed})")

    print(f"\nALL DONE. inserted={inserted} failed={failed} expos={len(expo_index)}")


if __name__ == "__main__":
    asyncio.run(main())
