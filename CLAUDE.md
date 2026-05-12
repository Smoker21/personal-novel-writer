# Claude Code 專案指引

## 專案性質

**個人本機**小說撰寫應用。前端 React + Vite + TS、後端 Node 監聽 localhost；無伺服器、無登入。內容以純文字檔（`.md` / `.yaml`）存使用者選的目錄，可自接 Google Drive / git 同步；衍生資料用本機 SQLite。LLM 透過 `packages/llm-adapter` 抽象層支援雲端多家（Claude / OpenAI / Gemini…）與地端（Ollama / LM Studio…）。

詳見 [ADR-0001](docs/architecture/adr/0001-storage-strategy.md)（儲存）與 [ADR-0002](docs/architecture/adr/0002-agent-skill-naming.md)（Agent / Skill）。

## 三層命名空間：別搞混

| 層 | 路徑 | 用途 | 由誰扮演 / 執行 |
|----|------|------|---------------|
| **開發期 Agent / Skill** | `.claude/agents/`、`.claude/skills/` | 協助開發本專案 | Claude Code（我）扮演 |
| **產品內 Agent / Skill — 全域** | `~/.novel-writer/agents/`、`~/.novel-writer/skills/` | 應用執行時讀 | apps/api 呼叫 LLM |
| **產品內 Agent / Skill — 專案** | `<project>/agents/`、`<project>/skills/` | 該專案特殊行為 | apps/api 呼叫 LLM |

寫程式時清楚自己在哪一層。`docs/agents/` 與 `docs/skills/` 是**規格**（產品內），不是要 Claude Code 自己扮演。

## Agent vs Skill

依 [ADR-0002](docs/architecture/adr/0002-agent-skill-naming.md)：

- **Agent**（名詞職稱）— 自主多步流程；例 `chapter-writer`、`character-designer`、`continuity-checker`
- **Skill**（動詞片語）— 單次操作；例 `polish-prose`、`shorten`、`make-dialogue-natural`

口訣：**Agent 是「誰」，Skill 是「做什麼」**。

每個產品內 Agent / Skill 文件**強制**檔頭三句話：「這是什麼 / 何時用 / 不做什麼」。

## 工作流：需求 → 規格 → 實作 → 測試

1. **需求**（`product-manager`）— 同時產出兩份：
   - `docs/requirements/stories/<NNN>-<slug>.md`（Connextra + Gherkin 給人讀）
   - `docs/requirements/features/<NNN>-<slug>.feature`（可執行 BDD 給機器跑）
   - 兩處 Scenario 文字逐字一致
2. **規格**（`spec-architect`）— 為 status=`Ready` 的 story 產出 `docs/architecture/specs/<NNN>-<slug>.md`，含 API 合約、資料模型、跨元件協議、效能假設、開發任務拆解
3. **實作**（`backend-developer` / `frontend-developer` / `llm-integrator`）— 動工前必讀對應 spec；spec 為 `Draft` 時禁止寫產品程式碼
4. **測試**（`qa-engineer`）— 依 .feature 寫 cucumber-js step definitions，連到 unit / integration / e2e；AI 代理另加 golden test
5. 重大跨切面決策一律寫 ADR（`docs/architecture/adr/`）
6. 跨前後端型別定義在 `packages/shared-types/`，不要兩邊各自寫

退回機制：spec-architect 發現 story 矛盾 → spec status=`Draft`，story status 退回 `Draft`，PM 釐清後再走一遍。dev 不繞過此流程。

## 重點規範

- TypeScript strict 模式，前後端共用型別
- 禁止把 LLM SDK 直接用在 controller / route handler，一律走 `packages/llm-adapter`
- 提示詞集中放 `packages/prompt-library/`，不要散落在程式碼字串中
- API key 與地端 endpoint 設定**只**寫到 `~/.novel-writer/settings.yaml`，**絕不**進入專案資料夾或 git
- 處理小說內容時注意：章節可能很長（數萬字），避免一次塞進 context；必要時分段或摘要
- SQLite 是衍生 cache，可重建；任何「掉了會痛」的東西都該存進使用者 Drive 目錄

## 常用啟動指令

```
> 載入 product-manager 子代理，整理本週要做的 stories 為一個 epic
> 載入 spec-architect，把 story 001 翻成 docs/architecture/specs/001-...md
> 載入 ai-agent-designer，為「chapter-writer」生出 docs/agents/chapter-writer.md
> 載入 ai-agent-designer，為「polish-prose」生出 docs/skills/polish-prose.md
> 用 write-user-story skill 寫一個關於「離線編輯後同步」的 story（含 .feature）
> 用 create-adr skill 記錄「為何選 Hono 而非 Express」
```

## 此檔的範圍

這是 Claude Code 的**全域**專案指引。子代理各自的職責、輸出格式、合作協議寫在 `.claude/agents/<name>.md`，不要重複寫在這裡。
