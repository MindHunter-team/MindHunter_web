"""Pipeline validation: JSON schema reuse plus lightweight quality checks."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .schema_validation import normalize_issue_type_enums, validate_result


@dataclass
class PipelineValidationResult:
    parse_ok: bool = False
    fields_ok: bool = False
    enums_ok: bool = False
    quality_ok: bool = False
    raw_value: dict[str, Any] | None = None
    normalized_value: dict[str, Any] | None = None
    normalization_log: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.parse_ok and self.fields_ok and self.enums_ok and self.quality_ok


def validate_pipeline_output(raw: str, agent: str, case_id: str, case_text: str) -> PipelineValidationResult:
    result = PipelineValidationResult()
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        result.errors.append(f"JSON 解析失败：{exc}")
        return result

    result.parse_ok = True
    if isinstance(value, dict):
        result.raw_value = value
    normalized, normalization_log = normalize_issue_type_enums(value, agent, case_id)
    result.normalization_log = normalization_log
    if isinstance(normalized, dict):
        normalized = apply_boundary_rules(normalized, agent, case_text)
        result.normalized_value = normalized

    schema_validation = validate_result(normalized, agent)
    result.fields_ok = schema_validation.fields_ok
    result.enums_ok = schema_validation.enums_ok
    result.errors.extend(schema_validation.errors)

    quality_errors, quality_warnings = quality_check(normalized, agent, case_text)
    result.errors.extend(quality_errors)
    result.warnings.extend(quality_warnings)
    result.quality_ok = not quality_errors
    return result


def apply_boundary_rules(value: dict[str, Any], agent: str, case_text: str) -> dict[str, Any]:
    """Deterministic guardrails for edge cases that prompts may handle inconsistently."""
    text = case_text.lower()
    if agent == "ethics_bias":
        apply_secondary_text_ethics_rule(value, text)
    elif agent == "innovation":
        apply_engineering_innovation_rule(value, text)
    return value


def append_limitation(value: dict[str, Any], message: str) -> None:
    limitations = value.get("limitations")
    if not isinstance(limitations, list):
        limitations = []
        value["limitations"] = limitations
    if message not in limitations:
        limitations.append(message)
    if len(limitations) > 6:
        del limitations[6:]


def apply_secondary_text_ethics_rule(value: dict[str, Any], text: str) -> None:
    secondary_markers = (
        "conference abstract", "abstract book", "document analysis",
        "会议摘要", "摘要集", "文献综述", "二次文本", "政策文本", "公开报告",
    )
    harm_markers = (
        "discrimination", "discriminatory", "unfair", "exclusion", "excluded",
        "rights", "resource allocation", "harm", "歧视", "不公平", "排除",
        "权益", "资源分配", "伤害",
    )
    if not any(marker in text for marker in secondary_markers):
        return
    if any(marker in text for marker in harm_markers):
        return

    biases = value.get("bias_detected")
    if not isinstance(biases, list):
        return

    retained = []
    moved = []
    for bias in biases:
        if not isinstance(bias, dict):
            retained.append(bias)
            continue
        if bias.get("bias_type") in {"sample_selection_bias", "regional_bias"}:
            evidence = str(bias.get("evidence", "")).strip()
            if evidence:
                moved.append(evidence)
        else:
            retained.append(bias)
    if len(retained) == len(biases):
        return

    value["bias_detected"] = retained
    append_limitation(
        value,
        "语料来源、会议地点或年份范围有限，属于研究代表性和推论边界限制；输入未显示明确不公平后果，因此未作为伦理偏见输出。",
    )
    for evidence in moved[:2]:
        append_limitation(value, f"代表性限制证据：{evidence[:120]}")


def apply_engineering_innovation_rule(value: dict[str, Any], text: str) -> None:
    engineering_markers = (
        "engineering", "system", "microcontroller", "resource-constrained",
        "embedded", "hardware", "real-world", "deployment", "控制系统",
        "工程系统", "微控制器", "资源受限", "嵌入式", "硬件", "部署",
    )
    validation_markers = (
        "simulation", "experiment", "benchmark", "baseline", "hardware",
        "real-world", "frequency", "runtime", "memory", "gazebo", "ros",
        "仿真", "实验", "基线", "硬件", "实机", "频率", "运行时间", "内存",
    )
    if not any(marker in text for marker in engineering_markers):
        return
    if not any(marker in text for marker in validation_markers):
        return

    issues = value.get("issues")
    if not isinstance(issues, list):
        return

    retained = []
    removed = False
    for issue in issues:
        if isinstance(issue, dict) and issue.get("issue_type") == "ablation_missing":
            removed = True
            continue
        retained.append(issue)
    if not removed:
        return

    value["issues"] = retained
    append_limitation(value, "工程系统论文已有仿真、实机、基线或部署验证时，缺少模块级消融不作为创新性 issue；模块贡献归因仍可加强。")


def quality_check(value: Any, agent: str, case_text: str) -> tuple[list[str], list[str]]:
    """Lightweight checks for shallow or poorly grounded model output."""
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(value, dict):
        return ["顶层不是 JSON object，无法进行质量检查"], warnings

    score = value.get("score")
    risk = value.get("risk_level")
    if isinstance(score, int):
        expected_risk = "low" if score >= 80 else "medium" if score >= 60 else "high"
        if risk != expected_risk:
            errors.append(f"score 与 risk_level 不一致：score={score} 应为 {expected_risk}")

    reasoning = str(value.get("reasoning_md", ""))
    if len(reasoning.strip()) < 80:
        errors.append("reasoning_md 过短，评价依据可能过浅")

    issues = value.get("issues", [])
    if isinstance(issues, list):
        for index, issue in enumerate(issues):
            if not isinstance(issue, dict):
                continue
            evidence = str(issue.get("evidence", "")).strip()
            if len(evidence) < 8:
                errors.append(f"issues[{index}].evidence 过短或缺少具体证据")
            if agent == "ethics_bias":
                issue_type = issue.get("issue_type")
                if issue_type in {
                    "ethics_approval_unclear",
                    "informed_consent_unclear",
                    "privacy_protection_unclear",
                    "data_authorization_unclear",
                } and "未说明" in evidence and not any(token in evidence for token in ("未取得", "未获得", "未经", "没有")):
                    errors.append(f"issues[{index}] 可能将“未说明”误判为明确伦理问题")

    evidence_refs = value.get("evidence_refs", [])
    if isinstance(evidence_refs, list):
        for index, ref in enumerate(evidence_refs):
            if not isinstance(ref, dict):
                continue
            quote = str(ref.get("quote", "")).strip()
            if quote and quote not in case_text:
                warnings.append(f"evidence_refs[{index}].quote 未在输入原文中精确匹配")

    if agent == "innovation":
        innovation_types = value.get("innovation_types", [])
        if isinstance(innovation_types, list) and innovation_types and not issues:
            warnings.append("innovation_types 非空但 issues 为空，请人工确认创新证据是否充分")

    return errors, warnings
