# Product

## Register

product

## Users

Hybrid audience inside one operator app (`frontend/`).

**Primary**: operator/analyst di intersection defense + commercial intelligence yang memantau crawler run dan vendor enrichment dalam sesi panjang (8 sampai 12 jam). Konteks: di depan monitor besar di kantor, sering glance ke status feed, butuh density tinggi tanpa lelah mata. Mood: fokus, kalibrasi, tidak terganggu.

**Secondary**: executive/stakeholder yang occasionally cek Atlas overview untuk reporting atau briefing. Konteks: sesi pendek (5 sampai 15 menit), butuh summary visual yang dimengerti tanpa context internal.

Kedua audience berbagi surface yang sama; tidak ada marketing/landing terpisah. Primary register = product. Brand surface bisa ditambahkan nanti sebagai task terpisah dengan register brand.

## Product Purpose

Autocrawl adalah self-hosted 24/7 crawler yang menemukan expo security/defense, mengekstrak daftar exhibitor dari aggregator (10times, Wikipedia, dan sebagainya), meresolusi domain vendor asli, dan memperkaya tiap vendor dari sumber publik gratis. Frontend ini adalah operator console untuk mengontrol dan memantau pipeline tersebut: status crawler real time, daftar expo dan vendor, peta geografis (Atlas), workspace fusion AI (Labs), agentic orchestrator, monitor live, dan konfigurasi scope.

Success looks like: operator bisa glance Topbar untuk tahu kondisi pipeline dalam dua detik, drill ke detail vendor dalam tiga klik, dan menulis draft email outreach tanpa keluar dari app. Executive bisa buka Atlas dan mengerti "apa yang sedang ditemukan" dalam tiga puluh detik tanpa training.

## Brand Personality

Three words: **Refined, Precise, Confident.**

- **Refined**: setiap detail dipertimbangkan. Tipografi deliberate, rhythm spasi intentional, motion terkontrol. Tidak ada elemen dekoratif tanpa fungsi.
- **Precise**: numerics tabular dengan slashed zero, label uppercase tracked untuk hierarchy, alignment ketat. Operator bisa membedakan 0.087 dari 0.807 tanpa berhenti.
- **Confident**: satu accent yang langka (≤10% dari any given screen) tapi tegas. Border statement 1 piksel tanpa stripe colored aksen. Tidak ada gratuitous animation. Tool tidak meminta perhatian, tool melayani perhatian.

Quality benchmark: Linear, Stripe, Raycast untuk craft level dan refinement. Bukan untuk look-and-feel.

## Anti-references

Eksplisit dihindari:

- **Notion/Linear yang terlalu bland**. Generic neutral pure (`#000` / `#fff`), Inter tanpa karakter, predictable card grid icon-heading-text, no personality. Autocrawl harus punya distinctive paper editorial character, bukan SaaS generic neutral.
- **Material Design tipikal**. Roboto, blue-primary, FAB, ripple, shadow elevation lima level. Android default look. Bukan Autocrawl.
- **SaaS landing gradient ungu ke pink**. Generic AI tool marketing aesthetic. Purple gradient header, glassmorphic card, glow text.
- **Dashboard cyberpunk/HUD neon**. Cyan/magenta glow, scanline overlay, monospace dominan, dark navy dengan bracket UI dekoratif. Legacy aesthetic yang masih ada residu di beberapa komponen dan harus dibersihkan.

Operasional anti-patterns (dari Impeccable absolute bans, lebih konkret):

- Side-stripe borders (`border-left` atau `border-right` >1 piksel sebagai colored aksen pada card, list, callout, alert)
- Gradient text via `background-clip: text`
- Glassmorphism sebagai default (`backdrop-filter: blur(...)` dekoratif)
- Hero-metric template (big number, small label, supporting stats, gradient accent)
- Identical card grids (same-sized icon + heading + text, repeated endlessly)
- Modal as first thought (selalu pertimbangkan inline/progressive alternative dulu)
- `#000` atau `#fff` tanpa tint ke brand hue
- Em-dash, en-dash, semicolon di copy user-facing dan dokumen ops

## Design Principles

1. **Density that doesn't burn**. Operator melihat banyak data 8 sampai 12 jam; tipografi tabular, line-height ample, contrast cukup tapi tidak harsh. Refined density mengalahkan spacious bland.
2. **One voice, one accent**. Vermilion (paper) atau amber (dark) hadir ≤10% dari any given screen. Kelangkaannya adalah artinya. Tidak ada full saturation di state inactive.
3. **Show provenance, hide chrome**. Setiap angka boleh diklik untuk sumber. Border, background, dekorasi tidak menutupi data. Tool disappear ke dalam task.
4. **Editorial over operator-cyber**. Anchor visual identity adalah dossier intelligence print, bukan SRE incident dashboard. Paper cream + ink deep + vermilion accent untuk light, warm navy + warm cream + amber accent untuk dark.
5. **Motion conveys state, never decoration**. 150 sampai 250 milidetik ease-out-quart untuk transition state. Tidak ada page-load choreography, tidak ada decorative pulse, tidak ada parallax. Reduce-motion fully respected.

## Accessibility & Inclusion

- **WCAG AA** sebagai floor. Contrast 4.5:1 untuk body text, 3:1 untuk komponen UI non-text dan border. Verify di kedua tema (paper light dan ink-dark).
- **prefers-reduced-motion**: hormati. Matikan `pulse-amber`, `blink`, ticker-scroll, dan segala animasi non-essential ketika di-set. Transition state (hover, focus) tetap, tapi tanpa exaggerated easing.
- **Color blindness**: status (ok/warn/crit) tidak boleh diandalkan warna saja. Pair dengan ikon atau label text.
- **Keyboard navigation**: focus-visible ring jelas (2 piksel amber outer ring sudah ada di `tokens.css`), traversal logis di modal dan dropdown.
- Mendukung operator 8 sampai 12 jam: contrast cukup di kedua tema untuk monitor besar di lighting kantor variabel.
