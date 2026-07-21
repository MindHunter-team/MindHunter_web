"""
API Probe -- Tests the FastAPI /api/review streaming endpoint.
Run: python test_api.py

This script uploads test_paper.pdf and prints every NDJSON line
from the streaming response, including any error events.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"
TEST_PDF = BACKEND_DIR / "test_paper.pdf"
API_URL = "http://localhost:8000/api/review"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main():
    print("=" * 60)
    print("  API PROBE -- /api/review streaming test")
    print("=" * 60)

    # ---- Check preconditions ----
    print()
    print("--- Preconditions ---")
    if not TEST_PDF.exists():
        print(f"  FAIL: Test PDF not found at: {TEST_PDF}")
        print(f"  Please place a PDF at: {TEST_PDF}")
        sys.exit(1)
    print(f"  OK: Test PDF found ({TEST_PDF.stat().st_size} bytes)")

    # Check health endpoint first
    try:
        r = requests.get("http://localhost:8000/api/health", timeout=5)
        if r.status_code == 200:
            print(f"  OK: /api/health -> {r.json()}")
        else:
            print(f"  FAIL: /api/health -> HTTP {r.status_code}: {r.text[:200]}")
            print(f"  Is the backend running? Run: cd backend && uvicorn api:app --host 0.0.0.0 --port 8000")
            sys.exit(1)
    except requests.ConnectionError:
        print("  FAIL: Cannot connect to http://localhost:8000")
        print("  Start the backend first:")
        print("    cd backend && uvicorn api:app --host 0.0.0.0 --port 8000")
        sys.exit(1)

    # ---- Send review request ----
    print()
    print("--- Sending POST /api/review ---")
    print(f"  PDF: {TEST_PDF}")
    print(f"  URL: {API_URL}")

    try:
        with open(TEST_PDF, "rb") as f:
            files = {"file": (TEST_PDF.name, f, "application/pdf")}
            data = {
                "domain": "stem",
                "api_key": "test-key",
                "base_url": "https://api.example.com/v1",
                "model_name": "gpt-4o",
                "language": "zh",
            }
            response = requests.post(
                API_URL, files=files, data=data, stream=True, timeout=600
            )
    except requests.ConnectionError:
        print("  FAIL: Connection refused -- is uvicorn running?")
        sys.exit(1)

    print(f"  HTTP Status: {response.status_code}")
    if response.status_code != 200:
        print(f"  Response body: {response.text[:1000]}")
        print()
        print("  BACKEND RETURNED NON-200. Check uvicorn terminal for traceback.")
        sys.exit(1)

    print()
    print("--- Streaming Response (NDJSON lines) ---")

    line_count = 0
    has_error = False
    has_result = False

    try:
        for raw_line in response.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line_count += 1
            try:
                event = json.loads(raw_line)
            except json.JSONDecodeError:
                print(f"  [line {line_count}] PARSE FAIL: {raw_line[:120]}")
                continue

            evt_type = event.get("type", "?")
            agent = event.get("agent", "")
            message = event.get("message", "")
            chunk = event.get("chunk", "")
            data = event.get("data")

            # Format output
            prefix = f"[{agent}]" if agent else ""
            if evt_type == "progress":
                print(f"  [{line_count}] PROGRESS {prefix} {message[:120]}")
            elif evt_type == "chunk":
                print(f"  [{line_count}] CHUNK   {prefix} {chunk[:120]}")
            elif evt_type == "result":
                has_result = True
                if data and isinstance(data, dict):
                    engines = data.get("engines", {})
                    scores = {k: v.get("score", "?") for k, v in engines.items()}
                    print(f"  [{line_count}] RESULT  overallScore={data.get('overallScore')} scores={scores}")
                else:
                    print(f"  [{line_count}] RESULT  {str(event)[:200]}")
            elif evt_type == "error":
                has_error = True
                print(f"  [{line_count}] ERROR   {prefix} {message}")
            elif evt_type == "chunk_end":
                print(f"  [{line_count}] CHUNK_END {prefix} score={event.get('score')}")
            else:
                print(f"  [{line_count}] {evt_type} {str(event)[:150]}")

    except requests.exceptions.ChunkedEncodingError as e:
        print(f"  STREAM BROKEN: {e}")
    except Exception as e:
        print(f"  READ ERROR: {type(e).__name__}: {e}")

    # ---- Summary ----
    print()
    print("=" * 60)
    print(f"  Lines received : {line_count}")
    print(f"  Errors detected: {'YES' if has_error else 'NO'}")
    print(f"  Result received : {'YES' if has_result else 'NO'}")
    print("=" * 60)

    if has_error:
        print()
        print("  ACTION: The error message above tells you what failed.")
        print("  Common causes:")
        print("  1. No valid DASHSCOPE_API_KEY in evaluation_agents_delivery/.env")
        print("  2. Missing Python packages in the subprocess environment")
        print("  3. CLI script crashed (check uvicorn terminal for traceback)")
    elif not has_result:
        print()
        print("  ACTION: No result event received. The stream may have hung.")
        print("  Check uvicorn terminal for traceback.")
    else:
        print()
        print("  SUCCESS: Review completed and result received.")


if __name__ == "__main__":
    main()
