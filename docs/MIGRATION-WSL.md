# Migrasi Autocrawl Stack dari Docker Desktop ke WSL Native Docker

Dokumen ini langkah konkret pindahin stack dari Docker Desktop ke Docker Engine native di dalam WSL2 Ubuntu. Tujuan: lebih stabil, lebih ringan, tidak terikat ke UI Docker Desktop yang bisa crash seperti yang baru terjadi.

## Pre-flight check

WSL2 sudah aktif di mesin ini dengan Ubuntu-24.04 (di-verify via `wsl --list --verbose`). Itu cukup. Distro `docker-desktop` yang ada juga aktif, tapi bakal kita pensiunkan.

## Arsitektur tujuan

Sebelum: Docker CLI di Windows talk ke Docker Engine di dalam VM dedicated `docker-desktop` (managed oleh Docker Desktop UI).

Sesudah: Docker Engine native di dalam WSL Ubuntu-24.04, jalan sebagai systemd service. CLI di Windows masih bisa pakai sama (Docker auto-bridges) ATAU kita kerjain semua di dalam shell Ubuntu.

## Volume dan data yang harus dipindahin

Bind mount (sudah di host filesystem, tinggal di-akses):
- `./data` (lessons, knowledge.json, recordings, profiles)
- `./logs`
- `./config` (seed YAMLs)
- `./backend/ops/prometheus`, `./backend/ops/grafana` (config files)
- `./Latihan` (JSONL traces)
- `./report` (laporan harian)

Named volume Docker (harus di-backup dari Docker Desktop):
- `autocrawl_pgdata` (CRITICAL, 3191+ vendor)
- `chroma_data` (vendor embedding dedup)
- `redis_data` (queue state, enrich PEL)
- `langfuse_db` (telemetry, non-critical)
- `prom_data` (historical metrics, non-critical)
- `grafana_data` (dashboards, di-rebuild dari provisioning)
- `searxng_data` (cache, non-critical)

## Phase 1, install Docker Engine di Ubuntu-24.04

Masuk ke Ubuntu WSL.
```
wsl -d Ubuntu-24.04
```

Di dalam Ubuntu shell, jalanin sebagai user kamu:
```
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Tambah user kamu ke docker group biar tidak perlu sudo tiap docker command:
```
sudo usermod -aG docker $USER
```

## Phase 2, enable systemd di WSL Ubuntu-24.04

WSL Windows 11 sudah dukung systemd. Aktifkan biar Docker bisa jalan sebagai service.

Buat atau edit file di Ubuntu shell:
```
sudo tee /etc/wsl.conf <<EOF
[boot]
systemd=true

[network]
generateResolvConf=false
EOF
```

Lalu dari Windows PowerShell, shutdown semua WSL biar config-nya kebaca:
```
wsl --shutdown
```

Buka lagi Ubuntu, verifikasi systemd jalan:
```
wsl -d Ubuntu-24.04
systemctl status
```

Harusnya muncul `State: running`. Lalu aktifkan Docker service:
```
sudo systemctl enable docker
sudo systemctl start docker
docker version
docker ps
```

## Phase 3, backup volume dari Docker Desktop

Ada dua kondisi.

**Kondisi A, Docker Desktop bisa di-revive sebentar.** Restart Docker Desktop (langkah yang dijelaskan di section sebelumnya, force-quit lalu start lagi). Setelah daemon hidup walau cuma sebentar:

```
cd C:\Users\TRIAL\Desktop\crawl
mkdir backup
docker run --rm -v autocrawl_pgdata:/data -v ${PWD}/backup:/backup busybox tar czf /backup/pgdata.tar.gz -C /data .
docker run --rm -v chroma_data:/data -v ${PWD}/backup:/backup busybox tar czf /backup/chroma.tar.gz -C /data .
docker run --rm -v redis_data:/data -v ${PWD}/backup:/backup busybox tar czf /backup/redis.tar.gz -C /data .
```

File backup masuk ke `C:\Users\TRIAL\Desktop\crawl\backup\`.

**Kondisi B, Docker Desktop tidak mau hidup sama sekali.** Akses langsung filesystem distro docker-desktop dari WSL.

```
wsl -d docker-desktop
ls /var/lib/docker/volumes/
```

Salin volume autocrawl ke folder host yang akan dipindahkan:
```
cp -a /var/lib/docker/volumes/autocrawl_pgdata /mnt/c/Users/TRIAL/Desktop/crawl/backup/pgdata-raw
cp -a /var/lib/docker/volumes/chroma_data /mnt/c/Users/TRIAL/Desktop/crawl/backup/chroma-raw
cp -a /var/lib/docker/volumes/redis_data /mnt/c/Users/TRIAL/Desktop/crawl/backup/redis-raw
```

Format raw ini akan kita import ulang di Phase 4.

## Phase 4, pindahin repo ke WSL native filesystem

Pilihan untuk lokasi repo, urut dari paling rekomen ke paling tidak:

**Pilihan A, native WSL home (paling cepat, recommended).**
```
cp -a /mnt/c/Users/TRIAL/Desktop/crawl ~/crawl
cd ~/crawl
```
Performa I/O 5 sampai 10x lebih cepat daripada akses /mnt/c. Trade-off, repo terpisah dari Windows view, harus pakai shell WSL untuk edit.

**Pilihan B, tetap di /mnt/c/.**
```
cd /mnt/c/Users/TRIAL/Desktop/crawl
```
Tidak perlu copy, edit dari Windows juga bisa, tapi performa I/O lebih lambat dan kadang ada bug permission. Buat 22 service yang heavy I/O (Chromium profiles, lessons archive, recordings), kerugian ini sayang.

Pilih A untuk production, B kalau cuma sementara.

## Phase 5, restore volume di WSL Docker

Dari shell Ubuntu (di mana docker sudah hidup):

```
cd ~/crawl
docker volume create autocrawl_pgdata
docker volume create chroma_data
docker volume create redis_data
docker volume create langfuse_db
docker volume create prom_data
docker volume create grafana_data
docker volume create searxng_data
```

Restore dari tar (kalau Kondisi A di Phase 3):
```
docker run --rm -v autocrawl_pgdata:/data -v $(pwd)/backup:/backup busybox tar xzf /backup/pgdata.tar.gz -C /data
docker run --rm -v chroma_data:/data -v $(pwd)/backup:/backup busybox tar xzf /backup/chroma.tar.gz -C /data
docker run --rm -v redis_data:/data -v $(pwd)/backup:/backup busybox tar xzf /backup/redis.tar.gz -C /data
```

Restore dari raw (kalau Kondisi B di Phase 3):
```
VOL=$(docker volume inspect autocrawl_pgdata -f '{{.Mountpoint}}')
sudo cp -a backup/pgdata-raw/. $VOL/
sudo chown -R 999:999 $VOL  # postgres UID
```
(angka UID 999 di Postgres image standar, sesuaikan kalau image kamu beda).

## Phase 6, naikkan stack

Dari shell Ubuntu di folder repo:

```
docker compose up -d
```

Compose akan baca docker-compose.yml yang sama (tidak perlu modifikasi), build image kalau perlu (crawler, api, frontend pakai Dockerfile lokal), lalu start semua 22 service.

Tunggu sekitar 1 sampai 2 menit pertama kali (build image dari awal). Setelah selesai:

```
docker compose ps
docker compose logs -f --tail 20 agentic-a
```

## Phase 7, verifikasi end-to-end

Dari Windows shell (atau PowerShell):
```
curl http://localhost:8090
curl http://localhost:8000/api/v1/heartbeat
curl http://localhost:6379
```

Localhost dari Windows otomatis forward ke WSL2 service di port yang sama (Windows 11 feature). Frontend, Postgres, Redis, Chroma semua reachable seperti dari Docker Desktop dulu.

Verifikasi pipeline:
```
docker exec autocrawl-db psql -U postgres -d autocrawl -t -A -c "SELECT count(*) FROM vendors"
```
Angka harus sama atau lebih dari 3191 (jumlah pre-incident).

## Phase 8, pensiunkan Docker Desktop

Setelah stack stabil di WSL selama beberapa jam atau hari, baru pensiunkan Docker Desktop biar memori bebas.

Quit Docker Desktop dari system tray. Lalu uninstall via Settings Apps. Distro WSL `docker-desktop` dan `docker-desktop-data` boleh di-unregister kalau mau bersih total:
```
wsl --unregister docker-desktop
wsl --unregister docker-desktop-data
```

Ini hapus VM-nya. Volume yang sudah migrate ke Docker WSL native tidak terdampak karena lokasinya di Ubuntu-24.04 distro, bukan docker-desktop distro.

## Update cron loop di Claude Code

Setelah migrasi sukses, command di cron loop juga perlu sedikit adjustment. Kalau repo dipindah ke `~/crawl` (Phase 4 Pilihan A), command-command docker yang dijalanin dari Windows Bash harus prefix WSL:

```
wsl -d Ubuntu-24.04 -e bash -c "cd ~/crawl && docker ps --format '{{.Names}}|{{.Status}}'"
```

Atau lebih elegan, edit script `recover_ollama.ps1` dan `cron prompt` biar tahu kalau Docker sekarang di WSL native, panggil docker via `wsl -d Ubuntu-24.04 -- docker ...` prefix.

Untuk laporan di `report/DDMMYYYY.md`, lokasinya tetap di host Windows (di-bind dari WSL Pilihan B), atau kalau Pilihan A, ada di `~/crawl/report/` di WSL, gantilah path saat akses dari Windows shell ke `\\wsl$\Ubuntu-24.04\home\<user>\crawl\report\`.

## Rollback plan

Kalau di tengah jalan ada masalah dan kamu mau balik ke Docker Desktop:
1. `docker compose down` di WSL native (jangan pakai `-v`, biar volume tetap).
2. Start Docker Desktop.
3. `docker compose up -d` di folder repo dari Windows.

Volume names sama persis (autocrawl_pgdata, chroma_data, dll), jadi Docker Desktop akan re-attach ke volume Docker Desktop yang lama. Catatan, kalau data sudah di-update di WSL native sebelum rollback, perubahan itu tidak ke-merge balik ke Docker Desktop, beda volume backend.

## Estimasi waktu

- Phase 1 install Docker Engine, 10 menit
- Phase 2 enable systemd plus WSL restart, 5 menit
- Phase 3 backup, 5 sampai 15 menit tergantung ukuran volume (Postgres bisa berat)
- Phase 4 copy repo ke WSL native, 5 menit
- Phase 5 restore volume, 5 sampai 10 menit
- Phase 6 first compose up dengan build, 5 sampai 15 menit
- Phase 7 verifikasi, 5 menit
- Total, sekitar 45 menit sampai 1 jam kerja aktif

## Risiko dan mitigasi

- **Postgres data corrupt saat raw copy.** Kalau pakai Kondisi B di Phase 3 (raw copy), ada risiko WAL belum flushed. Mitigasi, kalau Docker Desktop bisa sebentar dihidupkan, pakai Kondisi A dengan tar yang lebih clean. Atau jalanin `docker exec autocrawl-db pg_dumpall -U postgres > backup.sql` sebelum tar.
- **Chromium di container tidak nemu display di WSL.** Container agentic-a, agentic-b pakai Xvfb plus noVNC. Itu di dalam container, tidak terikat WSL display server, jadi seharusnya jalan. Kalau ada masalah, cek `docker logs autocrawl-agentic-a` untuk error Xvfb.
- **Port collision dengan Docker Desktop yang masih running.** Selama migrasi, matiin Docker Desktop dulu biar port 5432, 6379, 8000, 8090, 7900, dll tidak bentrok.
- **WSL memori.** Docker Engine di WSL pakai WSL2 VM yang punya memory budget. Default 50 persen RAM host. Kalau crawler heavy, mungkin perlu naikkin via `.wslconfig` di `%USERPROFILE%`.

## Kapan tidak perlu migrasi

Kalau setelah restart Docker Desktop sekarang langsung stabil dan tidak crash lagi dalam 24 jam berikutnya, migrasi ini tidak urgent. Tapi mengingat sudah dua kali Docker Desktop bermasalah dalam 3 hari terakhir (5 jam blackout barusan plus glitch sebelumnya), migrasi ke WSL native cukup masuk akal untuk insurance.
