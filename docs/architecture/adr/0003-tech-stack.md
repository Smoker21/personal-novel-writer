# 0003. 技術棧選型：Hono + better-sqlite3 + SSE + in-process queue

- Status: `Accepted`
- Date: `2026-05-10`
- Deciders: spec-architect

## Context

撰寫核心 specs（005 / 006 / 007）前，必須釘死數個跨切面技術選擇——每一個都會在多個 spec 中被引用。為避免重複討論與決策漂移，本 ADR 一次處理：

1. 後端 HTTP 框架
2. SQLite 客戶端
3. LLM 串流傳輸協議
4. 背景任務 / queue 機制
5. 輸入驗證
6. 應用打包形態（影響埠號 / 啟動方式）

定位前提（[ADR-0001](./0001-storage-strategy.md)）：本應用是**個人本機工具**，apps/api 監聽 `127.0.0.1`，無多租戶、無水平擴展、單一寫者、預期同時開啟 < 5 個小說專案。技術選擇向「簡單、低依賴、易嵌入桌面包裝」傾斜。

## Decision

### 1. 後端 HTTP 框架：**Hono**

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
```

理由：
- 體積小（< 30 KB），啟動快，適合桌面應用內嵌
- 一級 SSE / streaming 支援（`hono/streaming`），對 Story 005 直接受用
- TypeScript 原生（無 `@types` 拖累）
- 中介層模型乾淨，易測
- 對 Node / Bun / Cloudflare Workers 通吃，未來若改用 Tauri sidecar 不必重寫
- 學習曲線比 NestJS 低，沒有 decorator 魔法

### 2. SQLite 客戶端：**better-sqlite3**

```ts
import Database from "better-sqlite3";
const db = new Database(cachePath, { fileMustExist: false });
```

理由：
- **同步** API：本機單寫者場景下，async 開銷無意義；同步寫法更易讀、易測
- 效能最佳（直接 binding，無 IPC）
- 廣為使用、prebuilt binary 涵蓋 Win/Mac/Linux
- 支援 prepared statements、WAL mode
- 用 raw SQL，不引入 ORM——個人工具的 schema 不會大到需要 ORM 抽象；若需查詢構造，加薄包裝（不是 Drizzle / Prisma）

### 3. LLM 串流傳輸協議：**Server-Sent Events (SSE)**

理由：
- 單向（server → client）正好符合 LLM token 串流，用 WebSocket 是過度設計
- HTTP 原生，瀏覽器 `EventSource` 直接支援
- 重連語意內建（`Last-Event-ID`），但本應用無此需求
- 中止 = client 關閉連線；server 端用 `AbortController` 通知 LLM provider
- Hono `streamSSE` helper 處理事件框架
- 不需特殊代理 / load balancer 設定（本機無此問題）

事件格式（spec 005 / 007 共用）：

```
event: chunk
data: {"text":"她推開..."}

event: usage
data: {"inputTokens":2310,"outputTokens":120}

event: error
data: {"code":"network","message":"...","retryable":true}

event: complete
data: {"draftId":"abc123"}
```

### 4. 背景任務 / queue：**in-process FIFO queue（自寫，10 行）**

不引入 BullMQ / agenda / kue。對個人工具 overkill。

設計：

```ts
class JobQueue {
  private queue: Job[] = [];
  private running: Job | null = null;
  
  enqueue(job: Job): JobId { /* push, kick worker */ }
  cancel(jobId: JobId): boolean { /* remove or signal abort */ }
  status(jobId: JobId): JobStatus { /* queued|running|done|failed|aborted */ }
  events(jobId: JobId): AsyncIterable<JobEvent> { /* for SSE */ }
}
```

每個小說專案一個 queue 實例（鍵：projectPath）。同一 queue 同時最多 1 個 running job——這是 Story 007「同時兩次採用時排隊處理」的硬保證。

queue 狀態存在記憶體；應用重啟即遺失。對個人工具可接受（status-updater 失敗了，使用者重試一次即可，不需 durability）。

### 5. 輸入驗證：**Zod**

每個 endpoint 用 zod schema 驗證 request body。Hono 有 `@hono/zod-validator` middleware。

理由：型別與驗證一處定義；錯誤訊息可結構化餵給前端的 fieldErrors（spec 001 已用此模式）。

### 6. 應用打包：**暫定「Node + 瀏覽器」雙程序**

- apps/api：純 Node（不是 Bun，避免 better-sqlite3 binding 議題），bind `127.0.0.1:<random-free-port>`，啟動時把 port 寫到 `~/.novel-writer/.runtime.json`
- apps/web：Vite build 出靜態檔，由 apps/api 同程序 serve（或開發時 Vite dev server proxy）
- 桌面包裝（Tauri / Electron / 自寫 launcher）**留待後續 ADR**——目前不阻擋 spec 005-007 的設計

理由：
- 不綁死打包工具，未來 Tauri / Electron 都能套
- 本機 SQLite + 檔案 I/O 在 Node 主程序最直接
- 前端走 HTTP 與 apps/api 通訊，等同遠端 web app 的本機版本，能直接用瀏覽器 dev tools 偵錯

### 7. TypeScript：**strict + 5.x**，monorepo 用 **pnpm workspace**

避免 yarn berry / npm workspace 的雜訊。pnpm 對 monorepo 友善、安裝快、disk 友善。

## Consequences

**Positive:**

- 全棧依賴少、好嵌入：Hono + better-sqlite3 + 自寫 queue，部署單體積小
- SSE 是 web 標準，瀏覽器、curl、Postman 都能直接驗
- 同步 SQLite 寫法讓事務與一致性保證易讀
- 不引入大框架，spec 與測試重心放在業務邏輯

**Negative:**

- 自寫 queue 沒有 retry 持久化、沒有 cron 排程；若未來需要這些（例：每日匯出排程），要換實作
- better-sqlite3 是 native module，Tauri 打包要處理 binding rebuild
- Hono 生態小於 Express，若需要某個 Express middleware 可能要自寫——但目前 spec 範圍內無此需求

**Neutral:**

- 不選 Bun：better-sqlite3 在 Bun 上的 native binding 仍處於演進期
- 不選 Fastify：Fastify 的 schema-first / plugin 系統對個人工具偏重；Hono 更輕

## Alternatives considered

### Express
- Pros: 生態最大、文件最齊
- Cons: 老舊（不是現代 TS）、SSE 要自己手刻、效能不如 Hono
- 為何不選：本機應用不需「最大生態」，需「最小驚奇」

### Fastify
- Pros: 性能好、有 schema validation
- Cons: 設定面積大、SSE 要 plugin、TS 體驗不如 Hono
- 為何不選：對小規模本機工具偏重

### NestJS
- Pros: 結構清晰、DI、企業特性齊
- Cons: 啟動慢、decorator 學習曲線、檔案結構龐大
- 為何不選：個人工具不需這個量級的架構

### WebSocket（取代 SSE）
- Pros: 雙向、可保持連線
- Cons: 過度設計（LLM 串流是單向）、需要額外 ping / 重連邏輯
- 為何不選：YAGNI

### BullMQ / Agenda（取代自寫 queue）
- Pros: 持久化、分散式、Web UI
- Cons: 需要 Redis；對個人工具是天文級依賴
- 為何不選：本機單程序，自寫 10 行 queue 就夠

### Drizzle / Prisma
- Pros: 型別安全、遷移管理
- Cons: 對小 schema 是 overhead；Prisma 還引入 generator + binary
- 為何不選：本機 schema 簡單，raw SQL + 一個薄 query helper 即可

### sql.js / libsql
- Pros: 純 JS、可能更易跨平台
- Cons: 效能不如 better-sqlite3；libsql 未廣泛驗證 prebuilt
- 為何不選：本機應用不在乎那點 prebuilt 痛點

## References

- [ADR-0001](./0001-storage-strategy.md)（儲存策略）
- [ADR-0002](./0002-agent-skill-naming.md)（命名規範）
- Hono docs: https://hono.dev
- better-sqlite3 docs: https://github.com/WiseLibs/better-sqlite3
