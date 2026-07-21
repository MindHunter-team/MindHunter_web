"""Retry policy and retry-feedback helpers."""

from __future__ import annotations

import copy
import time
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RetryPolicy:
    api_retries: int = 2
    format_retries: int = 1
    quality_retries: int = 1
    base_delay_seconds: float = 1.0

    @property
    def max_attempts(self) -> int:
        return 1 + self.api_retries + self.format_retries + self.quality_retries

    def sleep_before_retry(self, attempt: int) -> None:
        delay = self.base_delay_seconds * (2 ** max(0, attempt - 1))
        time.sleep(delay)


def with_retry_feedback(
    case_data: dict[str, Any],
    *,
    agent: str,
    reason: str,
    problems: list[str],
    attempt: int,
) -> dict[str, Any]:
    """Return a copied case payload with targeted feedback for the next run."""
    updated = copy.deepcopy(case_data)
    review_context = updated.setdefault("review_context", {})
    if not isinstance(review_context, dict):
        review_context = {}
        updated["review_context"] = review_context
    review_context["retry_feedback"] = {
        "agent": agent,
        "reason": reason,
        "problems": problems,
        "previous_attempt": attempt,
        "instruction": "请只修正上述问题，保持输出为合法 JSON，并继续严格依据输入证据评价。",
    }
    return updated

