# 0007. Git 整合：Shell out 系統 git

- Status: `Accepted`
- Date: `2026-05-12`
- Deciders: spec-architect

## Context

依 [ADR-0001](./0001-storage-strategy.md) 與後續 Story 修訂版（2026-05-12），git 在本應用中是**第一公民**：

- Story 001 建立專案 = `git init` + initial commit
- Story 003 章節儲存 = git commit
- Story 006 採用 AI 草稿 = git commit
- Story 007 status-updater = git commit
- Story 010 整個就是 git 版控 UX
- Drive 同步衝突偵測 → `git status`
- 「還原採用前版本」→ `git checkout HASH -- path`

候選：shell out 系統 git / isomorphic-git（純 JS）/ 兩者 fallback。前輪討論已敲定 shell out。本 ADR 規範實作細節。

## Decision

**Shell out 系統 git**。應用前提：**使用者必須已裝 git**。

### 執行位置

`git` 命令由 **Hono sidecar 端**（Node child_process）執行，**不**在 Tauri Rust 端。

理由：
- 業務邏輯（commit timing、訊息組裝、衝突處理）天然在 sidecar 的 TS code 中
- Tauri Rust 端只負責「應用啟動時的環境探測」（git binary 是否存在）
- sidecar 內 `child_process.spawn('git', [...], { cwd: projectPath })` 模式單純

### Git binary 探測

**首次啟動時**（Tauri Rust 端）：

```rust
// Tauri command: detect_git()
// 1. 跑 `which git` (Unix) 或 `where git` (Windows)
// 2. 回傳 { found: bool, path: Option<String>, version: Option<String> }
```

WebView 在初始化時呼叫 `invoke('detect_git')`：

| 結果 | 行為 |
|---|---|
| `found: true` | 寫入 `~/.novel-writer/.runtime.json` 的 `gitBinary` 欄位；後續 Hono sidecar 用此路徑 |
| `found: false` | WebView 顯示「需要安裝 git」對話框，含 Win / Mac / Linux 安裝連結；阻擋「新小說」等需 git 功能 |

不在每次操作前重新探測。使用者中途解除安裝 git 是邊緣情境，由「git command failed」錯誤路徑捕捉。

### Commit timing（哪些動作觸發 commit）

| 動作 | 觸發 spec | commit message |
|---|---|---|
| 新建專案 | Story 001 | `init: novel project <title>` |
| 章節儲存（手動「儲存」按鈕）| Story 003 / Spec 003 | `chapter: save chapter <N> <title>` |
| 章節採用（採用 AI 草稿）| Story 006 / Spec 006 | `chapter: adopt AI draft for chapter <N> <title>` |
| 章節重命名 | Story 003 / Spec 003 | `chapter: rename chapter <N> to <title>` |
| status-updater 自動寫入 | Story 007 / Spec 007 | `status: update after <reason> chapter <N>` |
| status 檔手動編輯 + 儲存 | Story 003 編輯 status | `status: manual edit <story\|character_<slug>>` |
| AI 精簡 status | Story 007 | `status: AI shorten <filename>` |
| 角色卡新增 | Story 002 / Spec 002 | `character: add <name>` |
| 角色卡編輯 + 儲存 | Story 002 / Spec 002 | `character: edit <name>` |
| 角色卡刪除 | Story 002 / Spec 002 | `character: delete <name>` |
| style.md 編輯 + 儲存 | Story 003 編輯 style | `style: edit writing style` |

### Commit message convention

`<type>: <scope> <短描述>`

- `type` 限定：`init` / `chapter` / `character` / `status` / `style` / `meta`
- `scope` 為章節 / 角色 / 檔案名
- 短描述全部繁中即可（無強制 50/72 字長度限制；個人專案）

### 命令 wrapper 介面

Hono sidecar 提供 `apps/api/src/services/git.ts`：

```ts
export interface GitError {
  code: "not_installed" | "not_a_repo" | "command_failed" | "io_error";
  command: string;
  stderr: string;
  cause?: unknown;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitError };

export interface GitWrapper {
  init(projectPath: string): Promise<GitResult<void>>;
  add(projectPath: string, files: string[]): Promise<GitResult<void>>;
  commit(projectPath: string, message: string): Promise<GitResult<{ sha: string }>>;
  status(projectPath: string): Promise<GitResult<GitStatus>>;
  log(projectPath: string, opts: { limit?: number; file?: string }): Promise<GitResult<GitCommit[]>>;
  show(projectPath: string, sha: string, file: string): Promise<GitResult<string>>;
  checkoutFile(projectPath: string, sha: string, file: string): Promise<GitResult<void>>;
}

export interface GitStatus {
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  date: string;        // ISO 8601
  message: string;
  files: string[];
}
```

### 衝突偵測

**Drive 同步可能造成兩種情境**：

1. **應用外的編輯**（git pull / 直接 vim / Drive 從別台同步進來）
   - 偵測：Tauri fs watcher → 通知 sidecar → sidecar 跑 `git status` 確認
   - 偵測時機：應用啟動、章節開啟前、視窗 focus 時
   - 處理：UI 提示「外部變更已載入」，比對 IndexedDB draft（Spec 003）

2. **真實 git conflict**（多裝置同時改同一檔，Drive 寫進來 conflict marker）
   - 偵測：`git status` 出現 `UU` 或檔案內含 `<<<<<<<` marker
   - 處理：UI 提示「衝突需手動解決」+ 指引使用 git 命令列或第三方 git 工具；MVP 不內建衝突解決 UI

### 排隊與並發

git 命令**串列執行**（per project）。Hono sidecar 維護 `Map<projectHash, PromiseQueue>`：

- 同一專案的 commit / status / checkout 排隊跑
- 不同專案的命令並行 OK
- 避免「兩個 commit 同時跑造成 git index lock」

實作上用簡單的 `p-queue` 套件（concurrency: 1 per project）。

### `.gitignore` 預設

Story 001 建立專案時寫入：

```
.DS_Store
Thumbs.db
*.bak
*.swp
*.swo
.idea/
.vscode/
node_modules/
```

注意：**不**忽略 `chapter_####_*.md` / `characters/*.md` / `status/*.md` / `style.md`——這些都要進 git。

## Consequences

**Positive:**

- **效能**：原生 git 比 isomorphic-git 快 5-10×；對 200+ 章專案的 `git log` / `git status` 反應乾脆
- **使用者可直接用 git**：使用者可在 terminal 跑 `git log` 看歷史，與應用內顯示一致
- **LFS、submodule、稀疏 checkout 等進階特性**：未來需要時免費獲得
- **git hooks**：使用者可自行加 `.git/hooks/`（例：pre-commit 跑外部腳本）；isomorphic-git 不支援 hooks
- **熟悉度**：dev 寫 git wrapper 比學 isomorphic-git API 快

**Negative:**

- **使用者必須裝 git**：對「零安裝」期待的使用者是門檻
  - 緩解：首次啟動偵測 + 引導；個人創作者 persona 多半已裝
- **child_process 啟動 overhead**：每次 commit 約 50-150ms（包含 process spawn + git 內部 hashing）；對 MVP 寫作節奏可接受（commit 是手動觸發的）
- **跨平台路徑差異**：Win / Mac / Linux 的 git 行為一致但 stderr 編碼可能不同；wrapper 要 normalize
- **錯誤訊息對英文使用者友善但對繁中使用者陌生**：wrapper 將常見錯誤映射到繁中
- **不能完全控制 git 行為**：例如 `core.autocrlf`、`core.quotepath` 等使用者全域設定可能影響檔案處理；MVP 不主動 override，問題出現時 ADR 補

**Neutral:**

- **git binary 版本差異**：MVP 要求 git 2.30+（多數現代 OS 預裝版本皆滿足）；探測時記錄版本，過舊時警告
- **GPG signing**：不主動加 `-S`；使用者全域設定 `commit.gpgsign=true` 時尊重

## Alternatives considered

### isomorphic-git
- Pros: 純 JS、零外部依賴、跨平台行為一致
- Cons: 效能差（純 JS hashing）、LFS 不支援、hooks 不支援、無 git config 互動
- 為何不選：放棄效能與互通性換「零安裝」對「個人創作者」persona 不值得

### simple-git
- Pros: 包裝 shell out git 的成熟 npm 套件
- Cons: 加一層抽象但與我們自寫的 wrapper 差別不大；額外依賴
- 為何不選：自寫 wrapper 範圍小（< 300 行），不引入間接依賴

### nodegit
- Pros: libgit2 native binding，效能好
- Cons: native module 跨平台 prebuilt 麻煩；裝機體驗差
- 為何不選：與 better-sqlite3 同等 native binding 痛點疊加

### 「shell out 為主 + isomorphic-git fallback」
- Pros: 零安裝 + 高效能皆得
- Cons: dev 要維護兩套實作；錯誤情境矩陣翻倍；MVP 範圍爆炸
- 為何不選：scope creep

## 對其他文件的影響

- **ADR-0006** 應用打包：git 探測由 Tauri Rust 端 command 暴露；git 執行由 Hono sidecar 端
- **Story 010 / Spec 010** Git 版控：本 ADR 是其技術基礎，Spec 010 規範 UX 與 API
- **Spec 001** 建立專案：流程加 `git init` + initial commit step
- **Spec 003** 章節編輯器：「儲存」流程末端跑 git commit
- **Spec 006** 採用流程：「採用」流程末端跑 git commit
- **Spec 007** status-updater：寫入 status 後跑 git commit
- **Spec 002** 角色卡：新增 / 編輯 / 刪除後跑 git commit
- **Spec 009** 設定頁：API key 路徑必須在 `~/.novel-writer/`（git repo 之外），絕不上 commit

## References

- git 跨平台行為差異：https://git-scm.com/docs/git#_environment_variables
- Tauri sidecar 模式（用於 spawn 系統命令）：https://v2.tauri.app/develop/sidecar/
- p-queue: https://github.com/sindresorhus/p-queue
