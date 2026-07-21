# MindHunter — Multi-Agent 学术论文偏见审查系统

基于 Multi-Agent 协作架构的学术论文自动化审查工具。前端 React + Vite + Tailwind，后端 Python FastAPI，真实大模型驱动四大引擎并发审查 + 仲裁中枢打回重做。

---

## 新组员上手（克隆后第一件事）

### 你需要自己创建的文件

仓库里**没有** `.env` 文件（已被 `.gitignore` 排除）。你需要自己在 `agent/` 目录下创建一个：

```
agent/
└── .env    <-- 你自己创建这个文件
```

内容如下，替换成你自己的 API 信息：

```env
API_KEY=你的API密钥
OPENAI_BASE_URL=https://你的OpenAI兼容端点/v1
ANTHROPIC_BASE_URL=https://你的Anthropic兼容端点
```

> 如果你还没有 API Key，去找项目管理员要，或者去阿里云百炼 / Anthropic Console 申请。

### 从头跑起来（5 分钟）

```bash
# 1. 克隆
git clone https://github.com/MindHunter-team/MindHunter_web.git
cd MindHunter_web

# 2. 创建你自己的 .env（参考上面）
notepad agent/.env    # Windows
# 或 vim agent/.env   # Mac/Linux

# 3. 启动后端
cd agent
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 4. 新开一个终端，启动前端
cd web/frontend
npm install
npm run dev
```

- 后端：http://localhost:8000 （访问 `/api/health` 看到 `{"status":"ok"}` 就是成功了）
- 前端：http://localhost:5173

### 如果要改代码

| 你想改什么 | 去哪个文件 |
|-----------|-----------|
| 前端页面布局、动画、交互 | `web/frontend/src/App.jsx` |
| 前端样式、网格背景、特效 | `web/frontend/src/index.css` |
| 某个引擎的 Prompt 或评分标准 | `agent/engines/methodology.py` 等 |
| 仲裁逻辑或打回条件 | `agent/engines/arbitrator.py` |
| LLM 调用方式、模型名、超时 | `agent/llm_client.py` |
| 前后端数据格式 | `agent/main.py` 的 `strip_internal_fields()` |

---

## 项目架构

```
MindHunter_web/
├── web/frontend/                 # 前端 (React + Vite + Tailwind)
│   ├── src/App.jsx               # 主应用
│   ├── src/index.css             # 全局样式
│   └── package.json
│
├── agent/                        # 后端 (Python FastAPI)
│   ├── main.py                   # API 路由 + 调度
│   ├── llm_client.py             # LLM 客户端 (OpenAI → Anthropic 降级)
│   └── engines/                  # 五大引擎
│       ├── methodology.py        # 方法论与实证检验
│       ├── logic.py              # 论证严密性与逻辑推演
│       ├── ethics.py             # 学术伦理与认知偏见
│       ├── innovation.py         # 理论增量与前瞻性评估
│       └── arbitrator.py         # 全局一致性仲裁中枢
│
├── .gitignore
└── README.md
```

## API 数据契约

### 请求

```
POST /api/review
Content-Type: multipart/form-data

file:   <PDF 文件>
domain: "social_sciences" | "stem" | "medicine"
```

### 响应

```json
{
  "overallScore": 81.3,
  "biasLevel": "Moderate-Low",
  "retryCount": 1,
  "engines": {
    "methodology": {
      "score": 85,
      "core_conclusion": "...",
      "evidence": "...",
      "actionable_advice": "..."
    },
    "logic": { "score": 90, "core_conclusion": "...", "evidence": "...", "actionable_advice": "..." },
    "ethics": { "score": 70, "core_conclusion": "...", "evidence": "...", "actionable_advice": "..." },
    "innovation": { "score": 80, "core_conclusion": "...", "evidence": "...", "actionable_advice": "..." }
  }
}
```

前端在 API 不可用时自动 fallback 到内置默认评语，不会白屏。

## 生成单文件演示包（无需服务器）

```bash
cd web/frontend
npm run build
```

`dist/index.html` 即是包含所有 CSS/JS 的单文件，可直接双击打开或发给别人演示。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite 8 + Tailwind CSS v4 |
| 图表 | 自定义 SVG 雷达图 |
| 后端 | FastAPI + asyncio |
| LLM | OpenAI SDK + Anthropic SDK（自动容灾切换） |
| PDF | PyMuPDF |
| 打包 | vite-plugin-singlefile |
