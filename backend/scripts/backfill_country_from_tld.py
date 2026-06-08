"""Snowglobe Phase 2 — best-effort country backfill from domain TLD.

After the 26K bring-back wave restored vendors, only ~3% have address.country
populated — Browser-Use hasn't reached them yet and they need 60-180s each.
For the "Top Country" widget to show meaningful numbers immediately, derive a
country from the domain TLD (e.g. .de -> Germany, .cn -> China).

This is a *best-effort* signal: writes ONLY when both address.country and
registrar_country are NULL. Browser-Use re-enrichment will later overwrite
with the canonical scraped country if present.

Usage:
    python backend/scripts/backfill_country_from_tld.py --dry-run
    python backend/scripts/backfill_country_from_tld.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import text  # noqa: E402

from crawler.db.session import get_session  # noqa: E402

# ccTLD → country name. Conservative coverage for major defense markets.
TLD_TO_COUNTRY = {
    "de": "Germany",        "fr": "France",       "uk": "United Kingdom",
    "co.uk": "United Kingdom", "it": "Italy",     "es": "Spain",
    "ru": "Russia",         "jp": "Japan",        "kr": "South Korea",
    "in": "India",          "tw": "Taiwan",       "br": "Brazil",
    "au": "Australia",      "com.au": "Australia","ca": "Canada",
    "mx": "Mexico",         "sa": "Saudi Arabia", "ae": "United Arab Emirates",
    "il": "Israel",         "tr": "Türkiye",      "pl": "Poland",
    "nl": "Netherlands",    "be": "Belgium",      "ch": "Switzerland",
    "at": "Austria",        "se": "Sweden",       "fi": "Finland",
    "no": "Norway",         "dk": "Denmark",      "cz": "Czechia",
    "gr": "Greece",         "pt": "Portugal",     "ro": "Romania",
    "hu": "Hungary",        "bg": "Bulgaria",     "hr": "Croatia",
    "sg": "Singapore",      "my": "Malaysia",     "id": "Indonesia",
    "th": "Thailand",       "vn": "Vietnam",      "ph": "Philippines",
    "za": "South Africa",   "ng": "Nigeria",      "eg": "Egypt",
    "ma": "Morocco",        "cn": "China",        "hk": "Hong Kong",
    "ie": "Ireland",        "ar": "Argentina",    "cl": "Chile",
    "co": "Colombia",       "pe": "Peru",         "ve": "Venezuela",
    "ua": "Ukraine",        "by": "Belarus",      "kz": "Kazakhstan",
    "lt": "Lithuania",      "lv": "Latvia",       "ee": "Estonia",
    "is": "Iceland",        "lu": "Luxembourg",   "mt": "Malta",
    "cy": "Cyprus",         "rs": "Serbia",       "si": "Slovenia",
    "sk": "Slovakia",       "ba": "Bosnia and Herzegovina",
    "mk": "North Macedonia","al": "Albania",      "qa": "Qatar",
    "kw": "Kuwait",         "bh": "Bahrain",      "om": "Oman",
    "jo": "Jordan",         "lb": "Lebanon",      "ir": "Iran",
    "iq": "Iraq",           "tn": "Tunisia",      "dz": "Algeria",
    "ly": "Libya",          "sn": "Senegal",      "ke": "Kenya",
    "et": "Ethiopia",       "gh": "Ghana",        "tz": "Tanzania",
    "ug": "Uganda",         "pk": "Pakistan",     "bd": "Bangladesh",
    "lk": "Sri Lanka",      "np": "Nepal",        "nz": "New Zealand",
}


def _tld_of(domain: str | None) -> str | None:
    if not domain:
        return None
    parts = domain.strip().lower().lstrip(".").split(".")
    if len(parts) < 2:
        return None
    # Prefer 2-part SLD-TLD combos first (co.uk, com.au) before single TLD
    sld_tld = ".".join(parts[-2:])
    if sld_tld in TLD_TO_COUNTRY:
        return sld_tld
    tld = parts[-1]
    if tld in TLD_TO_COUNTRY:
        return tld
    return None


async def run(*, apply: bool) -> dict[str, int]:
    stats = {"scanned": 0, "would_update": 0, "updated": 0, "skipped_no_tld": 0}

    async with get_session() as session:
        rows = (await session.execute(text(
            """
            SELECT vendor_id, domain, address
              FROM vendors
             WHERE hidden = FALSE
               AND (address->>'country' IS NULL OR address->>'country' = '')
               AND (registrar_country IS NULL OR registrar_country = '')
               AND domain IS NOT NULL
            """
        ))).mappings().all()

    updates: list[tuple[str, dict]] = []
    for r in rows:
        stats["scanned"] += 1
        tld = _tld_of(r["domain"])
        if not tld:
            stats["skipped_no_tld"] += 1
            continue
        country = TLD_TO_COUNTRY[tld]
        addr = r["address"] if isinstance(r["address"], dict) else {}
        addr = {**addr, "country": country, "_source": "tld_backfill"}
        updates.append((str(r["vendor_id"]), addr))
        stats["would_update"] += 1

    print(f"[backfill] scanned={stats['scanned']}, would_update={stats['would_update']}, "
          f"skipped_no_tld={stats['skipped_no_tld']}")

    if not apply:
        # Sample distribution
        from collections import Counter
        dist = Counter(u[1]["country"] for u in updates)
        print(f"[DRY RUN] top 15 countries to be filled:")
        for c, n in dist.most_common(15):
            print(f"  {c:30s} {n}")
        return stats

    async with get_session() as session:
        for i in range(0, len(updates), 500):
            chunk = updates[i : i + 500]
            for vid, addr in chunk:
                await session.execute(
                    text("UPDATE vendors SET address = CAST(:a AS jsonb) WHERE vendor_id = :v"),
                    {"a": json.dumps(addr), "v": vid},
                )
            await session.commit()
            stats["updated"] += len(chunk)
            print(f"  updated {stats['updated']}/{len(updates)}")

    return stats


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="Write changes (default: dry-run)")
    args = p.parse_args()
    stats = asyncio.run(run(apply=args.apply))
    print(f"\n[{'APPLIED' if args.apply else 'DRY RUN'}] {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
