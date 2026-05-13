# Spec: 章節編輯器（兩層儲存）

> Story: `docs/requirements/stories/003-edit-chapter-basic.md`
> BDD: `docs/requirements/features/003-edit-chapter-basic.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-12`
> Depends on ADR: 0001（儲存）、0003（技術棧）、0005（CM6）、0006（Tauri fs watcher）、0007（git）、0008（前端架構）
> Depends on spec: 009（settings）、010（git）

## 摘要

章節編輯器是使用者寫小說的主介面。本 spec 規範**兩層儲存**架構與其全部 edge case：

1. **Layer 1 — Browser draft（IndexedDB）**：1.5s debounce autosave；F5 / 切章 / 關 tab 都不掉
2. **Layer 2 — Markdown 主檔（`.md`）**：使用者明示「儲存」按鈕才寫入；觸發 git commit + status-updater

兩層分離的核心收益：使用者隨意打字 / 探索不污染 AI 視野（AI 只讀 `.md`），「儲存」是 commit 心智契約。

含三種衝突情境的完整處理（IndexedDB / .md 不同步、Tauri fs watcher 偵測外部變更、多 tab 開同章）。

## API 合約

所有路徑前綴 `/api/projects/:projectHash/chapters/`。

### GET .../:chapterNumber

讀取章節主檔。

**Response 200:**
```ts
{
  number: number;
  title: string;                 // 從檔名抽取
  path: string;                  // 絕對路徑
  content: string;
  mtime: string;                 // ISO 8601，給衝突偵測用
  size: number;
}
```

**404:** `CHAPTER_NOT_FOUND`

### PUT .../:chapterNumber

儲存章節主檔（從 browser draft → `.md`）。

**Request:**
```ts
{
  content: string;
  title: string;                 // 章節標題（可能與當前不同 → 觸發重命名）
  expectedMtime?: string;        // optional：optimistic concurrency；提供時若 .md 的 mtime 不符回 409
}
```

**Response 200:**
```ts
{
  path: string;                  // 寫入後的路徑（可能因 title 變化而不同）
  mtime: string;
  size: number;
  commitSha: string | null;      // 若內容無變化則 null
  statusUpdateJobId: string | null;  // 若觸發了 status-updater 的 job
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_TITLE` | title 為空、含禁字元 |
| 409 | `MTIME_MISMATCH` | expectedMtime 與實際 .md mtime 不符（外部修改了 .md） |
| 409 | `RENAME_CONFLICT` | 新標題對應的檔名已存在（與另一章衝突） |
| 500 | `IO_ERROR` |

### POST .../:chapterNumber/rename

只重命名不改內容（用於使用者只改標題的場景）。

**Request:** `{ title: string }`
**Response 200:** `{ oldPath: string; newPath: string; commitSha: string }`

### DELETE .../:chapterNumber

刪除章節。

**Request:** `{ confirmed: true }`
**Response 200:** `{ commitSha: string }`

刪除主檔 + 對應 `_prompt.md`（若存在）+ IndexedDB 對應 draft + git commit。

### GET .../

列出該專案所有章節（給「章節列表」用）。

**Response:**
```ts
{
  chapters: Array<{
    number: number;
    title: string;
    path: string;
    wordCount: number;
    mtime: string;
    hasPromptFile: boolean;      // 是否有對應 _prompt.md（採用過的章節有）
    hasBrowserDraft: boolean;    // IndexedDB 中有未存草稿（前端側查詢，但 server 也提供 hint）
  }>;
}
```

### POST .../

新建空章節（章節列表「+」按鈕）。

**Request:** `{ title?: string }`（預設「未命名」）
**Response 201:**
```ts
{
  number: number;                // 自動 = max(existing) + 1
  title: string;
  path: string;
}
```

## Browser draft（IndexedDB）

依 [ADR-0008](../adr/0008-frontend-architecture.md) 用 **Dexie**。

### Schema（Dexie v1）

```ts
// apps/web/src/lib/db.ts

interface DraftRow {
  id: string;                    // primary key：`<projectHash>:chapter:<N>:draft`
  projectHash: string;
  chapterNumber: number;
  content: string;
  title: string;                 // 編輯器中的標題（可能與檔名上的不同 = 重命名 pending）
  updatedAt: number;             // epoch ms
  baseMtime: string;             // 上次讀取 .md 時的 mtime（給衝突偵測用）
  baseSha256?: string;           // 上次讀取 .md 內容的 sha256（補助比對）
}

class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;

  constructor() {
    super("novel-writer");
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber], updatedAt",
    });
  }
}

export const db = new NovelWriterDB();
```

### Autosave 觸發

CM6 `EditorView.updateListener` → debounce 1.5s → `db.drafts.put(...)`。

額外 flush 點：
- `window.blur` → 立即 flush
- 切換章節（store 變更）→ 立即 flush
- `beforeunload` → 同步寫（Dexie 支援 `.write(...)` 在 unload 期完成；保險起見 `localStorage` 也寫一份 backup）

**寫 IndexedDB 不觸發 git / 不觸發 status-updater**。

### 編輯器三狀態

```ts
type EditorState =
  | { state: "clean" }                                    // browser 與 .md 一致
  | { state: "browser-only"; lastAutoSaveAt: number }     // 有 dirty draft
  | { state: "save-error"; reason: string; retryCount: number };
```

對應 UI 角落 indicator：

- 🟢 `已儲存到 .md`
- 🟡 `編輯中（已 autosave 到 browser，<N> 秒前）`
- 🔴 `儲存失敗：<reason>，重試中…`

## 開啟章節流程

```
使用者點章節列表 ── 切換 ──▶
                            │
                            ▼
                  flush 前章 dirty draft 到 IndexedDB（不寫 .md）
                            │
                            ▼
                  GET /api/.../chapters/:N ──▶ 取主檔 content 與 mtime
                            │
                            ▼
                  db.drafts.get(`<hash>:chapter:<N>:draft`) ──▶ 取本機 draft
                            │
                            ├─ Case A: 沒 draft
                            │   ↓
                            │   載入 .md content；state = "clean"
                            │
                            ├─ Case B: 有 draft，draft.content === .md.content
                            │   ↓
                            │   載入 .md content；刪掉 draft（清理）；state = "clean"
                            │
                            ├─ Case C: 有 draft，draft.baseMtime === .md.mtime（draft 比 .md 新；正常情境）
                            │   ↓
                            │   載入 draft.content；state = "browser-only"
                            │   toast「這是上次未存入 .md 的草稿，按儲存才會寫入檔案」
                            │
                            └─ Case D: 有 draft，draft.baseMtime !== .md.mtime（外部修改了 .md）
                                ↓
                                顯示對話框「外部變更已載入：
                                   - 套用 .md（捨棄 browser 草稿）
                                   - 保留 browser 草稿（覆寫 .md 風險自負）
                                   - 開三方 diff（與 .md 比對）」
                                依使用者選擇處理
```

## 儲存流程（「儲存」按鈕）

```
使用者按「儲存」/Ctrl+S
  │
  ▼
1. 從 CM6 view 取當前 content + title
  │
  ▼
2. 比對 IndexedDB draft 與當前 .md content
   若無變化 → state = "clean"；不送 PUT；toast「無變更」
  │
  ▼
3. 送 PUT .../chapters/:N { content, title, expectedMtime: draft.baseMtime }
  │
  ├─ 200：
  │    ├─ 寫主檔 atomic（apps/api 端用 .tmp + fsync + rename）
  │    ├─ 若 title 變了：rename 檔案
  │    ├─ git commit「chapter: save chapter <N> <title>」
  │    ├─ status-updater 觸發（依 Spec 007）
  │    └─ 刪除 IndexedDB draft（已同步到 .md）
  │    回前端：path、新 mtime、commitSha、statusUpdateJobId
  │    前端：state = "clean"；toast「已儲存」
  │
  ├─ 409 MTIME_MISMATCH：
  │    .md 在我儲存前被外部改了
  │    顯示對話框：「外部變更與我的編輯衝突。請選擇：
  │       - 覆寫外部變更（強制儲存）
  │       - 載入外部變更（捨棄我的編輯）
  │       - 三方 diff」
  │
  └─ 500 IO_ERROR：
       state = "save-error"；自動重試 3 次（指數退避 1s / 2s / 4s）
       仍失敗 → 紅色 banner + 手動「重試」按鈕
       browser draft 保留（不刪）
```

## Title 重命名流程

當 `PUT` request 中的 `title` 與當前檔名上的 title 不同：

1. 計算新檔名 `chapter_<NNNN>_<sanitizedTitle>.md`
2. 若新檔名已存在 → 409 `RENAME_CONFLICT`
3. 否則：
   - 寫新檔（atomic）
   - unlink 舊檔
   - 若有對應 `chapter_<NNNN>_prompt.md` 也 rename
   - git add（含新舊檔）+ commit「chapter: save chapter <N> <title>」（rename + content 合在同一 commit）

title 的 sanitize 規則同 spec 001 的 slug 規則。

## 衝突處理三種情境（完整 matrix）

| Case | 觸發 | 處理 |
|---|---|---|
| **A. IndexedDB draft 與 .md 同步** | 開啟章節 / 切回章節 | 載入 .md；清理 draft |
| **B. IndexedDB draft 比 .md 新（正常）** | 開啟章節 | 載入 draft；提示使用者按「儲存」才會寫 .md |
| **C. .md 被外部修改（git pull / 直接 vim / Drive 同步）** | Tauri fs watcher → IPC event → 前端 invalidate | 對話框讓使用者選：套用外部 / 保留 browser / diff |
| **D. 兩 tab 開同章** | BroadcastChannel | 後開的 tab 顯示「另一 tab 正在編輯」+ 唯讀 banner；可選「強制接管」 |
| **E. 儲存時 mtime 衝突** | PUT 回 409 | 對話框讓使用者選：覆寫 / 載入外部 / diff |

### Tauri fs watcher 整合

Tauri Rust 端用 `notify` watch 專案目錄；偵測到 `.md` 變更後發 `fs-change` event。

前端 listen：

```ts
import { listen } from "@tauri-apps/api/event";

listen<{ path: string; kind: "modify" | "create" | "delete" }>("fs-change", e => {
  if (isCurrentChapter(e.payload.path) && !isAppSelfWriting()) {
    // Case C 處理
  }
});
```

`isAppSelfWriting()`：app 寫 .md 前後設一個 flag（200ms 內的 fs-change 視為自己的）；簡單但夠用。

### 多 tab 偵測（BroadcastChannel）

```ts
const channel = new BroadcastChannel(`novel-writer:${projectHash}:chapter:${N}`);
channel.postMessage({ type: "opened", tabId: TAB_ID });
channel.onmessage = (e) => {
  if (e.data.type === "opened" && e.data.tabId !== TAB_ID) {
    showReadOnlyBanner();
  }
};
```

BroadcastChannel 限同 origin / 同 WebView；Tauri 單視窗下天然成立。

## 資料模型

新增至 `packages/shared-types/src/chapter.ts`：

```ts
export interface ChapterContent {
  number: number;
  title: string;
  path: string;
  content: string;
  mtime: string;
  size: number;
}

export interface ChapterListItem {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
  hasBrowserDraft: boolean;
}

export interface SaveChapterRequest {
  content: string;
  title: string;
  expectedMtime?: string;
}

export interface SaveChapterResponse {
  path: string;
  mtime: string;
  size: number;
  commitSha: string | null;
  statusUpdateJobId: string | null;
}
```

## Word count

`wordCount` 透過 `text.replace(/\s/g, '').length`（中文字數）+ 純空白 token 計算（西文）。helper 在 `packages/shared-types/src/text-count.ts`。

## 章節列表的「最近編輯」記憶

由 settings.yaml 中的 `recentProjects[i].lastChapter` 維護：

- 每次 GET .../:chapterNumber → settings-store 更新該專案的 `lastChapter`
- Story 008 開啟專案時讀此欄位決定預設章節

## 跨元件協議

```
編輯器（前端 CM6 + Zustand editor-store）
  │
  ├─ 開啟章節：useChapterQuery → GET → 比對 IndexedDB → 載入 CM6
  ├─ 編輯：CM6 → updateListener → 1.5s debounce → db.drafts.put
  ├─ blur / 切章：立即 flush
  ├─ 儲存：取 view 內容 + title → PUT → 處理 200/409/500
  │
  ▼
apps/api
  ├─ GET → 讀 .md → 回 content + mtime
  ├─ PUT →
  │   ├─ zod 驗證
  │   ├─ 對照 expectedMtime（若提供）
  │   ├─ title sanitize
  │   ├─ 計算目標路徑
  │   ├─ 若 rename：取舊路徑、檢查衝突
  │   ├─ atomic write 新檔
  │   ├─ unlink 舊檔（若 rename）
  │   ├─ commitIfChanged（Spec 010）
  │   ├─ enqueue status-updater job（Spec 007）
  │   └─ 回 response
  │
  ▼
status-updater job 背景跑（Spec 007）
git commit 紀錄（Spec 010）
```

## 並發

- 同一 `(projectHash, chapterNumber)` 的 PUT 走 server 側互斥（用 file lock 或 PQueue per file）
- 不同章節並行 OK
- IndexedDB 的 Dexie 內部已處理併發

## 非功能性

- **效能**：
  - 開啟章節 p95 < 100ms（包含 IndexedDB 查詢 + 檔案讀）
  - PUT 儲存 p95 < 300ms（含 git commit）
  - autosave 寫 IndexedDB p95 < 20ms
- **容量**：
  - 單章 .md 上限 200 KB（軟限制；超過 UI 警告）
  - IndexedDB 配額預設 ~50 MB（每章 draft 通常 < 50 KB，可容納數百章）
- **安全**：路徑必須在 `<project>/chapters/` 下；title sanitize 防 path traversal
- **可用性**：browser draft 保證「F5 / crash / 切 tab 都不掉」
- **跨平台**：行尾統一存 LF（與 git 友善）；讀取時容忍 CRLF
- **長文編輯效能**：CM6 對 10 萬字章節仍順；vite-plugin-react 編譯後 bundle 對長文無感

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/chapter.ts`、`text-count.ts`
- [ ] **be-1**: `apps/api/src/services/chapter-fs.ts` — 讀寫 .md、title sanitize、rename 流程、檔案掃描列表
- [ ] **be-2**: `apps/api/src/services/chapter-mtime.ts` — mtime 取得與比對 helper
- [ ] **be-3**: `apps/api/src/routes/chapters.ts` — GET / PUT / POST / DELETE / list / rename endpoint
- [ ] **be-4**: 整合 Spec 010 commit-policy
- [ ] **be-5**: 整合 Spec 007 status-updater 觸發
- [ ] **be-6**: Tauri Rust fs watcher 設定（依 ADR-0006）
- [ ] **fe-1**: `apps/web/src/lib/db.ts` — Dexie database + migration
- [ ] **fe-2**: `apps/web/src/stores/editor-store.ts` — Zustand store（view ref、currentChapter、dirtyState）
- [ ] **fe-3**: `apps/web/src/features/editor/ChapterEditor.tsx` — CM6 整合 + autosave 鉤子
- [ ] **fe-4**: `apps/web/src/features/editor/SaveButton.tsx` — 儲存邏輯 + 衝突對話框
- [ ] **fe-5**: `apps/web/src/features/editor/ChapterList.tsx` — 列表 + 切換 + 新增
- [ ] **fe-6**: `apps/web/src/features/editor/TitleInput.tsx` — 標題編輯 + sanitize hint
- [ ] **fe-7**: `apps/web/src/features/editor/ConflictDialog.tsx` — 三種衝突情境的對話框
- [ ] **fe-8**: `apps/web/src/lib/tauri-fs-watcher.ts` — listen Tauri event → invalidate
- [ ] **fe-9**: `apps/web/src/lib/broadcast-channel.ts` — 多 tab 偵測
- [ ] **fe-10**: `apps/web/src/lib/word-count.ts` 即時字數顯示
- [ ] **fe-11**: 鍵盤快捷鍵 Ctrl+S → SaveButton
- [ ] **qa-1**: cucumber-js step definitions for `003.feature`
- [ ] **qa-2**: 衝突情境 matrix 端對端測試（A/B/C/D/E 每個都跑）
- [ ] **qa-3**: autosave 節流測試（debounce / flush 時機）
- [ ] **qa-4**: F5 / crash recovery 測試（用 Playwright 模擬 reload）
- [ ] **qa-5**: rename 流程的檔案 / git commit 完整性測試

## 變更紀錄

- `2026-05-12`: 初版 Ready
