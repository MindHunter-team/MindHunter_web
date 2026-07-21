"""
One-click launcher for AI Academic Review System.
Starts the FastAPI backend (port 8000) and Vite frontend (port 5173) concurrently.
Press Ctrl+C to stop both services gracefully.

Improvements:
  - Clears port 8000 before starting (kills orphan processes).
  - Waits for /api/health to respond before declaring success.
  - Falls back to 'python -m uvicorn' if 'uvicorn.exe' is not found.
"""
import subprocess
import sys
import os
import time
import signal
import webbrowser
import socket

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

BACKEND_PORT = 8000
FRONTEND_PORT = 5173

processes = []


def log(msg: str) -> None:
    print(f"[start.py] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Port management helpers
# ---------------------------------------------------------------------------
def _find_pid_on_port(port: int) -> int | None:
    """Return the PID listening on the given port, or None if free."""
    if os.name != "nt":
        return None
    import subprocess as sp
    try:
        out = sp.check_output(
            ["netstat", "-ano"], text=True, encoding="utf-8", errors="replace"
        )
    except Exception:
        return None
    for line in out.splitlines():
        if f":{port}" in line and "LISTENING" in line:
            parts = line.strip().split()
            try:
                return int(parts[-1])
            except (ValueError, IndexError):
                pass
    return None


def kill_port(port: int) -> bool:
    """Kill the process occupying the given port. Returns True if killed."""
    pid = _find_pid_on_port(port)
    if pid is None:
        return False
    log(f"Port {port} is occupied by PID {pid}. Killing...")
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                           capture_output=True, timeout=10)
        else:
            os.kill(pid, signal.SIGKILL)
        time.sleep(1.5)
        if _find_pid_on_port(port) is not None:
            log(f"WARNING: Port {port} still occupied after kill attempt")
            return False
        log(f"Port {port} freed.")
        return True
    except Exception as exc:
        log(f"WARNING: Could not kill PID {pid}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Service launchers
# ---------------------------------------------------------------------------
def launch_backend() -> subprocess.Popen:
    """Start uvicorn in the backend directory. Tries uvicorn.exe first,
    falls back to python -m uvicorn."""
    log("Starting backend (FastAPI + uvicorn) ...")

    # Try direct uvicorn first
    uvicorn_cmd = "uvicorn.exe" if os.name == "nt" else "uvicorn"
    cmd = [uvicorn_cmd, "api:app", "--host", "0.0.0.0", "--port", str(BACKEND_PORT)]

    # Verify uvicorn is reachable; fall back to sys.executable -m uvicorn
    try:
        subprocess.run([uvicorn_cmd, "--version"], capture_output=True,
                       timeout=5, check=True)
    except Exception:
        log("uvicorn.exe not found directly, falling back to python -m uvicorn")
        cmd = [sys.executable, "-m", "uvicorn", "api:app",
               "--host", "0.0.0.0", "--port", str(BACKEND_PORT)]

    proc = subprocess.Popen(
        cmd,
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    processes.append(("backend", proc))
    log("Backend process started (pid=%s)" % proc.pid)
    return proc


def launch_frontend() -> subprocess.Popen:
    """Start Vite dev server in the frontend directory."""
    log("Starting frontend (Vite + React) ...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    cmd = [npm_cmd, "run", "dev", "--", "--host", "0.0.0.0"]
    proc = subprocess.Popen(
        cmd,
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    processes.append(("frontend", proc))
    log("Frontend process started (pid=%s)" % proc.pid)
    return proc


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
def wait_for_backend(timeout: float = 30.0) -> bool:
    """Poll /api/health until the backend responds or timeout is reached."""
    import urllib.request
    import urllib.error
    url = f"http://localhost:{BACKEND_PORT}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = urllib.request.urlopen(url, timeout=2)
            if resp.status == 200:
                return True
        except (urllib.error.URLError, socket.timeout, OSError):
            pass
        time.sleep(1)
    return False


# ---------------------------------------------------------------------------
# Shutdown
# ---------------------------------------------------------------------------
def shutdown() -> None:
    """Kill all tracked child processes."""
    log("Shutting down...")
    for name, proc in processes:
        if proc.poll() is None:
            log("Terminating %s (pid=%s)..." % (name, proc.pid))
            try:
                if os.name == "nt":
                    proc.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    proc.terminate()
            except Exception:
                pass
    time.sleep(1)
    for name, proc in processes:
        if proc.poll() is None:
            log("Force-killing %s (pid=%s)..." % (name, proc.pid))
            try:
                proc.kill()
            except Exception:
                pass
    log("All services stopped.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    log("=" * 60)
    log("AI Academic Review System - Starting All Services")
    log("=" * 60)

    if not os.path.isdir(BACKEND_DIR):
        log("ERROR: backend/ directory not found in %s" % BASE_DIR)
        sys.exit(1)
    if not os.path.isdir(FRONTEND_DIR):
        log("ERROR: frontend/ directory not found in %s" % BASE_DIR)
        sys.exit(1)

    # --- Clear stale port ---
    kill_port(BACKEND_PORT)
    kill_port(FRONTEND_PORT)

    try:
        backend = launch_backend()
        frontend = launch_frontend()

        # --- Forward child stdout to console immediately (must be before
        #     any blocking wait, otherwise the pipe buffer fills up) ---
        import threading

        def forward_output(name, proc):
            try:
                for line in iter(proc.stdout.readline, ""):
                    if line:
                        print("[%s] %s" % (name, line.rstrip()), flush=True)
            except Exception:
                pass

        threading.Thread(target=forward_output, args=("backend", backend), daemon=True).start()
        threading.Thread(target=forward_output, args=("frontend", frontend), daemon=True).start()

        log("-" * 60)
        log("Services are starting up...")
        log("  Backend API  : http://localhost:%d" % BACKEND_PORT)
        log("  Frontend App : http://localhost:%d" % FRONTEND_PORT)
        log("  API Docs     : http://localhost:%d/docs" % BACKEND_PORT)
        log("")

        # --- Wait for backend health check ---
        log("Waiting for backend health check (up to 30s)...")
        if wait_for_backend(timeout=30):
            log("Backend is ready.")
        else:
            log("WARNING: Backend did not respond to health check within 30s.")
            log("The backend process may have crashed. Check output above.")
            if backend.poll() is not None:
                log("Backend process already exited with code %s" % backend.returncode)

        # --- Open browser ---
        log("Waiting 3 seconds for frontend to be ready...")
        time.sleep(3)
        try:
            webbrowser.open(f"http://localhost:{FRONTEND_PORT}")
            log("Browser opened at http://localhost:%d" % FRONTEND_PORT)
        except Exception:
            log("Could not auto-open browser. Please open http://localhost:%d manually." % FRONTEND_PORT)

        log("Press Ctrl+C to stop all services.")
        log("-" * 60)

        # --- Monitor ---
        while backend.poll() is None and frontend.poll() is None:
            time.sleep(0.5)

        log("A service exited unexpectedly. Shutting down...")
        shutdown()

    except KeyboardInterrupt:
        log("Interrupted by user.")
        shutdown()
    except Exception as exc:
        log("ERROR: %s" % exc)
        shutdown()
        sys.exit(1)


if __name__ == "__main__":
    main()
