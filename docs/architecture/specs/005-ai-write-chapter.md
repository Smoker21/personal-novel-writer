# Spec: AI 撰寫單章（chapter-writer）

> Story: `docs/requirements/stories/005-ai-write-chapter.md`
> BDD: `docs/requirements/features/005-ai-write-chapter.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-10`
> Depends on ADR: 0001（儲存）、0002（命名）、0003（技術棧）、0004（LLM adapter）

## 摘要

當使用者在章節編輯器點「AI 撰寫本章」時，server 蒐集本章上下文（synopsis / status / 角色卡 / outline / 前章摘要），透過 `LLMRouter` 呼叫 `chapter-writer` Agent，以 SSE 串流產出，client 收到後逐字顯示在草稿面板。產出與生成提示詞快照寫到 **本機 cache**（`~/.novel-writer/cache/<project>/drafts/`），**不直接寫到 Drive 同步的專案資料夾**——草稿是會被丟棄的中間產物，僅當 Story 006 採用時才寫入專案。

## API 合約

### POST /api/projects/:projectHash/chapters/:chapterNumber/generate

**Auth:** `none`（apps/api 監聽 127.0.0.1）

**Path:**
- `projectHash` — 由 client 從 project path 計算（sha256 前 12 字），server 透過 `~/.novel-writer/settings.yaml` 的 `recentProjects` 反查實際路徑。**不**直接接受路徑作為 URL 參數，避免 path traversal 與 URL 過長
- `chapterNumber` — 1-based

**Request:**
```ts
{
  agentName: "chapter-writer";  // 預留：未來可能有不同寫手 Agent
  modelOverride?: string;       // optional：覆寫預設的 routing.primary
  userIntent?: string;          // optional：使用者額外指示（短）
}
```

**Response:** SSE stream（`Content-Type: text/event-stream`）

事件序列：

```
event: started
data: {"draftId":"<uuid>","model":"anthropic:claude-sonnet-4-6","contextHash":"<sha256-12>"}

event: chunk
data: {"text":"她推開..."}

event: chunk
data: {"text":"書店木門時，"}

... (重複多次)

event: usage
data: {"inputTokens":2310,"outputTokens":1842}

event: complete
data: {"draftId":"<uuid>","totalChars":1842,"durationMs":47000}
```

中止：client 關閉 SSE 連線；server 端 `AbortController.abort()` 通知 LLM provider，已 partial 的草稿**保留在 cache**（使用者下次回該章可選擇接續）。

降級：若 primary 模型在 **尚未有任何 chunk 流出前**失敗，依 [ADR-0004](../adr/0004-llm-adapter.md) 規則切 fallback，發 `event: degraded` 事件後重新串流。已有 chunk 流出時不降級，發 `event: error` 後結束。

**錯誤事件：**

```
event: error
data: {"code":"<LLMErrorCode>","message":"...","retryable":true}
```

對應 HTTP status：建立 SSE 連線本身永遠 200；錯誤透過事件回報。連線前的驗證錯誤（context 不足）走標準 4xx：

| Status | Code | When |
|--------|------|------|
| 400 | `MISSING_CONTEXT` | synopsis.md 為空、無任何角色、outline 缺 |
| 400 | `INVALID_CHAPTER` | chapterNumber 該專案不存在 |
| 404 | `PROJECT_NOT_FOUND` | projectHash 不在 recentProjects |
| 409 | `DRAFT_IN_PROGRESS` | 該章已有正在跑的 generate；要求 client 先中止 |

### GET /api/projects/:projectHash/chapters/:chapterNumber/draft

讀取已存在的 draft（用於使用者**重開應用後恢復**草稿；對應 Story 005「串流期間切章 → 自動保留草稿」）。

**Response 200:**
```ts
{
  draftId: string;
  text: string;             // 完整草稿文字（可能是 partial）
  status: "complete" | "aborted" | "errored";
  contextHash: string;      // 產出時的上下文 hash，採用時記入 prompt.md
  createdAt: string;
  totalChars: number;
}
```

**Response 404:** `NO_DRAFT`

### DELETE /api/projects/:projectHash/chapters/:chapterNumber/draft

丟棄草稿（對應 Scenario「丟棄」按鈕）。

## 上下文蒐集

server 端的 `ContextCollector`（`apps/api/src/services/context-collector.ts`）：

```ts
interface ChapterContext {
  synopsis: string;
  writingStyle: string;                  // <project>/style.md 完整內容；不存在或空時為空字串
  storyStatus: string;
  characterStatuses: Record<string, string>;  // 一人一檔（依 Story 007 修訂）：slug → <slug>_status.md 內容
  characters: CharacterCardInContext[];  // 含 currentAppearance（依 Spec 002b 2026-05-13）
  currentOutline: string | null;
  previousChapterFullText: string | null; // 依 Story 005 修訂：上一章完整內容（不再 200 字摘要）
  contextHash: string;                   // sha256 of all of the above（含 currentAppearance、writingStyle）
}

interface CharacterCardInContext {
  slug: string;
  name: string;
  fields: CharacterFields;               // 完整 frontmatter（含 personality / culturalBackground / dialogue 等）
  body: string;                          // characters/<slug>.md 的連貫敘述段

  /**
   * 依當前章節 N 解出的「該章該角色外貌」：
   *   1. 若 fields.appearanceByChapter[K] 存在且 K ≤ N，取最大的 K
   *   2. 否則拼接 fields 中扁平外貌欄位（hairAndColor / eyes / bodyType / otherFeatures / clothing）
   *
   * chapter-writer 看到的「該角色當前長相」就是這個欄位。
   * 注意：角色 portrait 圖片**不直接餵給 chapter-writer**（純文字 Agent）；
   * vision 圖僅供 character-image-extractor 解析後寫進 appearanceByChapter / 扁平欄位。
   */
  currentAppearance: string;
}
```

`lookupAppearance` 實作（依 [Spec 002b](./002b-character-card-from-image.md) 規範）：

```ts
function lookupAppearance(fields: CharacterFields, currentChapter: number): string {
  const chapters = Object.keys(fields.appearanceByChapter)
    .map(Number).filter(n => n <= currentChapter).sort((a, b) => b - a);
  if (chapters.length > 0) return fields.appearanceByChapter[chapters[0]];
  return [
    fields.hairAndColor, fields.eyes, fields.bodyType, fields.otherFeatures,
    fields.clothing && `服裝：${fields.clothing}`,
  ].filter(Boolean).join("\n");
}
```

蒐集規則（與 story 005「上下文蒐集規則」表對齊）：

| 欄位 | 是否必填 | 大小限制 | 缺失行為 |
|------|---------|---------|---------|
| synopsis | 是 | 完整 | 400 `MISSING_CONTEXT` |
| storyStatus | 否 | 完整 | 視為空字串 |
| characterStatus | 否 | 完整 | 視為空字串 |
| characters | 是（≥1） | 全選或子集（見下） | 400 `MISSING_CONTEXT` |
| currentOutline | 否 | 完整 | 視為 null（提示詞中告知 LLM「無 outline，自由發揮但需符合 status」） |
| previousChapterFullText | 否 | 上一章完整內容（依 Story 005 修訂） | 第一章為 null |
| characters[i].currentAppearance | 是（每個 character） | 依 lookupAppearance 解出 | 完全沒外貌欄位時用 placeholder「（無外貌描述）」 |

**「該章相關角色」的選取**（Story 005 開放問題）：

1. 若 outline 中有 `## 角色` section 列出，則僅取列表中的
2. 否則取**全部**角色卡（保守）
3. 未來 Story 020 可改為從章節摘要做向量檢索動態挑選——介面預留 `characters` 欄位即可

**Context window 守門**：

蒐集完先估算 token（用 `js-tiktoken` cl100k_base 粗估）。若超過 model 的 `contextWindow * 0.75`：

1. 嘗試把 `characters` 從全選縮為「前 5 名按 outline 排序」
2. 若仍超 → 把 `previousChapterFullText` 改取末尾 1000 字
3. 若仍超 → 回 400 `CONTEXT_TOO_LARGE`，前端引導使用者到狀態 / 角色卡精簡

## 資料模型

新增至 `packages/shared-types/src/llm.ts`：

```ts
export interface DraftMetadata {
  draftId: string;
  projectHash: string;
  chapterNumber: number;
  chapterTitle: string;          // 產出當下的章節標題
  agentName: "chapter-writer";
  modelId: string;               // 實際使用的（含降級後的）
  contextHash: string;
  status: "running" | "complete" | "aborted" | "errored";
  createdAt: string;
  completedAt?: string;
  totalChars: number;
  usage?: { inputTokens: number; outputTokens: number };
  errorCode?: string;
  errorMessage?: string;
}

export interface PromptSnapshot {
  agentName: string;
  agentVersion: string;          // 從 docs/agents/<name>.md frontmatter 讀
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  context: {
    synopsisHash: string;
    storyStatusHash: string;
    characterStatusHash: string;
    characterHashes: Record<string, string>;
    outlineHash: string | null;
    previousChapterFullTextHash: string | null;
    currentAppearanceHashes: Record<string, string>;  // slug → sha256(currentAppearance)；2026-05-13 加
  };
  generatedAt: string;
  durationMs: number;
}
```

## 本機 Cache 佈局

```
~/.novel-writer/cache/<projectHash>/
├── drafts/
│   └── chapter-<NNNN>/
│       ├── current.draft.md         # 當前 draft 文字（追加寫入）
│       ├── current.meta.json        # DraftMetadata
│       └── current.prompt.json      # PromptSnapshot
└── index.db                         # SQLite
```

**為什麼 draft 是檔案不是 SQLite blob**：串流追加寫入用檔案 `appendFileSync` 比 DB UPDATE 簡單得多；採用時直接 read 整檔；丟棄時 unlink。SQLite 用來記 metadata 索引（誰是當前 draft、何時建立、status），方便日後做「最近草稿清單」之類的功能。

```sql
CREATE TABLE drafts (
  draft_id TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  status TEXT NOT NULL,           -- running | complete | aborted | errored
  model_id TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  total_chars INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX idx_drafts_project_chapter ON drafts(project_hash, chapter_number);
```

每章同時間最多 1 個 `status='running'` draft（透過 `JobQueue` per-project 保證）。

## 跨元件協議

```
client                 apps/api                  ContextCollector  LLMRouter   Cache
  │                       │                            │              │          │
  │ POST .../generate ───▶│                            │              │          │
  │                       │── collect ────────────────▶│              │          │
  │                       │◀─ ChapterContext ──────────│              │          │
  │                       │                            │              │          │
  │                       │── upsert draft (running)──────────────────────────────▶│
  │                       │                            │              │          │
  │                       │── stream(req, policy) ───────────────────▶│          │
  │                       │                            │              │          │
  │ event: started ◀──────│                            │              │          │
  │                       │                            │              │          │
  │ event: chunk ◀────────│◀── StreamChunk text ──────────────────────│          │
  │                       │── append to current.draft.md ──────────────────────▶│
  │ event: chunk ◀────────│◀── StreamChunk text ──────────────────────│          │
  │                       │── append ──────────────────────────────────────────▶│
  │ ... (loop)            │                            │              │          │
  │                       │◀── StreamChunk usage ─────────────────────│          │
  │ event: usage ◀────────│                            │              │          │
  │                       │◀── StreamChunk finish ────────────────────│          │
  │                       │── update draft (complete) ──────────────────────────▶│
  │                       │── write current.prompt.json ──────────────────────▶│
  │ event: complete ◀─────│                            │              │          │
```

**並發**：

- 每個 `(projectHash, chapterNumber)` 同時只允許一個 `running` draft
- 第二個 generate 請求若見到既有 running，回 409 `DRAFT_IN_PROGRESS`，要求 client 先 DELETE 或等完成

**Abort 路徑**：

- client 關閉 SSE → Hono 偵測 `req.signal` aborted → server 端 abort `LLMRouter.stream()` → provider 收到 abort → 已 partial 內容仍寫入 cache、status 設 `aborted`

## LLM adapter 合約

- 觸發的產品內 Agent：`docs/agents/chapter-writer.md`（待 ai-agent-designer 撰寫，TBD）
- 上層需提供的上下文：見「上下文蒐集」段
- 串流：是（強制）
- Routing policy：從 `settings.yaml.defaults.routing` 讀，`request.modelOverride` 可覆寫 `primary`
- 失敗處置：依 ADR-0004 降級規則
- 不在此層做提示詞拼接——交給 `packages/prompt-library/prompts/chapter-writer.ts`

## 非功能性

- **效能**：context 蒐集 < 200ms（純檔案 I/O，幾百 KB）；end-to-end 第一個 chunk 出現 < 3s（TTFT 主要受 LLM provider 影響）
- **容量**：單篇 draft 上限 100 KB（約 5 萬中文字，遠超合理章節長度）；超過時 server 強制中止並標 `errored`
- **安全**：apps/api bind 127.0.0.1；request body 上限 64 KiB（user intent 短）
- **可用性**：純本機；LLM 雲端網路斷線時走地端 fallback
- **資源**：cache 自動清理：completed 草稿保留 30 天或被採用 / 丟棄；aborted / errored 保留 7 天

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/llm.ts` — DraftMetadata、PromptSnapshot、ChapterContext
- [ ] **types**: `packages/shared-types/src/sse.ts` — SSE event union types（client / server 共用）
- [ ] **adapter-1**: `packages/llm-adapter/` — `LLMProvider` interface 與 `LLMRouter` 骨架（依 ADR-0004）
- [ ] **adapter-2**: `packages/llm-adapter/src/providers/anthropic.ts` — first concrete provider（其他延後）
- [ ] **adapter-3**: `packages/llm-adapter/src/providers/ollama.ts` — first local provider（fallback 路徑）
- [ ] **prompts**: `packages/prompt-library/prompts/chapter-writer.ts` — system + user prompt 模板（讀 `docs/agents/chapter-writer.md` 的 frontmatter version）
- [ ] **be-1**: `apps/api/src/services/project-resolver.ts` — projectHash → 實際路徑反查（讀 settings.yaml）
- [ ] **be-2**: `apps/api/src/services/context-collector.ts` — 蒐集 + token 估算 + 守門（→ Scenario 2）
- [ ] **be-3**: `apps/api/src/services/draft-cache.ts` — 草稿 cache 讀寫（檔案 + SQLite metadata）
- [ ] **be-4**: `apps/api/src/services/job-queue.ts` — 每專案 FIFO queue（依 ADR-0003）
- [ ] **be-5**: `apps/api/src/routes/generate.ts` — `POST /generate` SSE handler（→ Scenario 1, 3, 7）
- [ ] **be-6**: `apps/api/src/routes/draft.ts` — `GET /draft`、`DELETE /draft`（→ Scenario 4）
- [ ] **be-7**: 整合 LLMRouter 降級事件（`event: degraded`）
- [ ] **fe-1**: `apps/web/src/lib/sse-client.ts` — `EventSource` 包裝 + 中止
- [ ] **fe-2**: 草稿面板元件（並排或分頁顯示）
- [ ] **fe-3**: 「AI 撰寫本章」按鈕 + 串流期間 disable 主編輯區（→ Scenario 1, 6）
- [ ] **fe-4**: 中止 / 採用 / 丟棄 / 重產出 四按鈕（採用部分由 spec 006 處理）（→ Scenario 3, 4, 5）
- [ ] **fe-5**: 應用啟動時恢復 in-progress / aborted 草稿（GET /draft）
- [ ] **qa-1**: cucumber-js step definitions for `005.feature`，後端用 supertest + 模擬 LLMProvider
- [ ] **qa-2**: 模擬 LLMProvider（fixture：產出固定文字、可注入錯誤）
- [ ] **qa-3**: golden test：餵固定 context，斷言 chapter-writer 的提示詞輸入哈希穩定（不依賴模型輸出）

## 變更紀錄

- `2026-05-10`: 初版 Ready
- `2026-05-13`: ChapterContext 對齊 Story 005/007 修訂版 + Spec 002b 升 MVP：
  - 加 `writingStyle: string`（讀 `<project>/style.md`；依 style.md 邊界規則）
  - `characterStatus: string` → `characterStatuses: Record<slug, string>`（一人一檔，對齊 Spec 007）
  - `previousChapterSummary` → `previousChapterFullText`（完整內容，對齊 Story 005）
  - `characters: CharacterCard[]` → `characters: CharacterCardInContext[]`（含 `currentAppearance` 動態 lookup，依 Spec 002b 升 MVP）
  - PromptSnapshot.context 加 `writingStyleHash` / `characterStatusHashes` / `currentAppearanceHashes` / `previousChapterFullTextHash`
