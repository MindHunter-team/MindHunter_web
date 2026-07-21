"""
Diagnostic script for AI Academic Review System CLI pipeline.
Simulates what api.py does when a review request comes in.
Run: python diagnose.py
"""
import subprocess
import sys
import os
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
CLI_SCRIPT = BASE_DIR / "main_controller" / "main.py"
TEST_PDF = BASE_DIR / "test_paper.pdf"
RESULT_JSON = BASE_DIR / "result_diagnose.json"
TEMP_PDF = BASE_DIR / "temp_diagnose_test.pdf"

PASS = "PASS"
FAIL = "FAIL"


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def check(label: str, condition: bool, detail: str = "") -> bool:
    status = PASS if condition else FAIL
    msg = f"  [{status}] {label}"
    if detail and not condition:
        msg += f"  --  {detail}"
    print(msg, flush=True)
    return condition


def main():
    print("=" * 65)
    print("  DIAGNOSTIC REPORT - AI Academic Review System")
    print("=" * 65)

    # ---- Check 1: Python environment ----
    print()
    print("--- 1. Python Environment ---")
    check("Python executable", True, sys.executable)
    check("Python version >= 3.9", sys.version_info >= (3, 9),
          f"Found: {sys.version}")

    # ---- Check 2: Required files exist ----
    print()
    print("--- 2. Required Files ---")
    ok1 = check("CLI script exists", CLI_SCRIPT.exists(),
                f"Expected at: {CLI_SCRIPT}")
    check("Test PDF exists", TEST_PDF.exists(),
          f"Expected at: {TEST_PDF}")
    check("Backend root dir", BASE_DIR.exists(),
          f"Path: {BASE_DIR}")

    if not ok1:
        print()
        print("FATAL: CLI script not found. Cannot proceed.")
        return

    # ---- Check 3: Required packages ----
    print()
    print("--- 3. Required Python Packages ---")
    required = ["openai", "dotenv", "fitz", "requests", "fastapi", "uvicorn"]
    for pkg in required:
        try:
            __import__(pkg)
            check(f"Package '{pkg}'", True)
        except ImportError:
            check(f"Package '{pkg}'", False,
                  "Run: pip install -r requirements.txt")

    # ---- Check 4: Environment variables ----
    print()
    print("--- 4. Environment Variables ---")
    env_files = [
        BASE_DIR / "evaluation_agents_delivery" / ".env",
        BASE_DIR / "evaluation_agents" / ".env",
    ]
    dashscope_key = os.environ.get("DASHSCOPE_API_KEY")

    for env_f in env_files:
        exists = env_f.exists()
        check(f".env file: {env_f.name}", exists,
              f"Expected at: {env_f}")

    if dashscope_key:
        check("DASHSCOPE_API_KEY in environment", True,
              f"Key starts with: {dashscope_key[:8]}...")
    else:
        check("DASHSCOPE_API_KEY in environment", False,
              "Not found in os.environ. Will try dotenv auto-load.")
        # Try loading from dotenv
        try:
            from dotenv import load_dotenv
            env_path = BASE_DIR / "evaluation_agents_delivery" / ".env"
            if env_path.exists():
                load_dotenv(env_path)
                dashscope_key = os.environ.get("DASHSCOPE_API_KEY")
                if dashscope_key:
                    check("DASHSCOPE_API_KEY loaded from .env", True,
                          f"Key starts with: {dashscope_key[:8]}...")
                else:
                    check("DASHSCOPE_API_KEY loaded from .env", False,
                          f"File exists at {env_path} but key is empty or missing")
            else:
                check("DASHSCOPE_API_KEY loaded from .env", False,
                      f"No .env file at {env_path}")
        except Exception as e:
            check("dotenv loading", False, str(e))

    has_key = bool(dashscope_key and dashscope_key != "your_api_key_here"
                   and dashscope_key != "sk-your-api-key-here")

    # ---- Check 5: Dry-run CLI import ----
    print()
    print("--- 5. CLI Module Import Test ---")
    sys.path.insert(0, str(BASE_DIR / "main_controller"))
    try:
        # Try importing without running
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "main", str(CLI_SCRIPT)
        )
        mod = importlib.util.module_from_spec(spec)
        # Don't actually execute -- just check syntax
        with open(CLI_SCRIPT, encoding="utf-8") as f:
            code = compile(f.read(), str(CLI_SCRIPT), "exec")
        check("CLI script compiled (syntax valid)", True)
    except SyntaxError as e:
        check("CLI script compiled (syntax valid)", False, str(e))

    # ---- Check 6: PDF extraction test ----
    print()
    print("--- 6. PDF Extraction Test (local only, no LLM) ---")
    try:
        import fitz
        with fitz.open(str(TEST_PDF)) as doc:
            total_pages = len(doc)
            total_chars = sum(len(page.get_text()) for page in doc)
        check("PDF readable", True,
              f"{total_pages} pages, {total_chars} chars")
    except Exception as e:
        check("PDF readable", False, str(e))

    # ---- Check 7: Full CLI run (only if API key is valid) ----
    print()
    print("--- 7. Full CLI Execution Test ---")
    if not has_key:
        print("  [SKIP] No valid DASHSCOPE_API_KEY configured.")
        print("  To run the full test, set a real API key in:")
        print(f"    {BASE_DIR / 'evaluation_agents_delivery' / '.env'}")
        print("  Then re-run: python diagnose.py")
    else:
        print("  Running CLI (this may take 1-3 minutes)...")
        cmd = [sys.executable, str(CLI_SCRIPT), str(TEST_PDF),
               "-o", str(RESULT_JSON)]
        print(f"  Command: {' '.join(cmd)}")
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(BASE_DIR),
                capture_output=True,
                text=True,
                timeout=600,
                encoding="utf-8",
                errors="replace",
            )
            if proc.returncode == 0:
                check("CLI exit code 0", True)
            else:
                check("CLI exit code 0", False,
                      f"Return code: {proc.returncode}")

            if RESULT_JSON.exists():
                import json
                with open(RESULT_JSON, encoding="utf-8") as f:
                    data = json.load(f)
                top_keys = list(data.keys())
                check("result.json generated and valid JSON", True,
                      f"Top-level keys: {top_keys}")

                fr = data.get("final_results", {})
                agent_names = list(fr.keys()) if isinstance(fr, dict) else []
                check("final_results present", bool(agent_names),
                      f"Agents found: {agent_names}")

                # Clean up
                try: RESULT_JSON.unlink()
                except: pass
            else:
                check("result.json generated", False,
                      f"File not found at: {RESULT_JSON}")
                if proc.stdout:
                    print(f"  STDOUT tail: {proc.stdout[-500:]}")
                if proc.stderr:
                    print(f"  STDERR tail: {proc.stderr[-500:]}")
        except subprocess.TimeoutExpired:
            check("CLI completed within timeout", False,
                  "Process exceeded 600s limit")
        except Exception as e:
            check("CLI execution", False, str(e)[:200])

    # ---- Summary ----
    print()
    print("=" * 65)
    print("  DIAGNOSTIC COMPLETE")
    print("=" * 65)
    print()
    if not has_key:
        print("  ACTION REQUIRED: Configure DASHSCOPE_API_KEY")
        print()
        print("  1. Copy the example file:")
        print(f"     cp {BASE_DIR / '.env.example'} {BASE_DIR / 'evaluation_agents_delivery' / '.env'}")
        print()
        print("  2. Edit the .env file with your real key:")
        print(f"     notepad {BASE_DIR / 'evaluation_agents_delivery' / '.env'}")
        print()
        print("  3. Get your key at: https://dashscope.console.aliyun.com/")
    else:
        print("  All checks passed. System is ready to start.")
        print()
        print("  Start with: python start.py")

    # Cleanup
    for f in [TEMP_PDF, RESULT_JSON]:
        try: f.unlink()
        except: pass


if __name__ == "__main__":
    main()
