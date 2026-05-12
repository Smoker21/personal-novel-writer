# 架構概覽

> 草稿。隨第一個可運行版本建立後補實。

## 部署形態（[ADR-0001](./adr/0001-storage-strategy.md)）

本機個人工具，無內建伺服器、無登入。前後端分離但兩者皆跑在使用者本機（apps/api 監聽 localhost）。內容資料以使用者選的目錄為主，可自行接 Google Drive / git / 任何同步工具備援。

## 高層元件

```
┌──────────────────────────────────────────────────────────┐
│                    使用者本機                            │
│                                                          │
│  ┌─────────────────┐         ┌──────────────────────┐    │
│  │  apps/web       │  HTTP   │   apps/api (Node)    │    │
│  │  React + Vite   │ ──────▶ │   localhost only     │    │
│  │  編輯器 + AI 面板│        │                      │    │
│  └─────────────────┘         └──┬──────────┬────────┘    │
│                                 │          │             │
│                ┌────────────────▼───┐ ┌────▼──────────┐  │
│                │ packages/         │ │ 檔案 I/O      │  │
│                │ llm-adapter       │ │ (Drive 目錄)  │  │
│                └─┬──────────┬──────┘ └────┬──────────┘  │
│                  │          │             │             │
│              ┌───▼───┐  ┌───▼───┐    ┌────▼─────┐       │
│              │ Cloud │  │ Local │    │ SQLite   │       │
│              │Claude │  │Ollama │    │ cache    │       │
│              │OpenAI │  │LM Std.│    │ (本機)   │       │
│              │Gemini │  │       │    │          │       │
│              └───────┘  └───────┘    └──────────┘       │
└──────────────────────────────────────────────────────────┘

         ↕ 使用者自接同步
   ┌────────────────────────┐
   │ Google Drive / git ... │
   │ 只同步小說內容資料夾   │
   └────────────────────────┘
```

## 儲存分層（[ADR-0001](./adr/0001-storage-strategy.md)）

| 層 | 位置 | 同步 | 內容 |
|----|------|------|------|
| 使用者內容 | 使用者選的 Drive 目錄 | 是 | `synopsis.md`、`characters/*.md`、`chapters/chapter_####_*.md`、`status/*.md`、`agents/`、`skills/` |
| 衍生 cache | `~/.novel-writer/cache/<project-hash>/` | 否 | SQLite（FTS5、metadata、章節摘要） |
| 全域設定 | `~/.novel-writer/` | 否 | `settings.yaml`、API key、地端 endpoint、全域 `agents/` `skills/` 預設 |

## Agent / Skill 分層（[ADR-0002](./adr/0002-agent-skill-naming.md)）

| 層 | 位置 | 用途 |
|----|------|------|
| 開發期 | `.claude/agents/`、`.claude/skills/` | Claude Code 協助開發本專案 |
| 全域使用者 | `~/.novel-writer/agents/`、`~/.novel-writer/skills/` | 應用執行時讀取，內建 default + 使用者擴充 |
| 專案 override | `<project>/agents/`、`<project>/skills/` | 該專案特殊行為，會跟著 Drive 同步 |

執行時解析順序：專案 override > 全域使用者 > 內建 default。

## 跨切面決策

**已決定**：

- ✅ [ADR-0001](./adr/0001-storage-strategy.md) — 儲存策略（檔案 + 本機 SQLite）
- ✅ [ADR-0002](./adr/0002-agent-skill-naming.md) — Agent / Skill 分層與命名

**待 ADR**：

- [ ] 後端框架（Express / Fastify / NestJS / Hono）
- [ ] ORM / SQLite 客戶端（Prisma / Drizzle / better-sqlite3）
- [ ] 編輯器（Tiptap / Lexical / Slate）
- [ ] LLM provider 介面設計（packages/llm-adapter 的 `LLMProvider` interface）
- [ ] 章節版本快照策略（每次儲存全文 / diff / Yjs；ADR-0001 暫定資料夾＋時間戳，可再優化）
- [ ] 串流回應傳輸（SSE / WebSocket）
- [ ] 應用打包（Tauri / Electron / 純 Node CLI + 瀏覽器）
- [ ] Drive 同步衝突偵測與解決流程

每個項目決定後請用 `create-adr` skill 留下紀錄。
