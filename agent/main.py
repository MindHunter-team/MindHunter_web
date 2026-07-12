"""
MindHunter Backend — Multi-Agent Academic Bias Review System
Routes and orchestration. All engine logic lives in engines/.
"""
import asyncio
import logging
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF

from engines import (
    run_methodology_engine,
    run_logic_engine,
    run_ethics_engine,
    run_innovation_engine,
    run_arbitrator,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("mindhunter")

app = FastAPI(title="MindHunter API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_RETRIES = 2

ENGINES = {
    "methodology": run_methodology_engine,
    "logic": run_logic_engine,
    "ethics": run_ethics_engine,
    "innovation": run_innovation_engine,
}


def extract_text(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
        if len(text) > 10000:
            break
    doc.close()
    return text[:10000]


def validate_engine_result(result: dict) -> dict:
    score = result.get("score", 0)
    if not isinstance(score, (int, float)):
        try:
            score = int(score)
        except (ValueError, TypeError):
            score = 0
    score = max(0, min(100, int(score)))
    return {
        "score": score,
        "reasoning_process": str(result.get("reasoning_process", ""))[:600],
        "core_conclusion": str(result.get("core_conclusion", ""))[:200],
        "evidence": str(result.get("evidence", ""))[:800],
        "actionable_advice": str(result.get("actionable_advice", ""))[:800],
    }


def strip_internal_fields(engine_results: dict) -> dict:
    cleaned = {}
    for key, val in engine_results.items():
        cleaned[key] = {
            "score": val["score"],
            "core_conclusion": val["core_conclusion"],
            "evidence": val["evidence"],
            "actionable_advice": val["actionable_advice"],
        }
    return cleaned


@app.post("/api/review")
async def review_paper(file: UploadFile = File(...), domain: str = Form("social_sciences")):
    logger.info(f"Received: {file.filename} (domain={domain})")

    # 1. Parse PDF
    try:
        contents = await file.read()
        paper_text = extract_text(contents)
        logger.info(f"Extracted {len(paper_text)} chars")
    except Exception as e:
        logger.error(f"PDF parsing failed: {e}")
        return {"error": f"PDF parsing failed: {str(e)}"}

    # 2. Concurrent review
    engine_results = {}
    tasks = [run_fn(paper_text) for run_fn in ENGINES.values()]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    for (name, _), raw in zip(ENGINES.items(), raw_results):
        if isinstance(raw, Exception):
            logger.error(f"[{name}] Exception: {raw}")
            engine_results[name] = {
                "score": 0,
                "reasoning_process": f"Engine crashed: {str(raw)[:200]}",
                "core_conclusion": "Engine execution failed.",
                "evidence": "",
                "actionable_advice": "",
            }
        else:
            engine_results[name] = validate_engine_result(raw)

    # 3. Arbitration with feedback pass-back
    retry_round = 0
    for retry_round in range(MAX_RETRIES + 1):
        logger.info(f"Arbitration round {retry_round + 1}/{MAX_RETRIES + 1}")

        arb_result = await run_arbitrator(engine_results)
        approved = arb_result.get("approved", True)
        conflicts = arb_result.get("conflicts", [])
        feedback = arb_result.get("feedback_to_engines", {})

        if approved or not conflicts:
            logger.info(f"Arbitration approved after {retry_round} retry round(s).")
            break

        logger.info(f"Conflicts: {conflicts}. Re-reviewing with feedback...")
        re_tasks = []
        re_keys = []
        for key in conflicts:
            if key in ENGINES:
                fb = feedback.get(key, "") if isinstance(feedback, dict) else ""
                re_tasks.append(ENGINES[key](paper_text, feedback=fb))
                re_keys.append(key)

        if not re_tasks:
            break

        re_raw = await asyncio.gather(*re_tasks, return_exceptions=True)
        for key, raw in zip(re_keys, re_raw):
            if isinstance(raw, Exception):
                logger.error(f"[{key}] Re-review exception: {raw}")
            else:
                engine_results[key] = validate_engine_result(raw)

    # 4. Build frontend response (strip reasoning_process)
    cleaned = strip_internal_fields(engine_results)
    overall = sum(r["score"] for r in cleaned.values()) / 4
    bias_level = "Moderate-Low" if overall >= 75 else "Moderate-High"

    return {
        "overallScore": round(overall, 1),
        "biasLevel": bias_level,
        "retryCount": retry_round,
        "engines": cleaned,
    }


@app.get("/api/health")
async def health():
    return {"status": "ok"}
