# Konfigurasi `OLLAMA_HOST` di Ollama Server

Catatan jebakan: nama env var `OLLAMA_HOST` punya arti berbeda di sisi server dan di sisi client. Dokumen ini fokus ke sisi server, karena itu sumber kebingungan yang sering muncul.

## Pertanyaan inti

> "Kenapa harus `OLLAMA_HOST=0.0.0.0:11434` di sisi server? Server-nya kan IP-nya `10.83.81.246`, kenapa tidak langsung pakai IP itu?"

Jawaban singkat: `0.0.0.0` itu bukan alamat tujuan, itu instruksi binding. Artinya "dengarkan di SEMUA interface jaringan yang ada di mesin ini". `10.83.81.246` itu IP tujuan dari sisi klien, bukan IP yang harus didengarkan oleh server.

## Penjelasan teknis

### Apa yang dilakukan `OLLAMA_HOST` di sisi server

Saat `ollama serve` dijalankan, dia perlu tahu interface mana yang harus dia bind untuk listen port 11434. Pilihannya:

| Nilai `OLLAMA_HOST` | Arti | Reachable dari |
|---|---|---|
| `127.0.0.1:11434` (default) | Bind hanya ke loopback | Hanya localhost mesin itu sendiri |
| `0.0.0.0:11434` | Bind ke SEMUA interface | Localhost, LAN, Docker network, dan interface lain |
| `10.83.81.246:11434` | Bind hanya ke interface dengan IP itu | Mesin yang bisa route ke `10.83.81.246` |

Default Ollama adalah `127.0.0.1`. Itu yang bikin kasus kemarin si daemon hidup tapi tidak reachable dari container Docker saya, karena container datang dari subnet lain dan loopback tidak melayani mereka.

### Kenapa `0.0.0.0` lebih aman dipakai daripada IP spesifik

1. **Ganti IP atau multi-homed.** Kalau interface server berubah (DHCP, NIC dual, VLAN baru), bind ke IP spesifik langsung mati. `0.0.0.0` selalu kena.
2. **Docker network reachability.** Container Docker punya IP internal di network bridge sendiri, lalu ke luar via NAT. Saat container `curl 10.83.81.246`, paket nyampe ke server lewat interface fisik. Tapi kalau server cuma bind ke IP fisik yang berbeda (atau ada secondary IP, IPv6, dll), hasilnya tidak konsisten.
3. **Konvensi server software.** Mayoritas server software (nginx, postgres, etc) menerima `0.0.0.0` sebagai sinyal "all interfaces". Itu idiom standar.

### Beda OLLAMA_HOST sisi server vs sisi client

Ini biang kebingungan paling sering:

| Konteks | Nilai env | Arti |
|---|---|---|
| Mesin yang jalanin `ollama serve` | `OLLAMA_HOST=0.0.0.0:11434` | Bind ke semua interface lokal |
| Mesin yang jalanin `ollama run` atau klien lain | `OLLAMA_HOST=http://10.83.81.246:11434` | Target server yang dituju |

Nama env-nya sama persis, tapi semantiknya kebalikan. Klien isinya URL tujuan, server isinya alamat bind. Ollama CLI tahu konteksnya dari command yang dijalankan (`serve` versus `run`/`pull`/`list`).

Di stack ini, klien Ollama adalah container `agentic-a` dan `agentic-b`. Mereka baca env `AGENTIC_LLM_BASE_URL=http://10.83.81.246:11434` dari file `.env` di repo. Ini bukan `OLLAMA_HOST`, melainkan setting custom yang dipetakan ke `crawler.tools.llm.openai_client` saat init. Cek `backend/src/agentic_crawler/config.py` untuk definisi field-nya.

## Verifikasi binding actual

Setelah `ollama serve` jalan, lihat di mesin server-nya:

```bash
ss -tlnp | grep 11434
```

Output yang benar untuk `0.0.0.0`:
```
LISTEN 0  4096  *:11434  *:*  users:(("ollama",pid=...))
```

Tanda `*:11434` artinya wildcard alias `0.0.0.0`. Reachable dari mana saja yang punya rute ke mesin ini.

Output kalau bind ke `127.0.0.1`:
```
LISTEN 0  4096  127.0.0.1:11434  0.0.0.0:*
```

Yang ini cuma loopback, tidak reachable dari Docker container atau LAN.

Output kalau bind ke IP spesifik:
```
LISTEN 0  4096  10.83.81.246:11434  0.0.0.0:*
```

Tergantung kasus. Aman kalau IP itu betul-betul stabil.

## Konfigurasi yang dipakai sekarang

Stack autocrawl pakai pola:
- Server (`inference-kaytus` di `10.83.81.246`): `OLLAMA_HOST=0.0.0.0:11434`
- Client (`agentic-a`, `agentic-b` di docker network): `AGENTIC_LLM_BASE_URL=http://10.83.81.246:11434` di `.env`

Pola ini tahan ganti interface di sisi server dan tahan pindah container di sisi client.

## Risiko keamanan

Bind `0.0.0.0` artinya Ollama listen di semua interface, termasuk yang publik kalau ada. Pastikan minimal salah satu dari berikut:
1. Firewall (iptables, ufw, security group) blok port 11434 dari WAN.
2. Server cuma punya interface internal (private network only).
3. Bind ke IP private spesifik, misal `10.83.81.246:11434`, kalau server multi-homed dan kamu ingin Ollama tidak terjangkau dari sisi public.

Di kasus `inference-kaytus`, asumsinya host cuma di private LAN, jadi `0.0.0.0` aman. Kalau ada perubahan topologi, evaluasi ulang.

## Contoh deploy yang permanen

Pakai systemd override biar setting ini permanen melintas reboot:

```bash
sudo systemctl edit ollama
```

Isi editor dengan:
```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Restart=on-failure
RestartSec=10
```

Simpan, lalu:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
sudo systemctl enable ollama
sudo journalctl -u ollama -n 20
```

Sekarang setiap reboot Ollama hidup sendiri, bind ke `0.0.0.0:11434`, auto-restart kalau crash.
