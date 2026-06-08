# Ops scripts

## recover_ollama (.ps1 / .bat)

Auto-recovery untuk Ollama di host `inference-kaytus` (10.83.81.246:11434).

### Cara pakai

**Manual, double-click:** klik dua kali `recover_ollama.bat`. Window cmd
muncul sebentar, kalau Ollama hidup tutup sendiri tanpa ngapa-ngapain.
Kalau mati, MobaXterm di-launch dengan session gsp-user.

**Dari shell (Bash atau PowerShell):**
```
powershell -File "C:/Users/TRIAL/Desktop/crawl/tools/ops/recover_ollama.ps1"
```

**Dari Claude Code cron:** sama dengan di atas. Script ini idempotent,
aman dipanggil tiap pemeriksaan hourly. Kalau Ollama sehat, tidak ada
yang berubah.

### Setup MobaXterm (one-time)

Supaya script ini benar-benar otonom, MobaXterm session-nya harus
auto-run perintah `ollama serve` saat connect. Tanpa setup ini,
script cuma buka window MobaXterm tapi kamu masih harus ngetik
perintah manual.

Langkah:
1. Buka MobaXterm.
2. Di sidebar kiri, cari session `User sessions\10.83.81.246 (gsp-user)`.
3. Right-click, pilih `Edit session`.
4. Tab `Advanced SSH settings`.
5. Centang `Execute macro at session start`, atau pakai field
   `Execute the following commands at session start`.
6. Paste perintah ini sebagai isinya:
   ```
   pkill -u gsp-user ollama 2>/dev/null; sleep 1; setsid nohup env OLLAMA_HOST=0.0.0.0:11434 ollama serve > /tmp/ollama.log 2>&1 < /dev/null & disown; sleep 3; curl -s http://localhost:11434/api/version
   ```
7. Save session.

Sejak sekarang, setiap kali script ini jalanin MobaXterm via bookmark,
perintah itu auto-execute. `setsid` plus `nohup` plus `disown` bikin
proses ollama jadi yatim piatu, tetap hidup walau session MobaXterm
ditutup.

### Eksitcode

| Kode | Arti |
|------|------|
| 0    | Ollama hidup (sebelum atau sesudah recovery) |
| 1    | Probe gagal, MobaXterm di-launch, tapi re-probe masih gagal. Cek window MobaXterm manual |
| 2    | MobaXterm binary tidak ketemu di path yang diharapkan |

### Tweak

- Ubah `$MOBA_EXE` di script kalau path MobaXterm portable kamu beda.
- Ubah `Start-Sleep -Seconds 25` kalau cold start MobaXterm di mesin kamu lebih lama.
- Kalau punya akun yang punya sudo, ganti perintah auto-run di session config jadi `sudo systemctl restart ollama` untuk solusi yang lebih bersih.

### Integrasi ke cron loop Claude Code

Cron hourly bisa panggil script ini di setiap iterasi sebagai langkah
ke-7 di prosedur health sweep. Pseudo-instruksi:

> Setelah probe Ollama gagal, panggil `powershell -File ...\recover_ollama.ps1` lalu tunggu 30 detik dan re-probe. Kalau masih gagal, eskalasi ke human review.
