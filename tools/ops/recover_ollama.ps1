# =====================================================================
# recover_ollama.ps1
# =====================================================================
# Auto-recovery untuk Ollama di host inference (10.83.81.246:11434).
#
# Cara kerja:
#   1. Probe Ollama via HTTP. Kalau hidup, exit 0 tanpa side effect.
#   2. Kalau mati, launch MobaXterm pakai bookmark yang sama dengan
#      shortcut Desktop. MobaXterm session-nya HARUS sudah dikonfigurasi
#      auto-run command saat connect (lihat REQUIRED SETUP di bawah).
#
# Pemanggilan:
#   pwsh -File recover_ollama.ps1
#   atau dari Bash:  powershell -File "C:/Users/TRIAL/Desktop/crawl/tools/ops/recover_ollama.ps1"
#
# Exit code:
#   0 = Ollama hidup (sudah atau setelah recovery launch)
#   1 = Probe gagal, MobaXterm di-launch, butuh waktu untuk session connect plus auto-command jalan
#   2 = MobaXterm binary tidak ketemu
#
# REQUIRED SETUP (one-time, di MobaXterm GUI):
#   1. Buka MobaXterm.
#   2. Right-click session "User sessions\10.83.81.246 (gsp-user)" di sidebar.
#   3. Edit session, masuk ke tab "Advanced SSH settings".
#   4. Centang "Execute macro at session start" atau di field "Execute the
#      following commands at session start" paste:
#        pkill -u gsp-user ollama 2>/dev/null; sleep 1; setsid nohup env OLLAMA_HOST=0.0.0.0:11434 ollama serve > /tmp/ollama.log 2>&1 < /dev/null & disown; sleep 3; curl -s http://localhost:11434/api/version
#   5. Save session. Tutup MobaXterm.
#   Sejak sekarang, setiap kali script ini jalanin MobaXterm via bookmark,
#   command itu auto-execute saat session konek.
# =====================================================================

$ErrorActionPreference = "Stop"

$OLLAMA_URL   = "http://10.83.81.246:11434/api/version"
$MOBA_EXE     = "C:\Users\TRIAL\Downloads\MobaXterm_Portable_v26.3\MobaXterm_Personal_26.3.exe"
$MOBA_BOOKMARK = "User sessions\10.83.81.246 (gsp-user)"
$TIMESTAMP    = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "[$TIMESTAMP] probe ollama at $OLLAMA_URL"

try {
    $resp = Invoke-WebRequest -Uri $OLLAMA_URL -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        $body = $resp.Content
        Write-Host "[$TIMESTAMP] ollama UP, version response: $body"
        exit 0
    }
    Write-Host "[$TIMESTAMP] ollama responded with status $($resp.StatusCode), treating as down"
}
catch {
    Write-Host "[$TIMESTAMP] ollama probe failed: $($_.Exception.Message)"
}

# Sampai sini, Ollama dianggap mati. Launch MobaXterm bookmark.
if (-not (Test-Path $MOBA_EXE)) {
    Write-Error "[$TIMESTAMP] MobaXterm not found at $MOBA_EXE"
    exit 2
}

Write-Host "[$TIMESTAMP] launching MobaXterm session: $MOBA_BOOKMARK"
Start-Process -FilePath $MOBA_EXE -ArgumentList @("-bookmark", "`"$MOBA_BOOKMARK`"")

# Beri waktu MobaXterm boot dan auto-command jalan.
# 25 detik biasanya cukup untuk: MobaXterm boot, session connect, auto-cmd
# eksekusi, nohup detach. Kalau MobaXterm cold start dari portable, kadang
# butuh lebih. Tweak kalau perlu.
Write-Host "[$TIMESTAMP] waiting 25s for session + auto-command to run"
Start-Sleep -Seconds 25

# Re-probe untuk konfirmasi recovery.
Write-Host "[$TIMESTAMP] re-probe ollama after recovery attempt"
try {
    $resp = Invoke-WebRequest -Uri $OLLAMA_URL -TimeoutSec 8 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-Host "[$TIMESTAMP] recovery confirmed, ollama UP"
        exit 0
    }
    Write-Host "[$TIMESTAMP] recovery launched but still status $($resp.StatusCode), check MobaXterm window"
    exit 1
}
catch {
    Write-Host "[$TIMESTAMP] recovery launched but probe still fails: $($_.Exception.Message)"
    Write-Host "[$TIMESTAMP] check MobaXterm window manually, atau cek setup auto-command di session config"
    exit 1
}
