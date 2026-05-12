# Spec: 採用後更新故事與人物狀態（status-updater）

> Story: `docs/requirements/stories/007-update-story-character-status.md`
> BDD: `docs/requirements/features/007-update-story-character-status.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-10`
> Depends on ADR: 0001、0003、0004
> Depends on spec: 006

## 摘要

spec 006 採用流程尾端 enqueue 一個 `status-update` job 到該專案的 `JobQueue`。背景 worker 取出 job 後：

1. 蒐集上下文（剛採用的章節主檔、現行兩 status、相關角色卡）
2. 透過 `LLMRouter` 呼叫 `status-updater` Agent
3. 校驗 token 上限，超過時重試「精簡指示」最多 1 次，仍超則強制截短
4. 自動快照舊 status 後，原子寫入新 status
5. 透過 SSE 通知 client 進度
6. 失敗時保留舊 status，記錄錯誤，使用者可手動重試

這是 **AI 記憶機制的閉環**：spec 005 讀 status → spec 006 觸發 → 本 spec 寫回 status → 下一輪 spec 005 又讀新 status。

## API 合約

### POST /api/projects/:projectHash/jobs/status-update

手動觸發（也是 spec 006 內部呼叫的同一個 API；spec 006 的 enqueue 直接呼叫 service，不走 HTTP）。

**Request:**
```ts
{
  chapterNumber: number;
  reason: "auto-after-adopt" | "manual-retry";
}
```

**Response 202:**
```ts
{
  jobId: string;
  status: "queued" | "running";
  position?: number;            // 排隊位置（前面有幾個）
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | `INVALID_CHAPTER` | chapterNumber 不存在或主檔為空 |
| 404 | `PROJECT_NOT_FOUND` | projectHash 不在 recentProjects |

### GET /api/jobs/:jobId

**Response 200:**
```ts
{
  jobId: string;
  type: "status-update";
  projectHash: string;
  chapterNumber: number;
  status: "queued" | "running" | "completed" | "failed" | "aborted";
  startedAt?: string;
  completedAt?: string;
  retries: number;             // status-updater 因 token 超量重試了幾次
  truncated: boolean;          // 是否觸發強制截短
  error?: { code: string; message: string };
}
```

### GET /api/jobs/:jobId/events

SSE。事件序列：

```
event: queued
data: {"position":1}

event: started
data: {"model":"ollama:qwen2.5:14b"}

event: progress
data: {"phase":"generating-story-status"}

event: progress
data: {"phase":"validating-tokens","tokens":1850,"limit":1500}

event: progress
data: {"phase":"retrying-with-shorten"}

event: progress
data: {"phase":"writing-files"}

event: completed
data: {"truncated":false,"retries":1}
```

或失敗：

```
event: failed
data: {"code":"network","message":"...","retries":3}
```

client（編輯器）只 subscribe 該 job 的 SSE 直到 `completed` / `failed`，主要用來顯示右下角的小型 spinner 與最終 toast。

### DELETE /api/jobs/:jobId

取消 queued / running job。對 running job 設 abort signal。對 queued 直接從 queue 移除。

## 上下文蒐集

```ts
interface StatusUpdateContext {
  chapterText: string;             // 該章主檔內容（完整）
  currentStoryStatus: string;      // 目前 status/story_status.md
  currentCharacterStatus: string;  // 目前 status/character_status.md
  relevantCharacters: CharacterCard[];
  contextHash: string;
}
```

「相關角色」與 spec 005 同邏輯：outline 有列就用列出的，否則全部。

**不包含**：

- 其他章節主檔（避免 context 爆炸；status 自己的累積就是「跨章記憶」）
- 其他角色卡（同上）
- previousChapterSummary（status 已經涵蓋這個資訊）

## Token 上限規則

預設值（由 `project.yaml` 可覆寫）：

```yaml
status:
  storyStatusMaxTokens: 1500
  characterStatusMaxTokens: 2000
  shortenRetryLimit: 1     # 自動精簡重試次數
```

流程（產出新 status 後）：

```
generate(req, policy) → newStatus
tokens = countTokens(newStatus)

if tokens <= limit:
  write(newStatus)
  done

else if retries < shortenRetryLimit:
  reqWithShortenInstruction = appendShortenHint(req)
  retries += 1
  → 回到 generate

else:
  truncated = forceTruncate(newStatus, limit)
  write(truncated)
  emit warning toast
```

**強制截短**：解析新 status 的 Markdown，按頂層 heading 從末尾捨去段落，直到 token 在限制內。保留檔頭與「最重要」段落（由 `status-updater` 自己排序的順位前段——這是對 Agent 的設計要求）。

## 並發與排隊

每個 `projectHash` 一個 `JobQueue` 實例（記憶體中）：

```ts
class JobQueue {
  private queue: StatusUpdateJob[] = [];
  private running: StatusUpdateJob | null = null;
  
  enqueue(job: StatusUpdateJob): JobId
  cancel(jobId: JobId): boolean
  status(jobId: JobId): JobStatus
  events(jobId: JobId): AsyncIterable<JobEvent>
  
  // 工作 worker：finished 觸發 next
}
```

**保證**：

- 同一專案同時只 1 個 status-update 在跑
- queue FIFO
- 應用重啟後 queue 清空（in-memory）
- in-flight job 在重啟時遺失：採用流程已成功（spec 006 已 commit），但 status 沒更新——使用者下次開該章可看到「上次狀態更新未完成」提示，可手動重試

## 寫入流程（atomic + 自動快照）

```
write(newStoryStatus, newCharacterStatus):
  T = []
  try:
    # 1. 自動快照舊 status
    snapshotDir = status/_versions/v_<TS>
    mkdir snapshotDir
    if exists(story_status.md): copy → snapshotDir/story_status.md
    if exists(character_status.md): copy → snapshotDir/character_status.md
    T.push(() => rmdir snapshotDir)
    
    # 2. 原子寫 story_status.md
    write story_status.md.tmp
    fsync
    rename → story_status.md
    T.push(() => restore from snapshotDir)
    
    # 3. 原子寫 character_status.md
    write character_status.md.tmp
    fsync
    rename → character_status.md
    T.push(() => restore from snapshotDir)
    
  except:
    rollback T
    raise
```

`status/_versions/` 與 `chapters/_versions/` 同模式（[ADR-0001](../adr/0001-storage-strategy.md) 一致）。

## 資料模型

新增至 `packages/shared-types/src/jobs.ts`：

```ts
export type JobType = "status-update";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "aborted";

export interface StatusUpdateJob {
  jobId: string;
  projectHash: string;
  chapterNumber: number;
  reason: "auto-after-adopt" | "manual-retry";
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  status: JobStatus;
  retries: number;
  truncated: boolean;
  modelId?: string;
  contextHash?: string;
  error?: { code: string; message: string };
}

export type JobEvent =
  | { type: "queued"; position: number }
  | { type: "started"; modelId: string }
  | { type: "progress"; phase: string; details?: Record<string, unknown> }
  | { type: "completed"; truncated: boolean; retries: number }
  | { type: "failed"; code: string; message: string; retries: number };
```

SQLite：

```sql
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_hash TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  context_hash TEXT,
  error_code TEXT,
  error_message TEXT,
  enqueued_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_jobs_project_status ON jobs(project_hash, status);
```

## 跨元件協議

```
spec 006 (adopt 結尾)
    │
    ▼
JobQueue.enqueue(StatusUpdateJob)  ─────┐
                                         │
                              ┌──────────▼────────┐
                              │  Worker (per      │
                              │  project queue)   │
                              └──────────┬────────┘
                                         │ takes job
                                         ▼
                  ContextCollector.collect(projectHash, chapterNumber)
                                         │
                                         ▼
              LLMRouter.generate(req, statusUpdaterPolicy)
                                         │
                                         ▼
                   countTokens → over limit? → retry shorten (≤1)
                                         │
                                         ▼
                              forceTruncate if needed
                                         │
                                         ▼
                  atomic write story_status.md + character_status.md
                                         │
                                         ▼
                              update jobs table → completed
                                         │
                                         ▼
                              emit JobEvent("completed")  ─────▶ client SSE
```

## LLM adapter 合約

- 觸發的產品內 Agent：`docs/agents/status-updater.md`（待 ai-agent-designer 撰寫，TBD）
- 上下文：見「上下文蒐集」段
- 串流：否（背景任務不需逐字顯示）
- Routing：`statusUpdaterPolicy`，預設與全域 default 相同；可在 project.yaml 覆寫
- 失敗處置：依 ADR-0004，retryable 自動重試 3 次（指數退避 1s / 2s / 4s）；都失敗則 job 標 failed，舊 status 保留
- 品質保證（golden test）：
  - 不新增未在輸入中出現的角色姓名
  - 不修改既有角色名稱字元
  - 輸出符合 Markdown 格式
  - 字數在 token 上限內（過量觸發重試流程）
  - 保留輸入中現有角色（不漏寫）

## 非功能性

- **效能**：採用→完成 status update 整體 p95 < 30s（地端 14B 模型典型）；雲端可 < 10s
- **容量**：status 兩檔合計 ≤ 5 KB（受 token 上限保證）
- **安全**：status 路徑必須在 projectPath/status 之下；context_hash 防止「採用後改了 outline 才跑 updater」造成不一致——若 hash 不符，job 標 failed 並提示
- **可用性**：背景任務不阻塞編輯器；失敗時 status 不被汙染
- **觀察性**：jobs table 可 query 出每章的更新歷史；應用提供「狀態更新歷史」面板（次要功能）

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/jobs.ts` — `JobEvent`、`StatusUpdateJob`
- [ ] **be-1**: `apps/api/src/services/job-queue.ts`（與 spec 005 共享）— 補 `JobEvent` async iterable、SSE bridge
- [ ] **be-2**: `apps/api/src/services/token-counter.ts` — `js-tiktoken` 包裝；異常時回 fallback 估算
- [ ] **be-3**: `apps/api/src/services/status-truncator.ts` — Markdown-aware 截短（heading-based）
- [ ] **be-4**: `apps/api/src/services/status-updater-runner.ts` — 主流程（context → LLM → token check → write）
- [ ] **be-5**: `apps/api/src/routes/jobs.ts` — `POST /jobs/status-update`、`GET /jobs/:id`、`GET /jobs/:id/events`、`DELETE /jobs/:id`
- [ ] **prompts**: `packages/prompt-library/prompts/status-updater.ts`（與 ai-agent-designer 共寫）
- [ ] **fe-1**: 編輯器右下角 spinner（subscribe 採用回傳的 jobId 的 SSE）
- [ ] **fe-2**: 「狀態更新失敗：第 N 章」永久側邊提示 + 重試按鈕
- [ ] **fe-3**: 「狀態更新歷史」面板（從 GET jobs 取近 N 筆）
- [ ] **qa-1**: cucumber-js step definitions for `007.feature`，模擬 LLMProvider 注入超量輸出
- [ ] **qa-2**: 並發測試：兩次 enqueue → 確認 FIFO 串接執行（→ Scenario 6）
- [ ] **qa-3**: 強制截短測試：注入 5000 tokens → 斷言截短後 ≤ limit 且仍是合法 Markdown

## 變更紀錄

- `2026-05-10`: 初版 Ready
