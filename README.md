# Novel Writer

一個輔助小說撰寫的**個人本機**應用程式。前後端分離、無伺服器、無登入；內容以純文字檔（`.md` / `.yaml`）存使用者選的目錄，可自接 Google Drive / git 同步；衍生資料用本機 SQLite。內建多個 AI 寫作 Agent 與 Skill，支援雲端（多家）與地端 LLM。

## 開發模式

本專案採用**雙層多代理協作**：

1. **開發期** — Claude Code 子代理（`.claude/agents/`）分工協作：
   - `product-manager` 寫 user story + BDD `.feature`
   - `spec-architect` 把 ready 的 story 翻成技術 spec（API 合約、資料模型、開發任務）
   - `backend-developer` / `frontend-developer` / `llm-integrator` 依 spec 動工
   - `ai-agent-designer` 設計產品內 Agent 與 Skill 規格
   - `qa-engineer` 依 .feature 寫 step definitions + 各層測試
2. **產品內** — 應用內建多個 AI 角色（`docs/agents/`）與 AI 操作（`docs/skills/`）。例：`chapter-writer` 是 Agent（自主寫整章）、`polish-prose` 是 Skill（潤飾選取段落）。

兩層互不混淆：開發期是 Claude Code 的協作工具，產品內是要實作出來給使用者用的功能。

工作流：**需求（PM）→ 規格（spec-architect）→ 實作（dev）→ 測試（QA）**。dev 不繞過 spec 直接動工；spec-architect 發現 story 矛盾退回 PM。

## 目錄結構

```
.
├── .claude/                       # 開發期工具（給 Claude Code 用）
│   ├── agents/                    # 子代理（PM、spec-architect、後端、前端、AI 設計師、QA…）
│   ├── skills/                    # 工作流（write-user-story、create-adr、design-ai-agent…）
│   └── settings.json
├── apps/
│   ├── web/                       # React + Vite + TS 前端（待建立）
│   └── api/                       # Node 後端，監聽 localhost（待建立）
├── packages/
│   ├── shared-types/              # 跨前後端的型別（待建立）
│   ├── llm-adapter/               # 雲端/地端 LLM 抽象層（待建立）
│   └── prompt-library/            # 提示詞模板（待建立）
├── tools/
│   └── eval/                      # 模型評估 CLI（dev-time），見 tools/eval/README.md
├── docs/
│   ├── requirements/              # 需求層
│   │   ├── _template.md
│   │   ├── personas.md
│   │   ├── idea.md                # 專案發起人原始構想
│   │   ├── stories/               # User stories（Connextra + Gherkin，PM 寫）
│   │   └── features/              # 對應的 BDD .feature（PM 寫，QA 綁 step definitions）
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── specs/                 # 技術規格（spec-architect 寫，dev 動工依據）
│   │   └── adr/                   # 架構決策紀錄
│   ├── agents/                    # 產品內 Agent 規格（自主多步流程）
│   │   ├── _template.md
│   │   └── README.md
│   ├── skills/                    # 產品內 Skill 規格（單次操作）
│   │   ├── _template.md
│   │   └── README.md
│   └── api/                       # OpenAPI / API 合約
├── CLAUDE.md                      # Claude Code 專案指引
└── README.md
```

執行時（不在 repo 內，使用者本機）：

```
~/.novel-writer/                   # 全域使用者設定（不同步）
├── settings.yaml                  # API key、地端 endpoint、預設模型
├── agents/                        # 全域 Agent 預設（內建 + 使用者擴充）
├── skills/                        # 全域 Skill 預設
└── cache/<project-hash>/index.db  # SQLite 衍生 cache

<使用者選的同步資料夾>/<小說專案>/  # 跟著 Drive 同步
├── project.yaml
├── synopsis.md
├── characters/
├── world/
├── chapters/
├── status/
├── agents/                        # 此專案的 Agent override
└── skills/                        # 此專案的 Skill override
```

## 起步

目前處於需求與架構成形階段。建議流程：

1. ✅ 已有：[ADR-0001](docs/architecture/adr/0001-storage-strategy.md)、[ADR-0002](docs/architecture/adr/0002-agent-skill-naming.md)、idea.md、第一個 story 範例
2. 持續用 `write-user-story` skill 在 `docs/requirements/stories/` 寫 stories（含 .feature）
3. PM 把 stories 切成 epics、排優先序
4. 每個 ready story 由 spec-architect 寫 spec
5. 重大決策補 ADR（後端框架、編輯器、打包工具…）
6. dev 開工：`apps/`、`packages/`

## 與 Claude Code 協作

```
> 你是 product-manager 子代理，請根據 docs/requirements/idea.md 把功能切分為 epics 與 stories。
> 載入 ai-agent-designer，為「chapter-writer」生出 docs/agents/chapter-writer.md。
> 用 write-user-story skill 為「章節版本回溯」寫一個 story（含 .feature）。
> 用 create-adr skill 記錄「為何選 better-sqlite3 而非 Prisma」。
```
