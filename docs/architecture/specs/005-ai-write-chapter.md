# Spec: AI 撰寫單章（chapter-writer，兩階段 build-prompt + generate）

> Story: `docs/requirements/stories/005-ai-write-chapter.md`
> BDD: `docs/requirements/features/005-ai-write-chapter.feature`
> Status: `Draft`（M5 修訂中，待 PM 簽核轉 Ready）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001（儲存）、0002（命名）、0003（技術棧）、0004（LLM adapter）
> Depends on spec: 003（chapter front-matter）、009（routing.systemPromptOverride / temperature）
> 修訂：`2026-05-15` — M4 review 確認 generate 流程需重構為「兩階段」，使用者對 AI 看到的 prompt 完全透明可控：
> 1. 新增 `POST .../build-prompt` endpoint（純函式，不呼叫 LLM）
> 2. `POST .../generate` 介面變更：**接受使用者編輯過的 promptText**（不再 server 端自動 build）
> 3. ContextCollector 介面變更：accept `participantSlugs: string[]`（取代既有「outline 列表 / 全選」邏輯）
> 4. PromptSnapshot 補 `participants` / `outline` / `requirements`（採用時記入 `chapter_<NNNN>_prompt.md`）
> 5. 與 Spec 003 chapter front-matter 串接

## 摘要

當使用者在章節編輯器點「AI 撰寫本章」時，分兩階段：

1. **build-prompt 階段**（純函式）：server 蒐集本章上下文（synopsis / status / 選定角色卡 / outline / requirements / 前章內容），組成完整 prompt 並回給前端 — **不呼叫 LLM**。前端把 promptText 顯示給使用者編輯。
2. **generate 階段**（SSE 串流）：前端把（可能編輯過的）promptText 送回 server；server 直接以該 prompt 呼叫 LLM，SSE 串流草稿。

產出與「實際送出的 prompt」（不是 server 自動 build 的版本）寫到本機 cache；採用（Spec 006）時，使用者編輯過的 prompt 寫進 `chapter_<NNNN>_prompt.md` 累積。

`participants` 從 Spec 003 chapter front-matter 讀；context-collector 只蒐集列表中的角色 — **取代** M3/M4 既有的「outline 列表 / 全選」邏輯（substring matching 在多次測試中不穩）。

## API 合約

### POST /api/projects/:projectHash/chapters/:chapterNumber/build-prompt（M5 新增）

純函式：蒐集 context + 拼接 prompt + 回完整文字，**不呼叫 LLM**。

**Auth:** `none`（127.0.0.1）

**Request:**
```ts
{
  participantSlugs: string[];       // 本章參與角色 slugs（必填，可空陣列 = 不帶角色卡）
  outline?: string | null;          // 本章劇情大綱（為 null/undefined = 不在 prompt 中加此段）
  requirements?: string | null;     // 本章寫作需求
  modelOverride?: string;           // 本章覆寫 settings.routing.primary
  temperatureOverride?: number;     // 本章覆寫 settings.routing.temperature（0.0–2.0）
  systemPromptOverrideForChapter?: string;  // 本章覆寫 system prompt，疊加在 settings 的覆寫之後
  userIntent?: string;              // 額外短指示（M4 既有，保留）
}
```

**Response 200:**
```ts
{
  promptText: string;               // 完整 prompt（system + user 段合併，使用 markdown 分隔符）— 給使用者編輯
  systemPrompt: string;             // 純 system 段（debug/preview）
  userPrompt: string;               // 純 user 段（debug/preview）
  contextHash: string;              // 對應 ChapterContext.contextHash
  estimatedTokens: number;          // js-tiktoken 估算
  modelId: string;                  // 解析後實際會用的 model id
  participants: Array<{
    slug: string;
    name: string;
    matched: boolean;               // false = 該 slug 在 characters/ 下沒找到對應檔（前端顯示警告）
  }>;
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `MISSING_CONTEXT` | synopsis 為空 |
| 400 | `INVALID_CHAPTER` | chapterNumber 不存在 |
| 400 | `INVALID_PARTICIPANT` | participantSlugs 中至少有一個對應檔不存在；錯誤中含「找不到的 slug 列表」 |
| 400 | `CONTEXT_TOO_LARGE` | 估算 tokens > model.contextWindow * 0.75 |
| 400 | `ROUTING_NOT_CONFIGURED` | chapter-writer routing 未設定 |
| 404 | `PROJECT_NOT_FOUND` |

**注意**：此 endpoint **無副作用**（不寫檔、不呼 LLM、不動 frontmatter）。等同「dry-run preview」。前端可呼叫多次（例：使用者改參數後重 build）。

### POST /api/projects/:projectHash/chapters/:chapterNumber/generate（M5 介面變更）

**Auth:** `none`（apps/api 監聽 127.0.0.1）

**Path:**
- `projectHash` — 由 client 從 project path 計算（sha256 前 16 字，依 Spec 008 M5 修訂），server 透過 `~/.novel-writer/settings.yaml` 的 `recentProjects` 反查實際路徑
- `chapterNumber` — 1-based

**Request（M5 變更）：**
```ts
{
  promptText: string;               // M5 必填：使用者編輯過的 prompt（從 build-prompt 來，可能改過）
  modelOverride?: string;           // optional
  temperatureOverride?: number;     // optional
  contextHash: string;              // M5 必填：對應 build-prompt 的 contextHash；Spec 006 採用時驗證 staleness 用
  // M5：以下三欄記錄當次 generate 的「真實參數」，存進 PromptSnapshot（不重新跑 build-prompt 邏輯）
  participants: string[];
  outline: string | null;
  requirements: string | null;
}
```

**M5 移除欄位**：`agentName`（永遠 chapter-writer，不需傳）、`userIntent`（已併入 prompt build 階段）。

**未升級的 client 走舊 request 介面（不傳 promptText）→ server 回 400 `LEGACY_REQUEST_NOT_SUPPORTED`** — 應用未發佈，不做 BC。

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
  characters: CharacterCardInContext[];  // 由 participantSlugs 決定（M5），不再「全選 / outline 推斷」
  participantSlugs: string[];            // M5：原始輸入（用以驗證 + PromptSnapshot 記錄）
  currentOutline: string | null;         // M5：來自 chapter front-matter `outline` 或 build-prompt request 的 outline
  currentRequirements: string | null;    // M5 新增：本章寫作需求
  previousChapterFullText: string | null;
  contextHash: string;                   // sha256 of all of the above（含 participantSlugs / currentOutline / currentRequirements）
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

**「該章相關角色」的選取（M5 改）**：

從 M5 起，relevant character 列表來自呼叫端傳入的 `participantSlugs`（由 Spec 003 chapter front-matter 持久化、UI 角色挑選器決定）：

```ts
function collectContext(projectHash, chapterNumber, participantSlugs: string[], ...) {
  // ...
  const characters = participantSlugs.map(slug => {
    const card = readCharacterCard(slug);
    if (!card) throw INVALID_PARTICIPANT(slug);
    return buildCharacterCardInContext(card, chapterNumber);
  });
  // ...
}
```

- 空陣列 → 不帶任何角色卡（適用第一章 / 純氛圍敘述）
- 失敗 slug → 立即 400 `INVALID_PARTICIPANT`（讓使用者修正 UI 選取，不靜默 fallback）

**取代**：M3/M4 既有「outline 列表 / 全選 / substring matching」邏輯被**移除**。原因：substring matching 在多次 BDD 測試中不穩；參與角色由使用者明確勾選更可控。

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
  // M5：systemPrompt / userPrompt 為「實際送出 LLM 的版本」— 可能是 build-prompt 自動產的，也可能是使用者編輯後的
  systemPrompt: string;
  userPrompt: string;
  // M5：原始 build-prompt 自動產出版本（給「對比使用者編輯了什麼」用，與 systemPrompt/userPrompt 可能不同）
  autoGeneratedPromptText: string;
  userEdited: boolean;           // M5：promptText 是否被使用者編輯（autoGeneratedPromptText !== final promptText）
  context: {
    synopsisHash: string;
    storyStatusHash: string;
    characterStatusHashes: Record<string, string>;
    characterHashes: Record<string, string>;
    outlineHash: string | null;
    requirementsHash: string | null;    // M5 新增
    previousChapterFullTextHash: string | null;
    currentAppearanceHashes: Record<string, string>;
  };
  // M5：原始參數（給 chapter_<NNNN>_prompt.md 渲染與 audit 用）
  participants: string[];
  outline: string | null;
  requirements: string | null;
  temperature: number | null;
  systemPromptOverrideForChapter: string | null;
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

## 兩階段 Generate 流程（M5）

```
階段 1 — build-prompt（純函式）
─────────────────────────────────────────────────────────────
使用者按「生成本章」
  │
  ▼ (前端讀 chapter front-matter 與 UI 寫作參數)
POST .../build-prompt {
  participantSlugs, outline, requirements,
  modelOverride, temperatureOverride, systemPromptOverrideForChapter, userIntent
}
  │
  ▼
apps/api:
  - collectContext(...)  → ChapterContext（不寫 cache）
  - prompt-library.buildChapterWriterPrompt(context) → {systemPrompt, userPrompt}
  - 拼合為 promptText（markdown 分隔）
  - 估算 tokens
  - 200 回傳

前端：
  - 顯示 PromptPreviewModal（textarea，可編輯）
  - 顯示 estimatedTokens / modelId / participants 警告（matched=false 者）

階段 2 — generate（SSE 串流）
─────────────────────────────────────────────────────────────
使用者按「送出」（在 PromptPreviewModal 中）
  │
  ▼
POST .../generate {
  promptText: <可能編輯過>,
  modelOverride, temperatureOverride,
  contextHash, participants, outline, requirements
}
  │
  ▼
apps/api:
  - 從 promptText 切回 systemPrompt / userPrompt（用標準分隔符）
  - upsert draft (running) 到 cache
  - LLMRouter.stream(req, policy with systemPromptOverrideForChapter)
  - SSE 串流（既有邏輯）
  - completed 後：寫 current.prompt.json（含 PromptSnapshot.userEdited 標記）
```

### 「重產」與「丟棄」的互動

- **丟棄**：DELETE draft（既有）。回到「尚未生成」狀態，UI 保留 participantSlugs / outline / requirements / promptText 編輯（使用者可微調再 build-prompt）
- **重產**：相當於「丟棄 + 再次 build-prompt」。UI 把使用者剛剛編輯的 promptText 帶回 modal（或 re-build 後比對讓使用者選），由使用者決定要不要保留之前的編輯

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

## Shared UI components reference（M5 Round 2）

本 spec 涉及的 UI（PromptPreviewModal、generate 進度、錯誤呈現）使用 spec 002 canonical 定義的共用元件：

| 元件 / 慣例 | 使用點 |
|---|---|
| `<ExpandableTextarea>` | PromptPreviewModal 內 promptText 編輯區（讓使用者編輯 build-prompt 結果） |
| `<Spinner>` | generate 首 chunk 等待（1~3s 行內 spinner）；build-prompt 計算（< 200ms 不顯示）|
| Error 三層 | inline：`INVALID_PARTICIPANT`（角色挑選器旁紅字）；toast：generate 串流中斷後可重試；modal：`MISSING_CONTEXT` / `CONTEXT_TOO_LARGE` / `ROUTING_NOT_CONFIGURED`（含「前往設定頁」連結） |

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
- [x] **be-2**: `apps/api/src/services/context-collector.ts` — 蒐集 + token 估算 + 守門
- [x] **be-3**: `apps/api/src/services/draft-cache.ts` — 草稿 cache 讀寫
- [x] **be-4**: `apps/api/src/services/job-queue.ts` — 每專案 FIFO queue
- [x] **be-5**: `apps/api/src/routes/generate.ts` — `POST /generate` SSE handler（M5：介面變更，接受 promptText）
- [x] **be-6**: `apps/api/src/routes/draft.ts` — `GET /draft`、`DELETE /draft`
- [ ] **be-7**: 整合 LLMRouter 降級事件（`event: degraded`）
- [ ] **be-m5-1**: context-collector 介面變更：accept `participantSlugs` 取代 substring matching；INVALID_PARTICIPANT 錯誤碼
- [ ] **be-m5-2**: `apps/api/src/routes/build-prompt.ts` 新 endpoint（純函式）
- [ ] **be-m5-3**: prompt-library 補 `buildChapterWriterPrompt(context, params)` 輸出 systemPrompt + userPrompt（與 standard separator）
- [ ] **be-m5-4**: `apps/api/src/routes/generate.ts` 改：必填 `promptText` + `contextHash` + `participants` 等；移除 `agentName` / `userIntent`
- [ ] **be-m5-5**: PromptSnapshot 補欄位（autoGeneratedPromptText / userEdited / participants / outline / requirements / temperature / systemPromptOverrideForChapter）
- [ ] **be-m5-6**: 整合 Spec 009 systemPromptOverride 注入邏輯（settings + 本章覆寫兩段疊加）
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
- `2026-05-15`: M5 修訂（待 PM 簽核轉 Ready）— 兩階段 Generate：
  - 新增 `POST .../build-prompt`（純函式，不呼叫 LLM）
  - `POST .../generate` 介面變更：接受使用者編輯過的 promptText；移除 `agentName` / `userIntent`（併入 build-prompt）；應用未發佈，不做 BC
  - ContextCollector：relevant character 從 `participantSlugs` 決定（取代 substring matching / outline 列表）
  - ChapterContext 補 `participantSlugs` / `currentOutline`（取代 currentOutline 同名語意，現在來源是 chapter front-matter） / `currentRequirements`
  - PromptSnapshot 補 `autoGeneratedPromptText` / `userEdited` / `participants` / `outline` / `requirements` / `temperature` / `systemPromptOverrideForChapter`
  - 開放問題（「相關角色」選取）已關閉 — 由使用者明示 participants 決定
  - 新增 error code：`INVALID_PARTICIPANT` / `LEGACY_REQUEST_NOT_SUPPORTED`
- `2026-05-15`（晚）: M5 PM Round 2 修訂：
  - 引用 spec 002 共用元件規格（ExpandableTextarea / Spinner / Error 三層）
  - 各 error code 分類到 UX-6 三層呈現規則
