# Spec: Git 版控

> Story: `docs/requirements/stories/010-git-version-control.md`
> BDD: `docs/requirements/features/010-git-version-control.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-12`
> Depends on ADR: 0001（儲存策略）、0003（技術棧）、0006（Tauri）、0007（Git shell out）、0008（前端架構）

## 摘要

每個小說專案資料夾 = 一個 local git repo。所有寫 `.md` 的動作（章節儲存 / 採用 / status 更新 / 角色卡編輯 / 刪除等）都自動 `git commit`。前端提供「歷史」面板列出每個檔案的 commit 歷史、可預覽舊版本、可還原（產生 revert commit）、可看 diff。

本 spec 規範實作細節：git wrapper 介面、commit 觸發點、歷史 / 還原 / diff API、衝突偵測、未裝 git 引導流程。

依 [ADR-0007](../adr/0007-git-integration.md)：shell out 系統 git，由 Hono sidecar 端執行；Tauri Rust 端只做首次啟動的 git 路徑探測。

## API 合約

所有路徑前綴 `/api/projects/:projectHash/git/`。

### POST .../init

供 Story 008 開啟非 git repo 的合法 novel-writer 專案時補 init 用。

**Response:** `{ ok: true; initialCommitSha: string }`

### GET .../status

**Response:**
```ts
{
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];          // 有 conflict markers 的檔案
  ahead: number;                 // MVP 無 remote，永遠 0
  behind: number;                // 同上
}
```

用於：應用啟動 / 章節開啟前的衝突偵測 / 「git status 面板」顯示。

### GET .../log

**Query:**
- `file`: optional，限定該檔的 commit 歷史
- `limit`: 預設 50；最大 500
- `before`: optional ISO 8601，分頁用

**Response:**
```ts
{
  commits: GitCommit[];
  hasMore: boolean;
}
```

`GitCommit` 形態見 ADR-0007。

### GET .../show

**Query:**
- `sha`: required
- `file`: required，相對於專案目錄的路徑

**Response 200:** `{ content: string; size: number }`（檔案在該 commit 的內容）

**404:** 該 commit 不含此檔（檔案在該時點還沒建立 / 已被刪除）

### POST .../revert

**Request:**
```ts
{
  sha: string;                   // 要還原到的 commit
  file: string;                  // 該檔（單檔還原；不支援整 repo revert）
}
```

**Response 200:** `{ revertCommitSha: string }`

**邏輯：**

1. 跑 `git show <sha>:<file>` 取得該版本內容
2. 比對與當前內容是否相同；相同則 200 但 message「無變更」
3. 寫入主檔（atomic：tmp + rename）
4. 跑 `git add <file>` + `git commit -m "<type>: revert <file> to <short-sha>"`
5. 回 revert commit sha
6. 同時清空 IndexedDB 該檔對應的 draft（如果是章節）

**Errors:**
- 404 `COMMIT_NOT_FOUND`：sha 不存在
- 404 `FILE_NOT_IN_COMMIT`：該 commit 不含該檔
- 500 `IO_ERROR`

### GET .../diff

**Query:**
- `sha`: 與此 commit 比對
- `file`: required
- `against`: `"current"`（與 working dir 比）或 `"head"`（與 HEAD 比，預設）

**Response:**
```ts
{
  unifiedDiff: string;           // 標準 unified diff 格式
  additions: number;
  deletions: number;
}
```

### POST .../commit-manual

讓使用者在「git status 面板」手動 commit 未追蹤 / dirty 變更（例：從外部編輯器改了 synopsis.md）。

**Request:**
```ts
{
  message: string;               // 必填，使用者提供
  files?: string[];              // 若空則 `git add -A`
}
```

**Response 200:** `{ commitSha: string }`

### GET .../check-git-binary

**Response:**
```ts
{
  installed: boolean;
  path?: string;
  version?: string;              // 例 "2.42.0"
  versionMeetsRequirement: boolean;   // ≥ 2.30.0
}
```

由前端在啟動時呼叫，未裝時引導使用者。

> 注意：此 endpoint 在 sidecar 啟動時也自動跑一次，結果 cache 起來；前端 query 走 cache。Tauri Rust 端的 `detect_git()` command 是另一個來源（Tauri command IPC，不走 HTTP），主要給 Tauri 端的「整個應用 launching」流程用。

## Git wrapper 實作

`apps/api/src/services/git.ts`：

```ts
import { spawn } from "node:child_process";
import PQueue from "p-queue";

const queues = new Map<string, PQueue>();
function getQueue(projectPath: string) {
  if (!queues.has(projectPath)) {
    queues.set(projectPath, new PQueue({ concurrency: 1 }));
  }
  return queues.get(projectPath)!;
}

interface GitResult<T> {
  ok: true; value: T;
} | {
  ok: false; error: GitError;
}

interface GitError {
  code: "not_installed" | "not_a_repo" | "command_failed" | "io_error" | "timeout";
  command: string;
  stderr: string;
}

export async function runGit(
  projectPath: string,
  args: string[],
  options: { timeoutMs?: number; input?: string } = {},
): Promise<GitResult<{ stdout: string; stderr: string }>> {
  return getQueue(projectPath).add(() => new Promise(resolve => {
    const proc = spawn("git", args, {
      cwd: projectPath,
      env: { ...process.env, LC_ALL: "C.UTF-8", GIT_TERMINAL_PROMPT: "0" },
    });
    // ... timeout、stdout/stderr 收集、回 GitResult
  }));
}

export const git = {
  init: (path: string) => runGit(path, ["init", "--initial-branch=main"]),
  add: (path: string, files: string[]) => runGit(path, ["add", ...files]),
  commit: (path: string, message: string, opts: { allowEmpty?: boolean } = {}) =>
    runGit(path, ["commit", "-m", message, ...(opts.allowEmpty ? ["--allow-empty"] : [])]),
  status: (path: string) => runGit(path, ["status", "--porcelain=v2", "--branch"]).then(parseStatus),
  log: (path: string, opts: LogOptions) => runGit(path, buildLogArgs(opts)).then(parseLog),
  show: (path: string, sha: string, file: string) => runGit(path, ["show", `${sha}:${file}`]),
  diff: (path: string, args: string[]) => runGit(path, ["diff", "--no-color", ...args]),
  // ...
};
```

### Commit author

```
GIT_AUTHOR_NAME="novel-writer-app"
GIT_AUTHOR_EMAIL="noreply@local"
GIT_COMMITTER_NAME="novel-writer-app"
GIT_COMMITTER_EMAIL="noreply@local"
```

透過 env 注入，不動使用者全域 git config。

### Empty commit 處理

每個觸發 commit 的服務（spec 003/006/007/002）先呼叫 `git status` 確認確實有變更才 commit。避免「status-updater 跑完但 LLM 給出相同內容」造成空 commit（依 Story 010 Scenario「沒實際改動則無 commit」）。

實作層 helper：

```ts
export async function commitIfChanged(
  projectPath: string, files: string[], message: string,
): Promise<GitResult<{ commitSha: string | null }>> {
  await git.add(projectPath, files);
  const status = await git.status(projectPath);
  if (!status.value.staged.length) return { ok: true, value: { commitSha: null } };
  return git.commit(projectPath, message);
}
```

## Commit timing matrix

所有觸發點的對應 commit 訊息，由 `apps/api/src/services/commit-policy.ts` 集中管理：

| 觸發點 | files | message |
|---|---|---|
| Story 001 建立專案 | `["."]`（全部） | `init: novel project <title>` |
| Spec 003 章節儲存 | `["chapters/chapter_<NNNN>_<title>.md"]` | `chapter: save chapter <N> <title>` |
| Spec 003 章節重命名 | 包含舊檔名 + 新檔名 | `chapter: rename chapter <N> from <old> to <new>` |
| Spec 006 章節採用 | `["chapters/chapter_<NNNN>_*.md", "chapters/chapter_<NNNN>_prompt.md"]` | `chapter: adopt AI draft for chapter <N> <title>` |
| Spec 007 status 自動更新 | `["status/story_status.md", "characters/<slug>_status.md", ...]` | `status: update after <adopt\|save\|manual> chapter <N>` |
| Spec 007 AI 精簡 | `["status/story_status.md"]` 或 `["characters/<slug>_status.md"]` | `status: AI shorten <filename>` |
| Spec 007 手動編輯 status | 該 status 檔 | `status: manual edit <filename>` |
| Spec 002 角色新增 | `["characters/<slug>.md", "characters/<slug>_status.md", "characters/_index.md"]` | `character: create <slug>` |
| Spec 002 角色編輯（含 AI 重生成） | `["characters/<slug>.md", "characters/_index.md"]` | `character: edit <slug>` 或 `character: regenerate <slug>` |
| Spec 002 角色刪除 | `["characters/<slug>.md", "characters/<slug>_status.md", "characters/_index.md"]` | `character: delete <slug>` |
| Story 003 style.md 編輯 | `["style.md"]` | `style: edit writing style` |
| revert 還原（本 spec） | 該檔 | `<type>: revert <file> to <short-sha>` |
| 手動 commit 面板 | 使用者選的 | 使用者提供 |

`type` 必為 `init` / `chapter` / `character` / `status` / `style` / `meta`。

## 衝突偵測

### 啟動時 / 開啟專案時

1. 跑 `git status --porcelain=v2`
2. 若有 modified（uncommitted 變更）：UI banner「Drive 同步帶來了未 commit 的變更。是否一鍵 commit？」+「查看詳情」（開 git status 面板）
3. 若有 conflicted（含 `<<<<<<<` marker）：UI banner「偵測到 git 衝突。請手動解決。」+「查看衝突檔案清單」

### 章節開啟前

Spec 003 開啟章節時：

1. 跑 `git status -- chapters/chapter_<N>_*.md`
2. 若 dirty：與 IndexedDB draft 比對（依 Spec 003 衝突處理三種情境）

### Tauri fs watcher

Tauri 端用 `notify` 套件 watch 專案目錄；偵測到 `.md` 變更（非 app 自己寫的）後發 event。Hono sidecar 收到後 invalidate 對應快取並通知前端。

## 還原 UX

**前端歷史面板**（drawer，從編輯器右邊滑出）：

```
┌─ 第一章「梅雨初晴」 歷史 ─────────────┐
│ 🟢 目前版本 (working tree)            │
│ ────────────────────────────────────  │
│ • 3 小時前  chapter: adopt AI draft   │
│   +420 字  abc1234                    │
│ • 5 小時前  chapter: save chapter 1   │
│   +180 字  def5678                    │
│ • 1 天前    chapter: save chapter 1   │
│   +20 字   1a2b3c4                    │
│ • 2 天前    init: novel project 春日記事│
│   +50 字   5e6f7g8                    │
└──────────────────────────────────────┘
```

點 commit → 右側 preview 該版本內容 + 兩按鈕：
- 「還原到此版本」（→ POST .../revert）
- 「Diff 與當前比較」（→ GET .../diff，顯示 unified diff）

`+N 字` 透過 `git log --numstat -- <file>` 計算。

## 未裝 git 引導

啟動時 Tauri Rust 端 `detect_git()` 失敗 → 前端顯示阻擋對話框：

```
偵測不到 git

Novel Writer 需要 git 來自動備份你的小說內容。請先安裝 git，再重啟應用。

🪟 Windows: https://git-scm.com/download/win
🍎 macOS:   執行 xcode-select --install 或從 https://git-scm.com/download/mac
🐧 Linux:   sudo apt install git（Debian / Ubuntu）/ sudo dnf install git（Fedora）

[ 我已安裝，重啟應用 ]   [ 離開 ]
```

對話框關閉 = 離開應用；按「我已安裝」呼叫 Tauri `app.restart()`。

## 資料模型

新增至 `packages/shared-types/src/git.ts`：

```ts
export interface GitStatus {
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];
  ahead: number;
  behind: number;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;                  // ISO 8601
  message: string;
  type: "init" | "chapter" | "character" | "status" | "style" | "meta";
  files: GitCommitFile[];
}

export interface GitCommitFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  oldPath?: string;              // status === "renamed" 時
}

export interface GitBinaryInfo {
  installed: boolean;
  path?: string;
  version?: string;
  versionMeetsRequirement: boolean;
}

export interface RevertRequest {
  sha: string;
  file: string;
}

export interface ManualCommitRequest {
  message: string;
  files?: string[];
}
```

## 跨元件協議

```
編輯器（前端）
  │ 使用者按「儲存」/「採用」/「立刻更新狀態」/ 修改角色卡 + 儲存 等
  ▼
對應 API（Spec 003/006/007/002）
  │ 寫檔
  ▼
commit-policy → commitIfChanged(projectPath, files, message)
  │
  ▼
git.add → git.status → 有變更才 git.commit
  │
  ▼
回 { commitSha: string | null }
  │
  ▼
前端 toast「已儲存」（不顯示 commit hash，純 UX 體感）

歷史面板：
  │ 點「歷史」按鈕
  ▼
GET .../log?file=...&limit=50
  │
  ▼
顯示清單，點 commit → GET .../show + GET .../diff
  │
  ▼
點「還原到此版本」→ POST .../revert
  │
  ▼
寫主檔 + commit revert + 回應
  │
  ▼
編輯器主編輯區重新載入 + 清 IndexedDB draft + toast「已還原」
```

## 並發

依 ADR-0007：每專案一個 `PQueue concurrency: 1` 串列執行 git 命令。

不同專案的 git 命令並行 OK。

## 非功能性

- **效能**：
  - 單個 commit（含 status 確認）p95 < 200ms（小檔案）
  - `git log --oneline -50 -- <file>` p95 < 50ms（即使 1000+ commits）
  - `git show <sha>:<file>` p95 < 30ms
- **容量**：MVP 不限制 commit 數；長期使用者可手動 `git gc` 或 `git repack`
- **安全**：所有 git 命令以 `cwd: projectPath` 執行；不在 projectPath 外做 commit；強制 `LC_ALL=C.UTF-8` 避免 locale 影響輸出解析
- **可用性**：git 命令失敗 → 對應 spec 的觸發點視為失敗（章節儲存 fail / 採用 fail）；不要默默吞掉錯誤
- **跨平台**：
  - Windows：偵測 `git.exe`；處理路徑 `\` vs `/`（git 內部一律 `/`）
  - Mac/Linux：偵測 `git`
  - 編碼一律走 UTF-8

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/git.ts` — GitStatus、GitCommit、GitCommitFile、GitBinaryInfo
- [ ] **be-1**: `apps/api/src/services/git.ts` — wrapper（runGit、status/log/show/diff/commit 等），含 PQueue per-project
- [ ] **be-2**: `apps/api/src/services/commit-policy.ts` — commit timing matrix 集中管理
- [ ] **be-3**: `apps/api/src/services/git-status-parser.ts` — `--porcelain=v2` 輸出解析
- [ ] **be-4**: `apps/api/src/services/git-log-parser.ts` — log 輸出解析（含 numstat、parents、message type 抽取）
- [ ] **be-5**: `apps/api/src/routes/git.ts` — `/api/projects/:hash/git/*` 全部 endpoint
- [ ] **be-6**: 整合到 Spec 001/002/003/006/007 的儲存流程（每個流程末端呼叫 `commitIfChanged`）
- [ ] **be-7**: Tauri Rust 端 `detect_git()` command（spawn `which`/`where` + `git --version`）
- [ ] **be-8**: Tauri Rust 端 fs watcher（`notify` 套件，watch 專案目錄）
- [ ] **fe-1**: `apps/web/src/features/git/HistoryPanel.tsx` 歷史面板
- [ ] **fe-2**: `apps/web/src/features/git/DiffView.tsx` 統一 diff 顯示
- [ ] **fe-3**: `apps/web/src/features/git/CommitPreview.tsx` 歷史版本預覽
- [ ] **fe-4**: 啟動時 git 偵測 + 未裝引導對話框
- [ ] **fe-5**: 「git status 面板」（次要功能）+「手動 commit」對話框
- [ ] **fe-6**: 「Drive 同步帶來變更」啟動 banner
- [ ] **qa-1**: cucumber-js step definitions for `010.feature`
- [ ] **qa-2**: git wrapper 單元測試（用真實 git，臨時 repo 跑）
- [ ] **qa-3**: 跨平台 git 行為差異測試（CI 上 Win / Mac / Linux 都跑）
- [ ] **qa-4**: `commitIfChanged` 對「無變更」的正確行為測試

## 變更紀錄

- `2026-05-12`: 初版 Ready
