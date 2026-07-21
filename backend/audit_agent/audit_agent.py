# -*- coding: utf-8 -*-
"""
AI学术审查系统 审计 Agent 模块 (Audit Agent)
=========================================
质检中枢：负责对 4 个评价 Agent（方法论、逻辑、伦理、创新）的初步评价结果
进行"幻觉校验"和"跨引擎冲突仲裁"，输出清洗后的纯净数据。

职责边界：只清洗和纠偏数据，不计算最终总分或动态权重。
"""

import json
import time
import logging
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass
class AuditInput:
    """审计 Agent 的标准化输入"""
    original_paper: Dict[str, Any]       # 原始论文结构化 JSON
    preliminary_reports: Dict[str, Any]  # 4 个引擎的初步评价结果


@dataclass
class AuditOutput:
    """审计 Agent 的标准化输出"""
    audit_log: Dict[str, Any]
    audited_results: Dict[str, Any]
    raw_response: Optional[str] = None


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """
你现在是 AI学术审查系统 系统的"首席审计官 (Audit Agent)"。
你将接收到两部分输入：
1. 【原始论文数据】：一份结构化的论文 JSON（包含章节文本、图表描述等）。
2. 【初步评价报告】：由四个独立引擎（方法论、逻辑、伦理、创新）生成的初步评价 JSON。

你的唯一职责是进行"事实核查"与"冲突仲裁"，确保最终数据的纯净和逻辑自洽。

请严格执行以下两项任务：
【任务 1：幻觉与假证据校验 (Fact-Checking)】
- 逐一核对四个引擎提供的证据。验证这些证据是否在【原始论文数据】中真实存在。
- 若判定为"幻觉"，剔除该伪证并在日志中记录。

【任务 2：跨引擎冲突仲裁 (Conflict Resolution)】
- 检查四个引擎的评价结论是否存在严重矛盾。
- 一旦发现冲突，基于【原始论文数据】进行二次推演，修正出错一方的评价内容。

【输出要求】
你必须返回一个严格的 JSON 对象。
⚠️ 警告：在 `audited_results` 中，你必须完整保留这四个引擎原本输出的所有 advice 等字段，
只允许修改存在幻觉或冲突的具体字段值！

格式如下：
{
  "audit_log": {
    "fact_check_summary": "描述发现的幻觉和处理方式",
    "conflict_resolution_summary": "描述发现的冲突和仲裁结果"
  },
  "audited_results": {
    "methodology": { ...完整保留并修正后的原始JSON结构... },
    "logic": { ...完整保留并修正后的原始JSON结构... },
    "ethics": { ...完整保留并修正后的原始JSON结构... },
    "innovation": { ...完整保留并修正后的原始JSON结构... }
  }
}
"""

# 四个引擎的键名
ENGINE_KEYS = ("methodology", "logic", "ethics", "innovation")


# ---------------------------------------------------------------------------
# 主类
# ---------------------------------------------------------------------------

class AuditAgent:
    """
    AI学术审查系统 审计 Agent

    负责对 4 个并发评价 Agent 的输出进行：
      1. 幻觉 / 假证据校验 (Fact-Checking)
      2. 跨引擎冲突仲裁 (Conflict Resolution)

    使用方式:
        agent = AuditAgent(api_key="...", base_url="...", model="...")
        result = agent.audit(
            original_paper=paper_json,
            preliminary_reports=reports_json,
        )
    """

    # ---------- 默认配置 ----------
    DEFAULT_MODEL = "gpt-4o"
    DEFAULT_BASE_URL = "https://api.openai.com/v1"
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_TEMPERATURE = 0.0          # 审计任务需要确定性
    DEFAULT_TIMEOUT = 120              # 秒

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        max_retries: int = DEFAULT_MAX_RETRIES,
        temperature: float = DEFAULT_TEMPERATURE,
        timeout: int = DEFAULT_TIMEOUT,
        system_prompt: Optional[str] = None,
    ):
        """
        初始化审计 Agent。

        Parameters
        ----------
        api_key : str
            LLM API 密钥。
        base_url : str, optional
            API 端点地址，默认 OpenAI。
        model : str, optional
            模型名称，默认 gpt-4o。
        max_retries : int
            最大重试次数，默认 3。
        temperature : float
            采样温度，默认 0.0（确定性输出）。
        timeout : int
            单次请求超时（秒），默认 120。
        system_prompt : str, optional
            自定义 System Prompt；不传则使用内置提示词。
        """
        self.api_key = api_key
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self.model = model or self.DEFAULT_MODEL
        self.max_retries = max_retries
        self.temperature = temperature
        self.timeout = timeout
        self.system_prompt = system_prompt or SYSTEM_PROMPT

        # 惰性导入 openai，避免未安装时导入失败
        self._client = None

    # ------------------------------------------------------------------
    # 公共 API
    # ------------------------------------------------------------------

    def audit(
        self,
        original_paper: Dict[str, Any],
        preliminary_reports: Dict[str, Any],
    ) -> AuditOutput:
        """
        执行审计。

        Parameters
        ----------
        original_paper : dict
            原始论文的结构化 JSON（包含章节文本、图表描述等）。
        preliminary_reports : dict
            4 个引擎的初步评价结果，必须包含 methodology / logic / ethics / innovation。

        Returns
        -------
        AuditOutput
            包含 audit_log 与 audited_results 的审计结果。
        """
        # 1. 输入校验
        self._validate_input(preliminary_reports)

        # 2. 构建用户消息
        user_message = self._build_user_message(original_paper, preliminary_reports)

        # 3. 调用 LLM（含重试）
        raw_response = self._call_llm_with_retry(user_message)

        # 4. 解析响应
        parsed = self._parse_response(raw_response)

        # 5. 后处理：确保 audited_results 不丢失原始字段
        audited_results = self._merge_with_originals(
            preliminary_reports, parsed.get("audited_results", {})
        )

        return AuditOutput(
            audit_log=parsed.get("audit_log", {}),
            audited_results=audited_results,
            raw_response=raw_response,
        )

    # ------------------------------------------------------------------
    # LLM 调用
    # ------------------------------------------------------------------

    def _get_client(self):
        """惰性初始化 OpenAI 客户端。"""
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError:
                raise ImportError(
                    "请先安装 openai 库: pip install openai"
                )
            self._client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                timeout=self.timeout,
            )
        return self._client

    def _call_llm_with_retry(self, user_message: str) -> str:
        """
        调用大模型 API，失败时自动重试。

        重试策略：指数退避 (1s → 2s → 4s …)，最多 max_retries 次。
        """
        client = self._get_client()
        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(
                    "AuditAgent 调用 LLM (第 %d/%d 次)",
                    attempt, self.max_retries,
                )
                response = client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=self.temperature,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                if content is None:
                    raise ValueError("LLM 返回空内容")
                logger.info("AuditAgent LLM 调用成功")
                return content

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "AuditAgent 调用失败 (第 %d 次): %s", attempt, exc
                )
                if attempt < self.max_retries:
                    sleep_seconds = 2 ** (attempt - 1)  # 1, 2, 4, ...
                    logger.info("将在 %d 秒后重试...", sleep_seconds)
                    time.sleep(sleep_seconds)
                else:
                    logger.error("AuditAgent 已达最大重试次数，抛出异常")

        raise RuntimeError(
            f"LLM 调用失败，已重试 {self.max_retries} 次。"
            f"最后一次错误: {last_error}"
        )

    # ------------------------------------------------------------------
    # 消息构建
    # ------------------------------------------------------------------

    def _build_user_message(
        self,
        original_paper: Dict[str, Any],
        preliminary_reports: Dict[str, Any],
    ) -> str:
        """将双 JSON 组装为 LLM 可读的用户消息。"""
        paper_str = json.dumps(original_paper, ensure_ascii=False, indent=2)
        reports_str = json.dumps(preliminary_reports, ensure_ascii=False, indent=2)

        # 截断保护：防止超长论文撑爆上下文窗口（保留足够长度）
        MAX_PAPER_CHARS = 80000
        MAX_REPORT_CHARS = 40000
        if len(paper_str) > MAX_PAPER_CHARS:
            paper_str = paper_str[:MAX_PAPER_CHARS] + "\n... [原始论文过长，已截断]"
        if len(reports_str) > MAX_REPORT_CHARS:
            reports_str = reports_str[:MAX_REPORT_CHARS] + "\n... [评价报告过长，已截断]"

        message = f"""
请对以下论文的初步评价进行审计。

=== 原始论文数据 ===
{paper_str}

=== 初步评价报告 ===
{reports_str}

请严格按照 System Prompt 中的要求，返回严格的 JSON 对象。
"""
        return message

    # ------------------------------------------------------------------
    # 解析与后处理
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_response(raw: str) -> Dict[str, Any]:
        """
        解析 LLM 返回的 JSON 字符串。

        兼容 LLM 偶尔在 JSON 外包裹 ```json ... ``` 的情况。
        """
        text = raw.strip()
        # 去除可能的 markdown 代码块包裹
        if text.startswith("```"):
            # 找到第一个换行后的内容
            first_newline = text.find("\n")
            if first_newline != -1:
                text = text[first_newline + 1:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error("JSON 解析失败: %s\n原始内容前500字符: %s", e, raw[:500])
            raise ValueError(f"LLM 返回的内容无法解析为 JSON: {e}") from e

    @staticmethod
    def _validate_input(preliminary_reports: Dict[str, Any]) -> None:
        """校验 preliminary_reports 是否包含必要的四个引擎。"""
        missing = [k for k in ENGINE_KEYS if k not in preliminary_reports]
        if missing:
            raise ValueError(
                f"preliminary_reports 缺少以下引擎的输出: {missing}。"
                f"必须包含: {list(ENGINE_KEYS)}"
            )

    def _merge_with_originals(
        self,
        originals: Dict[str, Any],
        audited: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        安全合并：以原始数据为基底，用审计结果做"补丁式"覆盖。

        核心原则：
        - 原始字段 100% 保留
        - 仅当 audit 明确修改了某个字段时，才覆盖该字段
        - 如果审计结果缺少某个引擎的整体输出，回退到原始数据
        """
        merged = {}

        for engine_key in ENGINE_KEYS:
            original_engine = originals.get(engine_key, {})
            audited_engine = audited.get(engine_key)

            if audited_engine is None or not isinstance(audited_engine, dict):
                # 审计结果中缺少该引擎 → 完整保留原始数据
                logger.warning(
                    "audited_results 缺少 '%s' 引擎，回退到原始数据", engine_key
                )
                merged[engine_key] = original_engine
            else:
                # 以原始数据为底，审计结果做补丁
                merged[engine_key] = self._deep_patch(
                    original_engine, audited_engine
                )

        return merged

    @staticmethod
    def _deep_patch(
        original: Any,
        patch: Any,
    ) -> Any:
        """
        递归深度补丁合并。

        规则：
        - 如果 original 和 patch 都是 dict：递归合并每个 key
        - 否则：以 patch 为准（意味着 LLM 明确修改了该字段）
        - original 中有但 patch 中没有的字段：保留 original 的值
        """
        if isinstance(original, dict) and isinstance(patch, dict):
            result = dict(original)  # 从原始数据出发
            for key, patch_value in patch.items():
                if key in result:
                    result[key] = AuditAgent._deep_patch(
                        result[key], patch_value
                    )
                else:
                    # patch 中有、original 中没有的字段 → 直接采用
                    result[key] = patch_value
            return result
        else:
            # 标量 / 列表 / 其他类型：LLM 的修改直接覆盖
            return patch


# ---------------------------------------------------------------------------
# 便捷工厂函数
# ---------------------------------------------------------------------------

def create_audit_agent(
    api_key: str,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    **kwargs,
) -> AuditAgent:
    """
    工厂函数：快速创建一个 AuditAgent 实例。

    Parameters
    ----------
    api_key : str
        API 密钥。
    base_url : str, optional
        API 地址。
    model : str, optional
        模型名。
    **kwargs
        传递给 AuditAgent.__init__ 的其他参数。

    Returns
    -------
    AuditAgent
    """
    return AuditAgent(
        api_key=api_key,
        base_url=base_url,
        model=model,
        **kwargs,
    )


# ---------------------------------------------------------------------------
# 独立运行入口（调试 / 测试用）
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os
    import sys

    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # ---- 示例数据 ----
    sample_paper = {
        "title": "A Novel Approach to Machine Reasoning",
        "abstract": "This paper proposes a new framework for reasoning...",
        "sections": [
            {
                "heading": "Introduction",
                "content": "Machine reasoning has been a long-standing challenge..."
            },
            {
                "heading": "Methodology",
                "content": "We introduce a three-stage pipeline consisting of..."
            },
            {
                "heading": "Experiments",
                "content": "We evaluate on three benchmark datasets: Dataset-A, Dataset-B, Dataset-C..."
            },
        ],
        "tables": [
            {"id": "Table 1", "caption": "Performance comparison on Dataset-A"},
            {"id": "Table 2", "caption": "Ablation study results"},
        ],
        "figures": [
            {"id": "Figure 1", "caption": "Architecture overview"},
            {"id": "Figure 2", "caption": "Training curves"},
        ],
    }

    # 模拟 4 个引擎的初步评价（其中包含故意设置的"幻觉"证据）
    sample_reports = {
        "methodology": {
            "score": 8.0,
            "evidence": "The paper uses a three-stage pipeline as described in Section 3.2.",
            "core_conclusion": "Methodology is sound and rigorous.",
            "actionable_advice": "Consider adding more baseline comparisons.",
            "sub_dimensions": {
                "experimental_design": 8.0,
                "reproducibility": 7.5,
            },
        },
        "logic": {
            "score": 6.0,
            "evidence": "The proof in Appendix B contains a contradiction with Table 5.",
            "core_conclusion": "Logical flow has gaps.",
            "actionable_advice": "Revise the proof in Appendix B.",
            "sub_dimensions": {
                "argument_structure": 6.0,
                "deductive_validity": 5.5,
            },
        },
        "ethics": {
            "score": 9.0,
            "evidence": "IRB approval documented in Section 5.1.",
            "core_conclusion": "Ethical compliance is adequate.",
            "actionable_advice": "No major concerns.",
            "sub_dimensions": {
                "data_privacy": 9.0,
                "fairness": 8.5,
            },
        },
        "innovation": {
            "score": 7.0,
            "evidence": "Figure 3 demonstrates a novel architecture not seen in prior work.",
            "core_conclusion": "Moderate novelty.",
            "actionable_advice": "Highlight differentiation from prior art more clearly.",
            "sub_dimensions": {
                "originality": 7.5,
                "impact": 6.5,
            },
        },
    }

    # 从环境变量读取 API 配置
    api_key = os.environ.get("OPENAI_API_KEY", "your-api-key-here")
    base_url = os.environ.get("OPENAI_BASE_URL", None)
    model = os.environ.get("AUDIT_MODEL", "gpt-4o")

    agent = AuditAgent(
        api_key=api_key,
        base_url=base_url,
        model=model,
    )

    print("=" * 60)
    print("AI学术审查系统 Audit Agent - 调试模式")
    print("=" * 60)

    try:
        result = agent.audit(
            original_paper=sample_paper,
            preliminary_reports=sample_reports,
        )

        print("\n📋 审计日志 (audit_log):")
        print(json.dumps(result.audit_log, ensure_ascii=False, indent=2))

        print("\n✅ 审计后结果 (audited_results):")
        print(json.dumps(result.audited_results, ensure_ascii=False, indent=2))

    except Exception as e:
        print(f"\n❌ 审计失败: {e}", file=sys.stderr)
        sys.exit(1)