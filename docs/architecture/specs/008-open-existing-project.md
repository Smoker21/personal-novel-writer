# Spec: 開啟既有小說專案

> Story: `docs/requirements/stories/008-open-existing-project.md`
> BDD: `docs/requirements/features/008-open-existing-project.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-12`
> Depends on ADR: 0001、0003、0006（Tauri fs dialog）、0007（git）、0008（前端架構）
> Depends on spec: 009（settings.recentProjects schema）、010（git status 驗證）

## 摘要

開啟既有專案有兩個入口：

1. **「最近開啟」清單**：首頁點擊 → 取路徑 → 驗證 → 進入專案
2. **「瀏覽資料夾」按鈕**：Tauri fs dialog → 取路徑 → 驗證 → 加入清單 → 進入專案

驗證包括：`project.yaml` 存在與 schema 檢查、git repo 完整性、必要檔案結構。

驗證通過後進入專案 = 路由到該專案上次編輯的章節，章節編輯器載入內容（與 IndexedDB draft 比對依 Spec 003）。

## API 合約

### POST /api/projects/open

**Request:**
```ts
{
  path: string;                  // 絕對路徑
  source: "recent-list" | "browse";
  forceOpen?: boolean;           // 略過部分非致命警告（例：schema 版本較舊）
}
```

**Response 200:**
```ts
{
  project: {
    hash: string;                // sha256(path) 前 12 字
    path: string;
    title: string;
    schemaVersion: number;
    createdAt: string;
    chapterCount: number;
    lastChapter: number | null;
  };
  warnings: ProjectOpenWarning[];   // 非致命，列出來但不阻擋
}

interface ProjectOpenWarning {
  code: "no_git_repo" | "git_dirty" | "outdated_schema" | "missing_optional_file";
  message: string;
  suggestedAction?: string;
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_PATH` | 路徑非絕對、含禁字元 |
| 404 | `PATH_NOT_FOUND` | 資料夾不存在 |
| 422 | `MISSING_PROJECT_YAML` | 資料夾不是合法 novel-writer 專案 |
| 422 | `CORRUPTED_PROJECT_YAML` | project.yaml 存在但 parse 失敗 / schema 嚴重不符 |
| 422 | `SCHEMA_VERSION_TOO_NEW` | project.yaml schemaVersion > 應用支援版本 |
| 500 | `IO_ERROR` |

### POST /api/projects/recent/remove

從「最近開啟」清單移除一項（不刪資料夾）。

**Request:** `{ hash: string }`
**Response 200:** `{ removed: true }`

### POST /api/projects/recent/clear

清空整個「最近開啟」清單。

**Request:** `{ confirmed: true }`
**Response 200:** `{ cleared: true; removedCount: number }`

### POST /api/projects/recent/relocate

「無法定位」項目的「重新指定路徑」流程。

**Request:**
```ts
{
  oldHash: string;
  newPath: string;
}
```

**Response 200:** 同 `POST /open` 的 response

實作上：先驗證 newPath 為合法專案，移除舊 hash 的清單項，加入新 hash 的清單項。

### POST /api/projects/init-git

對「合法 novel-writer 專案但無 .git」的資料夾補 git init。

**Request:** `{ path: string }`
**Response 200:** `{ initialCommitSha: string }`

由 Story 008 「不是 git repo 的資料夾」scenario 觸發。

## 驗證流程

```
POST /api/projects/open { path, source, forceOpen }
  │
  ▼
1. zod 驗證 path（絕對路徑、無 path traversal）
   → 失敗：400 INVALID_PATH
  │
  ▼
2. 資料夾存在嗎？
   → 不存在：404 PATH_NOT_FOUND
  │
  ▼
3. project.yaml 存在？
   → 不存在：422 MISSING_PROJECT_YAML（含 suggestion「在此資料夾建立新專案」）
  │
  ▼
4. project.yaml parse + schema 驗證
   → parse 失敗：422 CORRUPTED_PROJECT_YAML
   → schemaVersion > APP_SUPPORTED_SCHEMA：422 SCHEMA_VERSION_TOO_NEW（除非 forceOpen=true）
   → schemaVersion < APP_SUPPORTED_SCHEMA：emit warning code=outdated_schema（未來才會出現；MVP 都是 v1）
  │
  ▼
5. 必要檔案結構檢查：
   - synopsis.md 存在
   - style.md 存在（不存在則 warning）
   - characters/_index.md 存在（不存在則 warning）
   - chapters/ 目錄存在
   - status/story_status.md 存在
   缺檔 → 加進 warnings；不阻擋
  │
  ▼
6. git repo 檢查：
   - .git 目錄存在？
     沒有 → warning code=no_git_repo + suggestion「現在初始化」
   - git status：dirty？
     dirty → warning code=git_dirty + suggestion「查看 git status 面板」
  │
  ▼
7. 計算 projectHash = sha256(absolutePath).slice(0, 12)
  │
  ▼
8. 統計：chapterCount（掃 chapters/ 中 `chapter_*_*.md`）
  │
  ▼
9. 更新 settings.yaml recentProjects：
   - 若 hash 已存在：更新 lastOpenedAt
   - 若不存在且 source=browse：新增（push 到 array 前）
   - 維持上限 10：超過時 LRU 淘汰
  │
  ▼
10. 回 200 { project, warnings }
```

## 「最近開啟」清單管理

依 [Spec 009](./009-settings-page.md) 的 `settings.yaml.recentProjects` schema：

```yaml
recentProjects:
  - hash: a1b2c3d4e5f6
    path: D:/GoogleDrive/MyNovels/春日記事
    title: 春日記事
    lastOpenedAt: 2026-05-12T10:30:00Z
    lastChapter: 3
    chapterCount: 12
```

維護規則：

- 上限 10
- 依 `lastOpenedAt` desc 排序
- 路徑為主 key（hash 是 path 的 sha 前 12 字）
- 「無法定位」（資料夾消失）的項目**保留**在清單中，UI 灰底顯示，使用者主動處理（移除 / 重新指定）
- `lastChapter` 由 Spec 003 GET chapter 時更新
- `chapterCount`、`title` 在每次開啟時更新（從專案資料夾掃 + 讀 project.yaml）

## 路徑不存在的處理

當「最近開啟」清單中的項目對應路徑已被刪 / 移走：

1. UI 不在 first render 時去 stat 每個路徑（避免 N 次 fs 訪問）
2. 使用者點該項時才 stat → 失敗
3. 顯示對話框：「找不到此專案。路徑：<path>。選擇：移除此項 / 重新指定路徑 / 取消」
4. 「重新指定路徑」→ Tauri fs dialog → POST `/recent/relocate`

## Tauri fs dialog 整合

「瀏覽資料夾」按鈕：

```ts
import { dialog } from "@tauri-apps/api";

async function browseForProject() {
  const path = await dialog.open({
    directory: true,
    multiple: false,
    title: "選擇小說專案資料夾",
  });
  if (!path || Array.isArray(path)) return;
  
  // 呼叫 apps/api 驗證
  const result = await api.projects.open({ path, source: "browse" });
  // 處理 result（成功進入專案 / 失敗顯示錯誤）
}
```

依 [ADR-0006](../adr/0006-app-packaging.md)：fs dialog 走 Tauri Rust 端原生 API，不用瀏覽器 File System Access API。

## Drive 同步衝突處理

開啟時若 git status 偵測到 dirty（Drive 從另一裝置同步進來變更）：

- `warnings` 加入 `code: "git_dirty"`
- 前端顯示 banner「Drive 同步帶來了未 commit 的變更」+ 「查看 git status 面板」連結（連到 Spec 010 的面板）
- 不阻擋使用者進入專案編輯

## 多視窗 / 多 tab 同專案偵測

依 [Spec 003](./003-edit-chapter-basic.md) 衝突處理 case D，用 BroadcastChannel：

- 視窗 A 開啟「春日記事」時，建一個 BroadcastChannel `novel-writer:project:<hash>`
- 視窗 B 嘗試開啟同專案時，先 BroadcastChannel 廣播
- 收到回應 → 顯示「此專案已在另一視窗開啟」對話框
- 使用者選「強制接管」→ A 視窗收到「被接管」訊息 → A 變唯讀

BroadcastChannel 限同 origin / WebView；Tauri 多視窗下成立。

## 資料模型

新增至 `packages/shared-types/src/project.ts`：

```ts
export interface OpenProjectRequest {
  path: string;
  source: "recent-list" | "browse";
  forceOpen?: boolean;
}

export interface OpenProjectResponse {
  project: ProjectSummary;
  warnings: ProjectOpenWarning[];
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
  // 機器可讀 hint：UI 用以顯示「立即修復」按鈕對應的 action
  fixAction?: {
    type: "init_git" | "create_file";
    params?: Record<string, unknown>;
  };
}
```

## 跨元件協議

```
client（首頁）
  │
  ├─ Render「最近開啟」清單：讀 settings.yaml.recentProjects
  │
  ├─ 點某項 →
  │   POST /api/projects/open { path, source: "recent-list" }
  │     ├─ 200：route to /editor?project=<hash>&chapter=<lastChapter>
  │     ├─ 404 PATH_NOT_FOUND：顯示「無法定位」對話框
  │     └─ 422 ...：顯示對應錯誤
  │
  └─ 點「瀏覽資料夾」→
      Tauri dialog.open → 取 path →
      POST /api/projects/open { path, source: "browse" }
        └─ 同上處理

client（編輯器）
  │
  └─ 進入時 BroadcastChannel 廣播「我開了 <hash>」
     → 收到回應 = 已在另一視窗開啟 → 對話框
```

## 並發

- 同一 hash 的 `POST /open` 走串列（per-project lock，與 spec 010 git 命令同 PQueue）
- 不同專案 OK 並行

## 非功能性

- **效能**：
  - 「最近開啟」清單初次 render < 30ms（純讀 settings.yaml）
  - `POST /open` p95 < 200ms（含 fs stat、yaml parse、git status、chapter count）
- **容量**：清單上限 10；超過 LRU 淘汰
- **安全**：path 必須是絕對路徑且通過 normalize；驗證後才寫入 recentProjects（防 path traversal 寫到別處）
- **跨平台**：path 規則由 Tauri / Node `path.normalize` 處理；Windows 大小寫不敏感、Mac/Linux 敏感的差異要 normalize（用 `realpath` 解 symlink）

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/project.ts` 補 `OpenProjectRequest/Response`、`ProjectOpenWarning`
- [ ] **be-1**: `apps/api/src/services/project-validator.ts` — 驗證流程（步驟 1-6）
- [ ] **be-2**: `apps/api/src/services/project-summary.ts` — 統計 chapterCount、title 等
- [ ] **be-3**: `apps/api/src/services/recent-projects-store.ts` — settings.yaml 中 recentProjects 的 CRUD
- [ ] **be-4**: `apps/api/src/routes/projects-open.ts` — POST `/open`、POST `/recent/remove`、POST `/recent/clear`、POST `/recent/relocate`、POST `/init-git`
- [ ] **be-5**: 整合 Spec 010 git status 檢查
- [ ] **fe-1**: `apps/web/src/features/home/HomePage.tsx`（與「新小說」按鈕並列）
- [ ] **fe-2**: `apps/web/src/features/home/RecentProjectsList.tsx`（卡片式樣）
- [ ] **fe-3**: `apps/web/src/features/home/BrowseFolderButton.tsx`（Tauri dialog 整合）
- [ ] **fe-4**: `apps/web/src/features/home/MissingProjectDialog.tsx`（無法定位處理）
- [ ] **fe-5**: `apps/web/src/lib/broadcast-channel.ts` — 多視窗偵測（與 Spec 003 共用）
- [ ] **fe-6**: Drive 同步 banner 元件（顯示 warnings）
- [ ] **fe-7**: 第一次安裝（清單為空）的 onboarding 提示
- [ ] **qa-1**: cucumber-js step definitions for `008.feature`
- [ ] **qa-2**: 驗證流程 matrix 測試（每個錯誤碼都有對應測試）
- [ ] **qa-3**: 「無法定位 + 重新指定路徑」流程端對端測試
- [ ] **qa-4**: 跨平台 path normalize 測試（Win 大小寫、Mac symlink）

## 變更紀錄

- `2026-05-12`: 初版 Ready
