# Spec: 開啟既有小說專案

> Story: `docs/requirements/stories/008-open-existing-project.md`
> BDD: `docs/requirements/features/008-open-existing-project.feature`
> Status: `Draft`（M5 微調中，待 PM 簽核轉 Ready）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001、0003、0006（Tauri fs dialog）、0007（git）、0008（前端架構）
> Depends on spec: 009（settings.recentProjects schema）、010（git status 驗證）
> 修訂：`2026-05-15` — M5 微調 TD-2 / TD-3：
> 1. **TD-2**：統一 hash 長度為 **16-char**（取代 M4 既有的 `recent-projects-store=16` vs `project-resolver=8` 不一致），消除「靠巧合運作」的風險
> 2. **TD-3**：路徑 normalize 一致性（`path.normalize` + `path.resolve` 確保 stored path 不因斜線方向重複）
> 3. **Migration**：應用啟動時掃 settings.yaml `recentProjects`，將 8-char hash / 未 normalize path 自動補正並去重

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

## ProjectHash 與 path normalize 規則（M5 修訂；TD-2 / TD-3）

### Hash 規則（M5 統一）

```ts
function hashProjectPath(absolutePath: string): string {
  const normalized = path.normalize(absolutePath);    // 統一斜線方向、解 .. / .
  return sha256(normalized).slice(0, 16);             // M5：統一 16 字（M4 既有兩個版本：8 / 16）
}
```

- **長度：16 字**（提升 collision resistance；M4 的 8-char 在使用者有大量 path 時碰撞風險上升）
- **輸入：normalized path**（先做 `path.normalize`；不做 `realpath` — 避免 symlink 解析造成「使用者改 link target 後 hash 變」）
- **輸入 case-sensitivity**：Windows 視為大小寫不敏感（小寫化 drive letter + 維持其餘）；Mac/Linux 大小寫敏感（不轉）。具體：

```ts
function normalizeForHash(p: string): string {
  const normalized = path.normalize(p);
  if (process.platform === "win32") {
    // 統一 drive letter 為小寫；維持其餘路徑大小寫
    return normalized.replace(/^([A-Z]):/, (_, d) => d.toLowerCase() + ":");
  }
  return normalized;
}
```

- 所有讀寫 hash 的 service（`recent-projects-store`、`project-resolver`、`context-collector` 等）**必須**使用同一個 `hashProjectPath` helper（M5 統一）

### Path 儲存規則（M5）

`recentProjects[i].path` 寫入 settings.yaml 前必做：

```ts
function canonicalizeProjectPath(p: string): string {
  const normalized = path.normalize(p);
  return path.resolve(normalized);            // 處理相對路徑（理論上 Tauri dialog 都回絕對路徑，但 belt-and-suspenders）
}
```

### Migration（應用啟動）

```
on app start:
  read ~/.novel-writer/settings.yaml
  for each entry in recentProjects:
    oldHash = entry.hash
    canonicalPath = canonicalizeProjectPath(entry.path)
    newHash = hashProjectPath(canonicalPath)

    if oldHash !== newHash or canonicalPath !== entry.path:
      mark entry.path = canonicalPath
      mark entry.hash = newHash

  # Dedupe：若多個 entry 有相同 newHash，保留 lastOpenedAt 最新者
  group by hash → keep max(lastOpenedAt)

  write back settings.yaml (atomic)
```

對應症狀：M4 觀察到的「同一專案因 forward/back slash 差異出現兩份 entry」（UX screenshot A1）。Migration 跑一次後自動 dedupe。

### project-resolver 反查（M5）

`POST /api/projects/:projectHash/...` 任何 endpoint 從 hash 反查實際 path：

```ts
function resolveProjectPath(projectHash: string): string {
  const settings = readSettings();
  for (const p of settings.recentProjects) {
    if (hashProjectPath(p.path) === projectHash) return p.path;
  }
  throw PROJECT_NOT_FOUND;
}
```

注意：反查時**重新 hash**（不用 stored `entry.hash`），確保即使 migration 漏跑也能正確比對。

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
- [x] **be-3**: `apps/api/src/services/recent-projects-store.ts` — settings.yaml 中 recentProjects 的 CRUD
- [x] **be-4**: `apps/api/src/routes/projects-open.ts` — POST `/open`、POST `/recent/remove`、POST `/recent/clear`、POST `/recent/relocate`、POST `/init-git`
- [x] **be-5**: 整合 Spec 010 git status 檢查
- [ ] **be-m5-1（TD-2）**: 提取 `apps/api/src/services/project-hash.ts` 為單一 source of truth；recent-projects-store 與 project-resolver 都引用此 helper；既有 8-char `hashProjectPath` 改為 16-char
- [ ] **be-m5-2（TD-3）**: 提取 `canonicalizeProjectPath` helper；recent-projects-store 寫入前一律呼叫
- [ ] **be-m5-3（migration）**: 應用啟動時的 settings.yaml 一次性 migration：補正 hash + dedupe；寫 unit test 驗證 idempotent
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
- `2026-05-15`: M5 微調（待 PM 簽核轉 Ready）：
  - TD-2：統一 hash 長度為 16-char（M4 雙版本 8/16 不一致 → 統一）；提取 `hashProjectPath` 為 single source of truth
  - TD-3：path normalize 一致性（`path.normalize` + drive letter 小寫化於 Windows）；recent-projects-store 寫入前 canonicalize
  - 加 Migration 段：應用啟動時自動補正 hash + dedupe（修 M4 UX 截圖 A1 觀察到的「同一專案重複顯示」問題）
  - 開發任務：be-m5-1 / be-m5-2 / be-m5-3
