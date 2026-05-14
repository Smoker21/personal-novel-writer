# Spec: 採用後更新故事與人物狀態（status-updater）

> Story: `docs/requirements/stories/007-update-story-character-status.md`
> BDD: `docs/requirements/features/007-update-story-character-status.feature`
> Status: `Draft`（M5 微調中，待 PM 簽核轉 Ready）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001、0003、0004
> Depends on spec: 003（chapter front-matter `participants`）、006
> 修訂：`2026-05-15` — M5 微調：
> 1. **TD-1**：新增 `POST /api/projects/:hash/status/write` endpoint（直接寫檔，取代 M4 「複製內容」）
> 2. **與 Spec 003 串接**：「相關角色」篩選改用 chapter front-matter `participants`，取代 substring matching

## 摘要

在以下三個觸發點呼叫 `status-updater` Skill，把最新章節內容轉化為更新的 status 檔，讓下一輪 `chapter-writer` 能「記得」前面章節發生的事。

這是 **AI 記憶機制的閉環**：spec 005 讀 status → spec 006 觸發本 spec → 本 spec 寫回 status → 下一輪 spec 005 又讀新 status。

> **2026-05-13 對齊修訂（依 2026-05-12 架構決策）**：
> - 移除 JobQueue / 背景 worker / jobs SQLite table — 改為 **stateless 直接呼叫**
> - 移除 token 上限邏輯 — 長度管控改由前端「AI 精簡」按鈕（status-shortener Skill）負責
> - `currentCharacterStatus: string`（單檔）→ 一人一檔：`characters/<slug>_status.md`
> - 新增三觸發點 + reason 欄位（`auto-after-save` / `auto-after-adopt` / `manual`）
> - 失敗處理：retry 3 次指數退避 → 持久 UI banner + 重試按鈕
> - AsyncIterable → SSE bridge 取代 jobs table

## 三個觸發點

| 觸發點 | reason | 觸發時機 |
|---|---|---|
| Spec 003 儲存 | `auto-after-save` | `PUT /chapters/:n` 成功後，後端非同步觸發 |
| Spec 006 採用 | `auto-after-adopt` | `POST /adopt` 成功後，後端非同步觸發 |
| 前端手動按鈕 | `manual` | 使用者點「立刻更新狀態」→ `POST /status/update-from-chapter` |

前兩個觸發點由後端直接呼叫 service（不走 HTTP），不進 queue；第三個由前端 HTTP 呼叫。所有觸發點都會回傳 `jobId` 供前端訂閱 SSE 進度。

## API 合約

所有路徑前綴 `/api/projects/:projectHash/`。

### POST .../status/update-from-chapter

手動觸發（與後端內部觸發共用同一 service function；此 API 供前端「立刻更新狀態」按鈕呼叫）。

**Request:**
```ts
{
  chapterNumber: number;
  reason: "auto-after-adopt" | "auto-after-save" | "manual";
}
```

**Response 202:**
```ts
{
  jobId: string;               // 一次性關聯 ID，供訂閱 SSE 進度
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | `INVALID_CHAPTER` | chapterNumber 不存在或主檔為空 |
| 404 | `PROJECT_NOT_FOUND` | projectHash 不在 recentProjects |
| 400 | `ROUTING_NOT_CONFIGURED` | status-updater routing 未設定 |

### GET .../jobs/:jobId/events

SSE bridge：client 訂閱後接收 status-updater 的進度事件。

事件序列：

```
event: started
data: {"model":"anthropic:claude-haiku-4-5","chapterNumber":1}

event: progress
data: {"phase":"collecting-context"}

event: progress
data: {"phase":"calling-llm"}

event: progress
data: {"phase":"writing-files"}

event: completed
data: {"skipped":false,"retries":0}
```

或失敗：

```
event: failed
data: {"code":"network","message":"...","retries":3}
```

`skipped: true` 表示 LLM 判斷 status 無需更新（輸出與輸入相同，故跳過寫檔）。

### POST .../status/write（M5 新增；TD-1）

直接寫 status 主檔。給 StatusEditorPage「儲存」按鈕用（取代 M4 的「複製內容到 clipboard」UX）。

**Request:**
```ts
{
  fileType: "story" | "character";
  characterSlug?: string;          // fileType === "character" 時必填
  content: string;                 // 完整 markdown 內容
  expectedMtime?: string;          // optional：optimistic concurrency；不符回 409
}
```

**Response 200:**
```ts
{
  path: string;                    // 寫入後的絕對路徑
  mtime: string;
  size: number;
  commitSha: string | null;        // 內容無變化則 null
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | fileType 不認、character 缺 slug、content 為空字串（empty 視為刪除？M5 規範：拒絕） |
| 404 | `CHARACTER_NOT_FOUND` | fileType=character 但 slug 對應檔不存在；此 endpoint **不**自動建立新角色 status，請走 Spec 002 character POST |
| 409 | `MTIME_MISMATCH` | expectedMtime 與實際 .md mtime 不符（外部修改了 .md） |
| 500 | `IO_ERROR` |

**寫入流程**：

1. zod 驗證
2. 計算目標路徑：
   - `fileType=story` → `<project>/status/story_status.md`
   - `fileType=character` → `<project>/characters/<slug>_status.md`（slug 必須對應已存在的 character.md）
3. 若 `expectedMtime` 提供 → stat 比對；不符回 409
4. atomic write（`.tmp` → rename）
5. `commitIfChanged` with message：`"status: manual edit <fileType>[/<slug>] (story chapter <N>?)"`
6. 回 200

**設計決策**：
- 此 endpoint **不**觸發 status-updater（使用者手寫的內容是「最終版」，不需要 AI 再去 review）
- **不**動 character_index cache（cache 只 index `<slug>.md` 不 index `<slug>_status.md`）

### POST .../status/shorten

AI 精簡 status 檔（對應「AI 精簡」按鈕）。

**Request:**
```ts
{
  fileType: "story" | "character";
  characterSlug?: string;       // fileType === "character" 時必填
  preserveMarkedSections: boolean;  // 預設 true：保留 🔖 / ✨ 段
  modelOverride?: string;
}
```

**Response 200:**
```ts
{
  shortenedContent: string;     // 精簡後的完整內容（不自動寫檔；前端 textarea 預覽後使用者儲存）
  preservedSections: string[];  // 哪些 heading 被保留
}
```

## 上下文蒐集

```ts
interface StatusUpdateContext {
  chapterNumber: number;
  chapterTitle: string;
  chapterText: string;              // 該章主檔完整內容
  currentStoryStatus: string;       // status/story_status.md
  characterStatuses: Record<string, string>;  // slug → characters/<slug>_status.md 完整內容（一人一檔）
  relevantCharacters: Array<{
    slug: string;
    name: string;
    card: string;                   // characters/<slug>.md body
    status: string;                 // characters/<slug>_status.md
  }>;
}
```

「相關角色」篩選邏輯（M5 改，與 spec 005 對齊）：

1. 從 chapter front-matter 讀 `participants: string[]`
2. 只更新 `participants` 中列出的角色的 `<slug>_status.md`
3. 若 `participants` 為空 → 不動任何 character_status，只更新 story_status
4. **不**做 substring matching（M3/M4 既有邏輯移除 — 不穩）

向前相容：M3/M4 既有章節無 frontmatter / 無 participants → 視為 `[]`，狀態更新時只動 story_status（保守，不誤動角色）。

**不包含**：
- writingStyle / style.md（structured data 處理，不受 style 影響）
- 其他章節主檔（status 自己的累積就是跨章記憶）

## status-updater 主流程

```
updateStatus(projectHash, chapterNumber, reason, jobId):
  emit(jobId, "started", { model: routing.primary })
  emit(jobId, "progress", { phase: "collecting-context" })

  context = collectStatusContext(projectHash, chapterNumber)
  emit(jobId, "progress", { phase: "calling-llm" })

  result = null
  retries = 0
  MAX_RETRIES = 3
  BACKOFF = [1000, 2000, 4000]

  while retries <= MAX_RETRIES:
    try:
      result = callStatusUpdaterSkill(context, reason)
      break
    except LLMError as e:
      if not e.retryable or retries >= MAX_RETRIES:
        emit(jobId, "failed", { code: e.code, message: e.message, retries })
        return
      await sleep(BACKOFF[retries])
      retries += 1

  emit(jobId, "progress", { phase: "writing-files" })

  # 比對：相同則 skip 寫檔
  changed = writeStatusFiles(projectHash, context, result)
  if changed:
    commitIfChanged(projectPath,
      ["status/story_status.md", ...changedCharacterStatusPaths],
      "status: update after <reason> chapter <N>"
    )

  emit(jobId, "completed", { skipped: not changed, retries })
```

## 寫入流程（atomic）

```
writeStatusFiles(projectPath, context, result):
  changed = false
  T = []

  # story_status.md
  if result.storyStatus != context.currentStoryStatus:
    atomicWrite(story_status.md, result.storyStatus)
    T.push(rollback for story_status.md)
    changed = true

  # characters/<slug>_status.md（一人一檔）
  for slug, newContent in result.characterStatuses:
    oldContent = context.characterStatuses[slug] or ""
    if newContent != oldContent:
      atomicWrite(characters/<slug>_status.md, newContent)
      T.push(rollback for <slug>_status.md)
      changed = true

  return changed
```

`atomicWrite` = write to `.tmp` → rename（已在 atomic-fs.ts 實作）。

## 資料模型

新增至 `packages/shared-types/src/status-update.ts`：

```ts
export type UpdateReason = "auto-after-save" | "auto-after-adopt" | "manual";

export interface StatusUpdateRequest {
  chapterNumber: number;
  reason: UpdateReason;
}

export type StatusJobEvent =
  | { type: "started"; model: string; chapterNumber: number }
  | { type: "progress"; phase: string; details?: Record<string, unknown> }
  | { type: "completed"; skipped: boolean; retries: number }
  | { type: "failed"; code: string; message: string; retries: number };

export interface StatusShortenRequest {
  fileType: "story" | "character";
  characterSlug?: string;
  preserveMarkedSections: boolean;
  modelOverride?: string;
}

export interface StatusShortenResponse {
  shortenedContent: string;
  preservedSections: string[];
}
```

**不需要** SQLite jobs table（stateless；jobId 只存在 in-memory event bus）。

## 跨元件協議

```
spec 006 (adopt 結尾) 或 spec 003 (save 結尾)
    │
    ▼
statusUpdaterService.trigger(projectHash, chapterNumber, reason)
    │ returns jobId (UUID，in-memory 關聯)
    │
    ▼ (非同步，在 queueMicrotask 或 setImmediate 中跑)
collectStatusContext(projectHash, chapterNumber)
    │
    ▼
LLMRouter.generate(req, statusUpdaterPolicy)  [retry 3x, exp backoff]
    │
    ▼
比對新舊內容 → 相同則 skip
    │
    ▼
atomicWrite story_status.md + characters/<slug>_status.md（一人一檔）
    │
    ▼
commitIfChanged(...)
    │
    ▼
emit StatusJobEvent("completed") → client SSE 收到
```

前端只需訂閱 `GET /jobs/:jobId/events` 直到收到 `completed` / `failed`，用來顯示右下角 spinner 與最終 toast。

## LLM adapter 合約

- 觸發的產品內 Skill：`docs/skills/status-updater.md`（v0.1，已對齊）
- 輸入：StatusUpdateContext（見上）
- 串流：否（背景任務，single response JSON）
- Routing：`settings.yaml.routing.statusUpdater`
- 失敗處置：retry 3 次（指數退避 1s / 2s / 4s）；都失敗 → `StatusJobEvent("failed")` → UI 持久 banner + 重試按鈕
- 降級：若雲端 content_blocked → 切地端；UI toast「狀態更新切換到地端模型」

## 非功能性

- **效能**：觸發→完成 status update p95 < 30s（地端 14B 典型）；雲端 < 10s
- **可用性**：背景任務不阻塞編輯器；失敗時 status 不被汙染；舊內容保留
- **觀察性**：前端 spinner 顯示「狀態更新中…」；完成 toast；失敗持久 banner + 重試按鈕

## 開發任務拆解

### types
- [ ] **types-2**: `packages/shared-types/src/status-update.ts`（UpdateReason、StatusJobEvent、StatusShortenRequest/Response）

### 後端
- [ ] **stat-be-1**: `apps/api/src/services/status-context-collector.ts`（蒐集 + 涉及角色篩選；一人一檔）
- [ ] **stat-be-2**: `apps/api/src/services/status-updater-service.ts`（主流程：context → LLM → 比對 → write；retry 3x exp backoff）
- [ ] **stat-be-3**: `apps/api/src/services/status-md-merger.ts`（識別 `## 🔖` `## ✨` heading + merge 規則）
- [ ] **stat-be-4**: `apps/api/src/services/status-shortener-service.ts`（呼叫 status-shortener Skill；不自動寫檔）
- [ ] **stat-be-5**: `apps/api/src/services/job-event-bus.ts`（AsyncIterable → SSE bridge；in-memory，jobId map）
- [ ] **stat-be-6**: `apps/api/src/routes/status.ts`（POST /status/update-from-chapter、POST /status/shorten）
- [ ] **stat-be-7**: `apps/api/src/routes/jobs.ts`（GET /jobs/:id/events SSE bridge）
- [ ] **stat-be-8**: 整合 Spec 003 PUT chapter 在尾端觸發 status-updater（reason: `auto-after-save`）
- [ ] **stat-be-9**: 整合 Spec 006 adopt 在尾端觸發 status-updater（reason: `auto-after-adopt`）

### 前端
- [x] **stat-fe-1**: `StatusUpdateIndicator.tsx`
- [x] **stat-fe-2**: `UpdateStatusButton.tsx`
- [x] **stat-fe-3**: `StatusShortenButton.tsx`
- [x] **stat-fe-4**: 「狀態更新失敗」永久側邊提示 + 重試
- [ ] **stat-fe-5（M5）**: status 編輯畫面「儲存」按鈕 — 改接 POST `/status/write` endpoint，取代「複製內容到 clipboard」（TD-1）
- [ ] **stat-fe-6（M5）**: 失敗時保留 textarea 內容 + inline error
- [ ] **stat-fe-7（M5）**: 「複製內容」改為次要 icon button（保留功能，主操作改為「儲存」）

### M5 後端微調
- [ ] **stat-be-m5-1**: `apps/api/src/routes/status.ts` 新增 `POST /status/write` endpoint（含 mtime 衝突偵測）
- [ ] **stat-be-m5-2**: `status-context-collector.ts`：「相關角色」改讀 chapter front-matter `participants`；移除 substring matching

### Prompt library
- [ ] **prompt-1**: `packages/prompt-library/skills/status-updater.ts`（依 status-updater.md v0.1）
- [ ] **prompt-2**: `packages/prompt-library/skills/status-shortener.ts`（依 status-updater.md 附錄）
- [ ] **prompt-3**: zod schema 驗證 LLM 輸出（statusUpdaterOutput / statusShortenerOutput）

### QA
- [ ] **qa-1**: cucumber-js step definitions for `007.feature`
- [ ] **qa-2**: status-updater golden test：固定 fixture → JSON parse + 不修改角色名 + 未提及角色 status 不變
- [ ] **qa-3**: status-shortener golden test：preserveMarkedSections=true → 🔖 / ✨ 條目字元保留
- [ ] **qa-4**: retry 邏輯測試：mock LLM 連續失敗 → 確認 3 次退避 + failed 事件

## 變更紀錄

- `2026-05-10`: 初版 Ready
- `2026-05-13`: 全面對齊 2026-05-12 架構決策：移除 JobQueue / worker / jobs SQLite table；改為 stateless 直接呼叫；character status 改為一人一檔（characters/<slug>_status.md）；移除 token 上限；加 retry 3x 指數退避；加三觸發點 reason 欄位；API 從 /jobs/status-update 改為 /status/update-from-chapter + /status/shorten；新增 StatusJobEvent SSE bridge
- `2026-05-15`: M5 微調（待 PM 簽核轉 Ready）：
  - TD-1：新增 `POST /status/write` endpoint，給 StatusEditorPage「儲存」按鈕用，取代 M4「複製內容」
  - 「相關角色」篩選改用 chapter front-matter `participants`（取代 substring matching；對齊 Spec 003 / 005）
