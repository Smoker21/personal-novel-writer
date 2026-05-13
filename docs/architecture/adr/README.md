# Architecture Decision Records

Michael Nygard 風格 ADR。新增請用 `create-adr` skill。

## 索引

| ID | 標題 | Status | Date |
|----|------|--------|------|
| [0001](./0001-storage-strategy.md) | 儲存策略：本機檔案為主、本機 SQLite 為輔、Drive 同步使用者內容 | Accepted | 2026-05-09 |
| [0002](./0002-agent-skill-naming.md) | Agent 與 Skill 的分層、命名規範與檔頭規則 | Accepted | 2026-05-09 |
| [0003](./0003-tech-stack.md) | 技術棧選型：Hono + better-sqlite3 + SSE + in-process queue | Accepted | 2026-05-10 |
| [0004](./0004-llm-adapter.md) | LLM adapter interface 設計 | Accepted | 2026-05-10 |
| [0005](./0005-editor-selection.md) | 編輯器選型：CodeMirror 6 | Accepted | 2026-05-12 |
| [0006](./0006-app-packaging.md) | 應用打包：Tauri 2 + Hono sidecar + Vite React | Accepted | 2026-05-12 |
| [0007](./0007-git-integration.md) | Git 整合：shell out 系統 git | Accepted | 2026-05-12 |
| [0008](./0008-frontend-architecture.md) | 前端架構：React 18 + Zustand + Dexie + Hono RPC | Accepted | 2026-05-12 |
| [0009](./0009-llm-adapter-vision.md) | LLM adapter vision 擴充（amends 0004） | Accepted | 2026-05-13 |

## 編號

四位數字補零，連續遞增。被取代的 ADR 保留檔案，status 改為 `Superseded by NNNN`，並在新 ADR 的 References 互連。
