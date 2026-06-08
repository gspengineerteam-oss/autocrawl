# Overnight Run Report — 2026-05-07 → 2026-05-08

## Ringkasan

Twin agentic crawler (`agentic-a` + `agentic-b`) jalan dari sore 2026-05-07 sampai pagi 2026-05-08. Hasil akhir di Postgres: **929 vendor** — sekitar 12× dari estimasi awal (40-80) yang dipasang sebelum optimasi seri Phase 3.

| Metrik | Nilai |
|---|---:|
| Total vendor di DB | 929 |
| Vendor terenrich (kontak/alamat lengkap) | 104 |
| Vendor di-reject scope classifier | 398 |
| Vendor unresolved (fallback persist) | 427 |
| Vendor sudah diterjemahkan ID | 497 (≈53%) |
| Vendor dengan structured contacts | 233 |
| Lesson sukses listing / gagal listing | 8 / 395 |
| Lesson sukses enrich / gagal enrich | 51 / 289 |

Throughput puncak terjadi 17:00–21:00 (~150 vendor/jam). Setelah ~00:54 WIB scheduler berhenti memicu pass baru — twin masih hidup tapi nggak nge-crawl, jadi ~5 jam terakhir kosong.

## Yang Berjalan Lancar

- **Persistent profile slots** (`browser-use-user-data-dir-listing-N` magic prefix) berhasil bypass `_copy_profile()` Browser-Use, jadi cookie + history Chromium kebawa antar run. VNC kelihatan "hidup" dengan 4 chromium per workspace.
- **Mistral key-value parser fallback** nyelametin banyak data — Mistral sering ngeluarin prose ("Vendor information for X has been gathered: Email: ...") bukan JSON. Parser fallback mapping Key:value langsung ke `VendorProfile`.
- **Auto EN→ID translator** via Mistral (reuse vision LLM yang udah loaded, no extra model) ngehasilin 53% coverage description/tagline/products dalam Bahasa Indonesia tanpa API call ke layanan eksternal.
- **Fallback unresolved persist** — saat enrich agent gagal (parse_failed / bail_reason / vendor=None), data dari listing pool tetap disimpan via `persist_unresolved_vendor`. Inilah kenapa angka unresolved (427) cukup besar tapi datanya nggak hilang.
- **Sharding twin** (shard 0/2 untuk agentic-a, 1/2 untuk agentic-b) bekerja — nggak ada overlap seed antara dua container.
- **Boot auto-reset** clean stale lock + LLM counter setiap restart, jadi recovery tinggal `docker compose restart`.

## Bottleneck yang Dihadapi Semalam

### 1. APScheduler berhenti firing setelah ~9 jam (PENYEBAB UTAMA berhenti)
Sekitar 00:54 WIB scheduler nggak lagi memicu pass baru, padahal proses Python masih hidup, Redis masih responsive. Twin idle sampai pagi. **Mitigasi**: cron 4-jam restart `docker compose restart agentic-a agentic-b` perlu di-setup. Belum dilakukan.

### 2. Browser-Use 0.12.6 CDP cascade ("Frame with the given frameId is not found")
Setelah sustained run, Chromium DOMWatchdog kadang return `BrowserStateRequestEvent` kosong `{}`, lalu agent kena `Stopping due to 5 consecutive failures`. Bug upstream Browser-Use, bukan kode kita. Sebagian gagal di-recovery oleh fallback persist; yang lain nyangkut sampai timeout (600s).

### 3. Ollama GPU thrashing
Awalnya ada 4 model loaded paralel (`qwen3.6:27b`, `gpt-oss:20b`, `qwen3-vl:30b`, `proposal-dev`). Setiap LLM call jadi lambat karena swap antar model. **Mitigasi yang dilakukan**: unload model non-esensial dengan `keep_alive:0`, stop base crawler sementara. Mistral di-pin `keep_alive=-1` setelah restart pagi.

### 4. Mistral output prose, bukan JSON
Bahkan dengan prompt eksplisit "respond in JSON only", Mistral 24B sering balas paragraf ("Based on the website, here is what I found..."). **Mitigasi**: tambah `_extract_keyvalue()` di `enrich_agent.py` sebagai fallback parser sebelum nge-throw parse_failed. Kalau di-skip, semua "parse_failed" branch akan return tanpa fallback persist (bug yang ketangkep sebelum subuh).

### 5. Browser-Use timeout default kecil
Default `llm_timeout=75s` dan `step_timeout=180s` Browser-Use bikin cascade `LLM call timed out`. Bumped ke `llm_timeout=600`, `step_timeout=720`. Plus `max_clickable_elements_length` dari 40000 → 8000 buat ngurangi context bloat.

### 6. Listing → Enrich rasio gagal masih tinggi
Enrich lessons: 51 sukses : 289 gagal (15% success rate). Mayoritas failure category = `formality` (vendor punya landing page generik tanpa kontak nyata) dan `403/captcha` (Alibaba, MIC). **Belum dimitigasi**: butuh few-shot exemplars yang lebih kaya + better domain heuristic di `search_vendor`.

### 7. Kontak/Alamat di raw_extracts tapi nggak masuk structured field
Awal sore frontend Kontak tab kosong padahal `raw_extracts.agentic_email` ada. Fixed dengan mapping ke `ContactPoint` + `Address` di `_parse_enrich_output`, plus SQL backfill `backend/scripts/backfill_agentic_contacts.sql`. Setelah fix, 233 vendor punya structured contacts.

### 8. Labs Fusion gating email
Frontend `canCombine` cek `missingEmail.length === 0` dan backend juga raise HTTP 400 kalau ada vendor tanpa email. User minta dihapus karena agentic-enriched vendor sering nggak punya `verified=true` flag eksplisit. Both gate dihapus.

## Status Saat Ini (08:30 WIB 2026-05-08)

- Twin sudah di-restart pagi ini, scheduler aktif lagi.
- Mistral pinned dengan `keep_alive=-1`.
- 4 vendor DIMDEX unresolved (Pavo, KUANTek, MAKINA, LOYD) re-enqueued untuk retry.
- Boot auto-reset bersihin stale state.

## Rekomendasi Lanjutan

1. **Setup cron 4-jam restart** untuk twin — ini paling urgent, karena tanpa ini setiap run >9 jam akan idle.
2. **Tambah few-shot enrich exemplars** dari 51 success lesson terbaru, biar Mistral lebih konsisten ngeluarin JSON.
3. **Heuristic domain picker** di `search_vendor`: deprioritize Alibaba/MIC/LinkedIn lebih agresif, prefer single-token match.
4. **Pertimbangkan upgrade Browser-Use** kalau 0.13.x sudah fix CDP frame bug.
5. **Backfill ulang** `backfill_agentic_contacts.sql` untuk 427 unresolved vendor — sebagian mungkin punya raw_extracts yang bisa diangkat ke structured.
