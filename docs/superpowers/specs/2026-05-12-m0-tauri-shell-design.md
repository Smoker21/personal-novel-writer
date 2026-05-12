# M0 Tauri Shell 設計文件

> 日期：2026-05-12
> 狀態：Approved
> 對應 milestone：[M0-foundation.md](../../architecture/milestones/M0-foundation.md)
> 任務：app-3 / tau-1 ~ tau-5

## 背景

M0 基礎建設的非 Tauri 部分（monorepo、apps/api、packages/llm-adapter、CI）已在 init commit 完成。本次目標是補齊唯一缺失的 `apps/desktop`（Tauri 2 殼），讓 M1 開工前能完整驗收 M0 DoD。

## 範圍

### 本次做

- `apps/desktop/` 目錄與所有必要 Tauri 2 檔案（手動建立，不依賴 `tauri init`）
- 三個 Rust commands：`get_api_port`、`detect_git`、`open_directory_dialog`
- `sidecar.rs` 骨架（M4 才實作 spawn）
- `fs_watcher.rs` 骨架（M1 才啟用 event 傳遞）
- `apps/web/src/lib/runtime.ts`：統一取 API base URL 的工具函式
- 根 `package.json` dev script 更新（加 `concurrently`）

### 不在範圍

- pkg 打包 api binary（M4）
- sidecar spawn 實作（M4）
- fs_watcher event 傳遞（M1）
- GitHub branch protection rule（GitHub UI 手動設）

## 目錄結構

```
apps/desktop/
├── package.json                  # @tauri-apps/api runtime + @tauri-apps/cli devDep
└── src-tauri/
    ├── Cargo.toml                # tauri 2 + tauri-build + serde + tokio + tauri-plugin-dialog
    ├── build.rs                  # tauri-build 標準入口
    ├── tauri.conf.json           # 視窗 / bundle ID / devUrl / frontendDist
    └── src/
        ├── main.rs               # Tauri app builder + register 3 commands
        ├── commands.rs           # get_api_port / detect_git / open_directory_dialog
        ├── sidecar.rs            # pub mod 骨架，TODO M4
        └── fs_watcher.rs         # pub mod 骨架，TODO M1
```

`tauri.conf.json` 關鍵欄位：
- `build.devUrl`: `http://localhost:5173`
- `build.frontendDist`: `../../apps/web/dist`
- `app.windows[0].title`: `"Novel Writer"`
- `identifier`: `"com.novel-writer.app"`

## Rust Commands 規格

### `get_api_port() -> Result<u16, String>`

1. 讀 `~/.novel-writer/.runtime.json`（`{ "port": N, "pid": N }`）
2. 解析 `port` 欄位回傳
3. 檔案不存在或解析失敗 → fallback 回傳 `3001`（dev mode 預設）

### `detect_git() -> Result<GitInfo, String>`

```rust
pub struct GitInfo {
    pub path: String,    // git binary 完整路徑
    pub version: String, // e.g. "2.44.0"
}
```

1. Windows: `where git`；Unix: `which git`，取第一行
2. `git --version` 解析版本字串（regex `\d+\.\d+\.\d+`）
3. 任一步驟失敗 → `Err("git not found")`

### `open_directory_dialog() -> Result<Option<String>, String>`

使用 `tauri-plugin-dialog`（Tauri 2 官方 dialog plugin）。在 `main.rs` 註冊 `tauri_plugin_dialog::init()`，command 內呼叫 `app.dialog().file().pick_folder()` 的 blocking 版本。使用者取消回 `Ok(None)`。

## Dev 模式 Port 策略

```
Terminal A: pnpm --filter @novel-writer/api dev   # 固定 port 3001，寫 .runtime.json
Terminal B: pnpm tauri dev                         # devUrl = localhost:5173
```

前端 `apps/web/src/lib/runtime.ts`：

```ts
// Tauri 環境：invoke("get_api_port") 讀 .runtime.json
// 非 Tauri（純瀏覽器 dev）：固定 3001
export async function getApiBase(): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    const port = await invoke<number>("get_api_port");
    return `http://127.0.0.1:${port}`;
  }
  return "http://127.0.0.1:3001";
}
```

現有 `apps/web/src/stores/health-store.ts`（或 api-client）要改用 `getApiBase()` 而非硬編碼。

## pnpm Workspace 整合

`apps/desktop/package.json` 加入：

```json
{
  "name": "@novel-writer/desktop",
  "scripts": {
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "dependencies": { "@tauri-apps/api": "^2" },
  "devDependencies": { "@tauri-apps/cli": "^2" }
}
```

根 `package.json` dev script 改為：

```json
"dev": "concurrently -n api,web \"pnpm --filter @novel-writer/api dev\" \"pnpm --filter @novel-writer/web dev\""
```

`pnpm tauri dev` 由開發者在另一個 terminal 執行（避免 concurrently 遮蔽 Tauri 的 stdout/stderr）。

Tauri CLI 一次性安裝：
```bash
cd apps/desktop && pnpm add -D @tauri-apps/cli@^2
```

## 驗收（M0 DoD 完整版）

```bash
# Terminal A
pnpm --filter @novel-writer/api dev
# → 印出 "READY 3001"

# Terminal B
cd apps/desktop && pnpm tauri dev
# → Tauri 視窗開啟
# → 前端顯示 "sidecar: ok"（/api/health 成功）
# → 前端顯示 git 版本（detect_git）

# CI（GitHub Actions）
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
# → 全綠
```

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| `.runtime.json` 在 Tauri dev 啟動時尚未寫入 | `get_api_port` fallback 到 3001；前端重試邏輯已存在於 health-store |
| `notify` crate 版本與 Tauri 2 依賴衝突 | fs_watcher.rs M0 不引入 notify 依賴；Cargo.toml 留空佔位，M1 才加 |
| `tauri-plugin-dialog` blocking API 在某些平台不可用 | 改用 async channel 回傳結果，command 改為 async fn |
