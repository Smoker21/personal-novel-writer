# M1-A 基礎層設計文件（型別 + 設定頁 + git 後端）

> 日期：2026-05-13
> 狀態：Approved
> 對應 milestone：[M1-writing-skeleton.md](../../architecture/milestones/M1-writing-skeleton.md)
> 子循環：M1-A（M1 拆三段的第一段，後續是 M1-B 專案生命週期、M1-C 章節編輯器）

## 背景

M1 寫作骨架太大（30-40 PR / 8 個獨立子系統），拆成 M1-A/B/C 三個子循環逐步實作。本檔是 M1-A：建立型別層 + 設定頁完整功能 + git 後端與啟動偵測 UI。

apps/web 工作目錄有大量 Phase B prototype 未提交修改，將先遷移到 `prototype/apps/web/`（獨立 PR）再開始 M1-A 工作。

## 範圍

### 本次做

- `packages/shared-types`：project / settings / git / chapter 四個型別模組
- `apps/api/src/services/`：provider-tester、commit-policy、git-status-parser
- `apps/api/src/routes/`：settings、git
- `apps/web/src/features/settings/`：SettingsPage、ProviderCard、ApiKeyField
- `apps/web/src/features/startup/`：GitMissingDialog、ConflictBanner
- `apps/web/src/mocks/`：MSW handlers + fixtures（給單元測試與 dev 模式用）

### 不在本次範圍

- per-Agent routing UI（dropdown + fallback 編輯器）→ M2
- preset 按鈕（Cloud / Cloud+地端 / 全地端）→ M2
- 建立/開啟專案 routes → M1-B
- 章節編輯器 → M1-C
- fs_watcher 啟用（M0 骨架在；event 傳遞留 M1-B 或 M1-C 用時啟用）

## 目錄結構

```
packages/shared-types/src/
├── index.ts
├── project.ts            # ProjectHash, ProjectMeta, RecentProject
├── settings.ts           # LLMProviderId, ProviderConfig, AppSettings, ProviderTestResult
├── git.ts                # GitBinaryInfo, GitFileChange, GitStatus
└── chapter.ts            # Chapter, ChapterSummary, countChars()

apps/api/src/
├── routes/
│   ├── settings.ts
│   └── git.ts
└── services/
    ├── provider-tester.ts
    ├── commit-policy.ts
    └── git-status-parser.ts

apps/web/src/
├── features/
│   ├── settings/
│   │   ├── SettingsPage.tsx
│   │   ├── ProviderCard.tsx
│   │   └── ApiKeyField.tsx
│   └── startup/
│       ├── GitMissingDialog.tsx
│       └── ConflictBanner.tsx
└── mocks/
    ├── handlers.ts
    ├── browser.ts
    ├── server.ts
    └── fixtures/
        ├── settings.ts
        └── git-status.ts
```

## 型別層

詳見 § 2（最終以 packages/shared-types/src/ 實際檔為準）。

關鍵設計：
- `ProjectHash`：16 字元 hex（路徑 sha256 前 16 byte），與 M0 settings-store 對齊
- `AppSettings.schemaVersion: 1`：未來欄位變動用此 migrate
- `AppSettings.providers` 用 `Record<LLMProviderId, ProviderConfig>`，避免漏支援某 provider
- `GitStatus.changes` 用 v2 porcelain 解析結果，rename 帶 `oldPath`
- `countChars()`：中文/英文/標點都算一個字，忽略空白與換行

## 後端服務

### `provider-tester.ts`

```ts
export async function testProvider(
  providerId: LLMProviderId,
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<ProviderTestResult>;
```

7 個 provider 的 endpoint：

| Provider | Endpoint | Header |
|---|---|---|
| anthropic | `https://api.anthropic.com/v1/models` | `x-api-key`, `anthropic-version: 2023-06-01` |
| openai | `https://api.openai.com/v1/models` | `Authorization: Bearer` |
| google | `https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}` | — |
| xai | `https://api.x.ai/v1/models` | `Authorization: Bearer` |
| ollama / lmstudio / rwkv-runner | `{endpoint}/v1/models` | — |

逾時 5 秒（用 `AbortController`）；latency 用 `performance.now()` 量測。

### `commit-policy.ts`

```ts
export type CommitTrigger =
  | "create-project"
  | "save-chapter"
  | "rename-chapter";

export async function commitIfChanged(
  projectPath: string,
  trigger: CommitTrigger,
  message: string,
): Promise<{ sha: string } | null>;
```

實作流程：
1. `git status --porcelain=v2` → 若無變更回 null
2. `git add .`
3. `git commit -m "{trigger}: {message}"`
4. 回傳 commit sha

### `git-status-parser.ts`

```ts
export function parseStatus(stdout: string): GitStatus;
```

解析 `git status --porcelain=v2 --branch` 輸出。v2 格式每行有明確 type prefix（`#` branch info、`1` 修改、`2` rename、`u` 衝突、`?` untracked）。

## 後端 Routes

```
GET  /api/settings                            → AppSettings（API key 遮蔽）
PUT  /api/settings                            → 寫入（zod 驗證）
POST /api/settings/test-provider              → ProviderTestResult
POST /api/settings/reset                      → 還原出廠預設
GET  /api/settings/secret/:provider           → 完整 API key

GET  /api/projects/:hash/git/status           → GitStatus
GET  /api/projects/:hash/git/check-binary     → GitBinaryInfo
```

`:hash` 反查路徑用 M0 已實作的 `project-resolver`。

API key 遮蔽規則：`sk-ant-xxxx-yyyy-zzzz` → `sk-ant-***zzzz`（保留尾 4 字元辨識）。

## 前端 Features

### Settings 區

- `SettingsPage.tsx`：路由 `/settings`，7 個 ProviderCard + 「儲存」+「重設出廠預設」
- `ProviderCard.tsx`：啟用 toggle + 欄位（雲端用 apiKey、地端用 endpoint）+ 「測試連線」按鈕 + 結果 indicator + defaultModel 輸入
- `ApiKeyField.tsx`：預設遮蔽 → 「顯示」按鈕呼叫 `/api/settings/secret/:provider` 取真值 → 「隱藏」回遮蔽

### Startup 區

- `GitMissingDialog.tsx`：啟動時 invoke Tauri `detect_git` 失敗 → 阻擋對話框 + 安裝指引 + 「我已安裝」重試按鈕
- `ConflictBanner.tsx`：開啟專案後呼叫 `git/status`，若 `clean=false` 顯示「外部有變更，請先處理」banner

### Mocks

- `mocks/handlers.ts`：MSW handlers 對應 7 個 endpoints
- `mocks/fixtures/settings.ts`：anthropic enabled + ollama enabled 的範例 AppSettings
- `mocks/fixtures/git-status.ts`：clean 與 conflict 兩個範例
- `mocks/server.ts`：vitest setup 時啟動
- `mocks/browser.ts`：`VITE_USE_MSW=1` 時啟用 service worker

## 測試策略

| 層 | 工具 | 範圍 |
|---|---|---|
| Backend unit | vitest | provider-tester（7 providers）、commit-policy（add/skip）、git-status-parser（clean / dirty / rename / conflict） |
| Backend integration | vitest + tmpdir | settings/git routes 走真實 fs |
| Frontend unit | vitest + RTL + MSW | ProviderCard 互動、ApiKeyField 遮蔽切換、SettingsPage 載入流程 |
| Frontend dev mock | `VITE_USE_MSW=1 pnpm dev:web` | 不需後端就能跑 UI 開發 |

覆蓋率目標：critical path（provider-tester、commit-policy、status-parser、settings routes）≥ 80%。

## API key 安全

- `settings.yaml` 永遠存完整 key（使用者本機檔案）
- `GET /api/settings` 回應永遠遮蔽
- `GET /api/settings/secret/:provider` 才回真值（給「顯示」按鈕一次性讀取，前端不快取）
- API key 絕不出現在 log、絕不進入 git（settings.yaml 在 `~/.novel-writer/` 不在專案目錄）

## 驗收（M1-A DoD）

```
1. pnpm typecheck / test / lint 全綠
2. 設定頁可開啟，7 個 provider 卡片都在
3. 啟用 anthropic + 填 API key + 點測試連線 → 綠色「連線成功，延遲 XXXms」
4. 「儲存」後 cat ~/.novel-writer/settings.yaml 看到完整 key（遮蔽只在 API 回應）
5. 「顯示」按鈕點下後欄位變成完整 key；再點「隱藏」回 sk-***xxxx
6. 「重設出廠預設」清空所有 provider config
7. 開啟既有 git 專案 → ConflictBanner 條件正確（有變更才顯示）
8. 模擬 git 未裝（rename git.exe）→ GitMissingDialog 顯示
9. VITE_USE_MSW=1 pnpm dev:web → 設定頁不接後端也能跑
```

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| Google API endpoint 需 query string 帶 key，與其他 provider 介面不一致 | provider-tester 內部分流，外部介面統一 |
| MSW service worker 在 Tauri WebView 行為不明 | 只在 Vite dev 環境啟用（用 `import.meta.env.DEV && VITE_USE_MSW`） |
| API key 遮蔽邏輯實作錯誤導致洩漏 | 寫成 pure function 並廣覆蓋單元測試（空字串、短 key、長 key） |
| commit-policy 在 detached HEAD 或 rebase 中時誤 commit | parseStatus 偵測 `# branch.head (detached)`，commitIfChanged 在 detached 時回 null + log warning |
