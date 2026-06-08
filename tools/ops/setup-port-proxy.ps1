# Auto-setup netsh portproxy untuk expose service WSL Docker ke LAN.
# Run as Administrator. Idempotent, aman dijalankan berulang.
#
# Default rule: expose port frontend 8090. Tambah service lain dengan extend $Forwards.
#
# Background:
# WSL2 networkingMode=mirrored cuma forward Windows localhost ke WSL.
# LAN binding butuh netsh portproxy plus firewall rule eksplisit.
# Target connectaddress=127.0.0.1 stabil karena mirrored mode bridge loopback.

[CmdletBinding()]
param(
    [switch]$RemoveOnly
)

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Script ini butuh Administrator. Klik kanan PowerShell -> Run as Administrator, lalu jalankan ulang."
    exit 1
}

# Port yang mau di-expose ke LAN. Tambah baris baru kalau perlu service lain.
$Forwards = @(
    @{ Port = 8090; Name = "Autocrawl Frontend 8090";  Desc = "Frontend Vue/Vite via nginx" }
    @{ Port = 8081; Name = "Autocrawl API 8081";       Desc = "FastAPI backend" }
    @{ Port = 3030; Name = "Autocrawl Grafana 3030";   Desc = "Grafana dashboards" }
    @{ Port = 9090; Name = "Autocrawl Prometheus 9090"; Desc = "Prometheus" }
)

# Cleanup dulu, biar idempotent
Write-Host "Cleanup existing rules..." -ForegroundColor Cyan
foreach ($f in $Forwards) {
    netsh interface portproxy delete v4tov4 listenport=$($f.Port) listenaddress=0.0.0.0 2>$null | Out-Null
    Get-NetFirewallRule -DisplayName $f.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

if ($RemoveOnly) {
    Write-Host "Removed all rules, exiting." -ForegroundColor Yellow
    exit 0
}

Write-Host "Adding portproxy + firewall rules..." -ForegroundColor Cyan
foreach ($f in $Forwards) {
    netsh interface portproxy add v4tov4 listenport=$($f.Port) listenaddress=0.0.0.0 connectport=$($f.Port) connectaddress=127.0.0.1 | Out-Null
    New-NetFirewallRule -DisplayName $f.Name -Description $f.Desc -Direction Inbound -LocalPort $f.Port -Protocol TCP -Action Allow | Out-Null
    Write-Host "  $($f.Port) -> 127.0.0.1:$($f.Port) ($($f.Name))" -ForegroundColor Green
}

Write-Host ""
Write-Host "Active port proxies:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

# Ambil Windows LAN IP buat output info
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } |
    Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.InterfaceAlias -notlike '*Local Area Connection*' } |
    Select-Object -First 1 -ExpandProperty IPAddress)

if ($lanIp) {
    Write-Host ""
    Write-Host "Access dari laptop lain di LAN yang sama:" -ForegroundColor Yellow
    foreach ($f in $Forwards) {
        Write-Host "  http://$lanIp`:$($f.Port)  ($($f.Name))" -ForegroundColor White
    }
}
