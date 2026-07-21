#!/bin/bash
# AI Academic Review System - One-Click Start (Mac/Linux)

cd "$(dirname "$0")"

echo "============================================"
echo "  AI Academic Review System - One-Click Start"
echo "============================================"
echo ""

echo "[1/3] Installing backend dependencies..."
echo ""
pip3 install -r backend/requirements.txt -q
if [ $? -ne 0 ]; then
    echo "ERROR: Dependency installation failed."
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "[2/3] Starting server..."
echo ""
open http://127.0.0.1:8000 2>/dev/null || echo "Opening browser at http://127.0.0.1:8000"

echo "[3/3] Launching at http://127.0.0.1:8000"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

cd backend
python3 -m uvicorn api:app --host 127.0.0.1 --port 8000
