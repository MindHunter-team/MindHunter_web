"""Backend-facing service API for four-dimensional paper evaluation."""

from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any

if __package__:
    from .pipeline.bailian_client import BailianClient
    from .pipeline.config import AGENTS, current_prompts
    from .pipeline.orchestrator import EvaluationOrchestrator
else:
    from pipeline.bailian_client import BailianClient
    from pipeline.config import AGENTS, current_prompts
    from pipeline.orchestrator import EvaluationOrchestrator


PACKAGE_ROOT = Path(__file__).resolve().parent


def _load_local_env() -> None:
    """Load an optional local .env while preserving existing environment values."""
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:
        return
    load_dotenv(PACKAGE_ROOT / ".env", override=False)


def _with_audit_feedback(paper_data: dict[str, Any], audit_feedback: dict[str, Any] | None) -> dict[str, Any]:
    payload = copy.deepcopy(paper_data)
    if audit_feedback is None:
        return payload

    review_context = payload.get("review_context")
    if not isinstance(review_context, dict):
        review_context = {}
        payload["review_context"] = review_context
    review_context["audit_feedback"] = copy.deepcopy(audit_feedback)
    return payload


def evaluate_paper(
    paper_data: dict,
    audit_feedback: dict | None = None,
) -> dict:
    """
    输入论文标准JSON
    输出四个评价Agent结果

    返回值以四个 Agent 标识为顶层键。每个维度包含运行状态、Prompt
    版本、尝试次数、标准化评价结果、错误和质量检查提示。
    """
    if not isinstance(paper_data, dict):
        raise TypeError("paper_data 必须是 dict")
    if audit_feedback is not None and not isinstance(audit_feedback, dict):
        raise TypeError("audit_feedback 必须是 dict 或 None")

    _load_local_env()
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise RuntimeError("未配置 DASHSCOPE_API_KEY")

    payload = _with_audit_feedback(paper_data, audit_feedback)
    orchestrator = EvaluationOrchestrator(
        client=BailianClient(api_key=api_key),
        prompts=current_prompts(),
        output_root=None,
        max_workers=len(AGENTS),
    )
    agent_results = orchestrator.evaluate_data(payload)

    response: dict[str, dict[str, Any]] = {}
    for agent_result in agent_results:
        validation = agent_result.validation
        response[agent_result.agent] = {
            "status": agent_result.status,
            "prompt_version": agent_result.prompt_version,
            "attempts": agent_result.attempts,
            "result": validation.normalized_value,
            "errors": list(validation.errors),
            "warnings": list(validation.warnings),
            "normalization_log": list(validation.normalization_log),
        }
    return response


__all__ = ["evaluate_paper"]
