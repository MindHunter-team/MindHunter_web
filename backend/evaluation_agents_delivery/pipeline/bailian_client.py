"""Aliyun Bailian API client wrapper for evaluation pipeline runs."""

from __future__ import annotations

from dataclasses import dataclass

from .config import BASE_URL, MODEL


@dataclass(frozen=True)
class ModelConfig:
    model: str = MODEL
    temperature: float = 0.1
    max_tokens: int = 4096
    enable_thinking: bool = False


class BailianClient:
    """Small wrapper around Bailian's OpenAI-compatible chat endpoint."""

    def __init__(
        self,
        api_key: str,
        base_url: str = BASE_URL,
        config: ModelConfig | None = None,
    ) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self.config = config or ModelConfig()

    def complete_json(self, prompt: str, case_text: str) -> str:
        response = self._client.chat.completions.create(
            model=self.config.model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": case_text},
            ],
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
            response_format={"type": "json_object"},
            extra_body={"enable_thinking": self.config.enable_thinking},
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("API 返回空内容")
        return content
