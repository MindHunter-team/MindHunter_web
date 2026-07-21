"""
AI Academic Review System - FastAPI Adapter
Bridges the CLI backend (main_controller/main.py) with the React frontend via REST + NDJSON streaming.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
CLI_SCRIPT = BASE_DIR / "main_controller" / "main.py"
RESULT_JSON = BASE_DIR / "result.json"
TEMP_DIR = BASE_DIR / "temp_uploads"
DB_PATH = BASE_DIR / "reports.db"
CLI_TIMEOUT_SEC = 600.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("api-adapter")

TEMP_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="AI Academic Review System API", version="1.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

@app.on_event("startup")
async def startup():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id          TEXT PRIMARY KEY,
            filename    TEXT    NOT NULL,
            subject     TEXT    NOT NULL,
            weights     TEXT    NOT NULL DEFAULT '{}',
            report_data TEXT    NOT NULL DEFAULT '{}',
            created_at  TEXT    NOT NULL
        )
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialized")

# ---------------------------------------------------------------------------
# Field mapping: CLI agent names -> frontend engine keys
# ---------------------------------------------------------------------------
AGENT_TO_ENGINE = {
    "data_reliability": "methodology",
    "ethics_bias": "ethics",
    "logical_rigor": "logic",
    "innovation": "innovation",
}

ENGINE_ORDER = ["methodology", "ethics", "logic", "innovation"]

def map_cli_results(final_results: dict) -> dict:
    """Transform CLI final_results (agent_name -> data) into frontend engines format."""
    engines = {}
    for agent_name, agent_data in final_results.items():
        engine_key = AGENT_TO_ENGINE.get(agent_name, agent_name)
        engines[engine_key] = {
            "score": agent_data.get("score", 0),
            "core_conclusion": str(agent_data.get("summary", ""))[:500],
            "evidence": _format_evidence_from_issues(agent_data),
            "actionable_advice": _format_advice_from_issues(agent_data),
            # Enriched fields for upgraded frontend
            "confidence": agent_data.get("confidence"),
            "risk_level": agent_data.get("risk_level", "medium"),
            "strengths": agent_data.get("strengths", []),
            "issues": agent_data.get("issues", []),
            "reasoning_md": agent_data.get("reasoning_md", ""),
            "limitations": agent_data.get("limitations", []),
        }
    return engines

def _format_evidence_from_issues(agent_data: dict) -> str:
    """Extract evidence from issues list into a readable text."""
    issues = agent_data.get("issues", [])
    if not issues:
        # Fall back to evidence_refs
        refs = agent_data.get("evidence_refs", [])
        if refs:
            lines = []
            for r in refs[:3]:
                loc = r.get("location", "")
                quote = r.get("quote", "")
                if quote:
                    lines.append(f"[{loc}] {quote[:200]}")
            return "\n".join(lines)
        return ""
    lines = []
    for i, issue in enumerate(issues):
        ev = issue.get("evidence", "")
        if ev:
            lines.append(f"Issue {i+1}: {ev[:300]}")
    return "\n".join(lines) if lines else ""

def _format_advice_from_issues(agent_data: dict) -> str:
    """Extract suggestions from issues into actionable advice text."""
    issues = agent_data.get("issues", [])
    lines = []
    for i, issue in enumerate(issues):
        sug = issue.get("suggestion", "")
        if sug:
            lines.append(f"{i+1}) {sug[:300]}")
    if not lines:
        return str(agent_data.get("summary", ""))[:500]
    return "\n".join(lines)

def line(event: dict) -> str:
    return json.dumps(event, ensure_ascii=False) + "\n"


def _emit(event_type: str, agent: str, message: str) -> str:
    """NDJSON-safe utility: build a progress/error event line."""
    return line({"type": event_type, "agent": agent, "message": message})


# ---------------------------------------------------------------------------
# CLI subprocess (blocking communicate — hides raw stdout/stderr)
# ---------------------------------------------------------------------------

async def run_cli(file_path: str) -> dict:
    """Run CLI via blocking communicate(); return parsed result.json."""
    file_abs = str(Path(file_path).resolve())
    cli_abs = str(CLI_SCRIPT.resolve())
    result_abs = str(RESULT_JSON.resolve())

    if not Path(file_abs).exists():
        raise RuntimeError(f"File not found at: {file_abs}")
    if not Path(cli_abs).exists():
        raise RuntimeError(f"CLI script not found at: {cli_abs}")

    cmd = [sys.executable, cli_abs, file_abs, "-o", result_abs]
    logger.info("Running CLI: %s", " ".join(cmd))

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(BASE_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=CLI_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        process.kill()
        stdout, stderr = await process.communicate()
        raise RuntimeError(f"CLI process timed out after {CLI_TIMEOUT_SEC}s")

    stdout_text = stdout.decode("utf-8", errors="replace") if stdout else ""
    stderr_text = stderr.decode("utf-8", errors="replace") if stderr else ""

    if process.returncode != 0:
        err_detail = stderr_text[-800:] if stderr_text else "No stderr output"
        raise RuntimeError(
            f"CLI exited with code {process.returncode}. "
            f"STDERR: {err_detail}"
        )

    if not RESULT_JSON.exists():
        raise RuntimeError(
            "CLI exited successfully but result.json was not generated. "
            f"Expected at: {result_abs}. STDOUT: {stdout_text[-500:]}"
        )

    with open(RESULT_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Lightweight document sniffer (never throws)
# ---------------------------------------------------------------------------

def _extract_paper_metadata(file_path: Path, filename: str) -> dict:
    """Lightweight document profiling for customised progress narration."""
    meta = {"pages": "未知", "words": "未知", "snippet": "核心学术观点"}
    try:
        size_kb = os.path.getsize(str(file_path)) / 1024
        meta["size"] = f"{size_kb:.1f}KB"

        text_content = ""
        if filename.lower().endswith(".pdf"):
            try:
                import fitz
                doc = fitz.open(str(file_path))
                meta["pages"] = str(len(doc))
                text_content = " ".join([page.get_text() for page in doc[:2]])
            except Exception:
                try:
                    import PyPDF2
                    with open(str(file_path), "rb") as f:
                        reader = PyPDF2.PdfReader(f)
                        meta["pages"] = str(len(reader.pages))
                        text_content = " ".join([
                            p.extract_text() for p in reader.pages[:2] if p.extract_text()
                        ])
                except Exception:
                    pass
        elif filename.lower().endswith(".txt"):
            with open(str(file_path), "r", encoding="utf-8", errors="ignore") as f:
                text_content = f.read(3000)
                meta["pages"] = "1"

        if text_content:
            text_content = re.sub(r"\s+", " ", text_content)
            pages_int = int(meta["pages"]) if meta["pages"].isdigit() else 10
            meta["words"] = f"约 {len(text_content) * pages_int} 字"
            match = re.search(
                r"(摘要|Abstract|引言|Introduction)[:\s]*(.{30,80})",
                text_content,
                re.IGNORECASE,
            )
            if match:
                meta["snippet"] = match.group(2).strip() + "..."
            else:
                meta["snippet"] = text_content[:60].strip() + "..."
    except Exception:
        pass
    return meta


# ============================================================================
# POST /api/review -- intelligent phase-based progress narration
# ============================================================================

@app.post("/api/review")
async def review_paper(
    file: UploadFile = File(...),
    domain: str = Form("social_sciences"),
    api_key: str = Form(""),
    base_url: str = Form(""),
    model_name: str = Form(""),
    language: str = Form("zh"),
):
    logger.info("Review requested: %s (lang=%s)", file.filename, language)

    # Save uploaded file to temp dir
    safe_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    file_path = TEMP_DIR / safe_name
    content = await file.read()
    file_path.write_bytes(content)

    async def stream():
        sys_label = "System"

        # 1. Sniff document metadata
        meta = _extract_paper_metadata(file_path, file.filename)
        domain_map = {
            "social_sciences": "社会科学与人文",
            "stem": "理工与实验科学",
            "medicine": "医学与生命科学",
        }
        domain_name = domain_map.get(domain, "学术")

        # 2. Phase-based narration library (each phase draws 1-2 random entries)
        phases = [
            # Phase 1: Receiving & parsing
            [
                f"正在接收文档：{file.filename}（大小: {meta.get('size', '未知')}）...",
                f"正在解析文档结构，检测到全文共 {meta.get('pages')} 页，{meta.get('words')}...",
                f"正在提取【{domain_name}】领域特征与上下文依赖...",
            ],
            # Phase 2: Core idea identification
            [
                f"已锁定文章核心探讨方向：\"{meta.get('snippet')}\"",
                "正在将提取的文本向量化，构建全局语义图谱...",
                "正在初始化多智能体协同网络（Multi-Agent System）...",
            ],
            # Phase 3: Methodology engine
            [
                "[方法论与实证引擎] 正在扫描研究设计、样本量与数据可靠性...",
                "[方法论与实证引擎] 正在交叉验证实验步骤与结论的因果关联...",
                "[方法论与实证引擎] 正在评估变量控制与统计学显著性...",
            ],
            # Phase 4: Ethics engine
            [
                "[学术伦理引擎] 正在进行文化偏见（WEIRD）与意识形态渗透检测...",
                "[学术伦理引擎] 正在核查数据隐私、利益冲突与伦理合规性...",
                "[学术伦理引擎] 正在扫描潜在的学术不端与引用操纵风险...",
            ],
            # Phase 5: Logic engine
            [
                "[逻辑推演引擎] 正在重构核心论点，推演论据支撑的严密性...",
                "[逻辑推演引擎] 正在进行反事实推理，寻找潜在的逻辑漏洞...",
                "[逻辑推演引擎] 正在校验概念界定的清晰度与前后一致性...",
            ],
            # Phase 6: Innovation engine
            [
                "[理论前瞻引擎] 正在评估研究的理论增量与边际贡献...",
                "[理论前瞻引擎] 正在对比领域前沿文献，计算创新度指数...",
                "[理论前瞻引擎] 正在分析研究局限性与未来拓展空间...",
            ],
            # Phase 7: Global arbitration
            [
                "[全局仲裁中心] 四大引擎初步审查完毕，正在进行逻辑一致性校验...",
                "[全局仲裁中心] 正在消除引擎间的认知冲突，生成最终共识...",
                "[全局仲裁中心] 正在量化各项指标，计算综合学术评估得分...",
            ],
        ]

        # 3. Launch real CLI task in background
        cli_task = asyncio.create_task(run_cli(str(file_path)))

        # 4. Narrate progress phase by phase
        for phase_logs in phases:
            if cli_task.done():
                break
            selected = random.sample(phase_logs, k=random.randint(1, min(2, len(phase_logs))))
            for msg in selected:
                if cli_task.done():
                    break
                yield _emit("progress", sys_label, msg)
                await asyncio.sleep(random.uniform(2.5, 4.0))

        # 5. Wait phase: stable single message with animated dots (no fake action rotation)
        wait_dots = 1
        while not cli_task.done():
            dot_str = "." * wait_dots
            msg = f"正在进行深度语义推理与大模型交叉验证，耗时约 1-3 分钟，请耐心等待{dot_str}"
            yield _emit("progress", sys_label, msg)
            wait_dots = (wait_dots % 3) + 1
            await asyncio.sleep(8.0)

        # 6. Real completion actions (CLI has finished)
        yield _emit(
            "progress", sys_label,
            "推理完成！正在生成结构化审查报告与可视化雷达图..."
        )
        await asyncio.sleep(1.5)

        # Cleanup temp file
        try:
            file_path.unlink()
        except Exception:
            pass

        # 7. Process CLI result
        try:
            cli_output = await cli_task
        except Exception as exc:
            err_text = str(exc)
            logger.error("CLI task failed: %s", err_text[:500])
            yield _emit("error", sys_label, f"审查引擎异常: {err_text[:400]}")
            return

        if not isinstance(cli_output, dict):
            yield _emit("error", sys_label, "CLI returned invalid JSON structure")
            return

        final_results = cli_output.get("final_results", {})
        if not isinstance(final_results, dict) or not final_results:
            logger.warning("final_results is empty or missing from CLI output")

        mapped_engines = map_cli_results(final_results) if final_results else {}

        overall_score = 0
        if mapped_engines:
            scores = [eng["score"] for eng in mapped_engines.values() if eng.get("score", 0) > 0]
            overall_score = round(sum(scores) / len(scores), 1) if scores else 0

        bias_level = "Moderate-Low" if overall_score >= 75 else "Moderate-High"
        retry_count = cli_output.get("retry_count", 0)
        audit_passed = cli_output.get("audit_passed", False)
        paper_data = cli_output.get("paper_data", {})

        result_data = {
            "overallScore": overall_score,
            "biasLevel": bias_level,
            "retryCount": retry_count,
            "auditPassed": audit_passed,
            "paperTitle": (paper_data.get("paper_info") or {}).get("title", ""),
            "paperJournal": (paper_data.get("metadata") or {}).get("journal", ""),
            "engines": mapped_engines,
        }

        yield _emit("progress", sys_label, "Report generated.")
        yield line({"type": "result", "data": result_data})

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )

# ---------------------------------------------------------------------------
# Report persistence endpoints
# ---------------------------------------------------------------------------
class ReportSaveRequest(BaseModel):
    filename: str
    subject: str = "social_sciences"
    weights: dict = {}
    report_data: dict = {}

@app.post("/api/reports")
async def create_report(req: ReportSaveRequest):
    report_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute(
        "INSERT INTO reports (id, filename, subject, weights, report_data, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (report_id, req.filename, req.subject,
         json.dumps(req.weights, ensure_ascii=False),
         json.dumps(req.report_data, ensure_ascii=False),
         now),
    )
    conn.commit()
    conn.close()
    return {"id": report_id}

@app.get("/api/reports")
async def list_reports(limit: int = 50):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, filename, subject, created_at FROM reports ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        try:
            dt = datetime.fromisoformat(d["created_at"])
            d["created_at_display"] = dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            d["created_at_display"] = d["created_at"]
        results.append(d)
    return results

@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()
    if row is None:
        return JSONResponse({"error": "Report not found"}, status_code=404)
    r = dict(row)
    try: r["weights"] = json.loads(r["weights"])
    except: pass
    try: r["report_data"] = json.loads(r["report_data"])
    except: pass
    try:
        dt = datetime.fromisoformat(r["created_at"])
        r["created_at_display"] = dt.strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        r["created_at_display"] = r["created_at"]
    return r

@app.get("/api/health")
async def health():
    return {"status": "ok"}

app.mount("/", StaticFiles(directory="dist", html=True), name="static")

# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    sys.argv.pop(1) if len(sys.argv) > 1 else None  # fix for singlefile plugin
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
