# -*- coding: utf-8 -*-
"""
AI学术审查系统 System Main Controller (main.py)
=============================================
Integration of A (data processing), B_X (evaluation_agents_delivery), C (audit agent).
- B_X service: evaluate_paper() with built-in validation & retry
- While-loop retry based on audit results
"""

from __future__ import annotations

import json
import os
import sys
import time
import logging
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Path setup: add A, B_X, C modules to sys.path
# ---------------------------------------------------------------------------
D_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = D_DIR.parent
A_DIR = PROJECT_ROOT / "data_processing"
B_X_DIR = PROJECT_ROOT / "evaluation_agents_delivery"
C_DIR = PROJECT_ROOT / "audit_agent"

for p in (A_DIR, B_X_DIR, C_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from data_processor import process_document  # noqa: E402
from audit_agent import AuditAgent       # noqa: E402
from service import evaluate_paper       # noqa: E402  (from evaluation_agents_delivery)

# Load env from B_X module
load_dotenv(B_X_DIR / ".env")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("AI学术审查系统-Main")

# ---------------------------------------------------------------------------
# Global config
# ---------------------------------------------------------------------------
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY")
MAX_RETRIES = 3

AGENT_NAMES = ["data_reliability", "ethics_bias", "logical_rigor", "innovation"]

# B_X agent name -> C engine key mapping (for audit agent compatibility)
B_TO_C = {
    "data_reliability": "methodology",
    "ethics_bias": "ethics",
    "logical_rigor": "logic",
    "innovation": "innovation",
}
C_TO_B = {v: k for k, v in B_TO_C.items()}


# ---------------------------------------------------------------------------
# Audit agent format conversion helpers
# ---------------------------------------------------------------------------
def _extract_agent_results(service_response: dict) -> dict[str, dict]:
    """
    Extract the 'result' field from each agent's service response,
    producing a flat dict suitable for audit agent input.
    """
    extracted = {}
    for agent_name in AGENT_NAMES:
        agent_data = service_response.get(agent_name, {})
        result = agent_data.get("result")
        if result is not None:
            extracted[agent_name] = result
        else:
            # Agent failed — provide a placeholder with error info
            errors = agent_data.get("errors", [])
            extracted[agent_name] = {
                "score": 0,
                "summary": f"Agent 调用失败: {'; '.join(errors)}",
            }
    return extracted


def _map_to_c_format(agent_results: dict[str, dict]) -> dict[str, dict]:
    """Map B_X agent results to C audit agent format (methodology/logic/ethics/innovation)."""
    return {B_TO_C[name]: result for name, result in agent_results.items() if name in B_TO_C}


def _map_back_to_b_format(audited_results: dict[str, dict]) -> dict[str, dict]:
    """Map C audit results back to B_X agent name format."""
    return {C_TO_B[key]: result for key, result in audited_results.items() if key in C_TO_B}


# ---------------------------------------------------------------------------
# Step C: Audit + while-loop retry
# ---------------------------------------------------------------------------
def _check_audit_quality(audit_log: dict) -> tuple[bool, str]:
    fact_check = audit_log.get("fact_check_summary", "")
    conflict = audit_log.get("conflict_resolution_summary", "")

    pass_keywords = [
        "无幻觉", "未发现幻觉",
        "无假证据", "未发现假证据",
        "无冲突", "未发现冲突",
        "无矛盾", "未发现严重矛盾",
        "所有证据均真实",
        "证据均存在",
        "全部通过", "无需修正",
    ]

    has_fact_issue = fact_check and not any(kw in fact_check for kw in pass_keywords)
    has_conflict = conflict and not any(kw in conflict for kw in pass_keywords)

    if has_fact_issue or has_conflict:
        parts = []
        if has_fact_issue:
            parts.append(f"Fact-check: {fact_check[:200]}")
        if has_conflict:
            parts.append(f"Conflict: {conflict[:200]}")
        return False, "; ".join(parts)

    return True, "Audit passed"


def run_audit_with_retry(
    paper_data: dict,
    api_key: str,
    max_retries: int = MAX_RETRIES,
) -> dict[str, Any]:
    """While-loop: evaluate (via B_X service) -> audit -> retry if needed."""
    audit_agent = AuditAgent(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus-latest",
    )

    retry_count = 0
    audit_feedback = None
    service_response = {}

    while retry_count <= max_retries:
        if retry_count > 0:
            logger.info("========== Retry %d/%d ==========", retry_count, max_retries)
        else:
            logger.info("========== First round ==========")

        # Call B_X evaluate_paper service
        logger.info("Calling evaluate_paper (B_X service)...")
        try:
            service_response = evaluate_paper(paper_data, audit_feedback=audit_feedback)
        except Exception as exc:
            logger.error("evaluate_paper failed: %s", exc)
            return {
                "audit_log": {},
                "final_results": {},
                "retry_count": retry_count,
                "audit_passed": False,
            }

        # Check if any agent succeeded
        agent_results = _extract_agent_results(service_response)
        if not agent_results:
            logger.error("All agents failed, terminating.")
            return {
                "audit_log": {},
                "final_results": {},
                "retry_count": retry_count,
                "audit_passed": False,
            }

        # Log per-agent status
        for agent_name in AGENT_NAMES:
            agent_data = service_response.get(agent_name, {})
            status = agent_data.get("status", "unknown")
            score = (agent_data.get("result") or {}).get("score", "N/A")
            logger.info("[%s] status=%s, score=%s", agent_name, status, score)

        # Map to audit agent format (methodology/logic/ethics/innovation)
        c_format_reports = _map_to_c_format(agent_results)
        for key in ("methodology", "logic", "ethics", "innovation"):
            if key not in c_format_reports:
                c_format_reports[key] = {"score": 0, "summary": "Agent call failed"}

        # Call audit agent
        logger.info("Calling audit agent...")
        try:
            audit_output = audit_agent.audit(
                original_paper=paper_data,
                preliminary_reports=c_format_reports,
            )
            audit_log = audit_output.audit_log
            audited_c_format = audit_output.audited_results
        except Exception as exc:
            logger.error("Audit agent failed: %s", exc)
            audit_log = {"fact_check_summary": "Audit agent call failed", "conflict_resolution_summary": ""}
            audited_c_format = c_format_reports

        passed, reason = _check_audit_quality(audit_log)
        if passed:
            logger.info("[PASS] %s", reason)
            return {
                "audit_log": audit_log,
                "final_results": _map_back_to_b_format(audited_c_format),
                "retry_count": retry_count,
                "audit_passed": True,
            }

        logger.warning("[FAIL] %s", reason)
        retry_count += 1
        if retry_count <= max_retries:
            audit_feedback = {
                "fact_check_summary": audit_log.get("fact_check_summary", ""),
                "conflict_resolution_summary": audit_log.get("conflict_resolution_summary", ""),
                "instruction": "请根据上述审计反馈重新评价，确保所有证据在原文中真实存在。",
            }

    logger.warning("[WARN] Max retries reached")
    # Return the last service response's extracted results
    final_results = _extract_agent_results(service_response)
    return {
        "audit_log": audit_log,
        "final_results": final_results,
        "retry_count": retry_count - 1,
        "audit_passed": False,
    }


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def main_pipeline(file_path: str) -> dict[str, Any]:
    """Full pipeline: A -> B_X (evaluate) -> C (audit + retry)."""
    logger.info("=" * 60)
    logger.info("AI学术审查系统 system starting")
    logger.info("=" * 60)
    start_time = time.time()

    if not DASHSCOPE_API_KEY:
        raise ValueError("DASHSCOPE_API_KEY not found. Please set it in evaluation_agents_delivery/.env")

    logger.info("[Step A] Parsing document...")
    paper_data = process_document(file_path)
    logger.info("[Step A] Done. Title: %s", paper_data.get("paper_info", {}).get("title", "Unknown"))

    logger.info("[Step B_X+C] Starting evaluation and audit...")
    audit_result = run_audit_with_retry(paper_data=paper_data, api_key=DASHSCOPE_API_KEY)

    elapsed = time.time() - start_time
    logger.info("=" * 60)
    logger.info("Done. Time: %.1fs, Retries: %d, Passed: %s", elapsed, audit_result["retry_count"], audit_result["audit_passed"])
    logger.info("=" * 60)

    return {
        "paper_data": paper_data,
        "audit_log": audit_result["audit_log"],
        "final_results": audit_result["final_results"],
        "retry_count": audit_result["retry_count"],
        "audit_passed": audit_result["audit_passed"],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AI学术审查系统 - AI Paper Assessment System")
    parser.add_argument("file_path", help="Path to the document (.pdf / .docx / .txt)")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    parser.add_argument("--max-retries", type=int, default=MAX_RETRIES, help=f"Max retries (default {MAX_RETRIES})")
    args = parser.parse_args()

    MAX_RETRIES = args.max_retries

    if not os.path.exists(args.file_path):
        logger.error("File not found: %s", args.file_path)
        sys.exit(1)

    try:
        result = main_pipeline(args.file_path)
        output_json = json.dumps(result, ensure_ascii=False, indent=2)

        if args.output:
            Path(args.output).write_text(output_json + "\n", encoding="utf-8")
            logger.info("Result saved to: %s", args.output)
        else:
            print("\n" + "=" * 60)
            print("Final Result:")
            print("=" * 60)
            print(output_json)

    except Exception as exc:
        logger.error("System failed: %s", exc, exc_info=True)
        sys.exit(1)
