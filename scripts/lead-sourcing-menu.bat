@echo off
title Lead-Sourcing Control Center (Unified TypeScript + Cloudflare)
cd /d "%~dp0\.."
if exist "backend\venv\Scripts\python.exe" (
    "backend\venv\Scripts\python.exe" "scripts\lead_manager.py" %*
) else (
    python "scripts\lead_manager.py" %*
)
pause
