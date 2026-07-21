"""Output schema definitions, normalization, and validation helpers."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from .config import AGENTS


RISK_ENUM = {"low", "medium", "high"}
SEVERITY_ENUM = {"low", "medium", "high"}
INNOVATION_ENUM = {"problem", "method", "theory", "data", "application", "engineering"}
ISSUE_ENUMS = {
    "data_reliability": {
        "data_source_unclear", "sample_size_insufficient", "sample_representativeness",
        "inclusion_exclusion_unclear", "missing_value_handling", "outlier_handling",
        "duplicate_handling", "preprocessing_unclear", "variable_definition_unclear",
        "statistical_method_inappropriate", "uncertainty_not_reported", "data_leakage",
        "selective_reporting", "unsupported_extrapolation", "reproducibility_insufficient",
        "data_conclusion_mismatch", "other",
    },
    "ethics_bias": {
        "ethics_approval_unclear", "informed_consent_unclear", "privacy_protection_unclear",
        "data_authorization_unclear", "intellectual_property_risk", "conflict_of_interest",
        "unfair_impact", "evaluation_reputation_bias", "other",
    },
    "logical_rigor": {
        "causality_confusion", "overgeneralization", "unsupported_claim", "circular_reasoning",
        "missing_premise", "internal_inconsistency", "ignored_alternative", "evidence_mismatch",
        "selective_evidence", "unclear_research_question", "untestable_hypothesis",
        "method_question_mismatch", "other",
    },
    "innovation": {
        "novelty_unclear", "incremental_improvement", "simple_module_combination",
        "baseline_insufficient", "ablation_missing", "related_work_insufficient",
        "contribution_unsupported", "performance_gain_insignificant",
        "innovation_claim_exaggerated", "practical_value_unclear",
        "theoretical_value_unclear", "other",
    },
}
BIAS_ENUM = {
    "sample_selection_bias", "gender_bias", "age_bias", "regional_bias", "ethnic_bias",
    "language_bias", "economic_bias", "historical_data_bias", "survivorship_bias",
    "publication_bias", "prestige_bias", "citation_bias", "topic_popularity_bias", "other",
}
ISSUE_ALIASES = {
    "data_reliability": {},
    "ethics_bias": {},
    "logical_rigor": {},
    "innovation": {
        "method_unclear": "novelty_unclear",
        "method_missing": "novelty_unclear",
        "insufficient_method_detail": "novelty_unclear",
        "insufficient_information": "novelty_unclear",
        "evidence_insufficient": "contribution_unsupported",
        "unsupported_innovation": "contribution_unsupported",
        "no_baseline": "baseline_insufficient",
        "missing_related_work": "related_work_insufficient",
    },
}

COMMON_FIELDS = {
    "agent_name": str,
    "dimension_name": str,
    "score": int,
    "confidence": (int, float),
    "risk_level": str,
    "summary": str,
    "strengths": list,
    "issues": list,
    "evidence_refs": list,
    "reasoning_md": str,
    "limitations": list,
}


@dataclass
class Validation:
    parse_ok: bool = False
    fields_ok: bool = False
    enums_ok: bool = False
    errors: list[str] = field(default_factory=list)


def normalize_issue_type_enums(value: Any, agent: str, case_id: str) -> tuple[Any, list[dict[str, Any]]]:
    """Normalize model enum drift while keeping an audit log."""
    normalized = copy.deepcopy(value)
    normalization_log: list[dict[str, Any]] = []
    if not isinstance(normalized, dict):
        return normalized, normalization_log

    issues = normalized.get("issues")
    if not isinstance(issues, list):
        return normalized, normalization_log

    legal_issue_types = ISSUE_ENUMS[agent]
    aliases = ISSUE_ALIASES.get(agent, {})
    for index, issue in enumerate(issues):
        if not isinstance(issue, dict):
            continue
        original_issue_type = issue.get("issue_type")
        if original_issue_type in legal_issue_types:
            continue
        normalized_issue_type = aliases.get(original_issue_type, "other")
        if normalized_issue_type not in legal_issue_types:
            normalized_issue_type = "other"
        issue["issue_type"] = normalized_issue_type
        normalization_log.append(
            {
                "agent": agent,
                "case": case_id,
                "issue_index": index,
                "original_issue_type": original_issue_type,
                "normalized_issue_type": normalized_issue_type,
            }
        )

    normalized["normalization_log"] = normalization_log
    return normalized, normalization_log


def validate_result(value: Any, expected_agent: str) -> Validation:
    """Validate common fields plus agent-specific enum constraints."""
    result = Validation(parse_ok=True)
    if not isinstance(value, dict):
        result.errors.append("顶层必须是 JSON object")
        return result

    for name, expected_type in COMMON_FIELDS.items():
        if name not in value:
            result.errors.append(f"缺少字段：{name}")
        elif name in {"score", "confidence"} and isinstance(value[name], bool):
            result.errors.append(f"字段类型错误：{name}")
        elif not isinstance(value[name], expected_type):
            result.errors.append(f"字段类型错误：{name}")

    required_special = "bias_detected" if expected_agent == "ethics_bias" else None
    if expected_agent == "innovation":
        required_special = "innovation_types"
    if required_special and not isinstance(value.get(required_special), list):
        result.errors.append(f"缺少专属数组字段或类型错误：{required_special}")

    if value.get("agent_name") != expected_agent:
        result.errors.append(f"agent_name 应为 {expected_agent}")
    if value.get("dimension_name") != AGENTS[expected_agent]:
        result.errors.append(f"dimension_name 应为 {AGENTS[expected_agent]}")
    score = value.get("score")
    if isinstance(score, int) and not isinstance(score, bool) and not 0 <= score <= 100:
        result.errors.append("score 超出 0—100")
    confidence = value.get("confidence")
    if isinstance(confidence, (int, float)) and not isinstance(confidence, bool) and not 0 <= confidence <= 1:
        result.errors.append("confidence 超出 0—1")

    if value.get("risk_level") not in RISK_ENUM:
        result.errors.append("risk_level 枚举非法")
    for index, issue in enumerate(value.get("issues", [])):
        if not isinstance(issue, dict):
            result.errors.append(f"issues[{index}] 必须是 object")
            continue
        for key in ("issue_type", "severity", "evidence", "suggestion"):
            if not isinstance(issue.get(key), str) or not issue[key]:
                result.errors.append(f"issues[{index}].{key} 缺失或类型错误")
        if issue.get("severity") not in SEVERITY_ENUM:
            result.errors.append(f"issues[{index}].severity 枚举非法")
        if issue.get("issue_type") not in ISSUE_ENUMS[expected_agent]:
            result.errors.append(f"issues[{index}].issue_type 枚举非法")
    for index, ref in enumerate(value.get("evidence_refs", [])):
        required = ("location", "quote")
        if not isinstance(ref, dict) or not all(isinstance(ref.get(key), str) and ref[key] for key in required):
            result.errors.append(f"evidence_refs[{index}] 结构错误")
    if expected_agent == "ethics_bias":
        for index, bias in enumerate(value.get("bias_detected", [])):
            keys = (
                "bias_type", "severity", "affected_group_or_factor",
                "evidence", "potential_impact", "suggestion",
            )
            if not isinstance(bias, dict) or not all(isinstance(bias.get(key), str) and bias[key] for key in keys):
                result.errors.append(f"bias_detected[{index}] 结构错误")
            elif bias["severity"] not in SEVERITY_ENUM:
                result.errors.append(f"bias_detected[{index}].severity 枚举非法")
            elif bias["bias_type"] not in BIAS_ENUM:
                result.errors.append(f"bias_detected[{index}].bias_type 枚举非法")
    if expected_agent == "innovation":
        invalid = set(value.get("innovation_types", [])) - INNOVATION_ENUM
        if invalid:
            result.errors.append(f"innovation_types 枚举非法：{sorted(invalid)}")

    result.fields_ok = not any("枚举非法" not in error for error in result.errors)
    result.enums_ok = not any("枚举非法" in error for error in result.errors)
    return result
