@echo off
REM ====================================================================
REM recover_ollama.bat
REM ====================================================================
REM Wrapper buat double-click. Forward ke PowerShell script utama.
REM Untuk pemanggilan dari Bash, panggil .ps1 langsung pakai powershell.exe.
REM ====================================================================

powershell -ExecutionPolicy Bypass -File "%~dp0recover_ollama.ps1"
exit /b %ERRORLEVEL%
