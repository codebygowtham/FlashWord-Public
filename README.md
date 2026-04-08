# FlashWord

**Context-first English vocabulary learning powered by AI.**  
FlashWord turns isolated words into meaningful memory by generating short, coherent stories where each target word appears in context, then converting those words into a personal review loop.

---

## English

### What FlashWord Is

FlashWord is an AI-native vocabulary learning app built for high-frequency, context-based acquisition:

- Pick 8 target words from your selected word bank.
- Generate a short Chinese-led story with those exact English words embedded in real usage.
- Tap words in the story to see meanings, mark mastered, or add to notebook.
- Continue with spaced review mode to convert short-term exposure into long-term retention.

This is not a dictionary viewer.  
It is a **context engine + memory engine**.

### Why Context-Based Learning Works Here

FlashWord operationalizes contextual learning as a product system:

1. **Constrained target set**: every generation uses exactly 8 unique target words.
2. **Contextual embedding**: words must appear inside a coherent narrative, not in isolated lists.
3. **Immediate interaction**: each word is clickable for meaning and action.
4. **State transition**: words move through learning states (`learning`, `mastered`) and review scheduling.
5. **Reinforcement loop**: due words are recycled into review articles with spaced intervals.

The result: better semantic binding, stronger retrieval cues, and less "I know this word but can't use it."

### AI Integration (Production-Oriented)

FlashWord uses DeepSeek for generation and applies strict response governance:

- API endpoint: `/api/generate` (`Node.js + Express`)
- Model: `deepseek-chat`
- Expected output: strict JSON `{ text, dictionary }`
- Server-side sanitization:
  - only allows the provided target words in dictionary keys
  - enforces normalized word matching
  - repairs missing dictionary entries with fallback placeholders
  - sanitizes generated text and patches missing target words
- Anonymous daily quota control:
  - signed cookie-based usage counter
  - server-side enforcement with `429 FREE_QUOTA_EXHAUSTED`

This keeps generation quality and platform constraints stable under real-world usage.

### Core Features

- **Multi-bank vocabulary input** (IELTS / CET4 / Gaokao / SAT)
- **Context article generation** with strict target-word constraints
- **Interactive reading UI** with inline word states and action bubbles
- **Notebook system** backed by Supabase (`user_words`)
- **Mastered/Learning tabs** (`notebook.html`)
- **Review mode** with SM-2 style scheduling fields (`reps`, `interval`, `ease_factor`, `next_review_at`)
- **Daily progress and goals**
- **Speech synthesis** (`Web Speech API`)
- **Auth + membership flows** (Supabase Auth + Pro activation UX)
- **Prefetch pipeline** for smoother next-article experience

### Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend API**: Node.js, Express
- **AI Provider**: DeepSeek Chat Completions API
- **Data/Auth**: Supabase (Auth + Postgres tables used by app)
- **Browser APIs**: SpeechSynthesis, LocalStorage
- **Deployment model**: static pages + serverless/Node API endpoint

### Project Structure

```text
FlashWord/
├─ index.html          # Main learning experience
├─ notebook.html       # Personal vocabulary notebook
├─ api/
│  └─ generate.js      # AI generation endpoint + sanitization + quota logic
└─ generate.js         # Local API server entry (starts api/generate)
```

### Quick Start

#### 1) Clone and install backend dependencies

```bash
git clone <your-repo-url>
cd FlashWord
npm install express cors
```

#### 2) Configure environment

Create `.env.local` in project root:

```bash
DEEPSEEK_API_KEY=your_deepseek_key
# Optional: custom signing key for anonymous quota cookie
ANON_QUOTA_SIGNING_KEY=your_random_secret
```

#### 3) Run API

```bash
node generate.js
```

#### 4) Open frontend

Serve `index.html` and `notebook.html` from your preferred static host/dev server.  
Make sure `/api/generate` routes to this Node API (same origin or reverse proxy).

### API Contract

**POST** `/api/generate`

Request:

```json
{
  "words": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8"],
  "is_logged_in": true
}
```

Response:

```json
{
  "text": "Generated context paragraph...",
  "dictionary": {
    "word1": "中文释义",
    "word2": "中文释义"
  }
}
```

### Open Source Roadmap

- Extract config from HTML into environment-driven runtime config
- Add DB migration scripts and schema docs
- Add automated tests for `/api/generate` sanitization and quota
- Add i18n content files and localization workflow
- Publish Docker and one-command local setup

### License

MIT (recommended). Add your final license file before public release.

---

## 中文

### FlashWord 是什么

FlashWord 是一个以 **语境驱动** 为核心的 AI 背单词产品，不是传统“词表 + 释义”工具，而是把单词放进真实叙事里学习：

- 每次从词库挑选 8 个目标词
- 生成一段中文主导、夹杂英文目标词的连贯短文
- 点击文中单词即可查看释义、加入生词本或标记掌握
- 进入复习模式后，按间隔算法持续回收待复习词

一句话：**把“看到单词”升级为“在上下文中使用单词”。**

### 语境学习逻辑（Context-based Learning）

FlashWord 的学习引擎不是一句口号，而是一套可执行流程：

1. **固定目标集**：一次只学习 8 个词，降低认知噪声。
2. **强制语境嵌入**：目标词必须出现在连贯语篇中，而不是词表堆砌。
3. **即时可交互**：词在正文中可点击，学习动作发生在阅读现场。
4. **状态可追踪**：单词在 `learning/mastered` 间流转，进入个人生词本。
5. **复习可调度**：到期词进入复习模式，形成长期记忆闭环。

### AI 集成与工程约束

FlashWord 使用 DeepSeek 生成内容，并在服务端做严格治理：

- 接口：`/api/generate`
- 模型：`deepseek-chat`
- 输出协议：严格 JSON（`text` + `dictionary`）
- 服务端兜底与清洗：
  - 仅保留目标词对应词典条目
  - 规范化词形匹配，避免脏键值
  - 缺失释义自动补位
  - 清洗文本并补齐漏掉的目标词
- 游客限额保护：
  - 签名 Cookie 记录日额度
  - 服务端返回 `429` 控制免费调用

这保证了 AI 输出在真实用户场景下依然可控、稳定、可运维。

### 核心能力

- 多词库输入（IELTS / CET4 / 高考 / SAT）
- 8 词语境短文生成
- 文内高亮与气泡交互（释义/收藏/掌握）
- Supabase 生词本与登录体系
- 学习中/已掌握视图切换
- 复习模式 + 间隔记忆参数（`reps` / `interval` / `ease_factor` / `next_review_at`）
- 每日目标与进度管理
- Web Speech 自动朗读
- 预生成队列，降低下一篇等待时间

### 技术栈

- 前端：Vanilla HTML / CSS / JavaScript
- 后端：Node.js + Express
- AI：DeepSeek Chat Completions
- 数据与认证：Supabase（Auth + Postgres）
- 浏览器能力：SpeechSynthesis、LocalStorage

### 快速启动

#### 1）安装依赖

```bash
git clone <你的仓库地址>
cd FlashWord
npm install express cors
```

#### 2）配置环境变量

在项目根目录创建 `.env.local`：

```bash
DEEPSEEK_API_KEY=你的密钥
ANON_QUOTA_SIGNING_KEY=任意高强度随机字符串（可选）
```

#### 3）启动 API

```bash
node generate.js
```

#### 4）启动前端页面

通过任意静态服务打开 `index.html` 和 `notebook.html`，并确保 `/api/generate` 指向上述 Node 服务（同源或反向代理）。

### 开源建议路线

- 将页面内配置项全部外置为环境配置
- 补齐数据库迁移脚本与建表文档
- 为 AI 接口清洗逻辑与额度逻辑增加自动化测试
- 提供 Docker 化一键启动

### 许可证

建议使用 MIT，并在开源发布前补充 `LICENSE` 文件。

