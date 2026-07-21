"""Concurrent orchestration for the four evaluation agents."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .bailian_client import BailianClient
from .config import AGENTS, prompt_version
from .retry_policy import RetryPolicy, with_retry_feedback
from .validators import PipelineValidationResult, validate_pipeline_output


@dataclass
class AgentRunResult:
    agent: str
    prompt_version: str
    status: str
    attempts: int
    validation: PipelineValidationResult
    raw_output_path: str = ""
    normalized_output_path: str = ""
    error_output_path: str = ""


class EvaluationOrchestrator:
    def __init__(
        self,
        *,
        client: BailianClient,
        prompts: dict[str, Path],
        output_root: Path | None = None,
        retry_policy: RetryPolicy | None = None,
        max_workers: int = 4,
    ) -> None:
        self.client = client
        self.prompts = prompts
        self.output_root = output_root
        self.retry_policy = retry_policy or RetryPolicy()
        self.max_workers = max_workers

    def evaluate_case(self, case_path: Path) -> tuple[str, dict[str, Any], list[AgentRunResult]]:
        case_data = json.loads(case_path.read_text(encoding="utf-8"))
        if not isinstance(case_data, dict):
            raise ValueError(f"业务数据顶层必须是 JSON object：{case_path}")
        case_id = case_path.stem
        return case_id, case_data, self.evaluate_data(case_data, case_id=case_id)

    def evaluate_data(self, case_data: dict[str, Any], *, case_id: str = "service_input") -> list[AgentRunResult]:
        """Evaluate an in-memory paper payload without requiring a case file."""
        if not isinstance(case_data, dict):
            raise TypeError("paper_data 必须是 dict")

        case_output_dir: Path | None = None
        if self.output_root is not None:
            case_output_dir = self.output_root / case_id
            case_output_dir.mkdir(parents=True, exist_ok=True)

        results: list[AgentRunResult] = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(self._run_agent, agent, prompt_path, case_id, case_data, case_output_dir): agent
                for agent, prompt_path in self.prompts.items()
            }
            for future in as_completed(futures):
                results.append(future.result())

        results.sort(key=lambda item: list(AGENTS).index(item.agent) if item.agent in AGENTS else item.agent)
        return results

    def _run_agent(
        self,
        agent: str,
        prompt_path: Path,
        case_id: str,
        original_case_data: dict[str, Any],
        case_output_dir: Path | None,
    ) -> AgentRunResult:
        prompt = prompt_path.read_text(encoding="utf-8")
        version = prompt_version(prompt_path)
        agent_output_dir: Path | None = None
        if case_output_dir is not None:
            agent_output_dir = case_output_dir / agent
            agent_output_dir.mkdir(parents=True, exist_ok=True)

        api_failures = 0
        format_failures = 0
        quality_failures = 0
        case_data = original_case_data
        last_validation = PipelineValidationResult()
        raw_output_path = ""
        normalized_output_path = ""
        error_output_path = ""

        for attempt in range(1, self.retry_policy.max_attempts + 1):
            case_text = json.dumps(case_data, ensure_ascii=False, indent=2)
            raw_path = agent_output_dir / f"{agent}_{version}_attempt{attempt:02d}.raw.txt" if agent_output_dir else None
            normalized_path = (
                agent_output_dir / f"{agent}_{version}_attempt{attempt:02d}.normalized.json"
                if agent_output_dir else None
            )
            error_path = agent_output_dir / f"{agent}_{version}_attempt{attempt:02d}.error.json" if agent_output_dir else None
            try:
                raw = self.client.complete_json(prompt, case_text)
                if raw_path is not None:
                    raw_path.write_text(raw, encoding="utf-8")
                    raw_output_path = str(raw_path)
            except Exception as exc:
                api_failures += 1
                last_validation = PipelineValidationResult(errors=[f"API 调用失败：{exc}"])
                if error_path is not None:
                    error_path.write_text(
                        json.dumps(
                            {"agent": agent, "attempt": attempt, "errors": last_validation.errors},
                            ensure_ascii=False,
                            indent=2,
                        )
                        + "\n",
                        encoding="utf-8",
                    )
                    error_output_path = str(error_path)
                if api_failures <= self.retry_policy.api_retries:
                    self.retry_policy.sleep_before_retry(attempt)
                    continue
                break

            last_validation = validate_pipeline_output(raw, agent, case_id, case_text)
            if last_validation.normalized_value is not None and normalized_path is not None:
                normalized_path.write_text(
                    json.dumps(last_validation.normalized_value, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                normalized_output_path = str(normalized_path)
            if last_validation.errors and error_path is not None:
                error_path.write_text(
                    json.dumps(
                        {
                            "agent": agent,
                            "attempt": attempt,
                            "errors": last_validation.errors,
                            "warnings": last_validation.warnings,
                            "normalization_log": last_validation.normalization_log,
                        },
                        ensure_ascii=False,
                        indent=2,
                    )
                    + "\n",
                    encoding="utf-8",
                )
                error_output_path = str(error_path)

            if last_validation.ok:
                return AgentRunResult(
                    agent=agent,
                    prompt_version=version,
                    status="success",
                    attempts=attempt,
                    validation=last_validation,
                    raw_output_path=raw_output_path,
                    normalized_output_path=normalized_output_path,
                    error_output_path=error_output_path,
                )

            if not last_validation.parse_ok or not last_validation.fields_ok or not last_validation.enums_ok:
                format_failures += 1
                if format_failures <= self.retry_policy.format_retries:
                    case_data = with_retry_feedback(
                        original_case_data,
                        agent=agent,
                        reason="format_validation_failed",
                        problems=last_validation.errors,
                        attempt=attempt,
                    )
                    continue
            else:
                quality_failures += 1
                if quality_failures <= self.retry_policy.quality_retries:
                    case_data = with_retry_feedback(
                        original_case_data,
                        agent=agent,
                        reason="quality_validation_failed",
                        problems=last_validation.errors,
                        attempt=attempt,
                    )
                    continue
            break

        return AgentRunResult(
            agent=agent,
            prompt_version=version,
            status="failed",
            attempts=attempt,
            validation=last_validation,
            raw_output_path=raw_output_path,
            normalized_output_path=normalized_output_path,
            error_output_path=error_output_path,
        )
