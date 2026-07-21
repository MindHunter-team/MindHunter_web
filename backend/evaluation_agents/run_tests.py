#!/usr/bin/env python3
"""Batch and stability testing for the four paper-evaluation agents."""

from __future__ import annotations

import argparse
import csv
import copy
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI


ROOT = Path(__file__).resolve().parent
PROMPTS_DIR = ROOT / "prompts"
CASES_DIR = ROOT / "tests" / "cases"
OUTPUTS_DIR = ROOT / "tests" / "outputs"
CSV_REPORT = ROOT / "tests" / "test_results.csv"
MD_REPORT = ROOT / "test_results.md"
REPORT_START = "<!-- AUTO_TEST_RESULTS_START -->"
REPORT_END = "<!-- AUTO_TEST_RESULTS_END -->"

MODEL = "qwen-plus-latest"
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

AGENTS = {
    "data_reliability": "数据可靠性",
    "ethics_bias": "伦理与偏见",
    "logical_rigor": "逻辑严密性",
    "innovation": "创新性",
}
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


@dataclass
class Record:
    timestamp: str
    agent: str
    case: str
    prompt_version: str
    run: int
    output_file: str
    json_parse_ok: bool
    fields_complete: bool
    enums_valid: bool
    score: int | None
    confidence: float | None
    risk_level: str
    issue_types: str
    normalization_applied: bool
    normalization_count: int
    error: str


def normalize_issue_type_enums(value: Any, agent: str, cid: str) -> tuple[Any, list[dict[str, Any]]]:
    """Normalize issue_type enum drift before schema validation.

    The raw model JSON is preserved separately; this returns a deep-copied value
    for validation/reporting plus an audit log of every enum replacement.
    """
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
                "case": cid,
                "issue_index": index,
                "original_issue_type": original_issue_type,
                "normalized_issue_type": normalized_issue_type,
            }
        )

    normalized["normalization_log"] = normalization_log
    return normalized, normalization_log


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="批量测试四个百炼评价 Agent")
    parser.add_argument(
        "--mode", choices=("batch", "stability", "all"), default="batch",
        help="batch=4×5 各一次；stability=指定用例各跑3次；all=两者都执行",
    )
    parser.add_argument(
        "--case", default="case01",
        help="稳定性测试用例，如 case01、01 或 test_case_01_typical.json",
    )
    parser.add_argument("--agent", choices=tuple(AGENTS), help="只测试指定 Agent")
    parser.add_argument("--runs", type=int, default=3, help="稳定性重复次数，默认3")
    parser.add_argument("--retry", type=int, default=2, help="单次 API 失败重试次数，默认2")
    parser.add_argument("--dry-run", action="store_true", help="只检查文件发现和本地配置，不调用 API")
    return parser.parse_args()


def version_key(path: Path) -> tuple[int, ...]:
    match = re.search(r"_v(\d+(?:\.\d+)*)\.txt$", path.name)
    if not match:
        return (-1,)
    return tuple(int(part) for part in match.group(1).split("."))


def current_prompts(selected_agent: str | None = None) -> dict[str, Path]:
    found: dict[str, Path] = {}
    agents = [selected_agent] if selected_agent else list(AGENTS)
    for agent in agents:
        candidates = list(PROMPTS_DIR.glob(f"{agent}_prompt_v*.txt"))
        if not candidates:
            raise FileNotFoundError(f"未找到 {agent} Prompt：{PROMPTS_DIR}")
        found[agent] = max(candidates, key=version_key)
    return found


def prompt_version(path: Path) -> str:
    match = re.search(r"_v(\d+(?:\.\d+)*)\.txt$", path.name)
    return f"v{match.group(1)}" if match else "unknown"


def all_cases() -> list[Path]:
    cases = sorted(CASES_DIR.glob("test_case_*.json"))
    if len(cases) != 5:
        raise RuntimeError(f"预期 5 个测试用例，实际找到 {len(cases)} 个：{CASES_DIR}")
    for path in cases:
        json.loads(path.read_text(encoding="utf-8"))
    return cases


def case_id(path: Path) -> str:
    match = re.search(r"test_case_(\d+)", path.name)
    return f"case{int(match.group(1)):02d}" if match else path.stem


def select_case(query: str, cases: list[Path]) -> Path:
    normalized = query.lower().replace("test_case_", "").replace("case", "")
    match = re.search(r"(\d+)", normalized)
    if not match:
        for path in cases:
            if path.name == query:
                return path
        raise ValueError(f"无法识别用例：{query}")
    wanted = int(match.group(1))
    for path in cases:
        if case_id(path) == f"case{wanted:02d}":
            return path
    raise ValueError(f"未找到用例：{query}")


def validate_result(value: Any, expected_agent: str) -> Validation:
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

    field_errors = [e for e in result.errors if "枚举" not in e]
    result.fields_ok = not field_errors

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
        if not isinstance(ref, dict) or not all(isinstance(ref.get(k), str) and ref[k] for k in ("location", "quote")):
            result.errors.append(f"evidence_refs[{index}] 结构错误")
    if expected_agent == "ethics_bias":
        for index, bias in enumerate(value.get("bias_detected", [])):
            keys = ("bias_type", "severity", "affected_group_or_factor", "evidence", "potential_impact", "suggestion")
            if not isinstance(bias, dict) or not all(isinstance(bias.get(k), str) and bias[k] for k in keys):
                result.errors.append(f"bias_detected[{index}] 结构错误")
            elif bias["severity"] not in SEVERITY_ENUM:
                result.errors.append(f"bias_detected[{index}].severity 枚举非法")
            elif bias["bias_type"] not in BIAS_ENUM:
                result.errors.append(f"bias_detected[{index}].bias_type 枚举非法")
    if expected_agent == "innovation":
        invalid = set(value.get("innovation_types", [])) - INNOVATION_ENUM
        if invalid:
            result.errors.append(f"innovation_types 枚举非法：{sorted(invalid)}")

    # Recompute after nested structure checks.
    result.fields_ok = not any("枚举非法" not in e for e in result.errors)
    result.enums_ok = not any("枚举非法" in e for e in result.errors)
    return result


def call_model(client: OpenAI, prompt: str, case_text: str, retries: int) -> str:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": case_text},
                ],
                temperature=0.1,
                max_tokens=4096,
                response_format={"type": "json_object"},
                extra_body={"enable_thinking": False},
            )
            content = response.choices[0].message.content
            if not content:
                raise RuntimeError("API 返回空内容")
            return content
        except Exception as exc:  # continue the whole suite after bounded retries
            last_error = exc
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(str(last_error)) from last_error


def run_one(
    client: OpenAI,
    agent: str,
    prompt_path: Path,
    case_path: Path,
    run_number: int,
    retries: int,
) -> Record:
    version = prompt_version(prompt_path)
    cid = case_id(case_path)
    stem = f"{agent}_{cid}_{version}_run{run_number:02d}"
    output_dir = OUTPUTS_DIR / agent
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{stem}.json"
    normalized_path = output_dir / f"{stem}.normalized.json"
    raw_path = output_dir / f"{stem}.raw.txt"
    error_path = output_dir / f"{stem}.error.json"
    timestamp = datetime.now().isoformat(timespec="seconds")
    value: dict[str, Any] | None = None
    normalized_value: dict[str, Any] | None = None
    normalization_log: list[dict[str, Any]] = []
    validation = Validation()
    error = ""

    try:
        raw = call_model(
            client,
            prompt_path.read_text(encoding="utf-8"),
            case_path.read_text(encoding="utf-8"),
            retries,
        )
        try:
            value = json.loads(raw)
            normalized, normalization_log = normalize_issue_type_enums(value, agent, cid)
            if isinstance(normalized, dict):
                normalized_value = normalized
            validation = validate_result(normalized, agent)
            json_path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            normalized_path.write_text(
                json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except (json.JSONDecodeError, TypeError) as exc:
            validation.errors.append(f"JSON 解析失败：{exc}")
            raw_path.write_text(raw, encoding="utf-8")
    except Exception as exc:
        validation.errors.append(f"API 调用失败：{exc}")

    if validation.errors:
        error = "；".join(validation.errors)
        error_path.write_text(
            json.dumps(
                {
                    "timestamp": timestamp,
                    "agent": agent,
                    "case": cid,
                    "errors": validation.errors,
                    "normalization_log": normalization_log,
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )

    issue_types: list[str] = []
    report_value = normalized_value or value
    if report_value:
        issue_types.extend(str(item.get("issue_type", "")) for item in report_value.get("issues", []) if isinstance(item, dict))
        issue_types.extend(str(item.get("bias_type", "")) for item in report_value.get("bias_detected", []) if isinstance(item, dict))
    return Record(
        timestamp=timestamp,
        agent=agent,
        case=cid,
        prompt_version=version,
        run=run_number,
        output_file=str(normalized_path.relative_to(ROOT)) if normalized_path.exists() else str(raw_path.relative_to(ROOT)),
        json_parse_ok=validation.parse_ok,
        fields_complete=validation.fields_ok,
        enums_valid=validation.enums_ok,
        score=report_value.get("score") if report_value and isinstance(report_value.get("score"), int) else None,
        confidence=float(report_value["confidence"]) if report_value and isinstance(report_value.get("confidence"), (int, float)) else None,
        risk_level=str(report_value.get("risk_level", "")) if report_value else "",
        issue_types="|".join(filter(None, issue_types)),
        normalization_applied=bool(normalization_log),
        normalization_count=len(normalization_log),
        error=error,
    )


def write_csv(records: list[Record]) -> None:
    CSV_REPORT.parent.mkdir(parents=True, exist_ok=True)
    fields = list(Record.__dataclass_fields__)
    with CSV_REPORT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for record in records:
            writer.writerow(record.__dict__)


def pct(count: int, total: int) -> str:
    return f"{(count / total * 100):.1f}%" if total else "0.0%"


def markdown_report(records: list[Record], prompts: dict[str, Path]) -> str:
    total = len(records)
    parse_count = sum(r.json_parse_ok for r in records)
    field_count = sum(r.fields_complete for r in records)
    enum_count = sum(r.enums_valid for r in records)
    normalization_count = sum(r.normalization_count for r in records)
    lines = [
        REPORT_START,
        "## 自动化测试结果",
        "",
        f"- 生成时间：{datetime.now().isoformat(timespec='seconds')}",
        f"- 模型：`{MODEL}`（temperature=0.1，enable_thinking=false，max_tokens=4096）",
        "- Prompt：" + "；".join(f"`{a}` {prompt_version(p)}" for a, p in prompts.items()),
        f"- 总运行数：{total}",
        f"- JSON 解析成功率：{pct(parse_count, total)} ({parse_count}/{total})",
        f"- 字段完整率：{pct(field_count, total)} ({field_count}/{total})",
        f"- 枚举合法率：{pct(enum_count, total)} ({enum_count}/{total})",
        f"- 枚举归一化次数：{normalization_count}",
        "",
        "| Agent | 用例 | 版本 | Run | JSON | 字段 | 枚举 | 分数 | 置信度 | 风险 | 核心 issue/bias | normalization_applied | normalization_count | 错误 |",
        "|---|---|---|---:|---|---|---|---:|---:|---|---|---|---:|---|",
    ]
    for r in records:
        error = r.error.replace("|", "\\|")
        issues = r.issue_types.replace("|", ", ")
        lines.append(
            f"| {r.agent} | {r.case} | {r.prompt_version} | {r.run} | "
            f"{'是' if r.json_parse_ok else '否'} | {'是' if r.fields_complete else '否'} | "
            f"{'是' if r.enums_valid else '否'} | {'' if r.score is None else r.score} | "
            f"{'' if r.confidence is None else r.confidence} | {r.risk_level} | {issues} | "
            f"{'是' if r.normalization_applied else '否'} | {r.normalization_count} | {error} |"
        )

    groups: dict[tuple[str, str], list[Record]] = {}
    for record in records:
        groups.setdefault((record.agent, record.case), []).append(record)
    stability = [(key, values) for key, values in groups.items() if len(values) > 1]
    if stability:
        lines += [
            "",
            "### 稳定性统计",
            "",
            "| Agent | 用例 | 次数 | 分数 | 最大分差 | 风险一致 | 核心 issue/bias 并集 |",
            "|---|---|---:|---|---:|---|---|",
        ]
        for (agent, cid), values in stability:
            scores = [r.score for r in values if r.score is not None]
            risks = {r.risk_level for r in values}
            issues = sorted({item for r in values for item in r.issue_types.split("|") if item})
            spread = max(scores) - min(scores) if scores else ""
            lines.append(
                f"| {agent} | {cid} | {len(values)} | {', '.join(map(str, scores))} | "
                f"{spread} | {'是' if len(risks) <= 1 else '否'} | {', '.join(issues)} |"
            )
    lines += ["", REPORT_END, ""]
    return "\n".join(lines)


def update_markdown(records: list[Record], prompts: dict[str, Path]) -> None:
    generated = markdown_report(records, prompts)
    existing = MD_REPORT.read_text(encoding="utf-8") if MD_REPORT.exists() else "# 四个评价 Agent 测试记录\n"
    if REPORT_START in existing and REPORT_END in existing:
        pattern = re.compile(re.escape(REPORT_START) + r".*?" + re.escape(REPORT_END) + r"\n?", re.S)
        updated = pattern.sub(generated, existing)
    else:
        updated = existing.rstrip() + "\n\n" + generated
    MD_REPORT.write_text(updated, encoding="utf-8")


def main() -> int:
    args = parse_args()
    prompts = current_prompts(args.agent)
    cases = all_cases()
    stability_case = select_case(args.case, cases)

    print("发现当前 Prompt：")
    for agent, path in prompts.items():
        print(f"  {agent}: {path.name}")
    print("发现测试用例：")
    for path in cases:
        print(f"  {case_id(path)}: {path.name}")
    if args.dry_run:
        print("Dry run 完成：未调用 API，未写入测试结果。")
        return 0

    load_dotenv(ROOT / ".env")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        print("错误：未找到 DASHSCOPE_API_KEY。请复制 .env.example 为 .env 并填入密钥。", file=sys.stderr)
        return 2
    if args.runs < 1:
        print("错误：--runs 必须大于等于 1", file=sys.stderr)
        return 2

    client = OpenAI(api_key=api_key, base_url=BASE_URL)
    jobs: list[tuple[str, Path, Path, int]] = []
    if args.mode in {"batch", "all"}:
        jobs.extend((agent, prompt, case, 1) for agent, prompt in prompts.items() for case in cases)
    if args.mode in {"stability", "all"}:
        jobs.extend((agent, prompt, stability_case, run) for agent, prompt in prompts.items() for run in range(1, args.runs + 1))

    records: list[Record] = []
    for index, (agent, prompt, case, run_number) in enumerate(jobs, start=1):
        print(f"[{index}/{len(jobs)}] {agent} {case_id(case)} run{run_number:02d}")
        record = run_one(client, agent, prompt, case, run_number, args.retry)
        records.append(record)
        state = "PASS" if record.json_parse_ok and record.fields_complete and record.enums_valid else "FAIL"
        print(f"  {state} score={record.score} risk={record.risk_level} {record.error}")

    write_csv(records)
    update_markdown(records, prompts)
    print(f"CSV：{CSV_REPORT}")
    print(f"Markdown：{MD_REPORT}")
    return 0 if all(r.json_parse_ok and r.fields_complete and r.enums_valid for r in records) else 1


if __name__ == "__main__":
    raise SystemExit(main())
