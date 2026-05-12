# M0 Tauri Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `apps/desktop`（Tauri 2 殼），補齊 M0 唯一缺失模組，讓 Tauri 視窗能啟動並透過 Vite dev server 連到 Hono sidecar。

**Architecture:** 純手動建立所有 Tauri 2 檔案（不依賴 `tauri init`）。dev 模式由三個 terminal 分工：`pnpm --filter @novel-writer/api dev`（port 3001）、`pnpm --filter @novel-writer/web dev`（port 5173）、`pnpm --filter @novel-writer/desktop tauri dev`（載入 devUrl）。三個 Rust commands 透過 `~/.novel-writer/.runtime.json` 和系統呼叫完成 port 查詢、git 偵測、資料夾對話框。

**Tech Stack:** Tauri 2、Rust 1.77+、`tauri-plugin-dialog`、`dirs` crate、`serde_json`；TypeScript 端新增 `apps/web/src/lib/runtime.ts`；`tsx` + `cross-env` 修正 API dev script。

---

## 檔案地圖

| 動作 | 路徑 | 負責 |
|---|---|---|
| CREATE | `apps/desktop/package.json` | desktop workspace entry |
| CREATE | `apps/desktop/src-tauri/Cargo.toml` | Rust 依賴 |
| CREATE | `apps/desktop/src-tauri/build.rs` | tauri-build 入口 |
| CREATE | `apps/desktop/src-tauri/tauri.conf.json` | 視窗 / devUrl / frontendDist |
| CREATE | `apps/desktop/src-tauri/capabilities/default.json` | IPC 權限 |
| CREATE | `apps/desktop/src-tauri/src/main.rs` | Tauri app builder |
| CREATE | `apps/desktop/src-tauri/src/commands.rs` | 3 個 Tauri commands + 單元測試 |
| CREATE | `apps/desktop/src-tauri/src/sidecar.rs` | TODO M4 骨架 |
| CREATE | `apps/desktop/src-tauri/src/fs_watcher.rs` | TODO M1 骨架 |
| CREATE | `apps/web/src/lib/runtime.ts` | getApiBase() 工具函式 |
| MODIFY | `apps/api/src/server.ts` | 讀 PORT env var |
| MODIFY | `apps/api/package.json` | 換用 tsx + cross-env；PORT=3001 |
| MODIFY | `package.json` | 根 dev script 換用 concurrently |

---

## Task 0：修正 API dev script（Tauri 驗收前置）

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 0.1：在 `apps/api/package.json` 加入 tsx + cross-env 依賴**

將 devDependencies 區塊改為：

```json
"devDependencies": {
  "@types/js-yaml": "^4.0.9",
  "@types/node": "^22.0.0",
  "cross-env": "^7.0.3",
  "tsx": "^4.19.2",
  "typescript": "^5.7.0",
  "vitest": "^2.1.0"
}
```

並將 `scripts.dev` 改為：

```json
"dev": "cross-env PORT=3001 tsx watch src/server.ts"
```

- [ ] **Step 0.2：更新 `apps/api/src/server.ts` 讀取 PORT 環境變數**

將 `serve()` 呼叫中的 `port: 0` 改為讀取環境變數（預設 0 以保持 prod 安全）：

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { health } from "./routes/health.js";
import { writeRuntimeInfo } from "./lib/runtime-info.js";
import { logger } from "./lib/logger.js";

const app = new Hono().route("/api/health", health);

export type AppType = typeof app;

const port = parseInt(process.env.PORT ?? "0", 10);

const server = serve(
  { fetch: app.fetch, port, hostname: "127.0.0.1" },
  (info) => {
    const actualPort = info.port;
    logger.info(`Sidecar ready on port ${actualPort}`);
    process.stdout.write(`READY ${actualPort}\n`);
    void writeRuntimeInfo({ port: actualPort, pid: process.pid });
  },
);

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down");
  server.close(() => process.exit(0));
});
```

- [ ] **Step 0.3：安裝依賴並驗證 API 能啟動**

```bash
pnpm install
pnpm --filter @novel-writer/api dev
```

預期輸出（等約 1 秒後）：
```
[info] Sidecar ready on port 3001
READY 3001
```

確認後 Ctrl+C 停止。

- [ ] **Step 0.4：commit**

```bash
git add apps/api/src/server.ts apps/api/package.json pnpm-lock.yaml
git commit -m "fix(api): use tsx + PORT env var in dev script; default port 3001"
```

---

## Task 1：`apps/desktop/package.json`

**Files:**
- Create: `apps/desktop/package.json`

- [ ] **Step 1.1：建立 apps/desktop 目錄並寫入 package.json**

建立目錄後，寫入以下內容：

```json
{
  "name": "@novel-writer/desktop",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

- [ ] **Step 1.2：安裝 Tauri CLI**

```bash
pnpm --filter @novel-writer/desktop install
```

預期：在 `apps/desktop/node_modules/.bin/tauri` 出現可執行檔。

- [ ] **Step 1.3：確認 CLI 可用**

```bash
pnpm --filter @novel-writer/desktop exec tauri --version
```

預期輸出類似：`tauri-cli 2.x.x`

- [ ] **Step 1.4：commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(desktop): add Tauri 2 desktop workspace package"
```

---

## Task 2：`Cargo.toml` + `build.rs`

**Files:**
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`

- [ ] **Step 2.1：建立 `apps/desktop/src-tauri/Cargo.toml`**

```toml
[package]
name = "novel-writer"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "5"

[profile.dev]
incremental = true

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
```

- [ ] **Step 2.2：建立 `apps/desktop/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 2.3：建立空的 `apps/desktop/src-tauri/src/main.rs`（臨時佔位，Task 5 再完整寫）**

此步驟讓 `cargo check` 能執行。建立：

```rust
fn main() {}
```

- [ ] **Step 2.4：執行 `cargo fetch` 下載依賴（不編譯）**

```bash
cd apps/desktop/src-tauri && cargo fetch
```

預期：下載 tauri、tauri-plugin-dialog 等 crates，無錯誤輸出。

若下載失敗（網路或版本問題）：
- 確認 Rust 版本 >= 1.77：`rustc --version`
- 若 tauri-plugin-dialog 版本衝突，在 Cargo.toml 加 `[patch.crates-io]` 鎖版本

- [ ] **Step 2.5：commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/build.rs apps/desktop/src-tauri/src/main.rs
git commit -m "feat(desktop): Rust Cargo.toml + build.rs skeleton"
```

---

## Task 3：`tauri.conf.json` + capabilities

**Files:**
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`

- [ ] **Step 3.1：建立 `apps/desktop/src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Novel Writer",
  "version": "0.1.0-dev",
  "identifier": "com.novel-writer.app",
  "build": {
    "beforeDevCommand": "",
    "beforeBuildCommand": "pnpm --filter @novel-writer/web build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../../apps/web/dist"
  },
  "app": {
    "windows": [
      {
        "title": "Novel Writer",
        "width": 1280,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": false,
    "targets": "all",
    "icon": []
  }
}
```

注意：`beforeDevCommand: ""` 表示我們手動啟動 Vite dev server，Tauri 不自動啟動。

- [ ] **Step 3.2：建立 `apps/desktop/src-tauri/capabilities/default.json`**

```json
{
  "identifier": "default",
  "description": "default permissions for Novel Writer",
  "windows": ["main"],
  "permissions": [
    "core:default"
  ]
}
```

`core:default` 包含 invoke IPC 橋接，讓前端可呼叫自訂 Tauri commands。

- [ ] **Step 3.3：commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/capabilities/default.json
git commit -m "feat(desktop): tauri.conf.json window config + IPC capabilities"
```

---

## Task 4：`commands.rs`（TDD — 先寫測試）

**Files:**
- Create: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 4.1：先寫測試模組**

建立 `apps/desktop/src-tauri/src/commands.rs`，**只有測試，函式尚未實作**：

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub(crate) struct RuntimeInfo {
    pub port: u16,
}

#[derive(Serialize)]
pub struct GitInfo {
    pub path: String,
    pub version: String,
}

// 函式佔位（讓測試能編譯）
pub(crate) fn extract_version(_s: &str) -> Option<String> {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_version_standard() {
        assert_eq!(extract_version("git version 2.44.0"), Some("2.44.0".into()));
    }

    #[test]
    fn extract_version_windows_suffix() {
        // Windows git 版本字串帶有後綴
        assert_eq!(
            extract_version("git version 2.44.0.windows.1"),
            Some("2.44.0".into()),
        );
    }

    #[test]
    fn extract_version_no_digits() {
        assert_eq!(extract_version("git not found"), None);
    }

    #[test]
    fn runtime_info_deserializes() {
        let json = r#"{"port": 3001, "pid": 1234, "startedAt": "2024-01-01T00:00:00Z"}"#;
        let info: RuntimeInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.port, 3001);
    }
}
```

同時更新 `apps/desktop/src-tauri/src/main.rs` 宣告模組（讓測試能被 cargo 找到）：

```rust
mod commands;

fn main() {}
```

- [ ] **Step 4.2：執行測試，確認失敗（unimplemented!）**

```bash
cd apps/desktop/src-tauri && cargo test
```

預期：3 個測試 PANIC with `not implemented`（`extract_version_*`），1 個測試 PASS（`runtime_info_deserializes`）。

- [ ] **Step 4.3：實作 commands.rs 完整版本**

將 `commands.rs` 替換為完整實作：

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Deserialize)]
pub(crate) struct RuntimeInfo {
    pub port: u16,
}

fn runtime_json_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".novel-writer").join(".runtime.json"))
}

/// 讀取 ~/.novel-writer/.runtime.json 取得 sidecar port。
/// 檔案不存在或解析失敗時 fallback 到 3001（dev 預設）。
#[tauri::command]
pub async fn get_api_port() -> u16 {
    runtime_json_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<RuntimeInfo>(&s).ok())
        .map(|info| info.port)
        .unwrap_or(3001)
}

#[derive(Serialize)]
pub struct GitInfo {
    pub path: String,
    pub version: String,
}

/// 解析 "git version 2.44.0.windows.1" → "2.44.0"
pub(crate) fn extract_version(s: &str) -> Option<String> {
    s.split_whitespace()
        .find(|w| w.starts_with(|c: char| c.is_ascii_digit()))
        .map(|ver| {
            ver.splitn(4, '.')
                .take(3)
                .collect::<Vec<_>>()
                .join(".")
        })
}

/// 偵測系統 git 二進位路徑與版本。
#[tauri::command]
pub async fn detect_git() -> Result<GitInfo, String> {
    let which_cmd = if cfg!(windows) { "where" } else { "which" };

    let output = Command::new(which_cmd)
        .arg("git")
        .output()
        .map_err(|e| format!("failed to run {which_cmd}: {e}"))?;

    if !output.status.success() {
        return Err("git not found".to_string());
    }

    let git_path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    let version_output = Command::new("git")
        .arg("--version")
        .output()
        .map_err(|e| format!("git --version failed: {e}"))?;

    let version_str = String::from_utf8_lossy(&version_output.stdout);
    let version = extract_version(&version_str)
        .ok_or_else(|| "cannot parse git version".to_string())?;

    Ok(GitInfo { path: git_path, version })
}

/// 開啟系統資料夾選擇對話框，回傳使用者選取的路徑。
/// 使用者取消時回傳 Ok(None)。
#[tauri::command]
pub async fn open_directory_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog().file().blocking_pick_folder();
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_version_standard() {
        assert_eq!(extract_version("git version 2.44.0"), Some("2.44.0".into()));
    }

    #[test]
    fn extract_version_windows_suffix() {
        assert_eq!(
            extract_version("git version 2.44.0.windows.1"),
            Some("2.44.0".into()),
        );
    }

    #[test]
    fn extract_version_no_digits() {
        assert_eq!(extract_version("git not found"), None);
    }

    #[test]
    fn runtime_info_deserializes() {
        let json = r#"{"port": 3001, "pid": 1234, "startedAt": "2024-01-01T00:00:00Z"}"#;
        let info: RuntimeInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.port, 3001);
    }
}
```

> **注意：`blocking_pick_folder()`** 在某些 tauri-plugin-dialog 版本回傳 `Option<tauri_plugin_dialog::FilePath>` 而非 `Option<PathBuf>`。若編譯失敗，嘗試改為：
> ```rust
> Ok(result.map(|p| p.display().to_string()))
> ```

- [ ] **Step 4.4：執行測試，確認全部通過**

```bash
cd apps/desktop/src-tauri && cargo test
```

預期：4 tests pass（extract_version_standard, extract_version_windows_suffix, extract_version_no_digits, runtime_info_deserializes）。

- [ ] **Step 4.5：commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/main.rs
git commit -m "feat(desktop): Tauri commands — get_api_port, detect_git, open_directory_dialog"
```

---

## Task 5：`main.rs`（完整版）+ 骨架模組

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/sidecar.rs`
- Create: `apps/desktop/src-tauri/src/fs_watcher.rs`

- [ ] **Step 5.1：建立 `apps/desktop/src-tauri/src/sidecar.rs`（M4 骨架）**

```rust
// TODO M4: spawn and monitor the apps/api sidecar binary.
// When implemented, this module will:
//   1. Locate the bundled api binary next to the Tauri executable
//   2. Spawn it with PORT=0, capture stdout to read "READY <port>"
//   3. Monitor the process and restart on crash
//   4. Kill it on app exit (SIGTERM / tauri::RunEvent::Exit)
```

- [ ] **Step 5.2：建立 `apps/desktop/src-tauri/src/fs_watcher.rs`（M1 骨架）**

```rust
// TODO M1: watch the active project directory for external file changes.
// When implemented, this module will:
//   1. Accept a project path from the frontend via a Tauri command
//   2. Use the notify crate (add to Cargo.toml at that point) to watch for changes
//   3. Debounce events and emit them to the frontend via tauri::Emitter
```

- [ ] **Step 5.3：完整寫入 `apps/desktop/src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fs_watcher;
mod sidecar;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_api_port,
            commands::detect_git,
            commands::open_directory_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5.4：執行 `cargo check` 確認編譯無誤**

```bash
cd apps/desktop/src-tauri && cargo check
```

預期：`Finished` 無 error（warning 可忽略）。

若出現 `cannot find crate 'tauri_plugin_dialog'` → 確認 `cargo fetch` 完成（Task 2.4）。

若出現 `blocking_pick_folder` 不存在 → 改用非同步版本（見 Task 4.3 注意事項）。

- [ ] **Step 5.5：commit**

```bash
git add apps/desktop/src-tauri/src/main.rs apps/desktop/src-tauri/src/sidecar.rs apps/desktop/src-tauri/src/fs_watcher.rs
git commit -m "feat(desktop): main.rs registers Tauri commands; sidecar + fs_watcher skeletons"
```

---

## Task 6：`apps/web/src/lib/runtime.ts`

**Files:**
- Create: `apps/web/src/lib/runtime.ts`

此函式在 Tauri WebView 中呼叫 `get_api_port` command，在純瀏覽器 dev 模式中 fallback 到 3001。M0 的 dev 驗收不依賴此函式（Vite proxy 已處理），但它是 production 路徑的基礎，M4 時 api-client.ts 會改用它。

- [ ] **Step 6.1：建立 `apps/web/src/lib/runtime.ts`**

```ts
import { tauriInvoke } from "./tauri.js";

let cachedBase: string | null = null;

/**
 * Returns the base URL for the Hono sidecar API.
 *
 * - Tauri environment: reads port from get_api_port command (~/.novel-writer/.runtime.json)
 * - Browser dev environment: returns http://127.0.0.1:3001 (Vite proxy target)
 *
 * Result is cached after the first call.
 */
export async function getApiBase(): Promise<string> {
  if (cachedBase !== null) return cachedBase;

  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const port = await tauriInvoke<number>("get_api_port");
    cachedBase = `http://127.0.0.1:${port}`;
  } else {
    cachedBase = "http://127.0.0.1:3001";
  }

  return cachedBase;
}
```

- [ ] **Step 6.2：typecheck 確認無型別錯誤**

```bash
pnpm --filter @novel-writer/web typecheck
```

預期：無 error。

- [ ] **Step 6.3：commit**

```bash
git add apps/web/src/lib/runtime.ts
git commit -m "feat(web): add runtime.ts getApiBase() for Tauri/browser port resolution"
```

---

## Task 7：根 `package.json` dev script

**Files:**
- Modify: `package.json`（根目錄）

- [ ] **Step 7.1：加入 concurrently 到根 devDependencies**

在根 `package.json` 的 `devDependencies` 加入：

```json
"concurrently": "^9.1.0"
```

並將 `scripts` 改為：

```json
"scripts": {
  "dev:api": "pnpm --filter @novel-writer/api dev",
  "dev:web": "pnpm --filter @novel-writer/web dev",
  "dev": "concurrently -n api,web -c cyan,green \"pnpm run dev:api\" \"pnpm run dev:web\"",
  "typecheck": "pnpm -r typecheck",
  "test": "pnpm -r test",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write ."
}
```

注意：Tauri 由開發者在第三個 terminal 獨立執行（`pnpm --filter @novel-writer/desktop tauri dev`），避免 concurrently 遮蔽 Tauri stdout。

- [ ] **Step 7.2：安裝並驗證**

```bash
pnpm install
pnpm dev
```

預期：api（cyan）與 web（green）同時啟動，終端機顯示前綴標籤。Ctrl+C 停止。

- [ ] **Step 7.3：commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: use concurrently for dev script; split dev:api and dev:web"
```

---

## Task 8：整合驗收（E2E）

此 Task 不寫程式碼，執行 M0 DoD walk-through。

**前置：** Tasks 0-7 全部完成，且已有 Rust 工具鏈（`rustc --version` >= 1.77）。

- [ ] **Step 8.1：Terminal A — 啟動 API sidecar**

```bash
pnpm run dev:api
```

預期輸出：
```
[info] Sidecar ready on port 3001
READY 3001
```

保持此 terminal 開著。

- [ ] **Step 8.2：Terminal B — 啟動 Vite dev server**

```bash
pnpm run dev:web
```

預期：`VITE v5.x ready in xxx ms` + `http://localhost:5173/`

保持此 terminal 開著。

- [ ] **Step 8.3：Terminal C — 啟動 Tauri dev 模式**

```bash
pnpm --filter @novel-writer/desktop tauri dev
```

第一次執行會編譯 Rust（耗時 1-3 分鐘）。預期：
1. Cargo 編譯完成，無 error
2. Tauri 視窗開啟，顯示 web app（Novel Writer 頁面）
3. 頁面上顯示 "✓ sidecar connected"（health-store 成功呼叫 /api/health）

- [ ] **Step 8.4：驗證 detect_git（瀏覽器 console）**

在 Tauri 視窗中開啟 DevTools（Ctrl+Shift+I），Console 執行：

```js
const { invoke } = window.__TAURI__.core;
await invoke("detect_git").then(console.log);
```

預期輸出：
```js
{ path: "C:\\...\\git.exe", version: "2.x.x" }
```

（路徑依系統而異）

- [ ] **Step 8.5：確認 .runtime.json 寫入正確**

新開 terminal 執行：

```bash
# Windows PowerShell
Get-Content "$env:USERPROFILE\.novel-writer\.runtime.json"
```

預期：
```json
{
  "port": 3001,
  "pid": 12345,
  "startedAt": "2026-05-12T..."
}
```

- [ ] **Step 8.6：執行 CI 指令確認全綠**

```bash
pnpm typecheck
pnpm test
pnpm lint
```

預期：全部 pass（Rust tests 透過 Task 4 已驗證；JS tests 不受本 PR 影響）。

- [ ] **Step 8.7：更新 M0 milestone 完成紀錄**

在 `docs/architecture/milestones/M0-foundation.md` 的「完成紀錄」段落填入：

```markdown
## 完成紀錄

- 實際開工時間：2026-05-12
- 實際完成時間：（填入日期）
- 實際 PR 數：Tasks 0-7 各一個 commit，共 8 個
- 偏離 plan 的範圍：dev 模式跳過 pkg 打包（依設計）
- 踩雷 / 教訓：（填入）
- 移交給 M1 的注意事項：fs_watcher 骨架就位，M1 加 notify crate 即可啟用
```

- [ ] **Step 8.8：final commit**

```bash
git add docs/architecture/milestones/M0-foundation.md
git commit -m "docs(milestone): M0 完成紀錄"
```

---

## 附錄：常見問題

### `blocking_pick_folder()` 編譯失敗

`tauri-plugin-dialog` 不同版本 API 略有差異。若 `blocking_pick_folder()` 不存在，使用以下非同步版本：

```rust
#[tauri::command]
pub async fn open_directory_dialog(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel();
    app.dialog().file().pick_folder(move |result| {
        let _ = tx.send(result);
    });
    let result = rx.await.map_err(|e| e.to_string())?;
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}
```

若使用此版本，在 `Cargo.toml` 的 `tokio` 依賴加入：
```toml
tokio = { version = "1", features = ["sync"] }
```

### `cargo check` 出現 `generate_context!() error`

`tauri::generate_context!()` 需要在 `src-tauri` 目錄下執行（讀取 `tauri.conf.json`）。確保：
```bash
cd apps/desktop/src-tauri && cargo check
```
不要在根目錄執行。

### Tauri 視窗開啟但頁面空白

確認 Vite dev server（Terminal B）正在執行，且 `tauri.conf.json` 的 `build.devUrl` 為 `http://localhost:5173`。
