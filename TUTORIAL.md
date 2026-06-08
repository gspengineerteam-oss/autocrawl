# Tutorial AutoCrawl

Panduan langkah demi langkah untuk menjalankan AutoCrawl sendiri dari nol. Tidak perlu pengetahuan dalam tentang Python atau Vue. Yang dibutuhkan hanyalah Docker yang sudah terpasang dan terminal yang bisa menjalankan perintah dasar.

Semua perintah di tutorial ini sudah ditest pada Windows 11 dengan Docker Desktop dan WSL2 backend, juga pada Linux Ubuntu 22.04. Untuk Mac, perintah identik dengan Linux.

---

## 1. Pengantar Singkat

AutoCrawl adalah crawler otonom yang berjalan 24 jam non stop untuk dua tujuan utama. Pertama, ia mencari pameran (expo) di bidang security dan defense industry dari berbagai sumber agregator (10times, Wikipedia, Eventbrite). Kedua, dari setiap expo yang ditemukan, ia mengekstrak daftar peserta (vendor) lalu memperkaya datanya dengan informasi seperti website resmi, deskripsi perusahaan, kontak email, lokasi, sosial media, dan teknologi yang dipakai.

Hasil akhirnya disimpan dalam Postgres dan tersedia di dashboard web untuk dilihat, dicari, dan diekspor. Data text vendor (deskripsi, tagline, produk, industri) otomatis diterjemahkan ke Bahasa Indonesia menggunakan model NLLB-200 dari Meta. Versi English aslinya tetap disimpan jadi bisa di toggle bolak balik di dashboard.

Stack teknologi.

- Backend Python 3.11 dengan FastAPI dan LangGraph untuk pipeline orchestration
- Postgres 16 untuk storage utama, ChromaDB untuk vector deduplication, Redis untuk queue dan rate limiting
- Frontend Vue 3 dengan ECharts dan world map 2.5D interaktif (MapLibre GL plus @antv/l7)
- LLM lokal default lewat **Ollama** dengan model **IBM Granite 4.1** (Apache-2.0, gratis, fully offline). OpenAI cuma escape hatch opsional kalau Ollama terlalu lambat
- Search lokal lewat **OpenSERP** multi engine (Google, Bing, Yandex, Baidu via headless Chromium self hosted)
- Translasi NLLB-200 distilled 600M via CTranslate2 (jalan di CPU, sekitar 1.2 GB int8)
- Semua di dockerize, satu perintah `docker compose up -d --build` cukup

---

## 2. Persyaratan Sistem

Yang harus ada di mesin Anda sebelum mulai.

| Item | Minimum | Direkomendasikan |
|---|---|---|
| RAM | 12 GB | 24 GB |
| Disk kosong | 30 GB | 60 GB |
| CPU | 6 core | 8 core plus |
| GPU NVIDIA | tidak wajib | 8 GB plus VRAM (untuk speedup Ollama) |
| Docker Desktop | 4.30 atau lebih baru | terbaru |
| Koneksi internet | wajib saat first build (download model) | stabil |
| OS | Windows 10/11, macOS 12 plus, atau Linux | apa saja yang support Docker |

RAM lebih besar dibanding versi lama karena sekarang stack include container Ollama (model granite4.1:3b dan granite-embedding:278m sama sama resident di memory) plus OpenSERP yang punya headless Chromium sendiri.

Yang harus dipersiapkan sebelum lanjut.

1. Docker Desktop terpasang dan running. Cek dengan `docker --version` dan `docker compose version`. Kalau dua duanya jalan, oke.
2. (Opsional) API Key OpenAI dari https://platform.openai.com/api-keys, kalau mau pakai cloud LLM sebagai escape hatch. Default stack pakai Ollama lokal, jadi key ini boleh kosong.
3. (Opsional) API Key Firecrawl dari https://www.firecrawl.dev. Default `ENABLE_FIRECRAWL=false`, jadi boleh kosong juga. Crawler default pakai Crawl4AI yang gratis.

Tidak perlu install Ollama di host. Container `ollama` di compose otomatis pull model granite4.1:3b dan granite-embedding:278m saat first boot.

---

## 3. Boot Pertama Kali

Lakukan urutan ini sekali saja saat pertama kali setup.

```bash
# Clone repo (atau extract dari zip kalau dapat versi snapshot)
git clone <REPO_URL> autocrawl
cd autocrawl

# Salin template env, default udah cukup untuk full lokal
cp .env.example .env
```

Default `.env` sudah pakai Ollama lokal jadi boleh tidak diisi apa apa untuk first boot. Kalau mau switch ke OpenAI cloud nanti, edit:

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
```

Variabel lain biarkan sesuai default. Bisa diubah kemudian kalau ada keperluan khusus (lihat bagian "Switch LLM Provider" dan "Aktifkan Translation").

Build dan start semua service dalam satu perintah.

```bash
docker compose up -d --build
```

Build pertama kali sekitar **8 sampai 15 menit** untuk image backend + frontend (playwright chromium, deps Python, plus npm install + vite build). OCR sekarang dilayani Ollama vision model (`gemma4:e4b`) jadi gak ada PyTorch / Surya weight 3 GB lagi di image — build jauh lebih cepat. Build berikutnya cuma 30-60 detik kalau cuma edit code (cache mount BuildKit + layer order yang dep-install sebelum COPY src).

NLLB-200 (~1.34 GB) **tidak lagi di-bake ke image** sejak migrasi May 2026 — sebelumnya re-download tiap rebuild yang bikin build 79+ menit. Sekarang download sekali ke host lewat one-shot service:

```bash
docker compose --profile setup run --rm nllb-setup
```

Ini download facebook/nllb-200-distilled-600M dari Hugging Face, konversi ke int8 CTranslate2 di folder `./nllb_models/nllb_ct2/` di host (~600 MB final). Subsequent rebuild image, prune cache, atau bahkan reinstall Docker Desktop **gak akan re-download** — file di host persist. Folder `nllb_models/` udah masuk `.gitignore`.

Pas runtime, container `crawler` dan `api` baca model dari host folder via volume mount `./nllb_models/nllb_ct2:/opt/nllb_ct2:ro`. Path env `NLLB_MODEL_PATH=/opt/nllb_ct2` di compose udah pointing ke sana.

Untuk download lebih cepat (gak kena anonymous rate limit HF), set token gratis dari https://huggingface.co/settings/tokens:

```bash
HF_TOKEN=hf_xxx docker compose --profile setup run --rm nllb-setup
```

Pantau progress download model granite di container ollama.

```bash
docker compose logs -f ollama
```

Yang lo cari di output, baris `[ollama-init] pulling granite4.1:3b` lalu `[ollama-init] bootstrap complete`. Tunggu sampai status container `ollama` jadi `healthy` (sekitar 5 sampai 8 menit pertama kali).

Kalau gak butuh translation Bahasa Indonesia (vendor data tetap English saja), skip step `nllb-setup` dan set di `.env`:

```
TRANSLATION_ENABLED=false
```

Atau kalau prefer model di-bake ke image (legacy mode untuk deployment air-gapped tanpa host volume), build dengan flag:

```bash
docker compose build --build-arg INSTALL_NLLB=true crawler
```
Kalau dipilih ini, hapus baris volume mount `./nllb_models/nllb_ct2:/opt/nllb_ct2:ro` di compose biar gak shadow model yang baked di image.

---

## 4. Verifikasi Stack Hidup

Cek semua container running.

```bash
docker compose ps
```

Yang harus terlihat status `running` atau `healthy` (kolom STATUS).

```
autocrawl-crawler        running
autocrawl-api            healthy
autocrawl-db             healthy
autocrawl-frontend       running
autocrawl-redis          healthy
autocrawl-chroma         running
autocrawl-flaresolverr   running
autocrawl-ollama         healthy
autocrawl-openserp       healthy
autocrawl-langfuse       running
autocrawl-prometheus     running
autocrawl-grafana        running
```

Verifikasi tambahan untuk dua container baru.

```bash
# Pastikan dua model granite udah ke pull
docker compose exec ollama ollama list
# Output yang diharapkan:
# granite4.1:3b              2.1 GB
# granite-embedding:278m     950 MB

# Pastikan OpenSERP listening
curl http://localhost:7000/health
# atau di PowerShell: Invoke-WebRequest http://localhost:7000/health
```

Akses dashboard web di browser.

| URL | Untuk apa |
|---|---|
| http://localhost:8090 | Dashboard utama AutoCrawl |
| http://localhost:8081/api/health | API health check JSON |
| http://localhost:8081/api/docs | Swagger UI auto generated |
| http://localhost:11434 | Ollama daemon (cuma `/api/tags` yang public) |
| http://localhost:7000 | OpenSERP, cek `/health` |
| http://localhost:3001 | Langfuse (LLM tracing, login pertama buat akun saja) |
| http://localhost:3000 | Grafana (metrics dashboard, login admin admin) |
| http://localhost:9090 | Prometheus raw metrics |

Kalau dashboard di port 8090 tampil tapi data kosong, itu wajar karena belum ada run yang dijalankan. Lanjut ke bagian berikutnya.

---

## 5. Run Pertama

Ada dua cara memicu run pertama.

### Cara A. Lewat dashboard

Buka http://localhost:8090. Di pojok kanan atas ada tombol kuning **ENGAGE** dengan dropdown chevron untuk pilih mode (dev, normal, agresif). Klik untuk pilih mode lalu konfirmasi. Tombol berubah jadi **BERJALAN** dengan badge kuning **OPS RUNNING** di sampingnya. Pipeline akan jalan di background selama 5 sampai 15 menit (tergantung mode dan kecepatan Ollama).

Kalau lo mau stop di tengah run.

- Klik tombol merah **STOP** di topbar untuk graceful drain. Worker akan selesaikan iterasi yang sedang jalan, lalu break. Selesai sekitar 30 sampai 60 detik.
- Shift plus klik tombol **STOP** untuk munculkan modal STOP PAKSA. Klik konfirm. Subprocess di kill langsung, selesai sekitar 5 detik. Token in flight kebakar tapi state di reset bersih.

### Cara B. Lewat CLI di dalam container

```bash
docker compose exec api crawl run --mode dev
```

Mode `dev` artinya hanya 1 atau 2 expo yang diproses, cocok untuk smoke test pertama. Mode lain.

| Mode | Expo per run | Waktu (Ollama lokal) | Waktu (OpenAI cloud) | Cost LLM |
|---|---|---|---|---|
| dev | 1 atau 2 | 8 sampai 20 menit | 3 sampai 8 menit | 0 USD lokal, 0.05 USD cloud |
| normal | 5 sampai 10 | 30 sampai 90 menit | 10 sampai 20 menit | 0 USD lokal, 0.30 USD cloud |
| aggressive | 15 sampai 25 | 1 sampai 3 jam | 25 sampai 50 menit | 0 USD lokal, 1.20 USD cloud |

Catatan, waktu Ollama tergantung kecepatan GPU. CPU only sangat lambat (5 sampai 15 token per detik), RTX 3060 atau 4070 sekitar 60 sampai 100 token per detik.

Untuk run berkala otomatis (tiap 30 menit), container `crawler` sudah menjalankan scheduler bawaan. Cek log untuk konfirmasi.

```bash
docker compose logs -f crawler
```

Cari baris yang mengandung `scheduler.started` atau `pipeline.run_complete`.

---

## 6. Membaca Hasil

Setelah run selesai, refresh dashboard. Halaman **Pusat Komando** akan menampilkan beberapa elemen.

**World map 2.5D di paling atas.** Setiap negara yang ada expo nya muncul cylinder bar dengan warna berdasar jumlah vendor (cyan untuk 1 sampai 4, hijau untuk 5 sampai 19, kuning untuk 20 sampai 49, oranye untuk 50 sampai 99, merah magenta untuk hub top 3). Drag untuk pan, scroll untuk zoom, klik kanan plus drag untuk tilt 3D, hover cylinder untuk tooltip, klik kiri untuk side panel detail. Polling 5 detik jadi cylinder baru muncul otomatis tanpa refresh.

**KPI tile.**

- VND total vendor unik
- EXP total expo unik
- PDF jumlah brosur PDF terindeks
- TRL persentase yang udah diterjemahkan ke Bahasa Indonesia
- PH2 progress menuju ambang 100 vendor untuk unlock Phase 2
- OPS jumlah operasi run

**Chart.** Akuisisi vendor per hari, distribusi industri, sumber data, top negara, mode operasi, gauge phase 2.

Klik tab "Vendor" di sidebar untuk daftar lengkap. Klik salah satu baris untuk halaman detail. Di halaman detail.

- Header card berisi nama, domain, logo, deskripsi, tagline, industri, dan produk. Kalau vendor sudah diterjemahkan, tampil badge `ID` dan tombol `Lihat English` untuk swap ke teks asli.
- Card "Source Trail" menampilkan timeline dari mana data berasal (aggregator URL, PDF brosur, search resolution).
- Card sebelah kanan berisi kontak email/phone (lengkap dengan skor verifikasi), alamat, sosial media, info domain (registrar, umur, wayback), tech stack, dan daftar expo dimana vendor ini terlihat.

Akses raw data lewat API. Contoh ambil 10 vendor pertama.

```bash
curl http://localhost:8081/api/vendors?limit=10 | jq
```

Atau ambil satu vendor spesifik.

```bash
curl http://localhost:8081/api/vendors/airbus.com | jq
```

---

## 7. Migrasi Data Lama

Kalau Anda mengambil snapshot project ini dengan folder `data/reports/` sudah berisi JSON hasil run terdahulu, jalankan migrasi sekali untuk import ke Postgres.

```bash
docker compose exec api crawl db migrate
docker compose exec api crawl db import-json
```

Output akan menampilkan tabel ringkasan vendor, expo, dan run yang berhasil di import. Kalau ada baris error, cek detail nya di output. Biasanya kasusnya ada JSON lama yang formatnya beda (misal `source_trail` sebagai string biasa di versi awal). Importer otomatis migrate ke format baru.

Setelah import sukses, refresh dashboard. Data akan muncul.

---

## 8. Switch LLM Provider

Default provider adalah Ollama lokal dengan IBM Granite 4.1 (gratis, fully offline). Konfigurasi default di `docker-compose.yml`.

```
LLM_PROVIDER=ollama
LLM_BASE_URL=http://ollama:11434
EMBEDDING_PROVIDER=ollama
EMBEDDING_BASE_URL=http://ollama:11434
OPENAI_MODEL_HEAVY=granite4.1:3b
OPENAI_MODEL_LIGHT=granite4.1:3b
OPENAI_EMBEDDING_MODEL=granite-embedding:278m
```

Container `ollama` di compose otomatis pull dua model saat first boot lewat script `backend/ops/ollama_init.sh`. Tidak perlu install Ollama di host.

Cek model setelah container healthy.

```bash
docker compose exec ollama ollama list
```

Output yang diharapkan, `granite4.1:3b` (sekitar 2.1 GB) dan `granite-embedding:278m` (sekitar 950 MB).

### Switch ke OpenAI cloud (escape hatch)

Kalau Ollama lokal terlalu lambat di mesin lo dan punya OpenAI key, override env di `.env`.

```
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx
OPENAI_MODEL_HEAVY=gpt-4o
OPENAI_MODEL_LIGHT=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Restart container yang affected.

```bash
docker compose restart crawler api
```

Chroma vector store auto detect mismatch dimensi 1536 dan 768. Saat embedding provider switch, koleksi vendor lama otomatis di wipe dan dibangun ulang. Tidak perlu intervensi manual.

### Tuning kecepatan Ollama

Default OLLAMA_NUM_PARALLEL=2 dan OLLAMA_KEEP_ALIVE=-1 udah set di compose. Concurrency crawler otomatis di throttle ke 2 untuk discovery dan 8 untuk enrichment via `for_provider("ollama")` di `config.py`.

Kalau lo punya GPU NVIDIA, edit `docker-compose.yml` di service `ollama`, uncomment block `deploy.resources.reservations.devices`. Pastikan `nvidia-container-toolkit` udah terinstall di host. Throughput naik 5 sampai 10x.

### Reliability structured output

Granite 3B kadang miss field optional di Pydantic schema saat enrichment 30 ribu token plus. Wrapper `chat()` punya retry loop 3 attempt dengan `with_structured_output(method="json_schema")` yang constrain decoding lewat JSON schema. Failure case di log dengan event `llm.structured_validation_retry`. Aman untuk operasional normal.

---

## 9. Aktifkan Translation Bahasa Indonesia

Translation otomatis aktif kalau Anda build dengan default `INSTALL_NLLB=true`. Cek model nya sudah di download di lokasi `/opt/nllb_ct2` (bukan `/app/data/nllb_ct2` versi lama, karena bind mount akan menutupi file di build time).

```bash
docker compose exec crawler ls -lh /opt/nllb_ct2
```

Yang harus terlihat, file `model.bin` ukuran sekitar 600 sampai 700 MB plus beberapa file tokenizer.

Kalau folder kosong, build ulang dengan flag.

```bash
docker compose build --build-arg INSTALL_NLLB=true crawler
docker compose up -d crawler api
```

Untuk run translation pada vendor yang sudah ada di DB (backfill).

```bash
docker compose exec api crawl translate-vendors
```

Output akan menampilkan progress per vendor dengan tanda centang hijau atau silang merah. Akhir nya tabel ringkasan.

```
Translation results
   Metric        Count
   translated      44
   skipped          0
   failed           0
```

Vendor baru yang diproses setelah ini otomatis ikut diterjemahkan saat enrichment selesai. Jadi cukup sekali jalan backfill untuk data lama.

Verifikasi di dashboard: buka detail satu vendor, deskripsi nya sudah dalam Bahasa Indonesia, dan tombol kecil `Lihat English` aktif untuk balik ke versi asli.

Untuk matikan translation (misal mau simpan English saja), edit `.env`.

```
TRANSLATION_ENABLED=false
```

Lalu restart api dan crawler.

---

## 10. Tambah Scraper Custom

Setiap aggregator punya struktur HTML berbeda. Untuk menambah dukungan aggregator baru, buat file di `backend/src/crawler/tools/scrapers/<nama>.py`. Contoh skeleton.

```python
from __future__ import annotations
from urllib.parse import urljoin
from ...schemas import ExhibitorRef, SourceProvenance
from ..browsers.fetcher import fetch
from ..parsers.html_parser import parse
from ..proxies.rate_limit import acquire as rl_acquire

AGGREGATOR_DOMAIN = "namaaggregator.com"


def matches(url: str) -> bool:
    return AGGREGATOR_DOMAIN in url


async def list_exhibitors(expo_url: str, expo_id: str) -> list[ExhibitorRef]:
    await rl_acquire(expo_url)
    page = await fetch(expo_url, force_render=True)
    if not page.get("html"):
        return []

    tree = parse(page["html"])
    out: list[ExhibitorRef] = []
    for a in tree.css("a.exhibitor-link"):
        href = a.attributes.get("href") or ""
        absolute = href if href.startswith("http") else urljoin(page["url"], href)
        out.append(ExhibitorRef(
            expo_id=expo_id,
            name=a.text(strip=True)[:200],
            raw_url=absolute,
            aggregator_domain=AGGREGATOR_DOMAIN,
            provenance=[SourceProvenance(
                type="aggregator",
                url=absolute,
                extraction_method="custom_html",
            )],
        ))
    return out
```

Daftarkan di `backend/src/crawler/tools/scrapers/registry.py`.

```python
from . import generic, tentimes, wikipedia, namaaggregator

_REGISTRY = {
    "10times.com": tentimes,
    "wikipedia.org": wikipedia,
    "namaaggregator.com": namaaggregator,
}
```

Rebuild image agar code tersimpan.

```bash
docker compose build crawler api
docker compose up -d crawler api
```

Test cepat tanpa run penuh.

```bash
docker compose exec api python -c "
import asyncio
from crawler.tools.scrapers.namaaggregator import list_exhibitors
print(asyncio.run(list_exhibitors('https://namaaggregator.com/expo/foo', 'foo-2026')))
"
```

---

## 11. Test PDF Brosur

Brosur PDF expo seringkali memuat daftar exhibitor lengkap dengan nomor booth. AutoCrawl bisa download dan ekstrak. Test pada satu URL PDF.

```bash
docker compose exec api crawl pdf-test https://example.com/expo-brochure.pdf --expo-id manual-test
```

Output tabel berisi nama vendor, halaman, posisi, dan metode ekstraksi (`pymupdf` untuk PDF text murni, `pdfplumber_table` untuk tabel terstruktur, `vlm_ocr` untuk PDF scan/image).

Kalau PDF Anda hanya hasil scan dan OCR diperlukan, pastikan `OCR_ENABLED=true` di `.env` dan vision model sudah ke-pull di Ollama (`docker compose exec ollama ollama pull gemma4:e4b`). Bisa swap ke model yang lebih kuat (`OCR_VLM_MODEL=gemma4:31b`) buat akurasi lebih tinggi, dengan trade-off latency.

---

## 12. Test Wikipedia

Untuk verify Wikipedia scraper bekerja, jalankan command khusus.

```bash
docker compose exec api crawl wiki-test https://en.wikipedia.org/wiki/2026_Bilderberg_Conference
```

Output tabel berisi nama organisasi, URL Wikipedia tujuan, metode ekstraksi (`wikipedia_link_company` atau `wikipedia_link_organisation`), dan skor confidence. Person diskip otomatis.

Vendor yang diidentifikasi lewat Wikipedia akan diresolusi domain aslinya saat full enrichment lewat search by name (karena Wikipedia bukan domain vendor langsung). Misal "AXA" hasil dari Wikipedia akan resolve ke `axa.com` lewat search engine.

---

## 13. Operations

### Restart container individual

```bash
docker compose restart crawler        # restart hanya scheduler
docker compose restart api            # restart hanya FastAPI
docker compose restart frontend       # restart hanya Vue dashboard
docker compose restart ollama         # restart Ollama daemon (model di reload dari disk)
docker compose restart openserp       # restart OpenSERP (jarang diperlukan)
```

### Cek model Ollama dan paksa pull ulang

```bash
docker compose exec ollama ollama list
docker compose exec ollama ollama pull granite4.1:3b           # idempotent
docker compose exec ollama ollama pull granite-embedding:278m
docker compose exec ollama ollama rm granite4.1:3b             # hapus (next boot auto pull lagi)
```

### Stop semua

```bash
docker compose down                   # stop, container terhapus, volume tetap
docker compose down -v                # stop, hapus juga semua volume (DESTRUCTIVE)
```

### Lihat log

```bash
docker compose logs -f crawler                   # follow log crawler
docker compose logs --tail 100 api               # 100 baris terakhir api
docker compose logs --since 1h crawler api       # 1 jam terakhir, dua container
```

### Backup data

Postgres data ada di volume `autocrawl_pgdata`. Snapshot manual.

```bash
docker compose exec autocrawl-db pg_dump -U postgres autocrawl > backup-$(date +%Y%m%d).sql
```

Restore.

```bash
cat backup-20260502.sql | docker compose exec -T autocrawl-db psql -U postgres autocrawl
```

JSON reports dan brosur PDF tersimpan di folder `./data` di host. Backup folder ini secara berkala kalau penting.

### Lihat queue Redis

```bash
docker compose exec redis redis-cli
> KEYS *
> LLEN urls:to_resolve
> exit
```

### Trigger run manual via curl

```bash
curl -X POST http://localhost:8081/api/runs/trigger -H "Content-Type: application/json" -d '{"mode":"normal"}'
```

---

## 13x. Reset State Sebelum Run Baru

Setiap run nyimpan state sementara di Redis (lock active_run, taskclaim, recent_queries) dan beberapa row Postgres yang status-nya mid-pipeline (`resolving`, `enriching`). Kalau container di-kill paksa, run sebelumnya freeze, atau lo cuma mau mulai dari clean slate, bersihin pakai satu command.

```bash
docker compose exec api crawl reset-state
```

Default-nya **aman dan idempotent**. Yang dihapus:

- Redis key `autocrawl:active_run` (lock yang nyegah trigger run baru kalau run lama gantung).
- Redis key `discovery:recent_queries` (dedup query antar-run, di-reset biar topik lama bisa di-query lagi).
- Semua Redis key `taskclaim:*` (claim per-domain enrichment).
- Postgres row di tabel `runs` yang `finished_at IS NULL` ditutup dengan `notes='manual_reset'`.
- Postgres row di tabel `exhibitor_refs` yang status-nya `resolving` atau `enriching` direset balik ke `extracted` (siap diretry run berikut).

Yang **tidak** dihapus (sengaja):

- File JSON di `data/reports/` — itu source of truth, jangan diutak-atik.
- Volume Postgres `autocrawl_pgdata` — vendors/expos yang udah complete tetap ada.
- Vector DB `data/vector_db/` — dedup similarity tetap nyala.
- PDF cache dan log file (kecuali pakai flag opsional di bawah).

Flag opsional kalau perlu lebih jauh:

```bash
docker compose exec api crawl reset-state --clear-pdfs            # hapus data/pdfs/
docker compose exec api crawl reset-state --clear-logs            # hapus logs/*.jsonl
docker compose exec api crawl reset-state --clear-pdfs --clear-logs -y   # full clean tanpa confirm
```

Output berupa dua tabel: pertama preview rencana aksi, kedua hasil akhir per step (jumlah row direset, key dihapus, dst).

Buat reset paling nuclear (hapus volume sekalian), pakai `docker compose down -v` dari section sebelumnya — itu wipe semua, perlu boot ulang dari awal.

### Manual fallback

Kalau CLI ga bisa dijalanin (image API rusak, container crash loop), reset manual:

```bash
docker compose exec redis redis-cli DEL autocrawl:active_run discovery:recent_queries
docker compose exec redis redis-cli --scan --pattern "taskclaim:*" | xargs -I{} docker compose exec redis redis-cli DEL {}

docker compose exec autocrawl-db psql -U postgres autocrawl -c "
  UPDATE runs SET finished_at=NOW(), notes='manual_reset' WHERE finished_at IS NULL;
  UPDATE exhibitor_refs SET status='extracted', failure_category=NULL, failure_reason=NULL
    WHERE status IN ('resolving','enriching');
"
```

---

## 13a. Konfigurasi Scope di UI (live, no restart)

Buka http://localhost:8090/konfigurasi. Empat tab tersedia.

1. **Kata Kunci Cakupan** untuk classifier in scope dan out of scope
2. **Blacklist Domain** plus whitelist override
3. **Seed Topik** dan anchor expo untuk LLM expansion
4. **Prompt AI** untuk system prompt scope classifier

Default sudah ke seed dari `config/aggregator_blacklist.yaml` dan `config/seed_topics.yaml` saat container api first boot. Setiap row punya badge sumber, `YAML` (read only, cuma boleh toggle off), `USER` (manual lo tambah), `AI` (saran AI yang lo approve).

Tombol **Saran AI** di tiap tab manggil LLM untuk kasih kandidat rule. Lo kasih hint singkat misal "hotel chain Asia yang sering nyangkut", LLM keluarkan list kandidat dengan confidence. Centang yang lo setuju lalu klik tambahkan. Tidak ada auto apply, semua approval manual.

Perubahan apapun di sini berlaku **realtime**. Backend bump counter `scope:version` di Redis, crawler dan api proses cek counter tiap polling 1 detik dan refresh in memory snapshot kalau berubah. Tidak perlu restart container.

Untuk reset prompt AI ke default, klik tombol **Reset ke Default** di tab Prompt AI.

---

## 13b. World Map Interaktif

Halaman Pusat Komando paling atas tampilkan world map 2.5D dengan globe projection (MapLibre 5 plus). Saat zoom out, bumi melengkung. Saat zoom in, fade ke flat mercator.

Kontrol kamera.

- **Drag** untuk pan
- **Scroll wheel** untuk zoom
- **Klik kanan plus drag** untuk tilt 3D plus rotate kompas
- **Double click** untuk zoom in
- Tombol +, -, dan reset di pojok kanan bawah

Interaksi data layer.

- **Hover** cylinder, tooltip muncul dengan flag emoji negara plus stat. Cylinder yang di hover flash putih sebagai feedback visual.
- **Klik kiri** cylinder, side panel slide in dari kanan. Berisi top 5 expo dan top 3 vendor di negara itu, plus tombol drilldown ke `/expos?country=X` dan `/vendors?country=X`.
- **Klik kanan** cylinder, context menu mini (Filter Ekspo di sini, Filter Vendor di sini, Copy ISO).
- **ESC** tutup panel atau context menu.

Polling 5 detik. Begitu crawler enrich vendor baru dengan country valid, marker baru muncul tanpa refresh. Indikator hijau pulsing **LIVE 5s** di header map konfirmasi polling jalan.

---

## 13c. Stop Run dari UI atau API

Saat run aktif, tombol **STOP** merah muncul di topbar di sebelah kiri tombol BERJALAN.

**Klik biasa** untuk graceful drain. Backend set flag asyncio Event, worker check di boundary tiap stage, in flight request natural complete, drain selesai sekitar 30 sampai 60 detik. Vendor yang sudah enriched tetap ke commit ke DB. Tabel `runs` baris terakhir punya `notes='aborted_graceful'`.

**Shift plus klik** munculkan modal merah konfirmasi STOP PAKSA. Klik konfirm. Backend cancel asyncio task langsung, kill Chromium subprocess, abort LLM call mid flight, reset state `exhibitor_refs.status` yang stuck. Selesai sekitar 5 detik. Token in flight kebakar tapi state DB clean. Tabel `runs` punya `notes='aborted_force'`.

Atau lewat curl untuk automation.

```bash
# Graceful
curl -X POST http://localhost:8081/api/runs/stop \
     -H "Content-Type: application/json" \
     -d '{"force": false}'

# Paksa
curl -X POST http://localhost:8081/api/runs/stop \
     -H "Content-Type: application/json" \
     -d '{"force": true}'
```

Setelah stop, lock `autocrawl:active_run` di Redis otomatis di clear. Trigger run baru langsung available.

---

## 13y. Agentic Crawler — AI-Driven Sibling (Host-Side Run)

Service kedua paralel sama existing crawler. Vision LLM (qwen3.6:27b di Ollama LAN `10.83.81.246:11434`) drive Chromium real, scroll dan klik kayak manusia, hasilkan exhibitor data ke meja yang sama (JSON + Postgres + Chroma). Dedup cosine 0.92 auto-merge overlap antara dua producer.

**Default OFF.** `AGENTIC_ENABLED=false` di `.env` — service tidur idle kalo gak diaktifkan, base crawler 100% gak terdampak.

### Kenapa run host-side, bukan di Docker?

`browser-use` butuh Python ≥3.11, base image kita Python 3.10. Plus install agentic ke main image artinya rebuild ~30 menit tiap kali iterasi code agentic — buang waktu. Solusi: jalanin di host pake Python 3.11+ venv, ngomong ke Redis/Postgres/Chroma di Docker via port localhost yang baru di-expose.

### Setup sekali (PowerShell di Windows):

```powershell
# Pastikan Python 3.11+ ada di PATH (verify: python --version)
.\backend\scripts\setup-agentic-host.ps1
```

### Setup sekali (Bash di Linux/macOS/WSL):

```bash
bash backend/scripts/setup-agentic-host.sh
```

Script bikin venv di `backend/.venv-agentic/`, install `autocrawler[agentic]` editable mode (browser-use + langchain-ollama + semua deps crawler), plus Playwright Chromium download.

### Jalanin (Windows PowerShell):

```powershell
# Pastikan service Docker yang dibutuhkan sudah jalan
docker compose up -d redis chroma autocrawl-db

# Activate venv
.\backend\.venv-agentic\Scripts\Activate.ps1

# Override env biar host-side ngomong ke localhost (bukan docker DNS)
$env:REDIS_URL = 'redis://localhost:6379/0'
$env:CHROMA_HOST = 'localhost'
$env:DATABASE_URL = 'postgresql+asyncpg://postgres:123@localhost:5432/autocrawl'
$env:AGENTIC_ENABLED = 'true'
$env:AGENTIC_HEADLESS = 'false'   # mau lihat Chromium real-time

# Verifikasi seed YAML loaded
agentic-crawl seeds

# One-shot: jalanin satu seed manual
agentic-crawl run --seed-name "ISC West 2026 — exhibitor list"

# 24/7 scheduler (Ctrl-C buat stop graceful)
agentic-crawl schedule
```

### Stop dari container/host lain (kalau scheduler stuck):

```bash
# Set Redis flag — scheduler check antar seed dan saat sleep, exit clean.
docker compose exec redis redis-cli SET autocrawl:agentic_stop_requested 1 EX 600
```

Atau pakai CLI dari container manapun yang punya akses Redis:
```bash
docker compose exec api agentic-crawl stop
```

### Edit seed list

`config/agentic_seeds.yaml` — tambah seed dengan nama, URL, expo_id, dan task instruction free-form (bahasa apapun yang qwen3.6 ngerti). Lihat template comment di file untuk contoh.

### Folder recordings

Tiap task tinggalin `data/agentic_recordings/<timestamp>-<seed_name>/` dengan screenshot per step + log conversation qwen. Buka folder buat audit "kenapa qwen klik salah di step 12". Toggle off via `AGENTIC_RECORD_SCREENSHOTS=false` kalau gak butuh.

### Kapan PERLU Docker mode (alternatif)

Kalau deploy di production server tanpa akses interaktif, butuh `agentic-crawler` jadi service container yang restart sendiri. Build image terpisah:

```bash
docker compose --profile agentic build agentic-crawler
docker compose --profile agentic up -d agentic-crawler
```

Tapi ini butuh `Dockerfile.agentic` dengan Python 3.11 base — belum dibikin. Buat dev iteration, host-side approach di atas jauh lebih cepat.

---

## 14. Troubleshooting Umum

### Port conflict saat `docker compose up`

Pesan `bind for 0.0.0.0:8090 failed: port is already allocated`. Sudah ada service lain pakai port itu. Edit `docker-compose.yml`, cari port mapping yang konflik, ganti sisi kiri (host).

```yaml
ports:
  - "9090:80"   # ganti 8090 → 9090
```

Restart. Akses dashboard pindah ke http://localhost:9090.

### Database not ready saat first run

```
sqlalchemy.exc.OperationalError: connection refused
```

API container start sebelum Postgres siap. Tunggu 10-15 detik lalu cek `docker compose ps`. Kalau `autocrawl-db` masih belum `healthy`, lihat log nya untuk error detail.

```bash
docker compose logs autocrawl-db
```

Solusi cepat: restart api saja.

```bash
docker compose restart api
```

### DNS error `Name or service not known`

Container tidak bisa resolve hostname container lain. Biasa muncul kalau salah satu container di luar network `crawl_net`. Cek.

```bash
docker network inspect autocrawl_crawl_net
```

Container yang tidak terlihat di list "Containers" harus dijoin manual.

```bash
docker network connect autocrawl_crawl_net <nama-container>
```

### OOM (Out Of Memory)

NLLB plus model di Ollama (Granite chat + gemma4:e4b vision OCR + qwen3-embedding) bisa makan RAM total sampai 12 sampai 18 GB saat semua resident. Kalau Docker Desktop di Windows atau Mac, naikkan limit nya di Settings, Resources. Minimum 12 GB, recommended 20 GB. (OCR sekarang diserahkan ke Ollama jadi crawler container sendiri jauh lebih ramping vs versi Surya.)

Kalau RAM tetap tidak cukup, ada beberapa opsi.

```bash
# 1. Build tanpa NLLB (translation fallback ke Granite via Ollama)
docker compose build --build-arg INSTALL_NLLB=false

# 2. Disable OCR (PDF scanned tidak akan ke ekstrak; PDF text murni tetep jalan)
# Set di .env:
OCR_ENABLED=false

# 3. Turunkan browser pool size di .env
BROWSER_POOL_SIZE=8
CRAWL4AI_MAX_CONCURRENT=2
```

### Ollama lambat atau timeout

Granite 3B di CPU butuh sekitar 5 sampai 15 token per detik, terlalu lambat untuk mode normal. Solusi.

1. Aktifkan GPU NVIDIA. Edit `docker-compose.yml` di service `ollama`, uncomment block `deploy.resources.reservations.devices`. Throughput naik 5 sampai 10x. Pastikan `nvidia-container-toolkit` udah terinstall di host.
2. Pakai mode `dev` saja saat tanpa GPU. Mode normal dan agresif terlalu berat.
3. Switch ke OpenAI cloud kalau punya budget. Lihat section 8.

### OpenSERP captcha 503

Saat Google detect bot, OpenSERP balikin 503 dengan body `captcha detected`. Logger crawler tampilkan `openserp.captcha`. Ini ditangani retry exponential backoff (5 detik, 10 detik, 20 detik, max 2 retry). Kalau persistent, edit `.env` untuk cabut Google saja.

```
OPENSERP_ENGINES=bing,yandex,baidu
```

Restart api dan crawler. Sisa engines tetap kasih coverage lumayan untuk discovery.

### Stage 03 04 05 di Orkestrator board kosong

Pipeline downstream gak jalan kemungkinan karena stage 02 (Extract Aggregator) return 0 ref. Cek query DB.

```bash
docker compose exec autocrawl-db psql -U postgres -d autocrawl -c "
SELECT status, failure_category, COUNT(*)
FROM exhibitor_refs GROUP BY status, failure_category;
"
```

Kalau semua status `extracted` dengan jumlah 0, generic scraper di `tools/scrapers/generic.py` gak match URL pattern di halaman aggregator. Cek log scraper untuk diagnostik.

```bash
docker compose logs crawler --tail 200 | grep generic_scraper
```

### Frontend kosong tapi API balikin data

Browser cache. Hard refresh dengan Ctrl+Shift+R (Cmd+Shift+R di Mac). Kalau masih, buka DevTools, cek tab Network, lihat apakah `/api/overview` balikin 200 atau error.

Kalau error 502, biasanya nginx config di container frontend belum up to date. Rebuild.

```bash
docker compose build frontend
docker compose up -d frontend
```

### Trigger run balikin 409 Conflict

Pesan `A run is already active`. Cara paling cepat, klik tombol merah **STOP** di topbar (graceful drain selesai sekitar 30 sampai 60 detik) atau shift plus klik untuk **STOP PAKSA** (selesai 5 detik).

Kalau tombol STOP di dashboard tidak respons (misal API down), reset manual.

```bash
# Force release lock di Redis
docker compose exec redis redis-cli DEL autocrawl:active_run

# Reconcile DB state, mark run yang gantung jadi aborted
docker compose exec autocrawl-db psql -U postgres -d autocrawl -c "
UPDATE runs SET finished_at = NOW(), notes = 'aborted_manual' WHERE finished_at IS NULL;
UPDATE exhibitor_refs SET status = 'extracted'
  WHERE status IN ('resolving', 'enriching');
"

# Restart api supaya state in memory clean
docker compose restart api
```

Tombol di dashboard akan kembali bisa diklik.

---

## 15. FAQ

**Berapa biaya LLM per run?**

Default Ollama lokal, biaya LLM nol. Tinggal biaya listrik untuk GPU atau CPU.

Kalau switch ke OpenAI cloud, ballpark per mode (asumsi gpt-4o-mini untuk light call dan gpt-4o untuk heavy merge enricher).

- dev, 0.03 sampai 0.08 USD per run
- normal, 0.20 sampai 0.40 USD per run
- aggressive, 0.80 sampai 1.50 USD per run

Kalau mode normal jalan tiap 30 menit selama 24 jam, sekitar 48 run, totalnya 9.60 sampai 19.20 USD per hari. Untuk produksi pakai aggressive 1 kali sehari dan normal 4 kali sehari, sekitar 5 sampai 8 USD per hari.

Set hard budget cap di OpenAI dashboard untuk safety, di Settings, Billing, Usage limits.

**Kapan butuh GPU?**

Sangat direkomendasikan kalau pakai Ollama default (granite4.1:3b). CPU only sekitar 5 sampai 15 token per detik, mode normal jadi 1 sampai 3 jam. Dengan RTX 3060 atau 4070, throughput naik ke 60 sampai 120 token per detik, mode normal selesai 30 sampai 90 menit.

NLLB-200 distilled 600M sudah optimized int8 untuk CPU, tidak butuh GPU. OCR sekarang dilayani Ollama vision model (`gemma4:e4b`) — pakai GPU yang sama dengan chat LLM lewat Ollama, tidak ada PyTorch terpisah lagi.

**Kapan unlock Phase 2?**

Saat kolom "Vendors enriched" mencapai 100 (default `PHASE_2_VENDOR_THRESHOLD=100`). Setelah itu, fitur paid (Crunchbase, Apollo, ZoomInfo) otomatis aktif untuk vendor yang sudah ada di DB. Tidak perlu restart, scheduler akan mendeteksi sendiri.

Untuk mengubah ambang batas, edit `.env`.

```
PHASE_2_VENDOR_THRESHOLD=50
```

**Bisakah jalan tanpa internet?**

Tidak. Crawler butuh akses ke 10times, Wikipedia, target vendor websites untuk fetch HTML mentah, plus tile basemap CartoDB untuk world map. LLM dan embedding udah lokal lewat Ollama. Search via OpenSERP juga butuh internet karena scrape Google atau Bing. Internet wajib operasional.

First boot perlu bandwidth ekstra untuk download model (granite 3 GB, NLLB 1.5 GB, gemma4:e4b ~3 GB lewat Ollama, OpenSERP image 600 MB). Setelah cached, restart selanjutnya tidak butuh download ulang.

**Bisakah ekstrak data dari LinkedIn / Crunchbase langsung?**

Tidak via free tier. Keduanya punya anti scraping kuat dan TOS yang melarang scraping. Phase 2 (paid) pakai API resmi mereka.

**Berapa banyak data yang bisa disimpan?**

Postgres mudah handle ratusan ribu vendor. ChromaDB untuk vector dedup juga scalable. Limit utama adalah biaya OpenAI dan rate limit aggregator. Ballpark per stack lokal: 10.000 vendor enriched per minggu di mode normal.

**Bagaimana cara hapus duplikat vendor?**

Sudah otomatis lewat Chroma vector deduplication. Vendor dengan domain sama tidak akan diproses ulang. Vendor berbeda domain tapi nama mirip (misal `axa-france.com` dan `axa.com`) akan tetap dianggap dua entitas berbeda. Untuk merge manual, hapus salah satu via SQL.

```sql
DELETE FROM vendors WHERE domain = 'axa-france.com';
```

**Kenapa beberapa vendor language_code masih `en`?**

Bisa beberapa alasan.

1. Translation gagal saat enrichment (cek log `enricher.translation_failed`).
2. Vendor diimport dari JSON lama dan belum di backfill. Jalankan `crawl translate-vendors` untuk fix.
3. Field nya kosong (description null), jadi tidak ada yang perlu diterjemahkan, tapi `language_code` tetap diset `id`.

Untuk paksa translate ulang semua.

```bash
docker compose exec api crawl translate-vendors --force
```

**Apakah ada batas request ke Wikipedia?**

Wikipedia API mengizinkan 200 request per detik per IP, tanpa autentikasi. Kita batch 50 titles per request, jadi satu artikel dengan 300 link butuh 6 request. Aman untuk operasional normal.

---

Selamat menggunakan AutoCrawl. Kalau ada masalah yang tidak tercakup di sini, buka log container, cari pesan error, dan cocokkan dengan section Troubleshooting di atas. Kalau masih buntu, simpan log dan deskripsi langkah yang dilakukan, lalu konsultasikan ulang.
