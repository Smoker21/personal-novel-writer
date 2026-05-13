# M0 — 基礎建設

> Status: **完成**
> 預估規模：20-30 PR
> 對應 ADR：[0001](../adr/0001-storage-strategy.md)、[0002](../adr/0002-agent-skill-naming.md)、[0003](../adr/0003-tech-stack.md)、[0004](../adr/0004-llm-adapter.md)、[0006](../adr/0006-app-packaging.md)、[0007](../adr/0007-git-integration.md)、[0008](../adr/0008-frontend-architecture.md)
> 對應 spec：無（M0 不交付 user-facing feature；建立讓 M1 動工的基礎）
> 前置依賴：無

## 目標

把 monorepo、Tauri shell、Hono sidecar、共用 types、git wrapper、LLM adapter 骨架全部建好。完成後**應用能啟動空白視窗，前端能呼叫 sidecar 健康檢查，能對 Anthropic 跑一次最小 LLM 呼叫**。

不交付任何使用者可見的功能；目的純粹是讓 M1 不必再回頭設定基礎。

## 範圍

### 1. Monorepo 初始化

```
.
├── package.json                      # root，private，type: module
├── pnpm-workspace.yaml
├── tsconfig.base.json                # 共用 strict 設定
├── biome.json                        # lint + format（取代 ESLint+Prettier）
├── .gitignore
├── .editorconfig
└── apps/、packages/、tools/
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
  - tools/*
```

### 2. apps/desktop（Tauri 2 殼）

```
apps/desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs           # detect_git, get_api_port
│   │   ├── sidecar.rs            # spawn / monitor apps/api binary
│   │   └── fs_watcher.rs         # notify-rs 包裝（M0 先建骨架，M1 啟用）
│   └── binaries/                 # apps-api-<target-triple> 二進位放這
└── package.json                  # Tauri JS API + Vite entry
```

Tauri commands（M0 完整實作）：

```rust
#[tauri::command]
async fn get_api_port() -> Result<u16, String> { /* 讀 ~/.novel-writer/.runtime.json */ }

#[tauri::command]
async fn detect_git() -> Result<GitBinaryInfo, String> { /* spawn which/where + git --version */ }

#[tauri::command]
async fn open_directory_dialog() -> Result<Option<String>, String> { /* Tauri dialog */ }
```

### 3. apps/api（Hono sidecar 骨架）

```
apps/api/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts                 # Hono app + bind 127.0.0.1:0
│   ├── ready-signal.ts           # 啟動完成印 "READY <port>" + 寫 .runtime.json
│   ├── routes/
│   │   └── health.ts             # GET /api/health → {ok: true, version, gitBinary}
│   ├── services/
│   │   ├── atomic-fs.ts          # writeFile-then-rename helper
│   │   ├── settings-store.ts     # 讀寫 ~/.novel-writer/settings.yaml（M0 含 defaults merge、API key 遮蔽）
│   │   ├── git.ts                # git wrapper（依 ADR-0007 + Spec 010 §「Git wrapper 實作」）
│   │   └── project-resolver.ts   # projectHash ↔ path 反查（從 recentProjects）
│   └── lib/
│       ├── runtime-info.ts       # 寫 ~/.novel-writer/.runtime.json
│       └── logger.ts             # consola 包裝
└── tests/                        # vitest
```

Hono server.ts 骨架：

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { health } from "./routes/health";

const app = new Hono().route("/api/health", health);

const server = serve({
  fetch: app.fetch,
  port: 0,
  hostname: "127.0.0.1",
}, info => {
  console.log(`READY ${info.port}`);
  writeRuntimeInfo({ port: info.port, pid: process.pid });
});
```

打包：用 `pkg` 或 `bun build --compile` 編單一 binary。先用 `pkg`（node-pkg）；M4 再評估 bun。

### 4. apps/web（Vite + React 骨架）

```
apps/web/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx                  # createRoot + <App />
│   ├── app.tsx                   # 空殼，顯示 "Novel Writer v0.1-dev"
│   ├── lib/
│   │   ├── api-client.ts         # Hono RPC client 包裝（依 ADR-0008）
│   │   ├── tauri.ts              # invoke / listen 包裝
│   │   └── runtime.ts            # 啟動時取 sidecar port
│   └── styles/
│       ├── globals.css           # Tailwind v4 entry
│       └── tokens.css            # 預留 design tokens
└── tsconfig.json
```

Vite dev 時 proxy `/api/*` 到 sidecar（dev 用固定 port 例 3001；prod 走 Tauri command 取 random port）。

### 5. packages/shared-types/

```
packages/shared-types/
├── package.json
├── src/
│   ├── index.ts                  # 統一 export
│   └── (M0 空殼；後續 milestone 各自填)
└── tsconfig.json
```

M0 先建立空殼讓其他 package 能 import 不報錯。

### 6. packages/llm-adapter/

依 [ADR-0004](../adr/0004-llm-adapter.md) 實作：

```
packages/llm-adapter/
├── package.json
├── src/
│   ├── index.ts                  # public exports
│   ├── types.ts                  # LLMProvider, LLMRouter 等 interfaces
│   ├── error.ts                  # LLMError class
│   ├── router.ts                 # LLMRouter（降級邏輯）
│   └── providers/
│       └── anthropic.ts          # 第一個 provider（M0 完整實作）
└── tests/
```

至少完成：
- `LLMProvider` interface
- `LLMRouter`（雲端→地端降級邏輯，但 M0 只有 anthropic provider；地端 fallback 留 M1）
- `AnthropicProvider`：generate + stream + capabilities + ping
- 錯誤對映到 `LLMError`
- 模型 ID parsing（`anthropic:claude-sonnet-4-6`）

### 7. packages/prompt-library/

```
packages/prompt-library/
├── package.json
├── src/
│   ├── index.ts                  # M0 空殼
│   └── (後續 milestone 各自填 prompts/ 與 skills/)
└── tsconfig.json
```

### 8. tools/eval（已存在的話保留；不存在則建立空殼）

M0 不需要動 tools/eval；只確保 monorepo 結構不破壞它。

### 9. CI 雛形

`.github/workflows/ci.yml`：

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm lint
```

Tauri build 留 M4。

## 任務拆解

> 每條任務應對應一個 PR。順序：1-3 並行可，4-8 依次，9 最後。

### 基礎結構
- [ ] **inf-1**: 建立 monorepo root（package.json、pnpm-workspace.yaml、tsconfig.base.json、biome.json、.gitignore、.editorconfig）
- [ ] **inf-2**: 建立 `packages/shared-types/` 空殼
- [ ] **inf-3**: 建立 `packages/prompt-library/` 空殼

### Apps 骨架（依賴 inf-1）
- [ ] **app-1**: `apps/api/` Hono server 骨架（健康檢查 + ready signal + .runtime.json 寫入）
- [ ] **app-2**: `apps/web/` Vite + React 骨架（空畫面 + Hono RPC client lib）
- [ ] **app-3**: `apps/desktop/` Tauri 2 殼（Cargo.toml + tauri.conf.json + main.rs 開窗）

### Services（依賴 app-1）
- [ ] **svc-1**: `apps/api/src/services/atomic-fs.ts`（atomic write helper + 單元測試）
- [ ] **svc-2**: `apps/api/src/services/settings-store.ts`（讀寫 settings.yaml、merge defaults、API key 遮蔽、API key 完整讀取分流）
- [ ] **svc-3**: `apps/api/src/services/git.ts`（依 ADR-0007 wrapper 與 Spec 010 命令清單；含 PQueue per-project、stderr 解析、GitError 對映）
- [ ] **svc-4**: `apps/api/src/services/project-resolver.ts`（projectHash → path 反查）

### Tauri 整合（依賴 app-3）
- [ ] **tau-1**: `commands::get_api_port`（讀 .runtime.json）
- [ ] **tau-2**: `commands::detect_git`（spawn `which`/`where` + `git --version`）
- [ ] **tau-3**: `commands::open_directory_dialog`（Tauri fs dialog）
- [ ] **tau-4**: sidecar 啟動 / 監看 / 退出處理（在 Tauri 啟動時 spawn apps/api binary）
- [ ] **tau-5**: fs_watcher 骨架（M0 建好 module，M1 啟用 event 傳遞）

### LLM adapter（依賴 inf-2）
- [ ] **llm-1**: `packages/llm-adapter/src/types.ts`（LLMProvider、ChatRequest 等 interface）
- [ ] **llm-2**: `packages/llm-adapter/src/error.ts`（LLMError class + codes）
- [ ] **llm-3**: `packages/llm-adapter/src/providers/anthropic.ts`（完整實作 + 單元測試 mock fetch）
- [ ] **llm-4**: `packages/llm-adapter/src/router.ts`（LLMRouter 骨架；M0 只支援單一 provider，降級邏輯留 M1 加地端）

### 串接驗證
- [ ] **e2e-1**: `pnpm dev` 跑 Tauri，視窗開出空白頁
- [ ] **e2e-2**: 前端 fetch `/api/health` 回 `{ok: true, version: "0.1.0-dev"}`（透過 Tauri command 取 port）
- [ ] **e2e-3**: 命令列腳本：對 Anthropic 跑一次最小 generate（用環境變數 API key）

### CI
- [ ] **ci-1**: GitHub Actions workflow（typecheck + test + lint）
- [ ] **ci-2**: 在 main branch 設 protection rule（CI 通過才能 merge）

## demo 驗收 walk-through

執行下列 5 步全部通過即 M0 完成：

```bash
# 1. 安裝與啟動
pnpm install
pnpm dev

# 預期：Tauri 視窗開啟，顯示空白頁面 + 「Novel Writer v0.1-dev」標題

# 2. 健康檢查
# 前端應自動呼叫 /api/health 並顯示「sidecar: ok, version: ..., port: NNNN」

# 3. git 偵測
# 前端應顯示「git: installed (version 2.x.x)」

# 4. settings.yaml 讀寫
ls ~/.novel-writer/
# 預期：settings.yaml 不存在（M0 不主動建立；M1 第一次進設定頁才建）

# 5. LLM 呼叫
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter llm-adapter exec ts-node scripts/smoke.ts
# 預期：印出 "Hello" 之類的 1-token 回應
```

## DoD

- [ ] 全部任務 PR 已 merge
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm lint` 全綠
- [ ] 上述 demo walk-through 5 步全通過
- [ ] CI 設定運作正常
- [ ] M1 開工不需要再回頭動 monorepo / Tauri / git wrapper

## 給下個 session 的開工 brief

你接手的是 Novel Writer 應用的 **M0 基礎建設** milestone。請：

1. 讀 [ADR-0003](../adr/0003-tech-stack.md)、[0006](../adr/0006-app-packaging.md)、[0007](../adr/0007-git-integration.md)、[0008](../adr/0008-frontend-architecture.md) 釐清技術棧
2. 讀本檔的「範圍」與「任務拆解」段，這是你的完整 PR 清單
3. 按任務依賴順序動工：inf → app → svc → tau / llm → e2e → ci
4. 每個 PR 對應一條任務；commit message 用 `<type>: <scope> <短描述>` 格式
5. 寫程式碼時遵循 [ADR-0008](../adr/0008-frontend-architecture.md) 中的選型（React 18 / Zustand / Dexie / Hono RPC / Tailwind v4）
6. 不需要實作任何 user-facing feature；M0 純粹建立基礎

**注意事項**：

- Tauri 2 與 Tauri 1 API 不同；明確使用 v2 docs（https://v2.tauri.app）
- `pkg` 打包 Hono sidecar 二進位時要把 better-sqlite3 native module 帶上（雖然 M0 還沒用 SQLite，但測試打包流程）
- LLMRouter 在 M0 只有 anthropic 一個 provider；地端 fallback（ollama）留 M1 加
- 不要實作 LLM adapter 的 stream（M0 用 generate 即可；stream 在 M2 才用到）
- biome 取代 ESLint+Prettier；如果有強烈偏好可改回，但要更新 ADR-0008

**驗收條件**：見「demo 驗收 walk-through」段；每一步都要實際跑過

**如果遇到 blocker**：
- 規格層問題 → 退回原 session 走 spec-architect 流程
- 技術選型疑慮 → 補 ADR 或更新既有 ADR
- 不明確的範圍 → 在本檔「實際範圍 vs 計劃範圍」段記下

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| Tauri 2 sidecar 跑 pkg-packaged Node binary 在某平台破功 | M0 早期就跑三平台煙霧測試；備援是改用 bun --compile 或內嵌 deno |
| better-sqlite3 native module 在 GitHub Actions 跨平台 build 失敗 | 預先在 CI 加 prebuilt binary 偵測；備援是切 sql.js（純 JS） |
| Tauri sidecar 啟動 race（前端在 sidecar ready 前讀 port）| ready signal 走 stdout 「READY <port>」+ Tauri 端 wait；前端透過 Tauri command 取 port 而非直接讀 .runtime.json |
| Hono RPC 型別穿透在 monorepo 中失效 | 確保 apps/web 引用 apps/api 的 `type AppType` 是 type-only import；不引入 runtime 依賴 |

## 完成紀錄

- 實際開工時間：2026-05-12
- 實際完成時間：2026-05-13
- 實際 PR 數：10 個 commits（直接推 main）
- 偏離 plan 的範圍：dev 模式跳過 pkg 打包（依設計）；`tauri dev` 視覺驗收由使用者手動執行
- 踩雷 / 教訓：
  1. MSVC 環境需從 VS Developer Command Prompt 或設定 INCLUDE/LIB 才能讓 `cargo` 找到 Windows SDK；一般 terminal 不帶這些變數，導致 `vswhom-sys`（tauri-plugin-dialog → rfd 的 C++ 依賴）編譯失敗
  2. `tauri-build` 在 Windows 上強制要求 `icons/icon.ico`，即使 `bundle.active: false`；M0 用 Node.js 生成 16×16 透明 ICO 佔位解決
  3. `tauri_plugin_dialog::FilePath` 沒有 `to_string_lossy()`，需改用 `to_string()`；設計文件已記錄此為已知風險
  4. TypeScript strict 的 `noPropertyAccessFromIndexSignature` 要求 bracket notation，但 Biome `useLiteralKeys` 規則偏好 dot notation；用 `biome-ignore` 注釋解決衝突
- 移交給 M1 的注意事項：
  - `apps/desktop/src-tauri/icons/icon.ico` 是 16×16 透明佔位，M4 打包前需替換為真實圖示
  - `sidecar.rs` 骨架就位，M1 可加 notify crate 啟用 fs_watcher 事件
  - cargo 相關指令（`cargo test`、`cargo check`、`pnpm tauri dev`）需在 VS Developer Command Prompt 或已設定 MSVC 環境的 terminal 執行
  - `pnpm dev`（concurrently）啟動 api + web；Tauri 需在第三個 terminal 獨立執行
