import { useState, useCallback, useRef, useMemo, useEffect, Component } from "react";
import {
  Upload, Activity, FileText, Download, RefreshCw, X, Zap,
  CheckCircle, AlertCircle, ChevronRight, Languages, Settings,
  Plus, History, Wrench, Shield, AlertTriangle, Info, Eye,
  Lock, Unlock,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import html2pdf from "html2pdf.js";
import { marked } from "marked";
import html2canvas from "html2canvas";

// ============================================================
// API Base URL — Vite env var (dev: localhost, prod: Render URL)
// ============================================================
const API_BASE = "";

// ============================================================
// Mock data for demo
// ============================================================
const MOCK_RESULT = {
  overallScore: 87.5,
  biasLevel: "Moderate-Low",
  retryCount: 0,
  engines: {
    methodology: {
      score: 85,
      core_conclusion: "研究方法整体规范，但样本存在显著的 WEIRD 偏差，统计方法选择恰当但效应量报告不完整。",
      evidence: "Section 3.2 Table 1：样本 76% 来自北美本科生（M_age=19.7），性别比 7:3。未提供 G*Power 先验功效分析。Method 部分缺失异常值处理策略。",
      actionable_advice: "1) 补充分层采样或事后加权方案校正人口学偏差；2) 在 Method 部分增加 G*Power 功效分析报告；3) 采用箱线图+IQR 法处理异常值并公开排除标准。"
    },
    logic: {
      score: 90,
      core_conclusion: "论证链条清晰递进，因果推断框架正确，但 Discussion 中存在一处相关到因果的语言跳跃。",
      evidence: "Section 4.1 Discussion：'A significantly predicts B (p<.001), therefore A causes B' — 未控制潜在混杂变量 Z。全文逻辑一致性良好，各章节间无矛盾。",
      actionable_advice: "1) 将因果性语言改为关联性表述，或补充工具变量/DID 策略；2) 在 Limitations 中列出未观测混杂变量；3) 勘误 p.15 表 3 注释中的符号错误。"
    },
    ethics: {
      score: 95,
      core_conclusion: "伦理合规性优秀，IRB 信息完整可追溯，但作者地域单一性构成轻微的认知多样性不足。",
      evidence: "首页明确标注 IRB#2024-047，可在线验证。利益冲突声明完整。但作者单位均为北美 R1 大学（MIT, Stanford, UC Berkeley），被试招募仅通过英文渠道。",
      actionable_advice: "1) 在 Discussion 末尾增加研究局限性声明（样本文化限制）；2) 建议邀请 1-2 位非西方机构合作者审阅讨论部分；3) 完善 COI 的机构级披露。"
    },
    innovation: {
      score: 80,
      core_conclusion: "XAI 方法交叉引入具有一定新颖性，但理论贡献属验证式扩展而非颠覆性突破，未来工作展望过于宽泛。",
      evidence: "Introduction 明确声称'首次将 SHAP 解释框架引入该细分领域'，但 Discussion 承认'核心框架沿用 [Smith, 2020]'。增量贡献主要体现在 contextual application 层面。",
      actionable_advice: "1) 精确区分方法论创新与应用创新的边界；2) 将'未来可结合 fMRI'改为具体实验设计方案（如 N=80 within-subject 设计）；3) 补充与 [Chen, 2023] 的差异化对比。"
    }
  }
};

// ============================================================
// ErrorBoundary — prevents any child crash from white-screening
// ============================================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("[AI学术审查系统 ErrorBoundary]", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800">
          <p className="font-semibold mb-2">Component render error</p>
          <p className="text-xs font-mono text-red-600 whitespace-pre-wrap">
            {String(this.state.error?.message ?? "Unknown error")}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// i18n Dictionary (unchanged)
// ============================================================
const T = {
  zh: {
    brand: "AI学术审查系统", version: "v2.0 专业版",
    engineStatus: "引擎状态", reviewEngine: "审查引擎", computePool: "计算池负载",
    arbitrationHub: "仲裁中枢", reviewMode: "审查模式",
    online: "在线", cores4: "4 核并发", idle: "空闲", active: "运行中", standby: "待命",
    concurrent: "并发审查", arbitration: "仲裁打回",
    uploadManuscript: "论文上传", uploadHint: "点击上传 PDF / DOCX / TXT", clearReset: "清除重置",
    appTitle: "AI学术审查系统",
    appSubtitle: "多引擎协同 · 深度学术偏见检测 · 全局一致性仲裁",
    title: "AI学术审查系统 学术偏见审查系统",
    subtitle: "多引擎协作 · 深度学术偏见检测 · 全局一致性仲裁",
    tab0: "社会科学与人文", tab1: "理工与实验科学", tab2: "医学与生命科学",
    focus0: "审查侧重：抽样代表性、文化偏见（WEIRD）、质性编码信度、意识形态渗透检测。适用于社会学、心理学、教育学、人类学及相关领域论文。",
    focus1: "审查侧重：实验可复现性、统计方法恰当性、数据清洗透明度、结果选择性报告（p-hacking）。适用于计算机科学、物理学、工程学及相关领域论文。",
    focus2: "审查侧重：临床试验注册合规性、利益冲突披露、样本纳入/排除标准合理性、基因决定论与生物本质主义风险。适用于医学、公共卫生、生命科学及相关领域论文。",
    uploadPrompt: "请在左侧边栏上传一篇 PDF 论文文件以开始审查。",
    systemOverview: "系统概述",
    overviewDesc: "AI学术审查系统 v2.0 是一款基于多引擎协作的学术论文偏见审查工具，旨在帮助研究者在投稿前自查论文中潜在的认知偏见、方法论缺陷与伦理风险。",
    reviewPipeline: "审查流程",
    pipeline1: "上传论文 — 四大引擎并发阅读全文。",
    pipeline2: "全局仲裁 — 仲裁中枢交叉校验各引擎评分与 Evidence 的一致性，发现异常立即打回重做。",
    pipeline3: "生成报告 — 结构化输出含雷达图、综合得分及各引擎详细评语。",
    pipeline1Label: "上传论文", pipeline2Label: "全局仲裁", pipeline3Label: "生成报告",
    reconfigure: "重新配置",
    fourEngines: "四大审查引擎", engineCol: "引擎", focusCol: "关注要点",
    initEngines: "正在初始化学术审查引擎...", launching: "启动",
    submitting: "将审查结果提交至 [全局一致性仲裁中枢] 进行交叉比对...",
    toastConflict: "仲裁中枢发现评分-Evidence 维度冲突，已触发强制深度复审！",
    warnMismatch: "检测到高分低质维度冲突：方法论引擎评分偏高，但其 Evidence 明确记录了 WEIRD 抽样偏差与类别不平衡问题。正在进行第 {n} 轮重构审查...",
    reEval: "方法论与实证检验引擎重新评估中 ...",
    crossCheck: "全局一致性仲裁中枢二次校验中 ...",
    finalApproval: "仲裁中枢终审核准：所有引擎评分与 Evidence 一致性达标，结构化报告已生成。",
    processing: "处理中...",
    successBanner: "仲裁中枢终审核准：所有引擎评分与 Evidence 一致性达标，结构化报告已生成。",
    radarTitle: "四维审查雷达图", overallAssessment: "综合评审结果",
    compositeScore: "综合审查得分", biasLevel: "偏见等级",
    moderateLow: "中等偏低", moderateHigh: "中等偏高", crossValidated: "交叉校验通过",
    perEngineScores: "各引擎得分明细", postArbitration: "仲裁修正（第 {n} 轮）",
    readyForReview: "就绪，等待审查", startReview: "开始审查",
    reviewComplete: "审查完成", reRunReview: "重新审查",
    engineReports: "引擎详细报告",
    reportsCaption: "以下为全局一致性仲裁中枢终审通过后的最终报告，各引擎输出均已交叉校验。",
    coreConclusion: "核心结论", evidence: "评价依据（Evidence）",
    actionableAdvice: "修改建议（Actionable Advice）", engineScore: "引擎评分",
    download: "下载完整审查报告（Markdown）",
    demoButton: "查看样例",
    confidenceLabel: "置信度",
    strengthsLabel: "论文亮点",
    issuesLabel: "检测到的问题",
    suggestionLabel: "建议: ",
    viewReasoning: "查看审查引擎推理过程",
    limitationsLabel: "评估局限性: ",
    exportPDFLabel: "导出 PDF",
    exportingLabel: "正在导出...",
    lowRiskLabel: "低风险", mediumRiskLabel: "中风险", highRiskLabel: "高风险",
    highSeverityLabel: "高严重度", mediumSeverityLabel: "中严重度", lowSeverityLabel: "低严重度",
    privacyFooter: "隐私声明：上传论文仅作本地/临时缓存，检测完成 72 小时后自动删除，绝不抓取或传播用户未发表稿件。",
    issuesLabel: "检测到的问题",
    suggestionLabel: "建议: ",
    viewReasoning: "查看审查引擎推理过程",
    limitationsLabel: "评估局限性: ",
    exportPDFLabel: "导出 PDF",
    exportingLabel: "正在导出...",
    lowRiskLabel: "低风险", mediumRiskLabel: "中风险", highRiskLabel: "高风险",
    highSeverityLabel: "高严重度", mediumSeverityLabel: "中严重度", lowSeverityLabel: "低严重度",
    privacyFooter: "隐私声明：上传论文仅作本地/临时缓存，检测完成 72 小时后自动删除，绝不抓取或传播用户未发表稿件。",
    newReview: "新建审查", history: "历史记录", devMode: "运维模式",
    historySoon: "历史记录功能开发中...", settingsSoon: "设置功能开发中...",
    appealTitle: "对 {engine} 的审查结果有异议？",
    appealHint: "请描述您的申诉理由，我们将转交人工专家复核。",
    appealPlaceholder: "请说明您认为大模型误判的具体原因...",
    appealSuccess: "申诉已记录，将转交人工专家复核。",
    submitAppeal: "提交复核", cancel: "取消",
    appealButton: "异议申诉",
    configSaved: "保存并进入审查系统",
    configHint: "凭证仅保存在本地浏览器中，不会上传到服务器",
    configTitle: "配置你的大模型 API 凭证以进入审查系统",
    configApiKey: "API Key", configBaseUrl: "Base URL", configModel: "模型名称",
    methodologyName: "方法论与实证检验引擎", logicName: "论证严密性与逻辑推演引擎",
    ethicsName: "学术伦理与认知偏见检测引擎", innovationName: "理论增量与前瞻性评估引擎",
    methodologyShort: "方法论与实证", logicShort: "逻辑推演",
    ethicsShort: "伦理与偏见", innovationShort: "理论增量",
    methFocus: "抽样偏差、数据质量、统计方法、可复现性",
    logicFocus: "论证链条、因果推断、谬误检测、统计表述准确性",
    ethicsFocus: "WEIRD 偏见、IRB 合规、利益冲突、认知多样性",
    innovationFocus: "理论贡献、方法论新颖性、应用潜力、未来工作可行性",
    methConclusion: "样本存在显著的 WEIRD 偏差与类别不平衡，实验设计整体可复现但部分对照组选择逻辑需补充。",
    methEvidence: "论文第 3.2 节 Table 1：样本男女比 8:2，且 94% 被试来自北美大学本科生群体。Method 部分未提供异常值处理策略与剔除标准。",
    methAdvice: "补充分层采样或事后加权方案以校正性别/地域失衡；在 Method 节增加异常值处理流程图（推荐箱线图+IQR法）；公开数据收集的完整 exclusion criteria。",
    logicConclusion: "整体论证链条清晰、递进合理，但因果关系推断环节存在相关到因果的跳跃，交互效应解读处有一处符号印刷错误。",
    logicEvidence: "论文第 4.1 节 Discussion 段1：'A significantly correlates with B, therefore A causes B' — 未讨论潜在混杂变量 Z。p.15 表3 注释：回归系数符号与正文不符。",
    logicAdvice: "将因果性表述改为关联性表述，或补充工具变量/DID 等因果识别策略；勘误 p.15 表3注释中的符号错误；在 Limitation 段明确列出未观测混杂变量的可能影响。",
    ethicsConclusion: "IRB 合规信息不完整，作者团队地域单一性构成认知多样性缺陷，敏感社会议题的讨论缺少风险声明。",
    ethicsEvidence: "脚注仅写'经伦理审查批准'但无 IRB 编号（参见首页脚注）；作者机构均为北美 R1 大学（Title Page）；被试招募广告仅通过英文渠道发布（Appendix A）。",
    ethicsAdvice: "补充可追溯的 IRB 审批编号；在 Discussion 末尾增加研究局限性声明，明确说明样本文化局限及结论适用范围；建议邀请至少 1 位非西方机构合作者审阅敏感议题论述。",
    innovationConclusion: "XAI 方法交叉引入心理学领域具有新颖性，但理论贡献属验证式扩展而非颠覆性突破，未来工作展望过于宽泛。",
    innovationEvidence: "Introduction 段3 明确声称'首次将 SHAP 解释框架引入该细分领域'；但 Discussion 中承认'核心框架沿用 [Smith, 2020]'，增量贡献主要体现在 contextual application。",
    innovationAdvice: "在 Contribution 段精确区分方法论创新与应用创新的边界；将'未来可结合 fMRI'改为具体的实验设计提案（如在 N=80 的 within-subject 设计中复现 Study 2）；补充与 [Chen, 2023] 的差异化对比分析。",
  },
  en: {
    brand: "AI学术审查系统", version: "v2.0 Professional",
    engineStatus: "Engine Status", reviewEngine: "Review Engine", computePool: "Compute Pool",
    arbitrationHub: "Arbitration Hub", reviewMode: "Review Mode",
    online: "Online", cores4: "4 Cores", idle: "Idle", active: "Active", standby: "Standby",
    concurrent: "Concurrent", arbitration: "Arbitration",
    uploadManuscript: "Upload Manuscript", uploadHint: "Click to upload PDF", clearReset: "Clear & Reset",
    appTitle: "AI Academic Review System",
    appSubtitle: "Multi-engine collaboration · Deep bias detection · Global arbitration",
    title: "AI学术审查系统 Academic Bias Review System",
    subtitle: "Multi-engine collaboration · Deep academic bias detection · Global consistency arbitration",
    tab0: "Social Sciences & Humanities", tab1: "STEM & Experimental Sciences", tab2: "Medicine & Life Sciences",
    focus0: "Review focus: Sampling representativeness, cultural bias (WEIRD), qualitative coding reliability, ideological penetration detection. Applicable to sociology, psychology, education, anthropology, and related fields.",
    focus1: "Review focus: Experimental reproducibility, statistical method adequacy, data cleaning transparency, selective reporting (p-hacking). Applicable to computer science, physics, engineering, and related fields.",
    focus2: "Review focus: Clinical trial registration compliance, COI disclosure, inclusion/exclusion criteria rationale, genetic determinism and bio-essentialism risk. Applicable to medicine, public health, life sciences, and related fields.",
    uploadPrompt: "Upload a PDF manuscript in the left sidebar to begin the review.",
    systemOverview: "System Overview",
    overviewDesc: "AI学术审查系统 v2.0 is a multi-engine academic bias review tool designed to help researchers self-audit papers for potential cognitive biases, methodological flaws, and ethical risks before submission.",
    reviewPipeline: "Review Pipeline",
    pipeline1: "Upload — Four engines concurrently read the full manuscript.",
    pipeline2: "Arbitration — The Arbitration Hub cross-validates scores against Evidence. Any conflict triggers an immediate re-review.",
    pipeline3: "Report — Structured output: radar chart, composite score, and detailed per-engine reports.",
    pipeline1Label: "Upload Manuscript", pipeline2Label: "Global Arbitration", pipeline3Label: "Generate Report",
    reconfigure: "Reconfigure",
    fourEngines: "Four Review Engines", engineCol: "Engine", focusCol: "Focus Area",
    initEngines: "Initializing academic review engines...", launching: "Launching",
    submitting: "Submitting results to [Global Consistency Arbitration Hub] for cross-validation ...",
    toastConflict: "Arbitration Hub detected dimension conflict — forced deep re-review triggered!",
    warnMismatch: "Score-Evidence mismatch detected: Methodology Engine scored high while its Evidence records WEIRD bias and class imbalance. Re-evaluation round {n} in progress...",
    reEval: "Methodology Engine re-evaluating ...",
    crossCheck: "Arbitration Hub performing secondary cross-check ...",
    finalApproval: "Arbitration Hub final approval: all engine scores consistent with Evidence. Structured report generated.",
    processing: "Processing...",
    successBanner: "Arbitration Hub final approval: all engine scores are consistent with their Evidence. Structured report generated.",
    radarTitle: "4-Dimension Review Radar", overallAssessment: "Overall Assessment",
    compositeScore: "Composite Score", biasLevel: "Bias Level",
    moderateLow: "Moderate-Low", moderateHigh: "Moderate-High", crossValidated: "Cross-validated",
    perEngineScores: "Per-Engine Scores", postArbitration: "Post-arbitration (round {n})",
    readyForReview: "Ready for review", startReview: "Start Review",
    reviewComplete: "Review Complete", reRunReview: "Re-run Review",
    engineReports: "Detailed Engine Reports",
    reportsCaption: "Final output approved by the Global Consistency Arbitration Hub. All entries are cross-validated.",
    coreConclusion: "Core Conclusion", evidence: "Evidence",
    actionableAdvice: "Actionable Advice", engineScore: "Engine Score",
    download: "Download Full Review Report (Markdown)",
    demoButton: "View Sample",
    confidenceLabel: "Confidence",
    strengthsLabel: "Strengths",
    issuesLabel: "Issues",
    suggestionLabel: "Suggestion: ",
    viewReasoning: "View Engine Reasoning Process",
    limitationsLabel: "Limitations: ",
    exportPDFLabel: "Export PDF",
    exportingLabel: "Exporting...",
    lowRiskLabel: "Low Risk", mediumRiskLabel: "Medium Risk", highRiskLabel: "High Risk",
    highSeverityLabel: "High Severity", mediumSeverityLabel: "Medium Severity", lowSeverityLabel: "Low Severity",
    privacyFooter: "Privacy: Uploaded manuscripts are cached locally/temporarily and auto-deleted 72 hours after review. We never crawl or distribute unpublished work.",
    newReview: "New Review", history: "History", devMode: "Ops Mode",
    historySoon: "History feature coming soon...", settingsSoon: "Settings feature coming soon...",
    appealTitle: "Objection to {engine}'s review?",
    appealHint: "Describe your objection and we will escalate to a human expert for review.",
    appealPlaceholder: "Please explain why you believe the AI made an error...",
    appealSuccess: "Objection recorded — will be escalated to human expert review.",
    submitAppeal: "Submit Appeal", cancel: "Cancel",
    appealButton: "Appeal",
    configSaved: "Save & Enter System",
    configHint: "Credentials are stored only in your browser — never uploaded to the server.",
    configTitle: "Configure your LLM API credentials to enter the review system",
    configApiKey: "API Key", configBaseUrl: "Base URL", configModel: "Model Name",
    methodologyName: "Methodology & Empirical Validation", logicName: "Argument Rigor & Logical Deduction",
    ethicsName: "Academic Ethics & Cognitive Bias Detection", innovationName: "Theoretical Increment & Foresight Assessment",
    methodologyShort: "Methodology", logicShort: "Logic",
    ethicsShort: "Ethics", innovationShort: "Innovation",
    methFocus: "Sampling bias, data quality, statistical methods, reproducibility",
    logicFocus: "Argument chain, causal inference, fallacy detection, reporting accuracy",
    ethicsFocus: "WEIRD bias, IRB compliance, COI, cognitive diversity",
    innovationFocus: "Theoretical contribution, novelty, application potential, future-work feasibility",
    methConclusion: "Significant WEIRD bias and class imbalance detected. Experimental design is reproducible but control-group logic needs supplementation.",
    methEvidence: "Section 3.2, Table 1: M/F ratio 8:2; 94% of subjects are North American undergraduates. The Method section lacks an outlier-handling strategy and exclusion criteria.",
    methAdvice: "Add stratified sampling or post-hoc weighting to correct gender/regional imbalance. Include an outlier-handling flowchart (boxplot + IQR) in the Method section. Publish full exclusion criteria.",
    logicConclusion: "Argument chain is clear and progressive, but a correlation-to-causation leap exists. One typographical sign error in interaction-effect notes.",
    logicEvidence: "Section 4.1, Discussion: 'A significantly correlates with B, therefore A causes B' — confounding variable Z not discussed. Table 3 note on p.15: regression coefficient sign contradicts the main text.",
    logicAdvice: "Replace causal with associative language, or supplement with IV/DiD strategies. Correct the sign error in Table 3 note. List unobserved confounders in Limitations.",
    ethicsConclusion: "IRB compliance is incomplete. Single-region authorship constitutes a cognitive-diversity deficit. Sensitive-topic discussion lacks a risk statement.",
    ethicsEvidence: "Footnote states 'approved by ethics review' but no IRB number. All author affiliations are North American R1 universities. Recruitment ads published only via English channels.",
    ethicsAdvice: "Supply a traceable IRB approval number. Add a Limitations of Generalizability statement. Invite at least one non-Western collaborator to review sensitive passages.",
    innovationConclusion: "Introducing XAI into this sub-field is novel, but the theoretical contribution is confirmatory extension rather than a breakthrough. Future-work outlook is overly broad.",
    innovationEvidence: "Introduction claims 'first application of SHAP to this sub-domain'. Discussion acknowledges 'core framework follows [Smith, 2020]' — primarily contextual application.",
    innovationAdvice: "Distinguish methodological from application innovation. Replace 'future fMRI' with a concrete proposal. Add differentiated comparison with [Chen, 2023].",
  },
};

// ============================================================
// Engine keys constant
// ============================================================
const ENGINE_KEYS = ["methodology", "ethics", "logic", "innovation"];

// Engine weight colors (for donut chart & sliders)
const ENGINE_WEIGHT_COLORS = {
  methodology: { fill: "#3B82F6", label: "方法论", labelEn: "Methodology" },
  logic: { fill: "#8B5CF6", label: "逻辑推演", labelEn: "Logic" },
  ethics: { fill: "#10B981", label: "伦理偏见", labelEn: "Ethics" },
  innovation: { fill: "#F97316", label: "理论创新", labelEn: "Innovation" },
};

// ============================================================
// Issue type mapping: English key -> Chinese academic term
// ============================================================
const ISSUE_TYPE_MAP = {
  uncertainty_not_reported: "未报告不确定性",
  reproducibility_insufficient: "复现性不足",
  related_work_insufficient: "相关工作对比不足",
  methodology_flaw: "方法论缺陷",
  sampling_bias: "抽样偏差",
  statistical_error: "统计方法错误",
  ethics_concern: "学术伦理问题",
  data_quality_issue: "数据质量问题",
  conclusion_overreach: "结论过度推断",
  missing_control_group: "缺少对照组",
  confound_not_controlled: "混杂变量未控制",
  literature_gap: "文献覆盖不足",
  logical_fallacy: "逻辑谬误",
  reporting_incomplete: "报告不完整",
  peer_review_insufficient: "同行评审不充分",
  effect_size_not_reported: "效应量未报告",
  power_analysis_missing: "功效分析缺失",
  selection_bias: "选择偏差",
  measurement_bias: "测量偏差",
  confounding_bias: "混杂偏差",
  publication_bias: "发表偏差",
  funding_bias: "资助偏差",
  cultural_bias: "文化偏差",
  gender_bias: "性别偏差",
  geographic_bias: "地域偏差",
  language_bias: "语言偏差",
  citation_bias: "引用偏差",
};

function translateIssueType(rawType) {
  if (!rawType) return "";
  return ISSUE_TYPE_MAP[rawType] || rawType;
}

// ============================================================
// Shared Markdown report generator (used by both download & PDF)
// ============================================================
function generateMarkdownReport({ engineMeta, engineScores, overallScore, biasLevel, retryCount }) {
  const lines = [];
  const scoreValue = typeof overallScore === "number" ? overallScore.toFixed(1) : "0.0";

  lines.push("# 论文审查报告");
  lines.push("");
  lines.push(`- **综合得分**：${scoreValue} / 100`);
  lines.push(`- **整体风险等级**：${biasLevel}`);
  lines.push(`- **仲裁轮次**：${retryCount}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  ENGINE_KEYS.forEach((key, idx) => {
    const eng = engineMeta[key] || {};
    const score = engineScores[key] ?? 0;
    const engNum = idx + 1;

    lines.push(`## ${engNum}. ${eng.name || key}`);
    lines.push("");

    lines.push("| 项目 | 内容 |");
    lines.push("|------|------|");
    lines.push(`| **引擎名称** | ${eng.name || key} |`);
    lines.push(`| **单项得分** | ${score} / 100 |`);
    if (eng.confidence != null) {
      lines.push(`| **置信度** | ${Math.round(eng.confidence * 100)}% |`);
    }
    if (eng.riskLevel) {
      const riskLabel =
        eng.riskLevel === "high" ? "【高度风险】" :
        eng.riskLevel === "medium" ? "【中度风险】" : "【低度风险】";
      lines.push(`| **风险等级** | ${riskLabel} |`);
    }
    lines.push("");

    lines.push("### 核心结论");
    lines.push("");
    lines.push(eng.conclusion || "（暂无结论）");
    lines.push("");

    const strengths = eng.strengths || [];
    if (strengths.length > 0) {
      lines.push("### 论文亮点");
      lines.push("");
      strengths.forEach((s) => {
        lines.push(`- ${s}`);
      });
      lines.push("");
    }

    const issues = eng.issues || [];
    if (issues.length > 0) {
      lines.push("### 风险与问题");
      lines.push("");
      issues.forEach((issue, i) => {
        const sevLabel =
          issue.severity === "high" ? "**风险等级**：【高度风险】" :
          issue.severity === "medium" ? "**风险等级**：【中度风险】" : "**风险等级**：【低度风险】";
        lines.push(`#### 问题 ${i + 1}：${sevLabel}`);
        lines.push("");
        if (issue.issue_type) {
          const translatedType = translateIssueType(issue.issue_type);
          lines.push(`- **问题类型**：${translatedType}`);
        }
        if (issue.evidence) {
          const evidenceText = String(issue.evidence).replace(/\n+/g, " ").trim();
          lines.push(`- **证据**：`);
          lines.push(`  > ${evidenceText}`);
        }
        if (issue.suggestion) {
          const suggestionText = String(issue.suggestion).replace(/\n+/g, " ").trim();
          lines.push(`- **建议**：`);
          lines.push(`  > ${suggestionText}`);
        }
        lines.push("");
      });
    }

    if (eng.reasoningMd) {
      lines.push("### 审查推理过程");
      lines.push("");
      lines.push(eng.reasoningMd);
      lines.push("");
    }

    const limitations = eng.limitations || [];
    if (limitations.length > 0) {
      lines.push("### 评估局限性");
      lines.push("");
      limitations.forEach((lim) => { lines.push(`- ${lim}`); });
      lines.push("");
    }

    if (strengths.length === 0 && issues.length === 0 && !eng.reasoningMd) {
      lines.push("### 评价依据（Evidence）");
      lines.push("");
      lines.push(eng.evidence || "（暂无评价依据）");
      lines.push("");
      lines.push("### 修改建议（Actionable Advice）");
      lines.push("");
      lines.push(eng.advice || "（暂无修改建议）");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  lines.push("*Generated by AI学术审查系统 v5.3*");
  return lines.join("\n");
}

// Subject presets: [社会科学, 理工, 医学]
const SUBJECT_WEIGHT_PRESETS = [
  { methodology: 15, logic: 30, ethics: 35, innovation: 20 },
  { methodology: 40, logic: 30, ethics: 10, innovation: 20 },
  { methodology: 35, logic: 15, ethics: 40, innovation: 10 },
];

// Domain → theme color mapping
const DOMAIN_THEMES = [
  { tab: "bg-orange-500 border-orange-500", badge: "bg-orange-100 text-orange-700", card: "border-orange-200", bg: "bg-orange-50", accent: "orange", lightBg: "bg-orange-50", lightBorder: "border-orange-200", lightText: "text-orange-800" },
  { tab: "bg-blue-600 border-blue-600", badge: "bg-blue-100 text-blue-700", card: "border-blue-200", bg: "bg-blue-50", accent: "blue", lightBg: "bg-blue-50", lightBorder: "border-blue-200", lightText: "text-blue-800" },
  { tab: "bg-green-600 border-green-600", badge: "bg-green-100 text-green-700", card: "border-green-200", bg: "bg-green-50", accent: "green", lightBg: "bg-green-50", lightBorder: "border-green-200", lightText: "text-green-800" },
];

// ============================================================
// Tooltip — inline hover popup for academic terms
// ============================================================
function Tooltip({ term, children }) {
  return (
    <span className="relative group/tip inline-block">
      <span className="border-b border-dotted border-slate-400 cursor-help">{children ?? term}</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block z-50 w-64 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-normal text-left">
        {term}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </span>
    </span>
  );
}

// ============================================================
// AppealModal
// ============================================================
function AppealModal({ engineName, isOpen, onClose, t }) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setReason(""); onClose(); }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">
          {t?.appealTitle?.replace("{engine}", engineName) ?? `对 ${engineName} 的审查结果有异议？`}
        </h3>
        <p className="text-xs text-slate-500 mb-4">{t?.appealHint ?? "请描述您的申诉理由，我们将转交人工专家复核。"}</p>
        {submitted ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">
            <CheckCircle size={18} />
            {t?.appealSuccess ?? "申诉已记录，将转交人工专家复核。"}
          </div>
        ) : (
          <>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-400 resize-none"
              placeholder={t?.appealPlaceholder ?? "请说明您认为大模型误判的具体原因..."}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                {t?.cancel ?? "取消"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reason.trim()}
                className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t?.submitAppeal ?? "提交复核"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// HistoryModal — list past reviews, click to reload
// ============================================================
function HistoryModal({ isOpen, onClose, t, lang, onSelect }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/reports`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setList(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDate = (isoStr) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return isoStr; }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">
            {lang === "zh" ? "历史审查记录" : "Review History"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="text-center text-sm text-slate-400 py-8">
              <div className="animate-spin inline-block w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full mb-2" />
              <p>{lang === "zh" ? "加载中..." : "Loading..."}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && list.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              {lang === "zh" ? "暂无审查记录" : "No review history"}
            </p>
          )}

          {!loading && !error && list.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 border border-slate-100 mb-2 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 truncate max-w-[300px]">
                  {item.filename || (lang === "zh" ? "未命名" : "Untitled")}
                </span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-slate-400">{formatDate(item.created_at)}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{item.subject ?? ""}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SettingsModal — API key + feedback link
// ============================================================
function SettingsModal({ isOpen, onClose, t, lang, apiKey, baseUrl, modelName, onSave, onApiKeyChange, onBaseUrlChange, onModelNameChange }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-slate-800">
            {lang === "zh" ? "系统设置" : "Settings"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              {t.configApiKey}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              {lang === "zh" ? "修改后将应用于后续的审查任务" : "Changes apply to future review tasks"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              {lang === "zh"
                ? "提示：若您开启了网络代理（梯子），请将其设置为「全局/绕过大陆」模式，或暂时关闭，否则可能导致阿里云 API 连接超时。"
                : "Tip: If using a VPN/proxy, set it to \"Global/Bypass Mainland China\" mode or disable it, otherwise API connections may time out."}
            </p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              {t.configBaseUrl}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder="https://api.deepseek.com/v1"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              {t.configModel}
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => onModelNameChange(e.target.value)}
              placeholder="deepseek-chat"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Feedback link */}
          <div className="border-t border-slate-100 pt-4">
            <a
              href="https://github.com/orgs/AI学术审查系统-team/repositories"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              {lang === "zh" ? "提交建议与反馈" : "Submit Feedback"}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => { onSave(); onClose(); }}
            disabled={!apiKey.trim() || !baseUrl.trim() || !modelName.trim()}
            className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {lang === "zh" ? "保存配置" : "Save Config"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TiltCard
// ============================================================
function TiltCard({ children, tiltFactor = 1.5, className = "" }) {
  const ref = useRef(null);
  const [transform, setTransform] = useState("");

  const handleMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((y - cy) / cy) * -tiltFactor;
    const ry = ((x - cx) / cx) * tiltFactor;
    setTransform(`perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`);
  };

  const handleLeave = () => {
    setTransform("perspective(1000px) rotateX(0deg) rotateY(0deg)");
  };

  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`}
      style={{ transform }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
    </div>
  );
}

// ============================================================
// Metric
// ============================================================
function Metric({ label, value, delta }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label ?? ""}</p>
      <p className="text-base font-bold text-slate-800 mt-0.5">{value ?? ""}</p>
      {delta && <p className="text-[10px] text-blue-600 mt-0.5">{delta}</p>}
    </div>
  );
}

// ============================================================
// SafeRadarChart — pure SVG, no external chart library
// ============================================================
function SafeRadarChart({ data = [] }) {
  const size = 360;
  const center = size / 2;
  const radius = 125;
  const levels = [20, 40, 60, 80, 100];

  const safeData = Array.isArray(data) && data.length
    ? data.slice(0, 4)
    : [
        { subject: "Methodology", score: 0 },
        { subject: "Logic", score: 0 },
        { subject: "Ethics", score: 0 },
        { subject: "Innovation", score: 0 },
      ];

  const points = safeData.map((item, index) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / safeData.length);
    const rawScore = Number(item?.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
    const r = radius * (score / 100);

    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
      labelX: center + Math.cos(angle) * (radius + 34),
      labelY: center + Math.sin(angle) * (radius + 34),
      subject: String(item?.subject ?? ""),
    };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const axisPoints = safeData.map((_, index) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / safeData.length);
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });

  return (
    <div id="radar-chart-container" className="w-full flex justify-center items-center" style={{ height: "380px" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} role="img">
        {levels.map((level) => {
          const r = radius * (level / 100);
          const gridPoints = safeData.map((_, index) => {
            const angle = -Math.PI / 2 + index * ((Math.PI * 2) / safeData.length);
            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
          }).join(" ");

          return (
            <polygon
              key={level}
              points={gridPoints}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        {axisPoints.map((p, index) => (
          <line
            key={index}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}

        <polygon
          points={polygonPoints}
          fill="#2563EB"
          fillOpacity="0.18"
          stroke="#2563EB"
          strokeWidth="2.5"
        />

        {points.map((p, index) => (
          <circle
            key={index}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#2563EB"
          />
        ))}

        {points.map((p, index) => (
          <text
            key={index}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12"
            fill="#475569"
          >
            {p.subject}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ============================================================
// ContentArea
// ============================================================
function ContentArea({ t, lang, phase, file, logs, retryCount, overallScore, biasLevel, radarData, engineMeta, engineScores, onStart, onReset, hasError, onDownload, onAppeal, domainTheme }) {
  const logEndRef = useRef(null);
  const [pdfExporting, setPdfExporting] = useState(false);

  // ---- Direct PDF export: Markdown -> chart capture -> styled HTML -> html2pdf ----
  const handleDirectPDFExport = useCallback(async () => {
    if (pdfExporting) return;
    setPdfExporting(true);

    try {
      await new Promise((r) => setTimeout(r, 100));

      // 1. Capture radar chart as base64 image
      let chartHtml = "";
      const chartElement = document.getElementById("radar-chart-container");
      if (chartElement) {
        try {
          const canvas = await html2canvas(chartElement, { scale: 2, backgroundColor: "#ffffff", logging: false });
          const imgData = canvas.toDataURL("image/png");
          chartHtml = `<h2>综合审查雷达图</h2><img src="${imgData}" alt="雷达图" />`;
        } catch (e) {
          console.warn("[AI学术审查系统] Radar chart capture for PDF failed:", e);
        }
      }

      // 2. Build full Markdown report
      const md = generateMarkdownReport({ engineMeta, engineScores, overallScore, biasLevel, retryCount });

      // 3. Convert Markdown to HTML
      const rawHtml = marked.parse(md);

      // 4. Wrap in a fully self-contained styled HTML document string
      const styledHtml = `<div style="padding:20px;font-family:'Helvetica Neue',Helvetica,Arial,'Microsoft YaHei',sans-serif;color:#333;line-height:1.7;">
  <style>
    h1, h2, h3 { color:#2c3e50; margin-top:24px; }
    h1 { font-size:24px; border-bottom:2px solid #2c3e50; padding-bottom:10px; text-align:center; }
    h2 { font-size:18px; border-bottom:1px solid #e0e0e0; padding-bottom:6px; }
    h3 { font-size:15px; }
    h4 { font-size:14px; color:#555; margin-top:16px; }
    table { border-collapse:collapse; width:100%; margin:16px 0; font-size:13px; }
    th, td { border:1px solid #ddd; padding:10px 14px; text-align:left; }
    th { background-color:#f8f9fa; font-weight:bold; color:#2c3e50; }
    td { color:#444; }
    blockquote { border-left:4px solid #4a90e2; margin:14px 0; padding:10px 18px; background-color:#f8f9fa; color:#555; }
    ul, ol { padding-left:24px; margin:8px 0; }
    li { margin-bottom:6px; font-size:13px; line-height:1.7; }
    p { font-size:13px; margin:6px 0; }
    hr { border:none; border-top:1px solid #e0e0e0; margin:24px 0; }
    strong { color:#2c3e50; }
    code { background:#f0f0f0; padding:2px 6px; border-radius:3px; font-size:12px; }
    pre { background:#2d3436; color:#dfe6e9; padding:16px; border-radius:6px; overflow-x:auto; font-size:12px; line-height:1.5; }
    pre code { background:none; padding:0; color:inherit; }
    img { max-width:75%; height:auto; margin:20px auto; display:block; border:1px solid #e0e0e0; border-radius:8px; padding:10px; }
  </style>
  ${chartHtml}
  ${rawHtml}
</div>`;

      // 5. Pass the HTML string directly to html2pdf (no DOM manipulation needed)
      await html2pdf().set({
        margin: [15, 15, 15, 15],
        filename: "AI学术审查系统_Review_Report.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(styledHtml).save();
    } catch (err) {
      console.error("[AI学术审查系统] Direct PDF export failed:", err);
    } finally {
      setPdfExporting(false);
    }
  }, [pdfExporting, engineMeta, engineScores, overallScore, biasLevel, retryCount]);

  // Auto-scroll to bottom whenever logs change
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Parse a log line into agent prefix + message body
  const parseLogLine = (text) => {
    const agentMatch = text.match(/^(\[.+?\]\s)/);
    if (agentMatch) {
      return { prefix: agentMatch[1], body: text.slice(agentMatch[1].length) };
    }
    if (text.startsWith("!!! ERROR:")) {
      return { prefix: "!!! ERROR:", body: text.slice(10) };
    }
    if (text.startsWith("WARNING")) {
      return { prefix: "", body: text };
    }
    return { prefix: "", body: text };
  };

  // Shared Markdown components (compact terminal style)
  const mdComponents = {
    p: ({ children }) => <span className="whitespace-pre-wrap">{children}</span>,
    ul: ({ children }) => <ul className="list-disc list-inside my-0.5 pl-2 whitespace-pre-wrap">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside my-0.5 pl-2 whitespace-pre-wrap">{children}</ol>,
    li: ({ children }) => <li className="my-0">{children}</li>,
  };

  // Filter raw JSON junk from log bodies before rendering
  const sanitizeBody = (text) => {
    if (!text) return text;
    let cleaned = text
      .replace(/["']?(score|core_conclusion|evidence|actionable_advice|overall_score|bias_level|reasoning_process|arbitration_note|feedback_to_engines|approved|conflicts)["']?\s*:\s*/g, "")
      .replace(/[\{\}\[\]]/g, "")
      .replace(/^[",\s]+|[",\s]+$/g, "");
    return cleaned.trim() || null;
  };

  // --- idle: always show full overview ---
  if (phase === "idle") {
    return (
      <div>
        <div className={`${domainTheme?.lightBg ?? "bg-blue-50"} border ${domainTheme?.lightBorder ?? "border-blue-100"} ${domainTheme?.lightText ?? "text-blue-800"} text-sm rounded-xl px-5 py-4 mb-6`}>
          <FileText size={18} className="inline mr-2 mb-0.5" />
          {file ? `已上传：${file.name} — ${t.readyForReview}` : t.uploadPrompt}
        </div>
        <TiltCard tiltFactor={1.5} className={`bg-white border ${domainTheme?.lightBorder ?? "border-slate-200"} rounded-xl p-6 text-sm text-slate-600 leading-relaxed space-y-4`}>
          <h3 className="text-lg font-semibold text-slate-800">{t.systemOverview}</h3>
          <p>{t.overviewDesc}</p>
          <div>
            <h4 className="font-semibold text-slate-700 mb-1">{t.reviewPipeline}</h4>
            <ol className="list-decimal list-inside space-y-1">
              <li><strong>{t.pipeline1Label}</strong> — {t.pipeline1.split("—")[1]?.trim() || t.pipeline1}</li>
              <li><strong>{t.pipeline2Label}</strong> — {t.pipeline2.split("—")[1]?.trim() || t.pipeline2}</li>
              <li><strong>{t.pipeline3Label}</strong> — {t.pipeline3.split("—")[1]?.trim() || t.pipeline3}</li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold text-slate-700 mb-1">{t.fourEngines}</h4>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4">{t.engineCol}</th>
                  <th className="text-left py-2">{t.focusCol}</th>
                </tr>
              </thead>
              <tbody>
                {ENGINE_KEYS.map((key) => {
                  const meta = engineMeta[key] || {};
                  return (
                    <tr key={key} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium">{meta.name ?? key}</td>
                      <td className="py-2 text-slate-500">{meta.focus ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TiltCard>
      </div>
    );
  }

  // --- reviewing ---
  if (phase === "reviewing") {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 mt-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
          <Activity size={18} className={`${hasError ? "text-red-600" : "text-blue-600"} ${hasError ? "" : "animate-pulse"}`} />
          {hasError ? "引擎异常 — 请查看下方日志" : t.initEngines}
        </div>
        <div className="space-y-1 font-mono text-xs text-slate-600 min-h-[500px] max-h-[650px] overflow-y-auto markdown-log">
          {(logs ?? []).map((msg, i) => {
            const text = String(msg ?? "");
            const isError = text.startsWith("!!! ERROR:");
            const isWarn = text.startsWith("WARNING");
            const { prefix, body } = parseLogLine(text);

            if (isError) {
              const cleanBody = sanitizeBody(body);
              if (!cleanBody) return null;
              return (
                <div key={i} className="py-1.5 px-2 rounded bg-red-50 border border-red-200 text-red-800">
                  <AlertCircle size={12} className="inline mr-1" />
                  <span className="font-semibold">{prefix}</span>
                  <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300">
                    <ReactMarkdown components={mdComponents}>{cleanBody}</ReactMarkdown>
                  </div>
                </div>
              );
            }
            const cleanBody = sanitizeBody(body);
            if (!cleanBody) return null;
            return (
              <div key={i} className={`py-1 px-2 rounded ${isWarn ? "bg-amber-50 text-amber-800" : ""}`}>
                {isWarn && <AlertCircle size={12} className="inline mr-1" />}
                {prefix && <span className="font-semibold text-blue-700">{prefix}</span>}
                <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300">
                  <ReactMarkdown components={mdComponents}>{cleanBody}</ReactMarkdown>
                </div>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
          {!hasError && <RefreshCw size={12} className="animate-spin" />}
          {hasError ? "发生错误，请检查 API 配置后重试" : t.processing}
        </div>
      </div>
    );
  }

  // --- done: full results ---
  const scoreValue = typeof overallScore === "number" ? overallScore.toFixed(1) : "0.0";
  const biasText = biasLevel ?? "Moderate-Low";

  return (
    <ErrorBoundary>
      <div id="report-export-content" className="space-y-6 mt-2">
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-5 py-4 text-sm flex items-center gap-2 no-print">
          <CheckCircle size={18} />
          {t.successBanner}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <TiltCard tiltFactor={1.2} className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">{t.radarTitle}</h3>
            <SafeRadarChart data={radarData} />
          </TiltCard>

          <TiltCard tiltFactor={1.2} className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">{t.overallAssessment}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-white to-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">{t.compositeScore}</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{scoreValue}</p>
                <p className="text-xs text-blue-600 mt-1">/ 100</p>
                <p className="text-[11px] text-slate-400 mt-2">{t.postArbitration.replace("{n}", String(retryCount ?? 0))}</p>
              </div>
              <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">{t.biasLevel}</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{biasText}</p>
                <p className="text-xs text-emerald-600 mt-1">{t.crossValidated}</p>
              </div>
            </div>
            <hr className="my-4 border-slate-100" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t.perEngineScores}</p>
            <div className="space-y-2.5">
              {ENGINE_KEYS.map((key) => {
                const score = engineScores[key] ?? 0;
                const meta = engineMeta[key] || { name: key };
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-700 font-medium">{meta.name ?? key}</span>
                      <span className="text-slate-500">{score} / 100</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${score}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </TiltCard>
        </div>

        {/* Engine Reports */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-3">{t.engineReports}</h3>
          <p className="text-xs text-slate-400 mb-4">{t.reportsCaption}</p>
          <div className="space-y-4">
            {ENGINE_KEYS.map((key) => {
              const eng = engineMeta[key] || {};
              const score = engineScores[key] ?? 0;
              const isEthics = key === "ethics";
              return (
                <details key={key} className="bg-white border border-slate-200 rounded-xl group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300" open={key === "methodology"}>
                  <summary className="px-5 py-4 cursor-pointer list-none flex items-center justify-between select-none">
                    <div className="flex items-center gap-3">
                      <ChevronRight size={16} className="text-slate-400 transition-transform group-open:rotate-90" />
                      <span className="text-sm font-semibold text-slate-700">{eng.name ?? key}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{score}/100</span>
                      {eng.riskLevel && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          eng.riskLevel === "low" ? "bg-emerald-100 text-emerald-700" :
                          eng.riskLevel === "high" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {eng.riskLevel === "low" ? t.lowRiskLabel : eng.riskLevel === "high" ? t.highRiskLabel : t.mediumRiskLabel}
                        </span>
                      )}
                      {eng.confidence != null && (
                        <span className="text-[10px] text-slate-400">
                          {t.confidenceLabel} {Math.round(eng.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAppeal?.(key, eng.name ?? key); }}
                      className="text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100 no-print"
                    >
                      <AlertTriangle size={11} />
                      {t.appealButton}
                    </button>
                  </summary>
                  <div className="px-5 pb-5 space-y-4">
                    {/* Core Conclusion */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t.coreConclusion}</p>
                      <p className="text-sm text-slate-700">{eng.conclusion ?? ""}</p>
                    </div>

                    {/* Strengths */}
                    {(eng.strengths?.length > 0) && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-emerald-700 uppercase mb-2">
                          {t.strengthsLabel}
                        </p>
                        <ul className="space-y-1.5">
                          {eng.strengths.slice(0, 5).map((s, i) => (
                            <li key={i} className="text-sm text-emerald-800 flex gap-2">
                              <span className="text-emerald-400 shrink-0 mt-0.5">+</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Issues */}
                    {(eng.issues?.length > 0) && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-700 uppercase mb-2">
                          {t.issuesLabel}
                        </p>
                        <div className="space-y-3">
                          {eng.issues.map((issue, i) => (
                            <div key={i} className="bg-white/70 border border-amber-100 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  issue.severity === "high" ? "bg-red-100 text-red-700" :
                                  issue.severity === "medium" ? "bg-amber-100 text-amber-700" :
                                  "bg-slate-100 text-slate-600"
                                }`}>
                                  {issue.severity === "high" ? t.highSeverityLabel : issue.severity === "medium" ? t.mediumSeverityLabel : t.lowSeverityLabel}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {issue.issue_type ?? ""}
                                </span>
                              </div>
                              {issue.evidence && (
                                <p className="text-xs text-slate-600 mb-1.5 bg-slate-50 rounded p-2 italic">
                                  {String(issue.evidence).slice(0, 400)}
                                </p>
                              )}
                              {issue.suggestion && (
                                <p className="text-xs text-blue-700">
                                  {t.suggestionLabel}
                                  {String(issue.suggestion).slice(0, 400)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Legacy: Evidence & Advice (fallback for old backend format) */}
                    {(!eng.strengths?.length && !eng.issues?.length) && (
                      <>
                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t.evidence}</p>
                          <p className="text-sm text-slate-600">{eng.evidence ?? ""}</p>
                        </div>
                        <div className={`rounded-lg p-3 ${isEthics ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-100"}`}>
                          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t.actionableAdvice}</p>
                          <p className={`text-sm ${isEthics ? "text-amber-800" : "text-blue-800"}`}>{eng.advice ?? ""}</p>
                        </div>
                      </>
                    )}

                    {/* Reasoning MD Collapsible */}
                    {eng.reasoningMd && (
                      <details className="group/reasoning border border-slate-200 rounded-lg overflow-hidden">
                        <summary className="px-4 py-2.5 cursor-pointer list-none flex items-center gap-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors select-none">
                          <ChevronRight size={12} className="text-slate-400 transition-transform group-open/reasoning:rotate-90" />
                          {t.viewReasoning}
                        </summary>
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 prose prose-sm max-w-none text-slate-600">
                          <ReactMarkdown>{String(eng.reasoningMd).slice(0, 8000)}</ReactMarkdown>
                        </div>
                      </details>
                    )}

                    {/* Limitations */}
                    {(eng.limitations?.length > 0) && (
                      <div className="text-[10px] text-slate-400 italic">
                        <span>{t.limitationsLabel}</span>
                        {eng.limitations.slice(0, 3).join("; ")}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        <div className="text-right pb-8 no-print">
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-2 bg-slate-800 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-slate-700 transition-colors mr-3"
          >
            <Download size={16} />
            {t.download}
          </button>
          <button
            onClick={handleDirectPDFExport}
            disabled={pdfExporting}
            className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pdfExporting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {pdfExporting
              ? t.exportingLabel
              : t.exportPDFLabel}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// ============================================================
// App
// ============================================================
function InnerApp() {
  const [lang, setLang] = useState("zh");
  const t = T[lang];
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [mousePos, setMousePos] = useState({ x: "50%", y: "50%" });
  const [engineResults, setEngineResults] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [weights, setWeights] = useState({ methodology: 25, logic: 25, ethics: 25, innovation: 25 });
  const [locked, setLocked] = useState({ methodology: false, logic: false, ethics: false, innovation: false });
  const [appealModal, setAppealModal] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Sync weights with subject tab changes — also unlock all
  useEffect(() => {
    setWeights(SUBJECT_WEIGHT_PRESETS[activeTab]);
    setLocked({ methodology: false, logic: false, ethics: false, innovation: false });
  }, [activeTab]);

  // Load credentials from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ai_academic_review_config");
    if (saved) {
      try {
        const cfg = JSON.parse(saved);
        if (cfg.apiKey && cfg.baseUrl && cfg.modelName) {
          setApiKey(cfg.apiKey);
          setBaseUrl(cfg.baseUrl);
          setModelName(cfg.modelName);
          setIsConfigured(true);
        }
      } catch {}
    }
  }, []);

  const saveConfig = () => {
    if (!apiKey.trim() || !baseUrl.trim() || !modelName.trim()) return;
    const cfg = { apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), modelName: modelName.trim() };
    localStorage.setItem("ai_academic_review_config", JSON.stringify(cfg));
    setIsConfigured(true);
  };

  const clearConfig = () => {
    localStorage.removeItem("ai_academic_review_config");
    setIsConfigured(false);
    setApiKey("");
    setBaseUrl("");
    setModelName("");
    setFile(null);
    setPhase("idle");
    setLogs([]);
    setEngineResults(null);
  }; // API response

  // ---- safe timer management ----
  const timersRef = useRef([]);
  const reviewingRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  const scheduleTimer = useCallback((fn, delay) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    scheduleTimer(() => setToast(null), 4000);
  }, [scheduleTimer]);

  const handleUpload = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPhase("idle");
      setLogs([]);
      setEngineResults(null);
    setRetryCount(0);
      setToast(null);
      clearAllTimers();
      reviewingRef.current = false;
    }
  };

  const DOMAIN_MAP = ["social_sciences", "stem", "medicine"];

  const startReview = useCallback(() => {
    if (reviewingRef.current || !file) return;
    reviewingRef.current = true;
    clearAllTimers();
    setPhase("reviewing");
    setLogs([]);
    setEngineResults(null);
    setHasError(false);

    // --- streaming API call ---
    const doApiCall = async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("domain", DOMAIN_MAP[activeTab] || "social_sciences");
        formData.append("api_key", apiKey);
        formData.append("base_url", baseUrl);
        formData.append("model_name", modelName);
        formData.append("language", lang);

        const res = await fetch(`${API_BASE}/api/review`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        // --- stream NDJSON with typewriter support ---
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastAgent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!reviewingRef.current) { reader.cancel(); return; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            try {
              const evt = JSON.parse(trimmed);

              if (evt.type === "chunk") {
                // Typewriter: append to current line, or start new line if agent changed
                const label = evt.agent ? `[${evt.agent}] ` : "";
                setLogs((prev) => {
                  let next = [...prev];
                  if (next.length > 0 && lastAgent === evt.agent && next[next.length - 1].startsWith("[")) {
                    // Append chunk to last line (typewriter effect)
                    next[next.length - 1] += evt.chunk;
                  } else {
                    next.push(label + evt.chunk);
                  }
                  return next;
                });
                lastAgent = evt.agent;
              } else if (evt.type === "chunk_end") {
                // Finalize typewriter line with score
                setLogs((prev) => [...prev, `  → 得分 ${evt.score}/100`]);
                lastAgent = "";
              } else if (evt.type === "progress" || evt.type === "thinking") {
                const prefix = evt.agent ? `[${evt.agent}] ` : "";
                setLogs((prev) => [...prev, `${prefix}${evt.message}`]);
                lastAgent = "";
              } else if (evt.type === "result") {
                setEngineResults(evt.data);
                setRetryCount(evt.data.retryCount ?? 0);
                setLogs((prev) => [...prev, "报告已生成."]);
                setPhase("done");
                reviewingRef.current = false;
                showToast(t.successBanner);
                // Auto-save to history (use evt.data directly — state hasn't updated yet)
                if (file) {
                  const subject = DOMAIN_MAP[activeTab] || "social_sciences";
                  fetch(`${API_BASE}/api/reports`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      filename: file.name,
                      subject,
                      weights: weights,
                      report_data: evt.data,
                    }),
                  })
                    .then((r) => r.json())
                    .then(() => { /* auto-saved to history */ })
                    .catch((err) => { console.error("[AI学术审查系统] Auto-save failed:", err); });
                }
              } else if (evt.type === "error") {
                // Show error in terminal, keep phase="reviewing" so logs stay visible
                const label = evt.agent ? `[${evt.agent}] ` : "";
                setLogs((prev) => [...prev, `!!! ERROR: ${label}${evt.message}`]);
                setHasError(true);
                lastAgent = "";
              }
            } catch {
              // skip malformed
            }
          }
        }
      } catch (err) {
        console.error("[AI学术审查系统] API call failed:", err);
        if (!reviewingRef.current) return;
        setLogs((prev) => [...prev, `!!! ERROR: 连接后端失败 — ${String(err.message ?? err).slice(0, 150)}`]);
        setHasError(true);
        // Keep phase="reviewing" so the error logs remain visible
        reviewingRef.current = false;
        showToast("后端 API 不可达 — 请检查 uvicorn 是否在 8000 端口运行");
      }
    };
    doApiCall();
  }, [t, scheduleTimer, showToast, clearAllTimers, file, activeTab]);

  const resetReview = useCallback(() => {
    clearAllTimers();
    reviewingRef.current = false;
    setPhase("idle");
    setLogs([]);
    setEngineResults(null);
    setRetryCount(0);
    setToast(null);
  }, [clearAllTimers]);

  const clearAll = useCallback(() => {
    clearAllTimers();
    reviewingRef.current = false;
    setFile(null);
    setPhase("idle");
    setLogs([]);
    setEngineResults(null);
    setRetryCount(0);
    setToast(null);
  }, [clearAllTimers]);

  // ---- Save completed report to history ----
  const saveReportToHistory = useCallback(() => {
    if (!engineResults || !file) return;
    const subject = DOMAIN_MAP[activeTab] || "social_sciences";
    fetch(`${API_BASE}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        subject,
        weights,
        report_data: engineResults,
      }),
    })
      .then((r) => r.json())
      .then(() => { /* saved */ })
      .catch((err) => {
        console.error("[AI学术审查系统] Failed to save report:", err);
      });
  }, [engineResults, file, activeTab, weights]);

  // ---- Load a report from history by ID and inject into current view ----
  const handleHistorySelect = useCallback((reportId) => {
    setShowHistory(false);
    // Fetch full report from backend
    fetch(`${API_BASE}/api/reports/${reportId}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const rd = data.report_data || {};
        setEngineResults(rd);
        setRetryCount(rd.retryCount ?? 0);
        setPhase("done");
        setFile({ name: data.filename || "" });
        setLogs([lang === "zh" ? "已加载历史报告" : "History report loaded"]);
        showToast(lang === "zh" ? "已加载历史审查报告" : "History report loaded");
      })
      .catch((err) => {
        console.error("[AI学术审查系统] Failed to load history report:", err);
        showToast(lang === "zh" ? "加载报告失败" : "Failed to load report");
      });
  }, [lang, showToast]);

  // ---- Engine weight auto-balancing handler (lock-aware, delta-based) ----
  const handleWeightChange = useCallback((key, rawValue) => {
    const clamped = Math.max(0, Math.min(100, Math.round(rawValue)));
    setWeights((prev) => {
      // Step B: identify unlocked passive keys
      const passiveKeys = ENGINE_KEYS.filter((k) => k !== key && !locked[k]);
      // If active key is also locked, or there are zero passive keys, block change
      if (locked[key] || passiveKeys.length === 0) return prev;

      const oldValue = prev[key];
      const delta = clamped - oldValue;
      if (delta === 0) return prev;

      // Step C: compute unlocked sum among passives; cap positive delta if needed
      const unlockedSum = passiveKeys.reduce((s, k) => s + prev[k], 0);
      let effectiveDelta = delta;
      if (delta > 0 && delta > unlockedSum) {
        effectiveDelta = unlockedSum;
      }

      const next = { ...prev, [key]: oldValue + effectiveDelta };
      const negDelta = -effectiveDelta; // total to subtract from passives

      // Steps D & E: distribute -delta proportionally, then correct rounding error
      const changes = {};
      if (unlockedSum > 0) {
        let allocated = 0;
        passiveKeys.forEach((k, i) => {
          if (i === passiveKeys.length - 1) {
            changes[k] = negDelta - allocated;
          } else {
            changes[k] = Math.round((prev[k] / unlockedSum) * negDelta);
            allocated += changes[k];
          }
        });
      } else {
        // All passives at zero — distribute -delta equally
        const each = negDelta / passiveKeys.length;
        passiveKeys.forEach((k) => { changes[k] = each; });
      }

      // Step E explicitly: correct rounding error
      const actualSum = passiveKeys.reduce((s, k) => s + changes[k], 0);
      const error = negDelta - actualSum;
      if (passiveKeys.length > 0 && error !== 0) {
        changes[passiveKeys[0]] += error;
      }

      // Apply changes with floor clamp
      passiveKeys.forEach((k) => {
        next[k] = Math.max(0, prev[k] + changes[k]);
      });

      return next;
    });
  }, [locked]);

  // ---- Toggle lock on a single engine ----
  const toggleLock = useCallback((key) => {
    setLocked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ---- Demo mode: inject mock data ----
  const showDemo = useCallback(() => {
    clearAllTimers();
    reviewingRef.current = false;
    setPhase("done");
    setLogs(["报告已生成."]);
    setEngineResults(MOCK_RESULT);
    setRetryCount(0);
    setFile(null);
    showToast("已加载样例数据，可自由浏览各引擎报告");
  }, [clearAllTimers, showToast]);

  // ---- derived ----
  const engineScores = useMemo(() => {
    if (engineResults?.engines) {
      const s = {};
      ENGINE_KEYS.forEach((k) => { s[k] = engineResults.engines[k]?.score ?? 0; });
      return s;
    }
    return { methodology: 0, logic: 0, ethics: 0, innovation: 0 };
  }, [engineResults]);

  const overallScore = useMemo(() => {
    const total =
      engineScores.methodology * ((weights.methodology ?? 25) / 100) +
      engineScores.logic * ((weights.logic ?? 25) / 100) +
      engineScores.ethics * ((weights.ethics ?? 25) / 100) +
      engineScores.innovation * ((weights.innovation ?? 25) / 100);
    return Math.round(total);
  }, [engineScores, weights]);
  const biasLevel = engineResults?.biasLevel || (overallScore >= 75 ? t.moderateLow : t.moderateHigh);

  const radarData = useMemo(() => [
    { subject: t.methodologyShort, score: engineScores.methodology, fullMark: 100 },
    { subject: t.logicShort, score: engineScores.logic, fullMark: 100 },
    { subject: t.ethicsShort, score: engineScores.ethics, fullMark: 100 },
    { subject: t.innovationShort, score: engineScores.innovation, fullMark: 100 },
  ], [lang, engineScores]);

  const domainTabs = [t.tab0, t.tab1, t.tab2];
  const domainFocuses = [t.focus0, t.focus1, t.focus2];

  const engineMeta = useMemo(() => {
    const api = engineResults?.engines || {};
    const mk = (key, defs) => ({
      name: defs.name, focus: defs.focus,
      conclusion: api[key]?.core_conclusion || defs.conclusion,
      evidence: api[key]?.evidence || defs.evidence,
      advice: api[key]?.actionable_advice || defs.advice,
      // Enriched fields from new backend
      riskLevel: api[key]?.risk_level || null,
      confidence: api[key]?.confidence ?? null,
      strengths: api[key]?.strengths || [],
      issues: api[key]?.issues || [],
      reasoningMd: api[key]?.reasoning_md || "",
      limitations: api[key]?.limitations || [],
    });
    return {
      methodology: mk("methodology", { name: t.methodologyName, focus: t.methFocus, conclusion: t.methConclusion, evidence: t.methEvidence, advice: t.methAdvice }),
      logic: mk("logic", { name: t.logicName, focus: t.logicFocus, conclusion: t.logicConclusion, evidence: t.logicEvidence, advice: t.logicAdvice }),
      ethics: mk("ethics", { name: t.ethicsName, focus: t.ethicsFocus, conclusion: t.ethicsConclusion, evidence: t.ethicsEvidence, advice: t.ethicsAdvice }),
      innovation: mk("innovation", { name: t.innovationName, focus: t.innovationFocus, conclusion: t.innovationConclusion, evidence: t.innovationEvidence, advice: t.innovationAdvice }),
    };
  }, [lang, engineResults]);

  // ---- download Markdown report ----
  const downloadMarkdown = useCallback(async () => {
    if (!engineResults) return;
    try {
      await new Promise((r) => setTimeout(r, 50));

      // Capture radar chart as base64 image
      let chartMarkdown = "";
      const chartElement = document.getElementById("radar-chart-container");
      if (chartElement) {
        try {
          const canvas = await html2canvas(chartElement, { scale: 2, backgroundColor: "#ffffff", logging: false });
          const imgData = canvas.toDataURL("image/png");
          chartMarkdown = `## 综合审查雷达图\n\n![雷达图](${imgData})\n\n---\n\n`;
        } catch (e) {
          console.warn("[AI学术审查系统] Radar chart capture failed:", e);
        }
      }

      const textMd = generateMarkdownReport({ engineMeta, engineScores, overallScore, biasLevel, retryCount });
      const finalMd = chartMarkdown + textMd;
      const blob = new Blob([finalMd], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "AI学术审查系统_Review_Report.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[AI学术审查系统] Markdown export failed:", err);
    }
  }, [engineResults, engineMeta, engineScores, overallScore, biasLevel, retryCount]);

  const handleMouseMove = (e) => {
    setMousePos({ x: `${e.clientX}px`, y: `${e.clientY}px` });
  };

  // ---- render ----
  return (
    <div
      className="h-screen flex overflow-hidden relative"
      style={{ "--mouse-x": mousePos.x, "--mouse-y": mousePos.y, background: "transparent" }}
      onMouseMove={handleMouseMove}
    >
      {/* Grid magnifier layers */}
      <div className="grid-base" />
      <div className="grid-magnifier" />

      {/* ============ CONFIG SCREEN ============ */}
      {!isConfigured && (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center">
          <div className="w-full max-w-md mx-4 bg-white border border-slate-200 rounded-2xl p-8 shadow-xl">
            <h2 className="text-xl font-bold text-slate-800 mb-1">{t.appTitle}</h2>
            <p className="text-sm text-slate-500 mb-6">{t.configTitle}</p>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-500 uppercase">{t.configApiKey}</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {lang === "zh"
                  ? "提示：若您开启了网络代理（梯子），请将其设置为「全局/绕过大陆」模式，或暂时关闭，否则可能导致阿里云 API 连接超时。"
                  : "Tip: If you are using a VPN/proxy, please set it to \"Global/Bypass Mainland China\" mode or disable it temporarily, otherwise Alibaba Cloud API connections may time out."}
              </p>
            </label>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-slate-500 uppercase">{t.configBaseUrl}</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
            </label>

            <label className="block mb-6">
              <span className="text-xs font-semibold text-slate-500 uppercase">{t.configModel}</span>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="deepseek-chat"
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
            </label>

            <button
              onClick={saveConfig}
              disabled={!apiKey.trim() || !baseUrl.trim() || !modelName.trim()}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {t.configSaved}
            </button>

            <p className="text-[11px] text-slate-400 mt-4 text-center">
              {t.configHint}
            </p>
          </div>
        </div>
      )}

      {/* Regular App UI (only when configured) */}
      {isConfigured && (<>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100] flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl shadow-lg no-print">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* ============ SIDEBAR ============ */}
      <aside className="w-64 bg-white/95 backdrop-blur border-r border-slate-200 flex flex-col h-screen overflow-y-auto p-5 gap-5 shrink-0 relative z-10 no-print">
        {/* Brand */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">{t.brand}</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">{t.version}</p>
          </div>
          <button
            onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
            className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors"
          >
            <Languages size={12} />
            {lang === "zh" ? "En" : "中"}
          </button>
        </div>
        <hr className="border-slate-100 shrink-0" />

        {/* Navigation menu */}
        <nav className="flex flex-col gap-1 shrink-0">
          <button
            onClick={clearAll}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors font-medium ${
              phase === "idle" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Plus size={16} />
            {t.newReview}
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <History size={16} />
            {t.history}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <Settings size={16} />
            {lang === "zh" ? "设置" : "Settings"}
          </button>
        </nav>

        <hr className="border-slate-100 shrink-0" />

        {/* Upload area */}
        <div className="shrink-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">{t.uploadManuscript}</p>
          <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
            <Upload size={20} className="text-slate-400" />
            <span className="text-[11px] text-slate-500 text-center leading-tight">
              {file ? file.name : t.uploadHint}
            </span>
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" />
          </label>
          {/* Demo button */}
          <button
            onClick={showDemo}
            className="w-full mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-2 transition-colors"
          >
            <Eye size={13} />
            {t.demoButton}
          </button>
          {file && (
            <button onClick={clearAll} className="w-full mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-red-500 transition-colors">
              <X size={13} /> {t.clearReset}
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-0" />

        {/* Dev Mode */}
        <div className="flex flex-col gap-2 shrink-0">
          {/* Ops mode toggle — disabled during review */}
          <label className={`flex items-center justify-between px-2 py-2 rounded-lg transition-colors ${
            phase === "reviewing"
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-slate-50"
          }`}>
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <Wrench size={13} />
              {t.devMode}
            </span>
            <div className={`relative w-10 h-5 rounded-full transition-colors scale-110 ${
              phase === "reviewing"
                ? "bg-slate-300"
                : devMode ? "bg-amber-500" : "bg-slate-300"
            }`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${devMode ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <input
              type="checkbox"
              checked={devMode}
              onChange={(e) => setDevMode(e.target.checked)}
              disabled={phase === "reviewing"}
              className="hidden"
            />
          </label>

          {/* ============ DEV MODE: Weight Adjuster + Donut Chart ============ */}
          {devMode && (
            <div className="border-t border-slate-200 pt-3 mt-1 space-y-3 dev-panel-enter">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {lang === "zh" ? "引擎权重调节" : "Engine Weights"}
              </p>

              {/* 4 Weight Sliders with Lock Toggle */}
              {ENGINE_KEYS.map((key) => {
                const meta = ENGINE_WEIGHT_COLORS[key];
                const val = Math.round(weights[key] ?? 25);
                const isLocked = !!locked[key];
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleLock(key)}
                          className={`p-0.5 rounded transition-colors ${
                            isLocked
                              ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                              : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                          }`}
                          title={isLocked ? (lang === "zh" ? "点击解锁" : "Click to unlock") : (lang === "zh" ? "点击锁定" : "Click to lock")}
                        >
                          {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                        </button>
                        <span className={`text-[11px] font-medium ${isLocked ? "text-slate-400" : "text-slate-600"}`}>
                          {lang === "zh" ? meta.label : meta.labelEn}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-bold ${isLocked ? "text-slate-300" : ""}`}
                        style={isLocked ? {} : { color: meta.fill }}
                      >
                        {val}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={val}
                      disabled={isLocked}
                      onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                      className={`weight-slider w-full h-1.5 rounded-full appearance-none ${isLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                      style={{
                        background: isLocked
                          ? `#e2e8f0`
                          : `linear-gradient(to right, ${meta.fill} 0%, ${meta.fill} ${val}%, #e2e8f0 ${val}%, #e2e8f0 100%)`,
                      }}
                    />
                  </div>
                );
              })}

              {/* Donut Chart */}
              <div className="flex justify-center pt-1">
                <PieChart width={150} height={150}>
                  <Pie
                    data={ENGINE_KEYS.map((k) => ({
                      name: lang === "zh" ? ENGINE_WEIGHT_COLORS[k].label : ENGINE_WEIGHT_COLORS[k].labelEn,
                      value: Math.round(weights[k] ?? 25),
                    }))}
                    cx={75}
                    cy={75}
                    innerRadius={40}
                    outerRadius={62}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {ENGINE_KEYS.map((k) => (
                      <Cell key={k} fill={ENGINE_WEIGHT_COLORS[k].fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value) => `${Math.round(value)}%`}
                    contentStyle={{
                      fontSize: "11px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      padding: "4px 8px",
                    }}
                  />
                </PieChart>
              </div>

              {/* Live logs when reviewing */}
              {phase === "reviewing" && (
                <div>
                  <p className="text-[9px] font-semibold text-slate-400 uppercase mb-1">
                    {lang === "zh" ? "实时日志" : "Live Log"}
                  </p>
                  <div className="font-mono text-[10px] text-slate-500 max-h-[160px] overflow-y-auto space-y-0.5 bg-slate-50 rounded-md p-1.5">
                    {(logs ?? []).slice(-10).map((msg, i) => (
                      <div key={i} className="whitespace-pre-wrap leading-tight break-all">
                        {String(msg).slice(0, 100)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Header */}
        <div className="shrink-0 px-8 pt-8 pb-4 no-print">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">{t.appTitle}</h1>
          <p className="text-sm text-slate-500 mt-1">{t.appSubtitle}</p>
        </div>

        {/* Domain Tabs */}
        <div className="shrink-0 px-8 pb-4 no-print">
          <div className="flex gap-2">
            {domainTabs.map((tab, i) => {
              const theme = DOMAIN_THEMES[i];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i)}
                  className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all duration-200 ${
                    i === activeTab
                      ? `${theme.tab} text-white shadow-md font-bold`
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <p className={`text-xs mt-3 rounded-lg p-3 border ${
            DOMAIN_THEMES[activeTab].bg
          } ${DOMAIN_THEMES[activeTab].card}`}>
            {phase !== "done" && (
              <><strong>{lang === "zh" ? "审查侧重" : "Review focus"}</strong>：{domainFocuses[activeTab].split(/[：:]/).slice(1).join("") || domainFocuses[activeTab]}</>
            )}
            {phase === "done" && (
              <><strong>{lang === "zh" ? "审查完成" : "Review complete"}</strong> — {lang === "zh" ? "以下为各引擎审查结果详情" : "Detailed engine reports below"}</>
            )}
          </p>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <ContentArea
            t={t}
            lang={lang}
            phase={phase}
            file={file}
            logs={logs}
            retryCount={retryCount}
            overallScore={overallScore}
            biasLevel={biasLevel}
            radarData={radarData}
            engineMeta={engineMeta}
            engineScores={engineScores}
            onStart={startReview}
            onReset={resetReview}
            hasError={hasError}
            onDownload={downloadMarkdown}
            onAppeal={(key, name) => setAppealModal({ engineKey: key, engineName: name })}
            domainTheme={DOMAIN_THEMES[activeTab]}
          />
          {/* Privacy Footer */}
          <div className="text-center mt-8 pb-8 no-print">
            <p className="text-[11px] text-slate-300">{t.privacyFooter}</p>
          </div>
        </div>

        {/* ============ APPEAL MODAL ============ */}
        <AppealModal
          engineName={appealModal?.engineName ?? ""}
          isOpen={!!appealModal}
          onClose={() => setAppealModal(null)}
          t={t}
        />

        {/* ============ HISTORY MODAL ============ */}
        <HistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          t={t}
          lang={lang}
          onSelect={handleHistorySelect}
        />

        {/* ============ SETTINGS MODAL ============ */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          t={t}
          lang={lang}
          apiKey={apiKey}
          baseUrl={baseUrl}
          modelName={modelName}
          onSave={saveConfig}
          onApiKeyChange={setApiKey}
          onBaseUrlChange={setBaseUrl}
          onModelNameChange={setModelName}
        />
      </div>

      {/* ============ FIXED BOTTOM BAR ============ */}
      {file && phase === "idle" && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[80%] max-w-[800px] z-50 no-print">
          <div className="bg-white/85 backdrop-blur-xl border border-blue-200/50 rounded-2xl p-5 shadow-[0_-10px_40px_rgba(37,99,235,0.12)] hover:shadow-[0_-15px_50px_rgba(37,99,235,0.2)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="flex-1 text-sm text-slate-700">
                <p className="font-semibold">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t.readyForReview}</p>
              </div>
              <button
                onClick={startReview}
                disabled={phase !== "idle"}
                className="flex items-center gap-2 bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-600/25 transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={16} />
                {t.startReview}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[80%] max-w-[800px] z-50 no-print">
          <div className="bg-white/85 backdrop-blur-xl border border-emerald-200/50 rounded-2xl p-5 shadow-[0_-10px_40px_rgba(16,185,129,0.12)]">
            <div className="flex items-center gap-4">
              <CheckCircle size={20} className="text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{t.reviewComplete}</p>
                <p className="text-xs text-slate-400">
                  {t.compositeScore}: {typeof overallScore === "number" ? overallScore.toFixed(1) : "0.0"}/100 · {t.postArbitration.replace("{n}", String(retryCount ?? 0))}
                </p>
              </div>
              <button
                onClick={resetReview}
                className="flex items-center gap-2 bg-slate-100 text-slate-700 font-medium px-5 py-2.5 rounded-xl hover:bg-slate-200 transition-colors text-sm"
              >
                <RefreshCw size={16} />
                {t.reRunReview}
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ============================================================
// App root — BrowserRouter with routes
// ============================================================
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<InnerApp />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
