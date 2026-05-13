# M1-C 章節編輯器設計文件

> 日期：2026-05-13
> 狀態：Approved
> 對應 milestone：[M1-writing-skeleton.md](../../architecture/milestones/M1-writing-skeleton.md)
> 對應 specs：[003](../../architecture/specs/003-edit-chapter-basic.md)
> 對應 stories：[004 Undo/Redo](../../requirements/stories/004-undo-redo-chapter.md)、[032 首次警語](../../requirements/stories/032-first-launch-warning.md)
> 子循環：M1-C（M1 第三段，最後一段；M1-A 基礎層 + M1-B 專案生命週期已完成）

## 背景

M1-A 完成 shared-types + settings + git 後端；M1-B 完成建立/開啟專案 + HomePage。M1-C 補齊整個 M1 寫作骨架最後一塊：**章節編輯器**——這是使用者寫小說的主介面，spec 003 標明「M1 最重的部分」。

完成 M1-C 後使用者能跑完整閉環：「**建立專案 → 編一章 → 儲存 → 重開 → 繼續寫**」，可以開始 M2 AI 寫作。

## 範圍

### 本次做

1. **後端**：chapter-fs service、chapter routes（GET/PUT/POST/DELETE/list/rename）、整合 commit-policy
2. **前端 lib**：Dexie database（draft schema）、word-count helper、broadcast-channel placeholder
3. **前端 stores**：editor-store（Zustand）
4. **前端 features**：
   - `editor/ChapterEditor`：CM6 + autosave + Ctrl+S
   - `editor/SaveButton` + 衝突對話框
   - `editor/ChapterList`：左側列表 + 新增章節
   - `editor/TitleInput`：title 編輯 + sanitize hint
   - `editor/EditorStatusIndicator`：🟢🟡🔴 三狀態
   - `editor/ConflictDialog`：case C/E 共用對話框
5. **Story 004**：Undo/Redo（用 CM6 內建 history extension，綁定 Ctrl+Z / Ctrl+Y）
6. **Story 032**：FirstLaunchWarningDialog
7. **路由整合**：`/editor/:hash` 接到真 ChapterEditor，去掉 placeholder

### 不在本次範圍（務實簡化 / 留後續 milestone）

- **fs_watcher（即時 .md 外部變更偵測）** → 簡化為「視窗 focus 時重新 GET mtime」；M0 骨架在 Rust 端，真實 notify 整合留 M3
- **Case D（多 tab/視窗開同章）** → Tauri 桌面應用預設單視窗，本次不實作；BroadcastChannel 留骨架
- **三方 diff UI** → 衝突對話框先提供「覆寫 / 載入外部」兩個動作，diff UI 留 M3
- **status-updater 觸發** → save 後在 commit-policy 結束位置記 log「skipped status-updater (M3)」，不實作 LLM 呼叫
- **章節刪除（DELETE endpoint）** → 在 spec 003 中是完整功能，但 M1-C 先不暴露 UI（後端 endpoint 仍實作以便 spec coverage）
- **長文效能優化（10 萬字章節）** → 基礎 CM6 設定即可，未來 milestone 再 profile

## 目錄結構

```
apps/api/src/
├── routes/
│   └── chapters.ts                    # GET/PUT/POST/DELETE + list + rename
└── services/
    ├── chapter-fs.ts                  # 讀寫 .md、rename、list
    └── chapter-mtime.ts               # mtime 取得 helper

apps/web/src/
├── lib/
│   ├── db.ts                          # Dexie + drafts schema
│   ├── word-count.ts                  # countChars wrapper
│   ├── broadcast-channel.ts           # 多 tab 偵測（骨架）
│   └── window-focus.ts                # focus event listener helper
├── stores/
│   └── editor-store.ts                # Zustand: chapter/draft/state
├── features/
│   ├── editor/
│   │   ├── ChapterEditorPage.tsx      # 整個編輯器頁（含 ChapterList + ChapterEditor）
│   │   ├── ChapterEditor.tsx          # CM6 編輯器主元件
│   │   ├── ChapterList.tsx            # 左側章節列表
│   │   ├── SaveButton.tsx             # 儲存按鈕（Ctrl+S）
│   │   ├── TitleInput.tsx             # 章節標題編輯
│   │   ├── EditorStatusIndicator.tsx  # 🟢🟡🔴 三狀態
│   │   └── ConflictDialog.tsx         # case C/E 共用衝突對話框
│   └── onboarding/
│       └── FirstLaunchWarningDialog.tsx
└── router.tsx                         # /editor/:hash → ChapterEditorPage
```

## 後端

### `chapter-fs.ts`

```ts
export interface ChapterFile {
  number: number;
  title: string;
  path: string;
  content: string;
  mtime: string;
  size: number;
}

export interface ChapterListEntry {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
}

export async function readChapter(
  projectPath: string,
  chapterNumber: number,
): Promise<ChapterFile | null>;

export async function listChapters(projectPath: string): Promise<ChapterListEntry[]>;

export async function createChapter(
  projectPath: string,
  title?: string,
): Promise<ChapterFile>;

export interface SaveChapterParams {
  projectPath: string;
  chapterNumber: number;
  content: string;
  title: string;
  expectedMtime?: string;
}

export type SaveChapterResult =
  | { ok: true; path: string; mtime: string; size: number; renamed: boolean }
  | { ok: false; code: "MTIME_MISMATCH" | "RENAME_CONFLICT" | "INVALID_TITLE"; message: string };

export async function saveChapter(params: SaveChapterParams): Promise<SaveChapterResult>;

export async function renameChapter(
  projectPath: string,
  chapterNumber: number,
  newTitle: string,
): Promise<{ oldPath: string; newPath: string }>;

export async function deleteChapter(
  projectPath: string,
  chapterNumber: number,
): Promise<{ deletedPath: string }>;
```

實作要點：
- 章節檔名格式 `chapter_NNNN_<sanitizedTitle>.md`（M1-A 的 sanitize service 沿用）
- `readChapter` 掃 `chapters/` 找到匹配 `chapter_NNNN_*.md` 的檔案（檔名 title 為事實來源）
- `saveChapter` 比對 `expectedMtime` → 不符回 MTIME_MISMATCH
- title 變更時 atomic write 新檔 + unlink 舊檔
- 字數用 `@novel-writer/shared-types` 的 `countChars()`

### `chapter-mtime.ts`

```ts
export async function getChapterMtime(
  projectPath: string,
  chapterNumber: number,
): Promise<string | null>;
```

從 `fs.stat` 取 ISO 8601。

### Routes

`POST /api/projects/:hash/chapters/` — 新建空章節（自動取下一個 number）
`GET  /api/projects/:hash/chapters/` — 列章節
`GET  /api/projects/:hash/chapters/:n` — 讀章節
`PUT  /api/projects/:hash/chapters/:n` — 儲存（含 rename + git commit）
`POST /api/projects/:hash/chapters/:n/rename` — 只 rename
`DELETE /api/projects/:hash/chapters/:n` — 刪除（M1-C 後端做，UI 不暴露）

PUT 流程：
1. zod 驗證
2. 取 project path（透過 resolveProjectPath）
3. `saveChapter()`
4. 若 success：`commitIfChanged(projectPath, "save-chapter", "<title>")`
5. 回 SaveChapterResponse（含 commitSha）

PUT 結束處加 log：`console.log("M3 placeholder: status-updater not implemented yet")`。

## 前端

### `lib/db.ts`（Dexie）

```ts
import Dexie, { type Table } from "dexie";

export interface DraftRow {
  id: string;                    // `${projectHash}:chapter:${N}:draft`
  projectHash: string;
  chapterNumber: number;
  content: string;
  title: string;
  updatedAt: number;
  baseMtime: string;
}

export class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;

  constructor() {
    super("novel-writer");
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber], updatedAt",
    });
  }
}

export const db = new NovelWriterDB();

export function draftKey(projectHash: string, chapterNumber: number): string {
  return `${projectHash}:chapter:${chapterNumber}:draft`;
}

export async function getDraft(projectHash: string, n: number): Promise<DraftRow | undefined>;
export async function putDraft(row: DraftRow): Promise<void>;
export async function deleteDraft(projectHash: string, n: number): Promise<void>;
```

### `stores/editor-store.ts`（Zustand）

```ts
type EditorState =
  | { kind: "loading" }
  | { kind: "clean" }
  | { kind: "browser-only"; lastAutoSaveAt: number }
  | { kind: "save-error"; reason: string; retryCount: number };

interface ChapterContext {
  number: number;
  title: string;       // editor 上的 title（可能與檔名不同 = pending rename）
  fileTitle: string;   // 檔名上的 title
  baseMtime: string;
  baseContent: string; // 上次 GET 拿到的 .md content
}

interface EditorStore {
  projectHash: string | null;
  chapter: ChapterContext | null;
  state: EditorState;
  charCount: number;

  loadChapter(projectHash: string, n: number): Promise<void>;
  setTitle(title: string): void;
  markDirty(charCount: number, autoSaveAt: number): void;
  markClean(newMtime: string, newContent: string, newFileTitle: string): void;
  markSaveError(reason: string): void;
  reset(): void;
}
```

### `features/editor/ChapterEditor.tsx`（CM6 整合）

CM6 套件需求（加入 apps/web 依賴）：
- `codemirror` ^6
- `@codemirror/state` ^6
- `@codemirror/view` ^6
- `@codemirror/commands` ^6（內建 undo/redo）
- `@codemirror/language` ^6
- `@codemirror/lang-markdown` ^6

實作要點：
- 用 `useRef<EditorView>` 持有 view 實例
- `useEffect` 初始化 EditorView 配置：lineWrapping、markdown、history（undo/redo）、keymap（含 indentWithTab + defaultKeymap + historyKeymap）
- `EditorView.updateListener` 監聽變更 → debounce 1.5s → `db.drafts.put` + `editorStore.markDirty`
- `window.blur` 立即 flush
- `beforeunload` 同步寫一筆（dexie 的 `await` 在 unload 中可能不執行；備用 localStorage backup）
- 切章前 flush（透過 useEffect cleanup）
- 載入流程：依 spec 003 § Case A/B/C/D

### `features/editor/ChapterList.tsx`

左側 sidebar：
- 列出 `GET /api/projects/:hash/chapters/` 回的章節
- 點某章 → `navigate` 到 `/editor/:hash/:chapterNumber`（或 store 切章）
- 「+」新增 → `POST /api/projects/:hash/chapters/` → navigate 到新章
- 每個章節項目顯示 title、wordCount、是否有未存 draft（藍點 indicator）

### `features/editor/SaveButton.tsx`

- Ctrl+S 觸發 + 點擊觸發
- 取 CM6 view 的 content + editorStore.chapter.title + baseMtime
- 若 title 為空 → 自動 prompt「請輸入章節標題」
- PUT 到 server
- 200 → markClean
- 409 MTIME_MISMATCH → 開 ConflictDialog（case E）
- 500 → markSaveError + 自動重試 3 次（1s/2s/4s 退避）

### `features/editor/ConflictDialog.tsx`

共用元件，case C / case E 都用。
- Props：`{ kind: "open" | "save"; localContent; serverContent; onApplyServer; onForceLocal; onCancel }`
- 兩個動作：「載入伺服器版本（捨棄我的編輯）」、「強制儲存我的版本（覆寫伺服器）」
- 不提供 diff（M3 補）

### `features/editor/EditorStatusIndicator.tsx`

讀 editorStore.state 顯示：
- 🟢 已儲存到 .md
- 🟡 編輯中（X 秒前 autosave）
- 🔴 儲存失敗：<reason>

### `features/editor/TitleInput.tsx`

文字 input：
- 即時更新 editorStore.chapter.title
- sanitize hint：若有禁字元，顯示警告「將會自動移除：/ \ : * ? " < > |」
- 失焦或按 Enter 標題若空 → 顯示紅框

### `features/editor/ChapterEditorPage.tsx`

整合三欄：
```
┌────────────┬──────────────────────────────────────────┐
│ ChapterList│ TitleInput  [EditorStatusIndicator] [Save]│
│   ・章 1   ├──────────────────────────────────────────┤
│   ・章 2   │                                          │
│   ・[+]    │     ChapterEditor (CM6)                  │
│            │                                          │
└────────────┴──────────────────────────────────────────┘
```

路由 `/editor/:hash` → 預設載入 lastChapter（從 settings.recentProjects 取）；`/editor/:hash/:n` → 載入第 n 章。

### `features/onboarding/FirstLaunchWarningDialog.tsx`

依 Story 032：
- App 啟動時讀 `AppSettings.meta.firstLaunchWarningAcknowledged`
- false 時顯示警語對話框：
  - 「Novel Writer 是個人本機工具，無雲端帳號，內容儲存在你選的資料夾」
  - 「請定期備份（git push、Drive 同步、外接硬碟等）」
  - 兩個按鈕：「我已了解，不再顯示」（PUT settings 標 true）、「離開應用」（Tauri close window）
  - ESC 鍵與點擊背景**不**關閉（強制 acknowledge）

整合到 `apps/web/src/App.tsx`，包在 RouterProvider 外層。

## fs_watcher 簡化（focus 重檢）

不啟用 Tauri 真實 fs_watcher（M3 補）。改用：

`lib/window-focus.ts`：
```ts
export function useWindowFocusEffect(cb: () => void): void;
```

`ChapterEditor` 內：
```ts
useWindowFocusEffect(() => {
  // 重新 GET mtime；若不符 → 觸發 Case C 處理
});
```

這達成 spec 003 case C 的「使用者離開 app 改完外部檔回來」場景，不需要 Rust 整合。

## status-updater placeholder

`apps/api/src/routes/chapters.ts` 的 PUT handler 結尾：

```ts
// M3 placeholder
console.log(`[status-updater] skipped for chapter ${n} (not implemented yet)`);
```

回應的 `statusUpdateJobId` 永遠是 `null`。

## MSW handlers 擴充

`apps/web/src/mocks/handlers.ts` 加：
- `GET /api/projects/:hash/chapters/` → mockChapterList
- `GET /api/projects/:hash/chapters/:n` → mockChapter
- `PUT /api/projects/:hash/chapters/:n` → mock 200
- `POST /api/projects/:hash/chapters/` → mock 新章

`mocks/fixtures/chapters.ts` 提供範例。

## 資料模型

`packages/shared-types/src/chapter.ts` 已有 Chapter / ChapterSummary / countChars。加：

```ts
export interface ChapterFile extends Chapter {
  path: string;
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

export type SaveChapterErrorCode =
  | "INVALID_TITLE"
  | "MTIME_MISMATCH"
  | "RENAME_CONFLICT"
  | "IO_ERROR";

export interface CreateChapterRequest {
  title?: string;
}

export interface CreateChapterResponse {
  number: number;
  title: string;
  path: string;
}
```

## 測試策略

| 層 | 工具 | 範圍 |
|---|---|---|
| Backend unit | vitest | chapter-fs 各 method（建/讀/儲存/rename/list）、mtime 比對 |
| Backend integration | vitest + tmpdir | chapters routes 全流程 + commit 整合 |
| Frontend unit | vitest + RTL | EditorStatusIndicator、TitleInput sanitize hint、ConflictDialog 按鈕 |
| Frontend store | vitest | editorStore 狀態轉移（loading → clean → browser-only → clean） |
| Frontend integration | vitest + RTL + MSW | ChapterEditorPage 載入、儲存、衝突情境 |
| **E2E** | （留 M2 一起做 Playwright） | — |

CM6 在 jsdom 測試環境有部分限制（contenteditable 行為），所以 ChapterEditor 內部直接互動的測試只測「能 render、能取 view 內容」這類粗粒度；細節留 manual / future E2E。

## 驗收（M1-C / M1 完整 DoD）

依 M1 milestone 的 9 步 walk-through：

```
1. 首次啟動 → 首次警語對話框 → 點「我已了解」→ HomePage
2. 點「新小說」→ 三步表單 → 「建立」→ 進入編輯器（第一章空白）
3. 打字 → 1.5 秒後 EditorStatusIndicator 變 🟡「編輯中」
4. 按 Ctrl+S → 提示「請輸入章節標題」
5. 填標題「梅雨初晴」+ Ctrl+S → 變 🟢「已儲存」；命令列 cat 看到內容
6. terminal git log → 看到 "init: <project>" 與 "chapter: <title>"
7. Ctrl+Z 多次 → 內容回上一個 checkpoint；Ctrl+Y 還原
8. 「+ 新章節」→ 切到第二章 → 編輯 → 切回第一章 → 內容仍在
9. 第一章編一段不存 → 切到第二章 → 切回第一章 → 看到剛編的 draft（IndexedDB）
10. 關閉應用 → 重開 → 不再顯示首次警語 → 最近開啟列表有專案
11. 點專案 → 進入編輯器 → 載入上次最後編輯章節
12. 外部 vim 改 .md → 切回 app → 視窗 focus 觸發 mtime 重檢 → 衝突對話框
```

全綠：
- typecheck / test / lint
- 上述 12 步驗收 walk-through

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| CM6 在 jsdom 測試環境某些 API 不存在 | 元件邏輯外移到 hooks / pure functions；UI 細節依靠手動驗證 + future E2E |
| Dexie schema migration 在未來 milestone 改動 | v1 已就位，未來加 v2 時用 `.upgrade()` 處理 |
| autosave 與切章 race（切章前 flush 沒寫完就讀新章 draft） | 切章流程 await flush → 才讀新章 draft |
| rename 時新檔名衝突造成資料遺失 | 先檢查新檔名存在 → 409 RENAME_CONFLICT 不寫 |
| beforeunload 寫 Dexie 來不及 | 額外用 `navigator.storage.persist()` 提示持久化 + localStorage backup |
| Ctrl+Z 多次後使用者按 Save，存了不想要的內容 | 屬使用者意圖，無需特別處理；commit-policy 已 commit 該版本，使用者可 git revert |
| Tauri WebView 中 IME（中文輸入）跟 CM6 衝突 | CM6 6.x 內建處理；如果遇到問題，加 `EditorView.contentAttributes.of({ inputMode: "text" })` |

## 變更紀錄

- `2026-05-13`: 初版 Approved（M1-C 子循環，含務實簡化 fs_watcher / Case D / diff UI / DELETE UI / status-updater 為後續 milestone）
