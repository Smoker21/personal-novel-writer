# Spec: 章節編輯器（兩層儲存 + AI 寫作工作台）

> Story: `docs/requirements/stories/003-edit-chapter-basic.md`
> BDD: `docs/requirements/features/003-edit-chapter-basic.feature`
> Status: `Ready`（PM 於 2026-05-15 拍板核准 M5 Round 3）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001（儲存）、0003（技術棧）、0005（CM6）、0006（Tauri fs watcher）、0007（git）、0008（前端架構）
> Depends on spec: 005（AI 撰寫 + build-prompt）、007（status-updater）、009（settings，含 systemPromptOverride / temperature）、010（git）
> 修訂：`2026-05-15` — M4 review 發現「無法使用」（BUG-A 修後仍只有空殼），M5 重新設計編輯器主介面為「AI 寫作工作台」：
> 1. 上下文預覽面板（前章 / story_status / 各參與角色 character_status）
> 2. 寫作參數 inline 編輯（本章覆寫 model / temperature / system prompt）
> 3. 本章劇情大綱 + 本章寫作需求（給 AI 的輸入，持久化於 chapter front-matter）
> 4. 本章角色挑選器（portrait grid，可多選；預設帶入上一章選定）
> 5. Generate 流程改造：build-prompt → user 編輯 prompt → 送出生 LLM
> 6. ChapterPromptHistory：採用後寫入該章歷次採用的 prompt 全文
> 7. chapter front-matter 新增 `participants: string[]` / `outline: string` / `requirements: string`

## 摘要

章節編輯器是使用者寫小說的主介面。本 spec 規範三件事：

1. **兩層儲存架構**（Layer 1 IndexedDB autosave + Layer 2 `.md` 明示儲存），含三種衝突情境的完整處理
2. **「AI 寫作工作台」UI**（M5 新增）：上下文預覽 + 寫作參數 + 大綱/需求 + 角色挑選器 + 兩階段 Generate
3. **chapter front-matter schema**：含 `participants`、`outline`、`requirements`，跨開關章節保留

兩層分離的核心收益：使用者隨意打字 / 探索不污染 AI 視野（AI 只讀 `.md`），「儲存」是 commit 心智契約。

兩階段 Generate（先 build-prompt → user 編輯 → submit）的核心收益：使用者對「AI 看到什麼」完全透明可控；不滿意 prompt 可不啟動 LLM 直接重新調整參數。

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
  content: string;               // 不含 frontmatter 的純正文
  mtime: string;                 // ISO 8601，給衝突偵測用
  size: number;

  // M5 新增：chapter front-matter（缺失欄位以預設值回應，便於前端統一處理）
  participants: string[];        // 缺失 → []
  outline: string | null;        // 缺失 → null
  requirements: string | null;
  hasFrontmatter: boolean;       // 偵測舊章節是否有 frontmatter（舊章節 = false；前端 UI 可顯示「未設定大綱」hint）
}
```

**404:** `CHAPTER_NOT_FOUND`

### PUT .../:chapterNumber

儲存章節主檔（從 browser draft → `.md`）。

**Request:**
```ts
{
  content: string;               // 純正文（不含 frontmatter；server 端負責拼接）
  title: string;                 // 章節標題（可能與當前不同 → 觸發重命名）
  expectedMtime?: string;        // optional：optimistic concurrency；提供時若 .md 的 mtime 不符回 409

  // M5 新增：chapter front-matter 欄位（與 PUT /generate 的 build-prompt 輸入同源）
  participants?: string[];       // 本章參與角色 slugs；不傳 = 不動既有 frontmatter；傳 [] = 清空
  outline?: string | null;       // 本章劇情大綱；null = 清空欄位；undefined = 不動
  requirements?: string | null;  // 本章寫作需求；同上
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
  participants: string[];        // M5：echo back 寫入後的 frontmatter（給 UI 同步用）
  outline: string | null;
  requirements: string | null;
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

## 章節 front-matter（M5 新增）

從 M5 起，章節 `.md` 檔可有 optional YAML frontmatter：

```markdown
---
participants:
  - 春雨
  - 明哲
outline: |
  春雨在圖書館找到明哲，請他協助查詢《梅雨草稿》借閱歷史。
  明哲在館藏系統發現該書曾被列為「待處理」，留下伏筆。
requirements: |
  約 1500 字。第三人稱有限視角（以春雨為主）。
  保留書卷氣的文藝風格；不要過度推進感情線。
---

春雨輕輕將那份無名詩稿推到明哲面前……
```

### Schema

| 欄位 | 型別 | 預設 | 用途 |
|---|---|---|---|
| `participants` | `string[]`（slugs） | `[]` | 本章參與角色 — Spec 005 context-collector 與 Spec 007 status-updater 都讀此欄位；只有列出的角色卡 + status 會塞進 prompt |
| `outline` | `string \| null` | `null` | 本章劇情大綱 — Spec 005 build-prompt 注入到 user prompt 的「本章劇情指引」段 |
| `requirements` | `string \| null` | `null` | 本章寫作需求 — Spec 005 build-prompt 注入到 user prompt 的「本章寫作需求」段 |

未來可加更多欄位（如 POV、wordCountTarget），向前相容（多餘欄位讀取時保留、不報錯）。

### Parser 規則

- 用 `yaml` 套件（eemeli/yaml）解析；frontmatter 由 `---\n` 開頭與 `\n---\n` 結尾界定（與 Hugo / Jekyll 慣例一致）
- 解析失敗 → 視為**無 frontmatter**（fail-open，保護現有純文字章節）+ log warning
- 寫入時：若三個欄位都是預設值（`[]` / `null` / `null`），**不**寫 frontmatter（保持檔案乾淨）；任何一個欄位非預設 → 寫完整 frontmatter（含三個欄位）
- 欄位順序固定：`participants` → `outline` → `requirements`（便於 git diff 觀察）
- 行尾統一 LF；frontmatter 與正文間以單一空行分隔

### Migration / 向前相容

- 舊章節（無 frontmatter）：GET 時 server 端解析回 `participants: []`、`outline: null`、`requirements: null`、`hasFrontmatter: false`
- 首次 PUT 攜帶任一新欄位 → server 寫入 frontmatter；`hasFrontmatter` 之後為 true
- **不**做自動偵測（不從正文 substring matching 推斷 participants，避免錯誤判斷）
- 使用者在編輯器手動勾選角色 + 填寫大綱 + 按儲存 → 開始持久化

### participants 欄位的下游讀者

| 讀者 | 用途 |
|---|---|
| Spec 005 `build-prompt` / `context-collector` | 只把 `participants` 中列出的角色卡 + character_status 塞進 prompt |
| Spec 005 `generate` 的 PromptSnapshot | 記錄當次採用的 participants（保留審計痕跡） |
| Spec 007 status-updater | 只更新 `participants` 中列出的角色的 `<slug>_status.md`；不再用 substring matching |
| Spec 006 adopt | 採用後將 build-prompt 階段的 participants 寫進主檔 frontmatter（採用流程同步持久化） |
| 章節編輯器 UI | 開啟章節時：UI 角色挑選器預選 `participants`；空時預選「上一章 participants」 |

## 章節編輯器 UI（M5 新增）

章節編輯器頁面（`ChapterEditorPage`）的版面從 M4 的「左清單 + CM6 編輯區」擴充為「AI 寫作工作台」：

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← 首頁  |  章節 7 ▸ 春雨的探訪  | [儲存] [歷史] [角色] [⚙ 設定]      │
├──────────┬──────────────────────────────────────────────────────────┤
│ 章節清單 │ ┌──── 上下文預覽（折疊面板）───────────────────────────┐ │
│ ──────── │ │ ▸ 前一章：第 6 章「圖書館的詩稿」 …………………… 1500 字 │ │
│ 1 …      │ │ ▸ story_status 摘要 ……………………………… 800 字       │ │
│ 2 …      │ │ ▸ 春雨_status   ……………………………… 350 字           │ │
│ 3 …      │ │ ▸ 明哲_status   ……………………………… 280 字           │ │
│ 4 …      │ └──────────────────────────────────────────────────────┘ │
│ 5 …      │ ┌──── 寫作參數 (inline) ─────────────────────────────┐  │
│ 6 …      │ │ Model:  [google:gemini-2.5-flash ▼] (從 routing 拉)│  │
│ 7 ●(目前)│ │ Temp:   [1.0 ▢▢▢▢▢▢▢▢▢]                            │  │
│ + 新章節 │ │ System prompt 本章覆寫:                            │  │
│          │ │ [(空 → 用 settings)                            ]   │  │
│          │ └────────────────────────────────────────────────────┘  │
│          │ ┌──── 本章劇情大綱 ─────────────────────────────────┐   │
│          │ │ [春雨在圖書館找到明哲，請他協助查詢……         ]   │   │
│          │ └─────────────────────────────────────────────────────┘ │
│          │ ┌──── 本章寫作需求 ─────────────────────────────────┐   │
│          │ │ [約 1500 字。第三人稱有限視角……                 ]   │   │
│          │ └─────────────────────────────────────────────────────┘ │
│          │ ┌──── 本章角色 (portrait grid，可多選) ────────────┐   │
│          │ │ [▣春雨] [▣明哲] [□林清風] [□蘇晴] … [+ 加角色]    │   │
│          │ └─────────────────────────────────────────────────────┘ │
│          │ ┌──── [▶ 生成本章] [⛢ 重產] [✕ 丟棄草稿] ─────────┐    │
│          │ │ (尚未生成 / 草稿產生中 / 完成時切按鈕)            │    │
│          │ └─────────────────────────────────────────────────────┘ │
│          │ ┌──── 章節主檔 (CM6) ─────────────────────────────┐   │
│          │ │  [使用者編輯正文 .md]                            │   │
│          │ │  …                                              │   │
│          │ └─────────────────────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────────────────────┘
```

### 1. 上下文預覽面板（read-only）

| 區段 | 內容來源 | 缺失時 |
|---|---|---|
| 前一章 | `chapters/chapter_<N-1>_*.md` 的正文（不含 frontmatter） | 第一章 → 顯示「（本章為第一章）」 |
| story_status 摘要 | `status/story_status.md` 完整內容 | 顯示「（尚無 story_status，第一章採用後生成）」 |
| 各參與角色 character_status | `participants` 中每個 slug 對應的 `characters/<slug>_status.md` | 該角色 status 不存在 → 顯示「（尚無 status；新角色）」 |

UI 為摺疊面板（accordion），預設摺疊。展開時顯示前 200 字摘要 + 「展開全部」按鈕。

- 來源變更（外部修改）：透過 Spec 003 既有的 Tauri fs watcher 通知 → 前端重新拉取
- 不可編輯 — 唯讀預覽

### 2. 寫作參數 inline 編輯

| 欄位 | 預設來源 | 覆寫範圍 | UI 元件 |
|---|---|---|---|
| Model | settings.agents.chapter-writer.routing.primary | 本章 build-prompt + generate 期間生效，不寫進 chapter front-matter（每次重新展開預設拉 settings） | 兩段下拉（provider → model）|
| Temperature | settings.agents.chapter-writer.routing.temperature | 同上；空白 = null = 用 settings | number input + slider |
| System prompt 本章覆寫 | （無） | 與 settings.systemPromptOverride 兩階段 concat（settings 先、本章後）；空白 = 不疊加 | [`<ExpandableTextarea>`](./_components/expandable-textarea.md) |

「本章覆寫」是 ephemeral state — 切章 / reload 後消失。原因：使用者在嘗試不同寫法時不應污染 chapter front-matter；要持久化請改 settings。

### 3. 本章劇情大綱（持久化）

- 用 [`<ExpandableTextarea>`](./_components/expandable-textarea.md) 共用元件 — inline 多行 + 右上 `⛶` 切 modal 全螢幕
- 寫入 `outline` frontmatter 欄位（PUT chapter）
- placeholder grey text：`例：春雨在圖書館找到明哲，請他協助查詢《梅雨草稿》借閱歷史。明哲在館藏系統發現該書曾被列為「待處理」，留下伏筆。`

### 4. 本章寫作需求（持久化）

- 用 [`<ExpandableTextarea>`](./_components/expandable-textarea.md) 共用元件
- 寫入 `requirements` frontmatter 欄位
- placeholder grey text：`例：約 1500 字。第三人稱有限視角（以春雨為主）。保留書卷氣的文藝風格；不要過度推進感情線。`

### 5. 本章角色挑選器（portrait grid）

- 顯示所有角色卡為 portrait grid（reuse Spec 002 M5 修訂的 grid）
- 預設選取：
  - 若 chapter frontmatter `participants` 非空 → 用該值
  - 否則：上一章的 `participants`（若有）
  - 否則：空
- 使用者可加入 / 移除
- **只有選定角色**的 character.md + character_status.md 會塞進 prompt
- 寫入 `participants` frontmatter 欄位（PUT chapter）
- 角色卡尚未建立時，UI 顯示「+ 新建角色」按鈕（連到 Spec 002 角色編輯器）

### 6. 兩階段 Generate 流程

詳見 Spec 005「兩階段 Generate」段。簡述：

```
使用者按「生成本章」
  │
  ▼
POST /api/projects/:hash/chapters/:n/build-prompt
   { participantSlugs, outline, requirements, modelOverride, temperatureOverride, systemPromptOverrideForChapter }
  │
  ▼ response 200 { promptText, contextHash, estimatedTokens, ... }
  │
  ▼
顯示完整 prompt 在 modal 或 side panel → 使用者可編輯
  │
  ▼ 使用者按「送出」
  │
  ▼
POST /api/projects/:hash/chapters/:n/generate
   { promptText, modelOverride, temperatureOverride, contextHash }
  │
  ▼ SSE stream (same as M4)
  │
  ▼
草稿產生 → 採用 / 重產 / 退回
```

「重產」= 回到 build-prompt 階段（保留先前的參數值，使用者可再次調整）。**PM Round 1 Q3=A 拍板（2026-05-15）：取此方案，不採「直接重送同 promptText」**。原因：每次 generate 都讓使用者明確確認 prompt，避免一鍵 re-roll 在不知不覺中消耗 LLM 額度且結果不可預期。

「退回」= 丟棄 draft（DELETE draft），不影響 frontmatter。

「採用」= 既有 Spec 006 流程；採用後 prompt 寫入 `chapter_<NNNN>_prompt.md`（即 ChapterPromptHistory，見下節）。

> **採用前置 dirty draft 確認**：當前編輯器頁面在使用者點「採用」時觸發確認 modal — 行為定義正本見 [Spec 006 §「採用前置：dirty browser draft 確認」](./006-adopt-chapter-draft.md#採用前置dirty-browser-draft-確認m5-pm-round-2--ux-7)。本 spec 只描述「驗證點仍在編輯器頁面」，不重複正本 modal 文案。

### 7. ChapterPromptHistory（沿用既有 `chapter_<NNNN>_prompt.md`）

> **設計決策（M5）**：M5 handover 提到「ChapterPromptHistory.md」是新檔案，但 Spec 006 既有的 `chapter_<NNNN>_prompt.md` 已經是「採用後累積的 prompt 歷史」。M5 **不**新增第二個檔案，而是**形式化** `_prompt.md` 的語意為「prompt history」。

- 路徑：`chapters/chapter_<NNNN>_prompt.md`（檔名與 Spec 006 一致，不變）
- 內容：每次採用（Spec 006）追加一個段落，含：
  - 時間戳
  - 模型 ID
  - 完整 prompt（使用者編輯過的，從 build-prompt + user edit 的最終版本）
  - contextHash
  - adopt-marker（HTML 註解，供 unadopt 定位 — Spec 006 既有）
- 採用流程（Spec 006）已實作 append + marker 邏輯；M5 只改 PromptSnapshot 內容為「使用者編輯過的 promptText」而非「server 自動 build 的版本」
- Chapter 刪除時，`_prompt.md` 一併刪除（既有規則不變）

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

  // M5 新增：frontmatter dirty 狀態（與 content 一起 autosave，使用者切章不掉）
  participants?: string[];
  outline?: string | null;
  requirements?: string | null;
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
export interface ChapterFrontMatter {
  participants: string[];        // 角色 slugs
  outline: string | null;
  requirements: string | null;
}

export interface ChapterContent {
  number: number;
  title: string;
  path: string;
  content: string;               // 不含 frontmatter
  mtime: string;
  size: number;
  participants: string[];        // M5
  outline: string | null;        // M5
  requirements: string | null;   // M5
  hasFrontmatter: boolean;       // M5
}

export interface ChapterListItem {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
  hasBrowserDraft: boolean;
  participants: string[];        // M5：列表 view 也回傳，給「角色挑選器預選上一章」使用
}

export interface SaveChapterRequest {
  content: string;
  title: string;
  expectedMtime?: string;
  participants?: string[];       // M5：undefined = 不動；[] = 清空
  outline?: string | null;       // M5
  requirements?: string | null;  // M5
}

export interface SaveChapterResponse {
  path: string;
  mtime: string;
  size: number;
  commitSha: string | null;
  statusUpdateJobId: string | null;
  participants: string[];        // M5
  outline: string | null;        // M5
  requirements: string | null;   // M5
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

### 既有（M3/M4）
- [x] **types**: `packages/shared-types/src/chapter.ts`、`text-count.ts`
- [x] **be-1**: `apps/api/src/services/chapter-fs.ts` — 讀寫 .md、title sanitize、rename 流程、檔案掃描列表
- [x] **be-2**: `apps/api/src/services/chapter-mtime.ts` — mtime 取得與比對 helper
- [x] **be-3**: `apps/api/src/routes/chapters.ts` — GET / PUT / POST / DELETE / list / rename endpoint
- [x] **be-4**: 整合 Spec 010 commit-policy
- [x] **be-5**: 整合 Spec 007 status-updater 觸發
- [ ] **be-6**: Tauri Rust fs watcher 設定（依 ADR-0006）
- [x] **fe-1**: `apps/web/src/lib/db.ts` — Dexie database + migration
- [x] **fe-2**: `apps/web/src/stores/editor-store.ts`
- [x] **fe-3**: `apps/web/src/features/editor/ChapterEditor.tsx`
- [x] **fe-4**: `apps/web/src/features/editor/SaveButton.tsx`
- [x] **fe-5**: `apps/web/src/features/editor/ChapterList.tsx`
- [x] **fe-6**: `apps/web/src/features/editor/TitleInput.tsx`
- [ ] **fe-7**: `apps/web/src/features/editor/ConflictDialog.tsx`
- [ ] **fe-8**: `apps/web/src/lib/tauri-fs-watcher.ts`
- [ ] **fe-9**: `apps/web/src/lib/broadcast-channel.ts`
- [x] **fe-10**: `apps/web/src/lib/word-count.ts`
- [x] **fe-11**: 鍵盤快捷鍵 Ctrl+S

### M5 新增

- [ ] **types-m5**: chapter.ts 補 `ChapterFrontMatter` / `participants` / `outline` / `requirements`；DraftRow 補三欄
- [ ] **be-m5-1**: `apps/api/src/services/chapter-fs.ts` 補 frontmatter parse / serialize（用 `yaml` 套件）；fail-open 保護舊章節；寫入時若三欄都預設則不寫 frontmatter
- [ ] **be-m5-2**: chapter-fs 提供 `listChaptersWithFrontmatter()`（給「上一章 participants」UI 用）
- [ ] **be-m5-3**: chapter-fs 整合：GET / PUT 補 frontmatter 三欄（schema 已在 API 段）
- [ ] **be-m5-4**: Dexie migration v2：DraftRow 補三欄（向前相容，舊 row missing → 預設值）
- [ ] **fe-m5-1**: `apps/web/src/features/editor/ContextPreviewPanel.tsx`（上下文預覽 — 前章 / story_status / character_status）
- [ ] **fe-m5-2**: `apps/web/src/features/editor/WritingParamsBar.tsx`（model / temperature / system prompt 本章覆寫）
- [ ] **fe-m5-3**: `apps/web/src/features/editor/OutlineInput.tsx` + `RequirementsInput.tsx`（textarea + autosave）
- [ ] **fe-m5-4**: `apps/web/src/features/editor/ParticipantPicker.tsx`（reuse Spec 002 M5 portrait grid 為內嵌挑選器）
- [ ] **fe-m5-5**: `apps/web/src/features/editor/PromptPreviewModal.tsx`（兩階段 generate 的 prompt 編輯介面）
- [ ] **fe-m5-6**: editor-store 補三欄 state + autosave 邏輯
- [ ] **qa-m5-1**: cucumber-js step defs for `003.feature` M5 新 scenarios
- [ ] **qa-m5-2**: frontmatter parser 單元測試（含 fail-open、舊章節向前相容）
- [ ] **qa-m5-3**: build-prompt → user edit → generate 端對端測試（mock LLM）
- [ ] **qa-m5-4**: participants 變更觸發 status-updater 「只更新所列角色」測試（連動 Spec 007）

## 變更紀錄

- `2026-05-12`: 初版 Ready
- `2026-05-15`: M5 修訂（待 PM 簽核轉 Ready）：
  - 章節編輯器 UI 重新設計為「AI 寫作工作台」（6 個面板）
  - chapter front-matter 新增 `participants` / `outline` / `requirements`（YAML frontmatter，向前相容）
  - GET / PUT chapter API 補三欄；ChapterContent / SaveChapterRequest / SaveChapterResponse 對應補欄位
  - 兩階段 Generate（build-prompt → user 編輯 → submit）取代既有單階段 generate；詳見 Spec 005
  - ChapterPromptHistory：沿用 Spec 006 既有 `chapter_<NNNN>_prompt.md`（形式化為「採用後 prompt 累積歷史」，不開新檔）
  - DraftRow 補 frontmatter 三欄 autosave（切章不掉）
  - 開發任務拆解：標記 M3/M4 既有任務 + 列 M5 新任務
- `2026-05-15`（晚）: M5 PM Round 2 修訂：
  - Q3=A 拍板：「重產」回 build-prompt 階段（取消 OPEN）
  - UX-7：採用前若有 dirty browser draft → modal 三選一確認
  - UX-1：「本章劇情大綱」/「本章寫作需求」/「system prompt 本章覆寫」改用 `<ExpandableTextarea>` 共用元件（spec 002 canonical 定義）
  - placeholder sample data 補上
