import { useState, useCallback, useRef, useMemo, useEffect, Component } from "react";
import {
  Upload, Activity, FileText, Download, RefreshCw, X, Zap,
  CheckCircle, AlertCircle, ChevronRight, Languages,
} from "lucide-react";

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
    console.error("[MindHunter ErrorBoundary]", error, errorInfo);
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
    brand: "MindHunter", version: "v2.0 专业版",
    engineStatus: "引擎状态", reviewEngine: "审查引擎", computePool: "计算池负载",
    arbitrationHub: "仲裁中枢", reviewMode: "审查模式",
    online: "在线", cores4: "4 核并发", idle: "空闲", active: "运行中", standby: "待命",
    concurrent: "并发审查", arbitration: "仲裁打回",
    uploadManuscript: "论文上传", uploadHint: "点击上传 PDF", clearReset: "清除重置",
    title: "MindHunter 学术偏见审查系统",
    subtitle: "多引擎协作 · 深度学术偏见检测 · 全局一致性仲裁",
    tab0: "社会科学与人文", tab1: "理工与实验科学", tab2: "医学与生命科学",
    focus0: "审查侧重：抽样代表性、文化偏见（WEIRD）、质性编码信度、意识形态渗透检测。适用于社会学、心理学、教育学、人类学及相关领域论文。",
    focus1: "审查侧重：实验可复现性、统计方法恰当性、数据清洗透明度、结果选择性报告（p-hacking）。适用于计算机科学、物理学、工程学及相关领域论文。",
    focus2: "审查侧重：临床试验注册合规性、利益冲突披露、样本纳入/排除标准合理性、基因决定论与生物本质主义风险。适用于医学、公共卫生、生命科学及相关领域论文。",
    uploadPrompt: "请在左侧边栏上传一篇 PDF 论文文件以开始审查。",
    systemOverview: "系统概述",
    overviewDesc: "MindHunter v2.0 是一款基于多引擎协作的学术论文偏见审查工具，旨在帮助研究者在投稿前自查论文中潜在的认知偏见、方法论缺陷与伦理风险。",
    reviewPipeline: "审查流程",
    pipeline1: "上传论文 — 四大引擎并发阅读全文。",
    pipeline2: "全局仲裁 — 仲裁中枢交叉校验各引擎评分与 Evidence 的一致性，发现异常立即打回重做。",
    pipeline3: "生成报告 — 结构化输出含雷达图、综合得分及各引擎详细评语。",
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
    brand: "MindHunter", version: "v2.0 Professional",
    engineStatus: "Engine Status", reviewEngine: "Review Engine", computePool: "Compute Pool",
    arbitrationHub: "Arbitration Hub", reviewMode: "Review Mode",
    online: "Online", cores4: "4 Cores", idle: "Idle", active: "Active", standby: "Standby",
    concurrent: "Concurrent", arbitration: "Arbitration",
    uploadManuscript: "Upload Manuscript", uploadHint: "Click to upload PDF", clearReset: "Clear & Reset",
    title: "MindHunter Academic Bias Review System",
    subtitle: "Multi-engine collaboration · Deep academic bias detection · Global consistency arbitration",
    tab0: "Social Sciences & Humanities", tab1: "STEM & Experimental Sciences", tab2: "Medicine & Life Sciences",
    focus0: "Review focus: Sampling representativeness, cultural bias (WEIRD), qualitative coding reliability, ideological penetration detection. Applicable to sociology, psychology, education, anthropology, and related fields.",
    focus1: "Review focus: Experimental reproducibility, statistical method adequacy, data cleaning transparency, selective reporting (p-hacking). Applicable to computer science, physics, engineering, and related fields.",
    focus2: "Review focus: Clinical trial registration compliance, COI disclosure, inclusion/exclusion criteria rationale, genetic determinism and bio-essentialism risk. Applicable to medicine, public health, life sciences, and related fields.",
    uploadPrompt: "Upload a PDF manuscript in the left sidebar to begin the review.",
    systemOverview: "System Overview",
    overviewDesc: "MindHunter v2.0 is a multi-engine academic bias review tool designed to help researchers self-audit papers for potential cognitive biases, methodological flaws, and ethical risks before submission.",
    reviewPipeline: "Review Pipeline",
    pipeline1: "Upload — Four engines concurrently read the full manuscript.",
    pipeline2: "Arbitration — The Arbitration Hub cross-validates scores against Evidence. Any conflict triggers an immediate re-review.",
    pipeline3: "Report — Structured output: radar chart, composite score, and detailed per-engine reports.",
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
    <div className="w-full flex justify-center items-center" style={{ height: "380px" }}>
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
function ContentArea({ t, phase, file, logs, retryCount, overallScore, biasLevel, radarData, engineMeta, engineScores, onStart, onReset }) {
  // --- idle: always show full overview ---
  if (phase === "idle") {
    return (
      <div>
        <div className="bg-blue-50 border border-blue-100 text-blue-800 text-sm rounded-xl px-5 py-4 mb-6">
          <FileText size={18} className="inline mr-2 mb-0.5" />
          {file ? `已上传：${file.name} — ${t.readyForReview}` : t.uploadPrompt}
        </div>
        <TiltCard tiltFactor={1.5} className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600 leading-relaxed space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">{t.systemOverview}</h3>
          <p>{t.overviewDesc}</p>
          <div>
            <h4 className="font-semibold text-slate-700 mb-1">{t.reviewPipeline}</h4>
            <ol className="list-decimal list-inside space-y-1">
              <li><strong>上传论文</strong> — {t.pipeline1.split("—")[1]?.trim() || t.pipeline1}</li>
              <li><strong>全局仲裁</strong> — {t.pipeline2.split("—")[1]?.trim() || t.pipeline2}</li>
              <li><strong>生成报告</strong> — {t.pipeline3.split("—")[1]?.trim() || t.pipeline3}</li>
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
          <Activity size={18} className="text-blue-600 animate-pulse" />
          {t.initEngines}
        </div>
        <div className="space-y-1.5 font-mono text-xs text-slate-600 max-h-60 overflow-y-auto">
          {(logs ?? []).map((msg, i) => {
            const text = String(msg ?? "");
            const isWarn = text.startsWith("WARNING");
            return (
              <div key={i} className={`py-1 px-2 rounded ${isWarn ? "bg-amber-50 text-amber-800" : ""}`}>
                {isWarn && <AlertCircle size={12} className="inline mr-1" />}
                {text}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
          <RefreshCw size={12} className="animate-spin" />
          {t.processing}
        </div>
      </div>
    );
  }

  // --- done: full results ---
  const scoreValue = typeof overallScore === "number" ? overallScore.toFixed(1) : "0.0";
  const biasText = biasLevel ?? "Moderate-Low";

  return (
    <ErrorBoundary>
      <div className="space-y-6 mt-2">
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-5 py-4 text-sm flex items-center gap-2">
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
                    </div>
                  </summary>
                  <div className="px-5 pb-5 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t.coreConclusion}</p>
                      <p className="text-sm text-slate-700">{eng.conclusion ?? ""}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t.evidence}</p>
                      <p className="text-sm text-slate-600">{eng.evidence ?? ""}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${isEthics ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-100"}`}>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t.actionableAdvice}</p>
                      <p className={`text-sm ${isEthics ? "text-amber-800" : "text-blue-800"}`}>{eng.advice ?? ""}</p>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        <div className="text-right pb-8">
          <button className="inline-flex items-center gap-2 bg-slate-800 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-slate-700 transition-colors">
            <Download size={16} />
            {t.download}
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

  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [mousePos, setMousePos] = useState({ x: "50%", y: "50%" });
  const [engineResults, setEngineResults] = useState(null); // API response

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

    // --- animation logs while API call is in flight ---
    const msgs = [
      `${t.launching} [${t.methodologyName}] ...`,
      `${t.launching} [${t.logicName}] ...`,
      `${t.launching} [${t.ethicsName}] ...`,
      `${t.launching} [${t.innovationName}] ...`,
      t.submitting,
    ];
    const delays = [1200, 1200, 1200, 1000, 1500];
    let cumulative = 100;
    delays.forEach((delay, i) => {
      cumulative += delay;
      const msg = String(msgs[i] ?? "");
      scheduleTimer(() => {
        if (!reviewingRef.current) return;
        setLogs((prev) => [...prev, msg]);
      }, cumulative);
    });

    // extra warning log during API wait
    cumulative += 600;
    scheduleTimer(() => {
      if (!reviewingRef.current) return;
      setLogs((prev) => [...prev, "Calling Multi-Agent backend via API ..."]);
    }, cumulative);

    // --- actual API call ---
    const doApiCall = async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("domain", DOMAIN_MAP[activeTab] || "social_sciences");

        const res = await fetch("http://localhost:8000/api/review", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        const data = await res.json();

        if (!reviewingRef.current) return; // cancelled while waiting

        if (data.error) {
          setLogs((prev) => [...prev, `ERROR: ${data.error}`]);
          setPhase("idle");
          reviewingRef.current = false;
          return;
        }

        setEngineResults(data);
        setRetryCount(data.retryCount ?? 0);
        setLogs((prev) => [...prev, "API response received.", t.finalApproval]);
        setPhase("done");
        reviewingRef.current = false;
        showToast(t.successBanner);
      } catch (err) {
        console.error("[MindHunter] API call failed:", err);
        if (!reviewingRef.current) return;
        setLogs((prev) => [...prev, `ERROR: ${String(err.message ?? err).slice(0, 120)}`]);
        setPhase("idle");
        reviewingRef.current = false;
        showToast("Backend API unreachable — check that uvicorn is running on port 8000");
      }
    };

    // launch API call immediately (logs show simultaneously via the timers above)
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

  // ---- derived ----
  const engineScores = useMemo(() => {
    if (engineResults?.engines) {
      const s = {};
      ENGINE_KEYS.forEach((k) => { s[k] = engineResults.engines[k]?.score ?? 0; });
      return s;
    }
    return { methodology: 0, logic: 0, ethics: 0, innovation: 0 };
  }, [engineResults]);

  const overallScore = Object.values(engineScores).reduce((a, b) => a + b, 0) / 4;
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
    return {
      methodology: { name: t.methodologyName, focus: t.methFocus, conclusion: api.methodology?.core_conclusion || t.methConclusion, evidence: api.methodology?.evidence || t.methEvidence, advice: api.methodology?.actionable_advice || t.methAdvice },
      logic: { name: t.logicName, focus: t.logicFocus, conclusion: api.logic?.core_conclusion || t.logicConclusion, evidence: api.logic?.evidence || t.logicEvidence, advice: api.logic?.actionable_advice || t.logicAdvice },
      ethics: { name: t.ethicsName, focus: t.ethicsFocus, conclusion: api.ethics?.core_conclusion || t.ethicsConclusion, evidence: api.ethics?.evidence || t.ethicsEvidence, advice: api.ethics?.actionable_advice || t.ethicsAdvice },
      innovation: { name: t.innovationName, focus: t.innovationFocus, conclusion: api.innovation?.core_conclusion || t.innovationConclusion, evidence: api.innovation?.evidence || t.innovationEvidence, advice: api.innovation?.actionable_advice || t.innovationAdvice },
    };
  }, [lang, engineResults]);

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

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100] flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl shadow-lg">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* ============ SIDEBAR ============ */}
      <aside className="w-72 bg-white/90 backdrop-blur border-r border-slate-200 flex flex-col p-6 gap-6 shrink-0 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">{t.brand}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.version}</p>
          </div>
          <button
            onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Languages size={14} />
            {lang === "zh" ? "En" : "中"}
          </button>
        </div>
        <hr className="border-slate-100" />
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t.engineStatus}</p>
          <div className="grid gap-3">
            <TiltCard tiltFactor={10}><Metric label={t.reviewEngine} value={t.online} delta="v2.0" /></TiltCard>
            <TiltCard tiltFactor={10}><Metric label={t.computePool} value={t.cores4} delta={t.idle} /></TiltCard>
            <TiltCard tiltFactor={10}><Metric label={t.arbitrationHub} value={t.active} delta={t.standby} /></TiltCard>
            <TiltCard tiltFactor={10}><Metric label={t.reviewMode} value={t.concurrent} delta={t.arbitration} /></TiltCard>
          </div>
        </div>
        <hr className="border-slate-100" />
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t.uploadManuscript}</p>
          <label className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
            <Upload size={22} className="text-slate-400" />
            <span className="text-xs text-slate-500 text-center">
              {file ? file.name : t.uploadHint}
            </span>
            <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
        {file && (
          <button onClick={clearAll} className="flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-500 transition-colors">
            <X size={14} /> {t.clearReset}
          </button>
        )}
      </aside>

      {/* ============ MAIN ============ */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Header */}
        <div className="shrink-0 px-8 pt-8 pb-4">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">{t.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>

        {/* Domain Tabs */}
        <div className="shrink-0 px-8 pb-4">
          <div className="flex gap-2">
            {domainTabs.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  i === activeTab
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3 bg-white border border-slate-100 rounded-lg p-3">
            {phase !== "done" && (
              <><strong>{lang === "zh" ? "审查侧重" : "Review focus"}</strong>：{domainFocuses[activeTab].split(/[：:]/).slice(1).join("") || domainFocuses[activeTab]}</>
            )}
            {phase === "done" && (
              <><strong>{lang === "zh" ? "审查完成" : "Review complete"}</strong> — {lang === "zh" ? "以下为各引擎审查结果详情" : "Detailed engine reports below"}</>
            )}
          </p>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-8 pb-44">
          <ContentArea
            t={t}
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
          />
        </div>
      </div>

      {/* ============ FIXED BOTTOM BAR ============ */}
      {file && phase === "idle" && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[80%] max-w-[800px] z-50">
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
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[80%] max-w-[800px] z-50">
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
    </div>
  );
}

// ============================================================
// App root — wrapped in ErrorBoundary
// ============================================================
export default function App() {
  return (
    <ErrorBoundary>
      <InnerApp />
    </ErrorBoundary>
  );
}
