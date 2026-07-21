@echo off
chcp 65001 >nul
title AI Academic Review System

echo ============================================
echo   AI Academic Review System - One-Click Start
echo ============================================
echo.
echo [1/3] Installing backend dependencies...
echo.
pip install -r backend/requirements.txt -q
if %errorlevel% neq 0 (
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Starting server...
echo.
start http://127.0.0.1:8000

echo [3/3] Launching at http://127.0.0.1:8000
echo.
echo Press Ctrl+C to stop the server.
echo.

cd /d "%~dp0\backend"
python -m uvicorn api:app --host 127.0.0.1 --port 8000
pause
