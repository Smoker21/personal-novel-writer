# 0006. 應用打包：Tauri 2 + Hono sidecar + Vite React

- Status: `Accepted`
- Date: `2026-05-12`
- Deciders: spec-architect

## Context

本應用為**個人本機工具**（[ADR-0001](./0001-storage-strategy.md)）：
- 無內建伺服器、無多租戶
- 重檔案 I/O（章節 `.md`、status、character 卡、git commit）
- 重 LLM 呼叫（雲端 / 地端 OpenAI-compatible HTTP）
- 重編輯器互動（[ADR-0005](./0005-editor-selection.md) CM6）
- 預期跨平台（Windows / Mac / Linux）

需要選一個桌面應用框架。前輪討論候選：Tauri 2 / Electron / 純 web app。純 web app 已排除（無法 shell out git、無法穩定本機 fs）。剩 Tauri 2 vs Electron。

## Decision

採用 **Tauri 2 + Hono sidecar + Vite React** 三層架構。

### 架構圖

```
┌──────────────────────────────────────────────────────────┐
│                      使用者本機                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Tauri 2 (Rust 殼)                      │    │
│  │  - 視窗 / 選單 / 拖放                            │    │
│  │  - fs dialog（選資料夾、選檔）                   │    │
│  │  - fs watcher（偵測 .md 外部變更）              │    │
│  │  - 系統 git 路徑探測（which/where）              │    │
│  │  - sidecar 進程管理（啟動 / 監看 / kill）        │    │
│  │  - updater（P2）                                 │    │
│  │                                                  │    │
│  │  ┌─────────────────────┐  ┌───────────────────┐  │    │
│  │  │  WebView（Vite）    │  │  Hono sidecar     │  │    │
│  │  │  React 18 + TS      │  │  Node 22+         │  │    │
│  │  │  - CM6 編輯器       │  │  - 127.0.0.1:?    │  │    │
│  │  │  - Zustand stores   │  │  - LLM adapter    │  │    │
│  │  │  - Dexie (IndexedDB)│◀─HTTP─▶ - SQLite     │  │    │
│  │  │  - Hono RPC client  │  │  - 檔案 I/O       │  │    │
│  │  │                     │  │  - git shell out  │  │    │
│  │  └─────────────────────┘  └───────────────────┘  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 三層職責

| 層 | 技術 | 職責 |
|---|---|---|
| Tauri Rust 端 | Rust + Tauri | 視窗 / 對話框 / fs watcher / sidecar lifecycle / 系統整合（git path、protocol handler） |
| Hono sidecar | Node 22 + Hono | 業務邏輯：LLM 呼叫、SQLite cache、檔案 I/O、git 命令、API server |
| WebView 前端 | Vite + React 18 + TS | UI / 編輯器 / 狀態管理 / IndexedDB / HTTP client |

三層通訊：
- WebView ↔ Hono sidecar：HTTP（127.0.0.1:random-port + SSE）
- WebView ↔ Tauri Rust 端：Tauri command IPC（取 sidecar port、開檔案 dialog、訂閱 fs watcher 事件）
- Tauri Rust 端 ↔ Hono sidecar：spawn + stdin/stdout 監看；不互動 IPC

### Sidecar 啟動流程

1. Tauri 啟動時 spawn Hono binary
2. Hono 啟動後 bind `127.0.0.1:0`（系統指派 random port），印出 `READY <port>` 到 stdout
3. Tauri 解析 stdout 拿到 port，寫到 `~/.novel-writer/.runtime.json`
4. WebView 載入時呼叫 Tauri command `get_api_port()` 取得 port，後續所有 HTTP 走此 port
5. 應用退出時 Tauri 發 SIGTERM 給 sidecar，等 5 秒 timeout 後強制 kill
6. 應用 crash 時 Tauri 的 sidecar 設定保證 sidecar 一併退出（不殘留 zombie）

### Sidecar 打包

把 Hono server 用 `pkg` 或 `bun build --compile` 編成單一 binary（含 Node runtime）。每平台一個 binary，放在 Tauri 的 `src-tauri/binaries/<target-triple>/apps-api`。Tauri 自動依平台選對的 sidecar binary。

`better-sqlite3` 的 native module 走 sidecar 的 Node binary，**不**走 Tauri Rust。這避開「Tauri Rust 端要重新綁定 native node module」的痛點。

### 為何加一層 Hono sidecar？不直接 Tauri Rust + WebView？

技術上 Tauri Rust 也能跑完所有業務邏輯（用 `tauri::command` 暴露給 WebView），但：

- 業務邏輯 90% 是 TS 棧（LLM SDK、檔案 I/O、git wrapper 都有成熟 npm 套件）
- 用 Rust 重寫 LLM adapter 是巨大投資且無回報
- 留 Hono sidecar 讓未來「也能跑在 server / Docker / 純 web 版本」成為可能（共用 sidecar，換殼）
- 沒有理由把 SQLite / LLM adapter 寫成 Rust

代價：多一層進程，啟動時間 +200-500ms；可接受。

## Consequences

**Positive:**

- **體積**：Tauri 殼 ~10MB + Vite build ~2MB + Hono sidecar binary ~50MB（pkg Node）+ better-sqlite3 native ~5MB ≈ **總 60-80 MB**；遠小於 Electron 同等應用（200+ MB）
- **安全**：Tauri 預設限制 fs 與網路 access scope，比 Electron 預設「Node 全可用」安全
- **業務邏輯保留 TS 棧**：LLM、git、fs、SQLite 全用成熟 npm 套件；不重寫
- **架構未來可拆**：sidecar 抽象讓「server 版」「Docker 版」未來可選
- **熱重載 dev 體驗**：Vite dev server + Tauri dev 模式 + Hono sidecar nodemon，三層獨立熱重載
- **GitHub Actions 跨平台打包成熟**：`tauri-action` 一鍵 Win/Mac/Linux

**Negative:**

- **Rust 學習曲線**：Tauri Rust 端要寫一些 `tauri::command`（取 port、開 dialog、訂閱 watcher、git path 探測等）；估計 < 500 行 Rust，可學
- **三層架構維護成本**：sidecar 啟動 / 退出邊界情境（crash recovery、port 衝突、port 寫入 .runtime.json 與 WebView 取值的競態）需要設計
- **better-sqlite3 binding**：在 sidecar pkg 打包時要把 native 二進位帶上，每平台一份
- **首次啟動較慢**：sidecar spawn + bind + ready 約 200-500ms；Tauri / Electron 同等應用都類似，可接受

**Neutral:**

- **auto-update**：Tauri 內建 updater 留 P2；MVP 走 GitHub Releases 手動下載
- **deep link / protocol handler**：Tauri 支援；MVP 不需要

## Alternatives considered

### Electron
- Pros: 純 Node 棧、學習曲線最低、生態最大、native module 整合直接
- Cons: 體積 100-200 MB、Chromium 安全表面大、預設 Node 全開影響安全模型；對「個人本機輕量工具」過重
- 為何不選：與專案「個人本機工具」定位不符；體積與資源消耗在多個小說專案開啟下會明顯

### Wails（Go 殼 + WebView）
- Pros: 體積與 Tauri 類似、Go 學習曲線比 Rust 低
- Cons: 生態比 Tauri 小；插件、跨平台 packaging 不如 Tauri 成熟
- 為何不選：取捨上不如 Tauri 全面

### Tauri 只用 Rust 端（無 Hono sidecar）
- Pros: 一個進程、無 IPC 成本
- Cons: 業務邏輯必須 Rust 重寫；LLM SDK / git wrapper / better-sqlite3 都要找 Rust 等價物或自寫 binding
- 為何不選：投資產出比差；Rust 不是業務代碼的最佳語言（對小說寫作工具）

### 純 PWA（瀏覽器 + File System Access API）
- Pros: 零安裝
- Cons: 無法 shell out git、無法穩定 fs watcher、僅 Chromium 系支援 FSAA、無 sidecar 概念
- 為何不選：MVP 需要 git 整合

## 對其他文件的影響

- **ADR-0003**「應用打包」段（原寫「暫定 Node + 瀏覽器雙程序」「桌面包裝待後續 ADR」）由本 ADR 取代
- **ADR-0007** Git 整合：git shell out 由 Hono sidecar 端執行（不是 Tauri Rust 端）；Tauri Rust 端只做首次啟動的 path 探測
- **Spec 003** 章節編輯器：「外部編輯了 .md」的偵測由 Tauri fs watcher 觸發；WebView 透過 Tauri event 收到通知
- **Spec 008** 開啟既有專案：選資料夾走 Tauri `dialog::open_directory`，不走瀏覽器的 File System Access API
- **Spec 009** 設定頁：API key 不可寫到專案路徑（Drive 同步），存在 `~/.novel-writer/settings.yaml`；用 Tauri 的 `app_data_dir` 取對應 OS 路徑
- **monorepo 結構**：
  ```
  apps/
  ├── web/             # Vite React 前端
  ├── api/             # Hono sidecar（Node binary 打包）
  └── desktop/         # Tauri Rust 殼（src-tauri/）
  ```

## References

- Tauri 2 docs: https://v2.tauri.app/
- Tauri sidecar 模式: https://v2.tauri.app/develop/sidecar/
- `tauri-action`（GitHub Actions 自動跨平台打包）：https://github.com/tauri-apps/tauri-action
- 體積對照（Tauri vs Electron）：https://tauri.app/start/comparison/
