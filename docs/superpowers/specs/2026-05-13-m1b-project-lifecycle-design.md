# M1-B 專案生命週期設計文件（建立 + 開啟）

> 日期：2026-05-13
> 狀態：Approved
> 對應 milestone：[M1-writing-skeleton.md](../../architecture/milestones/M1-writing-skeleton.md)
> 對應 specs：[001](../../architecture/specs/001-create-novel-project.md)、[008](../../architecture/specs/008-open-existing-project.md)
> 子循環：M1-B（M1 第二段；M1-A 基礎層已完成，M1-C 章節編輯器待開）

## 背景

M1-A 完成了 shared-types、settings 後/前端、git 後端、startup UI。M1-B 接續建立「建立新小說 + 開啟既有專案」的完整閉環，讓使用者能：

```
首頁（HomePage）
├─ 點「新小說」→ NewProjectDialog（三步表單）→ POST /api/novels → 路由到編輯器（M1-C 接手）
└─ 點某「最近開啟」項或「瀏覽資料夾」→ POST /api/projects/open → 路由到編輯器
```

M1-B 結束時編輯器路由還是 placeholder（M1-C 才補上 CM6 + autosave）。

## 範圍

### 本次做

- `packages/shared-types`：補 `CreateNovelRequest/Response`、`OpenProjectRequest/Response`、`ProjectOpenWarning`、`CharacterCard`、`ChapterRef`
- 後端 services：`sanitize`、`project-fs`、`recent-projects-store`、`project-validator`、`project-summary`
- 後端 routes：`POST /api/novels`、`POST /api/projects/open`、`POST /api/projects/recent/{remove,clear,relocate}`、`POST /api/projects/init-git`
- 前端 features：
  - `home/`：`HomePage`、`RecentProjectsList`、`NewProjectButton`、`BrowseFolderButton`、`MissingProjectDialog`
  - `new-project/`：`NewProjectDialog`（三步表單）+ `CharacterListInput`
- 路由：`/` → HomePage、`/editor/:hash` → placeholder（M1-C 接手）
- Ctrl+N 全域快捷鍵
- MSW handlers 補上述 endpoints

### 不在本次範圍

- 章節編輯器（CM6 + autosave + 衝突）→ M1-C
- BroadcastChannel 多視窗偵測 → M1-C（與編輯器一起做）
- Drive 同步衝突 banner UI（M1-A 已有 ConflictBanner 元件，本次只整合到 HomePage 顯示 warnings）
- 首次警語對話框 → M1-C
- per-Agent routing UI → M2

## 目錄結構

```
apps/api/src/
├── routes/
│   ├── novels.ts                    # POST /api/novels
│   └── projects.ts                  # POST /open + /recent/* + /init-git
└── services/
    ├── sanitize.ts                  # slug + title sanitization
    ├── project-fs.ts                # 建目錄樹 + rollback + 模板寫入
    ├── recent-projects-store.ts     # settings.yaml.recentProjects CRUD
    ├── project-validator.ts         # spec 008 § 驗證流程 step 1-6
    └── project-summary.ts           # chapterCount + lastChapter 統計

apps/web/src/
├── features/
│   ├── home/
│   │   ├── HomePage.tsx
│   │   ├── RecentProjectsList.tsx
│   │   ├── NewProjectButton.tsx     # 「新小說」按鈕（開 dialog + Ctrl+N）
│   │   ├── BrowseFolderButton.tsx   # Tauri dialog 整合
│   │   └── MissingProjectDialog.tsx
│   └── new-project/
│       ├── NewProjectDialog.tsx     # 三步表單
│       ├── CharacterListInput.tsx   # 角色清單編輯
│       └── useNewProjectForm.ts     # 表單狀態 + 驗證
├── lib/
│   └── keyboard.ts                  # Ctrl+N 全域快捷鍵 hook
└── router.tsx                       # 加 / 與 /editor/:hash 路由
```

## 資料模型

新增到 `packages/shared-types/src/project.ts`：

```ts
export interface CharacterCard {
  slug: string;
  name: string;
  description: string;
}

export interface ChapterRef {
  number: number;
  title: string;
  path: string;
}

export interface CreateNovelRequest {
  parentFolder: string;
  title: string;
  synopsis: string;
  characters: Array<{ name: string; description: string }>;
}

export interface CreateNovelResponse {
  project: { path: string; title: string; createdAt: string };
  firstChapter: ChapterRef;
}

export interface ProjectSummary {
  hash: string;
  path: string;
  title: string;
  schemaVersion: number;
  createdAt: string;
  chapterCount: number;
  lastChapter: number | null;
}

export interface ProjectOpenWarning {
  code: "no_git_repo" | "git_dirty" | "outdated_schema" | "missing_optional_file";
  message: string;
  suggestedAction?: string;
  fixAction?: { type: "init_git" | "create_file"; params?: Record<string, unknown> };
}

export interface OpenProjectRequest {
  path: string;
  source: "recent-list" | "browse";
  forceOpen?: boolean;
}

export interface OpenProjectResponse {
  project: ProjectSummary;
  warnings: ProjectOpenWarning[];
}
```

`AppSettings.recentProjects` 已存在，本次擴充 `RecentProject` 加入 `lastChapter?: number`、`chapterCount?: number`（M1-A 的 `RecentProject` 缺這兩欄，需補上）。

## 後端服務

### `sanitize.ts`

```ts
export function sanitizeTitle(title: string): string;
export function sanitizeSlug(name: string): string;
export function isWindowsReservedName(s: string): boolean;
```

規則依 Spec 001 §「Slug 規則」：NFC normalize、移除 `/ \ : * ? " < > | \0`、合併空白為 `_`、Windows reserved name 加後綴 `-novel`、空字串 throw error。

### `project-fs.ts`

```ts
export interface CreatedProject {
  projectPath: string;
  firstChapterPath: string;
  firstChapterNumber: 1;
  firstChapterTitle: "未命名";
  meta: ProjectMeta;
}

export async function createProjectFiles(
  req: CreateNovelRequest,
  resolvedProjectPath: string,
): Promise<CreatedProject>;
```

行為（Spec 001 § 跨元件協議 step 4-6）：
1. `mkdir -p` 建目錄樹（characters/、chapters/、status/、agents/、skills/）
2. `Promise.all` 並行寫入 7 個檔案（project.yaml、synopsis.md、characters/_index.md、characters/<slug>.md…、chapters/chapter_0001_未命名.md、status/story_status.md、status/character_status.md）
3. 任一失敗 → `rm -rf projectPath` rollback → throw IO 錯誤
4. 同 slug 衝突時加後綴 `-2`、`-3`...

### `recent-projects-store.ts`

```ts
export async function addRecentProject(
  hash: string, path: string, title: string,
): Promise<void>;
export async function removeRecentProject(hash: string): Promise<boolean>;
export async function clearRecentProjects(): Promise<number>;
export async function updateRecentProjectMeta(
  hash: string, patch: Partial<RecentProject>,
): Promise<void>;
export async function relocateRecentProject(
  oldHash: string, newPath: string, newTitle: string,
): Promise<void>;
```

實作：透過 M1-A 的 `readSettings` / `writeSettings`，操作 `settings.recentProjects` 陣列。維護規則：上限 10、`lastOpenedAt` desc 排序、LRU 淘汰。

### `project-validator.ts`

```ts
export type ValidationError =
  | { code: "INVALID_PATH"; status: 400 }
  | { code: "PATH_NOT_FOUND"; status: 404 }
  | { code: "MISSING_PROJECT_YAML"; status: 422 }
  | { code: "CORRUPTED_PROJECT_YAML"; status: 422 }
  | { code: "SCHEMA_VERSION_TOO_NEW"; status: 422 };

export interface ValidationOk {
  meta: ProjectMeta;
  warnings: ProjectOpenWarning[];
}

export async function validateProject(
  path: string, forceOpen: boolean,
): Promise<{ ok: true; data: ValidationOk } | { ok: false; error: ValidationError; message: string }>;
```

依 Spec 008 § 驗證流程 step 1-6 實作。

### `project-summary.ts`

```ts
export async function summarizeProject(projectPath: string): Promise<{
  chapterCount: number;
  lastChapter: number | null;   // 從 recentProjects 取，初次開啟為 null
}>;
```

掃 `chapters/` 中 `chapter_*_*.md`，計數 + 取最大 number。

### `commit-policy` 整合

`POST /api/novels` 完成 7 個檔案寫入後呼叫：
```ts
await git.init(projectPath);
await commitIfChanged(projectPath, "create-project", title);
```

`POST /api/projects/init-git` 同樣呼叫 init + initial commit。

## 後端 Routes

### `routes/novels.ts`

`POST /api/novels`：
1. zod 驗證 `CreateNovelRequest`
2. `sanitizeTitle(title)` → `resolvedProjectPath = path.join(parentFolder, sanitized)`
3. 檢查 `parentFolder` 存在且可寫；`resolvedProjectPath` 不存在
4. `createProjectFiles(req, resolvedProjectPath)`
5. `git.init` + `commitIfChanged(create-project)`
6. `addRecentProject(hash, path, title)`（失敗只 warn log，不阻擋 200）
7. 回 `CreateNovelResponse`

錯誤映射：INVALID_INPUT / INVALID_PATH / WRITE_FORBIDDEN / PROJECT_CONFLICT / IO_ERROR（依 Spec 001 表）。

### `routes/projects.ts`

`POST /api/projects/open`：依 Spec 008 § 驗證流程 step 1-10。

`POST /api/projects/recent/remove`：`removeRecentProject(hash)`

`POST /api/projects/recent/clear`：`clearRecentProjects()`

`POST /api/projects/recent/relocate`：先 `validateProject(newPath)`，OK 後 `relocateRecentProject(oldHash, newPath, newTitle)`，再回 `POST /open` 等同格式

`POST /api/projects/init-git`：`git.init(path) + commitIfChanged("create-project", title)` → `{ initialCommitSha }`

## 前端 Features

### `features/home/`

**`HomePage.tsx`**：
- 左：標題「Novel Writer」+ 大型「新小說」按鈕
- 右：「最近開啟」清單（卡片式）+ 「瀏覽資料夾」按鈕
- 啟動時呼叫 `GET /api/settings` 取 recentProjects（已在 M1-A）
- 顯示 ConflictBanner（M1-A 已有，當 git_dirty warning）

**`RecentProjectsList.tsx`**：
- 卡片：title、path、lastOpenedAt 相對時間（如「2 小時前」）
- 點卡片 → `POST /api/projects/open` → 路由到 `/editor/:hash`
- 404 → 開 MissingProjectDialog
- 右上角 ⋯ 選單：「從清單移除」、「重新指定路徑」

**`NewProjectButton.tsx`**：點擊或 Ctrl+N → 開 NewProjectDialog

**`BrowseFolderButton.tsx`**：
- 點擊 → `tauriInvoke<string | null>("open_directory_dialog")`（M0 已實作）
- 取到路徑 → `POST /api/projects/open { source: "browse" }`
- 失敗顯示 toast

**`MissingProjectDialog.tsx`**：
- 「找不到此專案。路徑：<path>」
- 三個動作：「移除此項」/ 「重新指定路徑」/ 「取消」
- 「重新指定」→ 開 Tauri dialog → `POST /api/projects/recent/relocate`

### `features/new-project/`

**`NewProjectDialog.tsx`** — 三步表單：

```
Step 1：書名 + 父資料夾（文字輸入 + 「瀏覽」按鈕走 Tauri dialog）
Step 2：故事大綱（多行 textarea，min 10 字）
Step 3：角色清單（CharacterListInput，至少一名）
最後「建立」按鈕 → POST /api/novels
```

下一步驗證：當步驟內欄位皆通過才能進「下一步」。

**`CharacterListInput.tsx`**：
- 動態陣列（+ 新增角色）
- 每個項目：name + description
- 最少 1 名（無法刪到 0）

**`useNewProjectForm.ts`**：
- 表單狀態（Zustand 或 useReducer）
- step 切換邏輯
- 欄位驗證（即時 + 提交時）
- fieldErrors 對映後端回應

### 路由更新（`router.tsx`）

```tsx
{ path: "/", element: <HomePage /> }
{ path: "/settings", element: <SettingsPage /> }
{ path: "/editor/:hash", element: <EditorPlaceholder /> }  // M1-C 接手
```

進入點從 `/` → `/settings` 改為 `/` → HomePage。

### Ctrl+N 全域快捷鍵

`lib/keyboard.ts`：
```ts
export function useGlobalKey(combo: string, handler: () => void): void;
```
HomePage 用 `useGlobalKey("ctrl+n", () => setNewProjectOpen(true))`。

### MSW handlers 擴充

`mocks/handlers.ts` 補：
- `POST /api/novels` → 回成功的 CreateNovelResponse
- `POST /api/projects/open` → 回成功的 OpenProjectResponse
- `POST /api/projects/recent/remove` → `{ removed: true }`
- `POST /api/projects/recent/clear` → `{ cleared: true, removedCount: 3 }`
- `POST /api/projects/init-git` → `{ initialCommitSha: "abc123..." }`

Fixtures：`mocks/fixtures/projects.ts` 提供範例。

## Tauri dialog 整合策略

M0 已實作 `open_directory_dialog` Tauri command（回傳 `Option<String>`）。前端透過 `apps/web/src/lib/tauri.ts` 的 `tauriInvoke` 呼叫。

但在 **dev 模式 + 瀏覽器**（無 Tauri），dialog 不可用。fallback：顯示一個 prompt 對話框讓使用者貼上絕對路徑（dev 用，正式發佈一律走 Tauri）。

```ts
async function pickFolder(): Promise<string | null> {
  if ("__TAURI_INTERNALS__" in window) {
    return tauriInvoke<string | null>("open_directory_dialog");
  }
  return prompt("dev 模式：輸入資料夾絕對路徑");
}
```

## 測試策略

| 層 | 工具 | 範圍 |
|---|---|---|
| Backend unit | vitest | sanitize（中/英/符號/Windows reserved name）、project-fs rollback、recent-projects-store CRUD |
| Backend integration | vitest + tmpdir | novels route 全 6 個 Scenario、projects-open 5 個錯誤碼 |
| Frontend unit | vitest + RTL + MSW | NewProjectDialog 三步驗證、RecentProjectsList、MissingProjectDialog |
| Frontend E2E | （留 M1-C 一起做 Playwright） | — |

覆蓋率目標：critical path ≥ 80%。

## 驗收（M1-B DoD）

```
1. 啟動應用 → HomePage 顯示「新小說」+「瀏覽資料夾」+ 空清單
2. 點「新小說」（或 Ctrl+N）→ NewProjectDialog 開啟
3. 填書名「春日記事」→ 點瀏覽選 D:/MyNovels → Step 1 OK
4. 填大綱 → Step 2 OK
5. 加角色「林川 — 衛星工程師」→ Step 3 OK
6. 點「建立」→ 系統建目錄 + git init + initial commit
   驗證：ls D:/MyNovels/春日記事 看到 project.yaml + characters/林川.md + chapters/chapter_0001_未命名.md
   驗證：cd D:/MyNovels/春日記事 && git log → 看到 "init: 春日記事"
7. 自動路由到 /editor/<hash>（M1-C placeholder）
8. 關閉應用 → 重新打開 → HomePage 看到「春日記事」在清單中
9. 點清單卡片 → 載入專案 → 路由到編輯器
10. mv D:/MyNovels/春日記事 D:/elsewhere/ → 再點清單 → MissingProjectDialog 顯示
11. 「重新指定」→ 選 D:/elsewhere/春日記事 → 清單更新 → 成功進入
12. 點「瀏覽資料夾」選一個非 novel-writer 資料夾 → 顯示「MISSING_PROJECT_YAML」錯誤 + 建議
13. typecheck / test / lint 全綠
```

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| 並行寫入 7 個檔案失敗時的部分狀態 | 全部用 try-catch 包，任何失敗 `rm -rf projectPath`，並把錯誤訊息傳給前端 |
| Windows path 大小寫不敏感與 Mac/Linux 敏感差異 | `realpath` normalize + 用 `path.normalize`，UI 顯示原始輸入 |
| 同 hash 的 `/open` 並行造成 settings.yaml 競爭 | 用 PQueue per-hash 串列化（M0 atomic-fs 已有 atomic write） |
| Tauri dialog 在純瀏覽器 dev 不可用 | prompt() fallback 給 dev；正式發佈一律走 Tauri |
| `git init` 在 fs watcher 啟動後造成大量 event | M1-B 不啟用 fs_watcher（留 M1-C），暫無此問題 |
| recentProjects 陣列污染（lastChapter / chapterCount 缺欄位） | 加入 deepMerge 時用 defaultRecentProject() fill missing fields |
