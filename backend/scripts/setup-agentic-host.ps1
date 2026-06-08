# Set up the agentic_crawler in a host-side Python 3.11+ venv.
# This avoids rebuilding the heavy Docker image just to iterate on agentic code.
#
# Prerequisites on the host:
#   - Python 3.11 or newer (verify: `python --version`)
#   - Docker compose stack already running for the base services (redis, chroma,
#     autocrawl-db) — those expose ports to localhost via the recent compose update.
#
# Run once:
#   .\backend\scripts\setup-agentic-host.ps1
#
# After setup, run the agentic crawler with:
#   .\backend\.venv-agentic\Scripts\Activate.ps1
#   agentic-crawl seeds      # verify YAML loaded
#   agentic-crawl run        # one-shot
#   agentic-crawl schedule   # 24/7 loop (Ctrl-C to stop)

$ErrorActionPreference = "Stop"

$BackendDir = Split-Path -Parent $PSScriptRoot
$VenvDir = Join-Path $BackendDir ".venv-agentic"

Write-Host "[setup-agentic] Backend dir: $BackendDir" -ForegroundColor Cyan

# 1. Verify Python 3.11+
$pyVersion = & python --version 2>&1
Write-Host "[setup-agentic] Python: $pyVersion" -ForegroundColor Cyan
$versionMatch = [regex]::Match($pyVersion, "(\d+)\.(\d+)\.(\d+)")
if (-not $versionMatch.Success) {
    throw "Could not parse Python version from: $pyVersion"
}
$major = [int]$versionMatch.Groups[1].Value
$minor = [int]$versionMatch.Groups[2].Value
if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 11)) {
    throw "Python 3.11+ required (got $major.$minor). Install from python.org and ensure it's on PATH."
}

# 2. Create venv
if (-not (Test-Path $VenvDir)) {
    Write-Host "[setup-agentic] Creating venv at $VenvDir" -ForegroundColor Cyan
    & python -m venv $VenvDir
} else {
    Write-Host "[setup-agentic] Venv already exists at $VenvDir — reusing" -ForegroundColor Yellow
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

# 3. Upgrade pip + install crawler with agentic extra
Write-Host "[setup-agentic] Installing autocrawler[agentic] in editable mode..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -e ".[agentic]"
} finally {
    Pop-Location
}

# 4. Install Playwright Chromium (Browser-Use needs it)
Write-Host "[setup-agentic] Installing Playwright Chromium..." -ForegroundColor Cyan
& $VenvPython -m playwright install chromium

# 5. Print activation instructions
Write-Host ""
Write-Host "[setup-agentic] DONE." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Make sure docker compose services are up (redis, chroma, autocrawl-db, ollama LAN reachable):"
Write-Host "       docker compose up -d redis chroma autocrawl-db"
Write-Host ""
Write-Host "  2. Activate the venv:"
Write-Host "       .\backend\.venv-agentic\Scripts\Activate.ps1"
Write-Host ""
Write-Host "  3. Set host-side env overrides (services on localhost, not docker DNS):"
Write-Host "       `$env:REDIS_URL = 'redis://localhost:6379/0'"
Write-Host "       `$env:CHROMA_HOST = 'localhost'"
Write-Host "       `$env:DATABASE_URL = 'postgresql+asyncpg://postgres:123@localhost:5432/autocrawl'"
Write-Host "       `$env:AGENTIC_ENABLED = 'true'"
Write-Host "       `$env:AGENTIC_HEADLESS = 'false'  # see browser when iterating"
Write-Host ""
Write-Host "  4. Run:"
Write-Host "       agentic-crawl seeds"
Write-Host "       agentic-crawl run --seed-name '<name from yaml>'"
Write-Host "       agentic-crawl schedule    # 24/7 loop, Ctrl-C to stop"
