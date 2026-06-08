"""Expand the CCPIT topic taxonomy into explicit query lines.

Discovery's LLM-driven `expand_seeds()` will generate queries from the
`config/seed_topics_ccipt.yaml` topics on its own. This script materializes
the cross-product (provinces × sectors) for two cases where deterministic
seeding beats LLM expansion:

    1. Reproducibility — same seed list every run, useful for diff testing.
    2. Cold-start — when the knowledge store is empty and we want a wide
       initial sweep without burning LLM cycles on expansion.

Usage:

    python backend/tools/expand_ccipt_seeds.py                 # print to stdout
    python backend/tools/expand_ccipt_seeds.py --as-yaml-seeds # agentic_seeds.yaml shape
    python backend/tools/expand_ccipt_seeds.py --provinces 5   # cap to top-N provinces
    python backend/tools/expand_ccipt_seeds.py --out FILE.yaml # write to file

Output cross-product is ~248 queries by default (31 provinces × 8 sectors),
each emitted both in romanized and Hanzi form (so it gets ~496 query
variants — one per script).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 31 provincial-level administrative divisions of mainland China.
# (省 + 直辖市 + 自治区) Order is roughly population-weighted so --provinces N
# picks the densest manufacturing hubs first.
PROVINCES_HANZI: list[str] = [
    "广东", "江苏", "山东", "浙江", "河南", "四川", "河北",
    "湖南", "湖北", "福建", "安徽", "辽宁", "陕西", "江西",
    "重庆", "云南", "山西", "贵州", "广西", "上海", "北京",
    "天津", "黑龙江", "吉林", "甘肃", "内蒙古", "新疆", "西藏",
    "宁夏", "青海", "海南",
]

PROVINCES_PINYIN: list[str] = [
    "Guangdong", "Jiangsu", "Shandong", "Zhejiang", "Henan", "Sichuan",
    "Hebei", "Hunan", "Hubei", "Fujian", "Anhui", "Liaoning", "Shaanxi",
    "Jiangxi", "Chongqing", "Yunnan", "Shanxi", "Guizhou", "Guangxi",
    "Shanghai", "Beijing", "Tianjin", "Heilongjiang", "Jilin", "Gansu",
    "Inner Mongolia", "Xinjiang", "Tibet", "Ningxia", "Qinghai", "Hainan",
]

# Sectors that intersect the security/defense crawler scope. Each is a
# (hanzi, english) pair so the expander emits both scripts.
SECTORS: list[tuple[str, str]] = [
    ("公共安全", "public security"),
    ("警用装备", "police equipment"),
    ("安防", "security surveillance"),
    ("电子信息", "electronics & information"),
    ("机械", "machinery"),
    ("航空航天", "aerospace"),
    ("防务", "defense"),
    ("反恐", "counter-terrorism equipment"),
]

# Phrasing templates. {prov} = province token, {sector} = sector token.
HANZI_TEMPLATES: list[str] = [
    "CCPIT {prov} {sector} 会员单位",
    "中国贸促会 {prov} {sector} 厂商",
    "{prov} {sector} 出口 制造商 名录",
    "{prov} {sector} 公众号 推荐",
]

PINYIN_TEMPLATES: list[str] = [
    "CCPIT {prov} {sector} member directory",
    "{prov} {sector} manufacturers China export",
    "CCPIT sub-council {prov} {sector} 2026",
]


def expand(provinces_cap: int | None = None) -> list[dict]:
    """Return list of {query, prov_hanzi, prov_pinyin, sector_hanzi, sector_en, script}."""
    out: list[dict] = []
    pairs = list(zip(PROVINCES_HANZI, PROVINCES_PINYIN, strict=True))
    if provinces_cap is not None:
        pairs = pairs[:provinces_cap]
    for prov_hanzi, prov_pinyin in pairs:
        for sector_hanzi, sector_en in SECTORS:
            for tpl in HANZI_TEMPLATES:
                out.append({
                    "query": tpl.format(prov=prov_hanzi, sector=sector_hanzi),
                    "prov_hanzi": prov_hanzi,
                    "prov_pinyin": prov_pinyin,
                    "sector_hanzi": sector_hanzi,
                    "sector_en": sector_en,
                    "script": "hanzi",
                })
            for tpl in PINYIN_TEMPLATES:
                out.append({
                    "query": tpl.format(prov=prov_pinyin, sector=sector_en),
                    "prov_hanzi": prov_hanzi,
                    "prov_pinyin": prov_pinyin,
                    "sector_hanzi": sector_hanzi,
                    "sector_en": sector_en,
                    "script": "pinyin",
                })
    return out


def emit_plain(queries: list[dict]) -> str:
    return "\n".join(q["query"] for q in queries) + "\n"


def emit_yaml_seeds(queries: list[dict]) -> str:
    """Render in `config/agentic_seeds.yaml` discovery-seed shape so the
    operator can paste a chunk in directly. Each line becomes a `name`
    + `task` seed with `tags=[ccpit, discovery, china_deep]`.
    """
    lines: list[str] = ["seeds:\n"]
    for i, q in enumerate(queries):
        slug = (
            f"ccpit-{q['prov_pinyin'].lower().replace(' ', '-')}-"
            f"{q['sector_en'].split()[0].lower()}-{q['script']}-{i:03d}"
        )
        lines.append(f'  - name: "{slug}"\n')
        # No anchor URL — discovery search seed, not a direct expo URL.
        lines.append(f'    url: ""\n')
        lines.append(
            f'    task: "Discover Chinese vendors via the CCPIT '
            f'{q["prov_pinyin"]} chamber, sector \\"{q["sector_en"]}\\". '
            f'Run a deep-China search with the query: {q["query"]!r}."\n'
        )
        lines.append(
            '    tags: ["ccpit", "discovery", "china_deep", '
            f'"sector:{q["sector_en"].split()[0].lower()}", '
            f'"province:{q["prov_pinyin"].lower().replace(" ", "-")}"]\n'
        )
        lines.append(f'    source_query: {q["query"]!r}\n')
    return "".join(lines)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--provinces", type=int, default=None,
        help="Cap to top-N provinces (default: all 31)",
    )
    p.add_argument(
        "--as-yaml-seeds", action="store_true",
        help="Emit in agentic_seeds.yaml shape instead of plain queries",
    )
    p.add_argument(
        "--out", type=Path, default=None,
        help="Write to file instead of stdout",
    )
    args = p.parse_args()

    queries = expand(provinces_cap=args.provinces)
    text = (
        emit_yaml_seeds(queries) if args.as_yaml_seeds else emit_plain(queries)
    )

    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(
            f"wrote {len(queries)} queries to {args.out}",
            file=sys.stderr,
        )
    else:
        # Windows consoles default to cp1252 and choke on Hanzi. Reconfigure
        # stdout to UTF-8 if possible; otherwise write raw bytes through the
        # underlying buffer.
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
            sys.stdout.write(text)
        except (AttributeError, ValueError):
            sys.stdout.buffer.write(text.encode("utf-8"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
