# Spec: xiaohuangwen LLM Provider（章節寫作 / 潤稿專用）

> Story: 無對應 user story — 此為 LLM adapter 層機制 spec，由 M6 P1 引入
> ADR: [ADR-0010](../adr/0010-llm-adapter-structured-generation.md)
> Related specs: [005](./005-ai-write-chapter.md) / [012](./012-polish-prose-flow.md) / [009](./009-settings-page.md)
> Status: `Ready`（PM Round 1 拍板 2026-05-18）
> Owner: `spec-architect`
> Last updated: `2026-05-17`

## 待 PM 釐清

> 已於 M6 PM Round 1 拍板 Q1~Q4；本 spec 起草中。

- [ ] 餘額不足的明確 error code（從 xiaohuangwen API 實測回應推導；待 dev 階段確認）

## 摘要

xiaohuangwen 是**小說專用 API**（[https://www.xiaohuangwen.com](https://www.xiaohuangwen.com)）。本 spec 定義 `XiaohuangwenAdapter` 在 `packages/llm-adapter` 內的實作合約：streaming 解析、capability flag、錯誤分類、abort 行為、餘額查詢。

**使用範圍限制（PM 拍板）**：僅供 `chapter-writer` Agent 與 `polish-prose` Skill 使用。不可用於任何 structured-data routing slot。

## 定性

| 項 | 規格 |
|---|---|
| Base URL | `https://www.xiaohuangwen.com` |
| 認證 | `Authorization: Bearer <api_key>`（OpenAI 格式）|
| Streaming | **plain text stream**（非 SSE JSON event；需獨立解析）|
| 計費 | **字數**（`remaining_words`）— 不是 token |
| Model 選擇 | `version: "latest" \| "stable"`（僅兩個，非完整 model ID） |
| Vision / Function calling | 無 |
| 設計動機 | API 端內建 prompt engineering；caller 傳結構化欄位即可 |

## API 端點

### POST /api/v1/generate（章節生成）

**Request:**
```ts
{
  plot: string;            // 必填
  background?: string;
  requirements?: string;
  pre_summary?: string;
  prev_segment?: string;
  version?: "latest" | "stable";   // 預設 "latest"
}
```

**Response:** plain text stream（`Content-Type: text/plain; charset=utf-8`，chunked transfer encoding）

### POST /api/v1/polish（章節潤飾）

**Request:**
```ts
{
  pre_output: string;      // 必填：當前章節 / 選段文字
  polish_input: string;    // 必填：潤稿指令
  version?: "latest" | "stable";
}
```

**Response:** plain text stream（同上）

### GET /api/v1/balance（餘額查詢）

**Response 200:**
```ts
{
  status: "success";
  remaining_words: number;
}
```

## XiaohuangwenAdapter 類別合約

### 介面實作

```ts
// packages/llm-adapter/src/providers/xiaohuangwen.ts

export class XiaohuangwenAdapter implements LLMProvider, StructuredNovelProvider {
  readonly id = "xiaohuangwen";
  readonly origin = "novel-api";   // ADR-0010 新增分類

  constructor(private apiKey: string, private baseUrl = "https://www.xiaohuangwen.com") {}

  // ---- LLMProvider 介面（純 structured provider 不支援 messages-array） ----

  async *stream(req: GenerateRequest): AsyncIterable<StreamChunk> {
    throw new LLMError(
      "operation_not_supported",
      this.id,
      "xiaohuangwen only supports structured generation; use generateNovel()/polishNovel()",
      false,
    );
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    // 與 stream() 同樣 throw
    throw new LLMError("operation_not_supported", this.id, "...", false);
  }

  capabilities(modelId: string): ModelCapabilities | null {
    if (modelId !== "latest" && modelId !== "stable") return null;
    return {
      contextWindow: NaN,                // 不適用（API 內建處理）
      maxOutputTokens: NaN,
      supportsStreaming: true,
      supportsToolCalls: false,
      supportsVision: false,
      hasStructuredNovelGenerate: true,  // ADR-0010 新 flag
      // 不揭露 cost — 字數計費由 getBalance() 取得
    };
  }

  async listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]> {
    // 硬編；不打 HTTP（API 無 /models endpoint）
    return [
      { id: "latest", displayName: "latest（最新版）" },
      { id: "stable", displayName: "stable（穩定版）" },
    ];
  }

  async ping(): Promise<{ ok: boolean; latencyMs?: number }> {
    // 用 balance 端點當 health check
    try {
      const t0 = performance.now();
      await this.getBalance();
      return { ok: true, latencyMs: performance.now() - t0 };
    } catch {
      return { ok: false };
    }
  }

  // ---- StructuredNovelProvider 介面 ----

  async *generateNovel(params: StructuredNovelGenerateParams): AsyncIterable<StreamChunk> { ... }
  async *polishNovel(params: StructuredNovelPolishParams): AsyncIterable<StreamChunk> { ... }
  async getBalance(): Promise<{ remainingWords: number; currency: "words" }> { ... }
}
```

### Streaming 解析

xiaohuangwen 回 plain text stream（非 SSE）。實作：

```ts
async *generateNovel(params: StructuredNovelGenerateParams) {
  const resp = await fetch(`${this.baseUrl}/api/v1/generate`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plot: params.plot,
      background: params.background,
      requirements: params.requirements,
      pre_summary: params.pre_summary,
      prev_segment: params.prev_segment,
      version: params.version ?? "latest",
    }),
    signal: params.abortSignal,
  });

  if (!resp.ok) {
    throw this.mapHttpError(resp.status, await resp.text());
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalChars = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) {
        totalChars += [...text].length;   // codepoint 計數，與 text-count.ts 一致
        yield { type: "text", text };
      }
    }
    // 字數計費，無 token usage
    yield {
      type: "usage",
      usage: { inputTokens: 0, outputTokens: totalChars },   // outputTokens 借用為「字數」
    };
    yield { type: "finish", finishReason: "end", modelId: params.version ?? "latest" };
  } catch (e) {
    if ((e as DOMException).name === "AbortError") {
      yield { type: "finish", finishReason: "abort", modelId: params.version ?? "latest" };
      return;
    }
    throw new LLMError("network", this.id, String(e), true);
  }
}
```

**字數計數**：使用 codepoint 計（`[...text].length`）；與 `packages/shared-types/src/text-count.ts` 規則一致（中文字 + 半形字元都算 1 字）。**借用 `usage.outputTokens` 欄位記字數** — UI 層依 `capabilities().hasStructuredNovelGenerate` 判斷顯示「N 字」或「N tokens」。

### 錯誤映射

| HTTP / 情境 | LLMErrorCode | retryable |
|---|---|---|
| 401 / 403 | `unauthorized` | false |
| **402（無視 body）** | `quota_exhausted` | false |
| **HTTP 400~499（402 以外）AND body 含 keyword**（見下）| `quota_exhausted` | false |
| 429 | `rate_limit` | true |
| 5xx | `network` | true |
| connect timeout / network error | `network` | true |
| caller-side validation 失敗（空 `plot` / 空 `pre_output` / 空 `polish_input`） | `invalid_argument` | false |
| 任何 `LLMProvider.stream()` / `generate()` 呼叫 | `operation_not_supported` | false |
| 4xx 其他（無 keyword）| `unknown` | false |

### `quota_exhausted` keyword 偵測規則（SA-R2-3 拍板 2026-05-18）

**HTTP 402** → 直接判 `quota_exhausted`（高信心，無視 body）。

**HTTP 400~499（402 以外）** → 額外掃 response body，符合以下任一 → `quota_exhausted`：

| keyword | 比對方式 |
|---|---|
| `餘額不足` | exact substring（UTF-8） |
| `insufficient` | case-insensitive substring（ASCII lowercase）|
| `quota` | case-insensitive substring（ASCII lowercase）|

**HTTP 200 + body 含這些 keyword 不算** — HTTP status guard 排除誤判（例：200 response 描述上次扣費「remaining quota: N」）。

`quota_exhausted` / `invalid_argument` / `operation_not_supported` 均為 ADR-0010 新增 code。

### Abort 行為

- `params.abortSignal` 透傳到 fetch `signal`
- 觸發 abort 時：fetch reject → 在 catch 中 yield `{ type: "finish", finishReason: "abort" }`，**不**throw error
- ⚠️ **計費警告**：xiaohuangwen API 文件未明確說明 abort 時是否退費；spec 假定**已送出字數仍扣費**，UI 層在「取消」按鈕旁顯示說明文字

### getBalance 實作

```ts
async getBalance() {
  const resp = await fetch(`${this.baseUrl}/api/v1/balance`, {
    headers: { "Authorization": `Bearer ${this.apiKey}` },
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new LLMError("unauthorized", this.id, "API key 無效", false);
  }
  if (!resp.ok) {
    throw new LLMError("network", this.id, `balance query failed: ${resp.status}`, true);
  }
  const json = await resp.json() as { status: string; remaining_words: number };
  return { remainingWords: json.remaining_words, currency: "words" as const };
}
```

## 欄位對應（context-collector）

`packages/llm-adapter` adapter 只處理「呼叫 API + 解析」；context-collector 負責欄位組裝（在 `apps/api` chapter-writer service 內）。

| xiaohuangwen 欄位 | novel_writer 來源 | 由誰組 |
|---|---|---|
| `plot` | spec 003 chapter front-matter `outline` | chapter-writer service |
| `background` | 選定 characters（`participants`）的 `## 角色描述（手動）` + `## AI 統整敘述` 拼接 + `story_status` 摘要 | context-collector |
| `requirements` | spec 003 chapter front-matter `requirements` | chapter-writer service |
| `pre_summary` | `story_status.md` 的 `## 故事摘要` 段 | context-collector |
| `prev_segment` | 前章 .md 的末段（context-collector 既有邏輯，取最後 2000 codepoint） | context-collector |
| `version` | `settings.yaml` 的 `agents.chapter-writer.routing.primary` 解析後 `<model>` 部份（`"latest"` 或 `"stable"`） | router |

## API 合約（apps/api 端不新增 endpoint）

xiaohuangwen 整合**走既有 spec 005 / 012 endpoint**：

| Spec | Endpoint | xiaohuangwen path |
|---|---|---|
| 005 | `POST .../build-prompt` | 偵測 routing primary `hasStructuredNovelGenerate=true` → 回 `{ structuredInputs }` 而非 `{ promptText }` |
| 005 | `POST .../generate` | request body `structuredInputs` 替代 `promptText`；service 端 dispatch 到 `router.generateNovel()` |
| 012 | `POST .../polish` | service 端 dispatch 到 `router.polishNovel()` |
| 009 | `GET .../balance/:providerId` | 新 endpoint（spec 009 新增）；wrapping `adapter.getBalance()` |

## 資料模型

> **Type 分層原則**（SA-R2 釐清 2026-05-18）：
> - **adapter 介面型別**（`LLMProvider` / `ModelCapabilities` / `StreamChunk` / `LLMErrorCode` / `StructuredNovelProvider` / `StructuredNovelGenerateParams` 等）→ `packages/llm-adapter/src/types.ts`
> - **跨 workspace 共用型別**（前後端都 import，如 `PromptSnapshot` / `DraftMetadata` / `Settings`）→ `packages/shared-types/`
> 判斷準則：只在 apps/web 也需要 import 時才放 `shared-types/`。adapter 介面型別只在 apps/api + packages/llm-adapter 內 import，留在 adapter package 即可。

### `ModelCapabilities` 擴張（ADR-0010）

```ts
// packages/llm-adapter/src/types.ts
export interface ModelCapabilities {
  // ...既有
  hasStructuredNovelGenerate: boolean;
}
```

### `LLMErrorCode` 擴張（ADR-0010）

```ts
export type LLMErrorCode =
  | ...既有
  | "operation_not_supported"
  | "quota_exhausted";
```

### `Provider.origin` 擴張（ADR-0010）

```ts
export interface LLMProvider {
  readonly origin: "cloud" | "local" | "novel-api";
}
```

### `StructuredNovelProvider` 介面

見 [ADR-0010](../adr/0010-llm-adapter-structured-generation.md)。

## 跨元件協議

### chapter-writer 走 structured path

```
client                apps/api                    LLMRouter            XiaohuangwenAdapter
  │ POST .../build-prompt
  │─────────────────▶│
  │                   │ context-collector 蒐集 plot/background/...
  │                   │ 偵測 primary provider hasStructuredNovelGenerate=true
  │◀── { structuredInputs, contextHash } ─────┤
  │
  │ (使用者編輯 5 欄)
  │
  │ POST .../generate  body: { structuredInputs, contextHash }
  │─────────────────▶│
  │                   │ router.generateNovel(structuredInputs, policy)
  │                   │──────────────────────▶│ provider.generateNovel(params)
  │                   │                        │──────────────────────────▶│ fetch /api/v1/generate
  │                   │                        │                            │ stream plain text
  │                   │                        │◀── StreamChunk{type:"text"}─┤
  │◀── SSE chunk ─────┤◀── StreamChunk ───────┤
  │ ...
  │◀── SSE finish ────┤◀── StreamChunk{type:"finish"}─┤
```

### polish-prose 走 structured path

詳見 [spec 012](./012-polish-prose-flow.md)。

### Routing slot 限制驗證（spec 009）

- **UI 端**：`AgentRoutingCard` provider 下拉依 slot 過濾 — `chapter-writer` / `polish-prose` 可選 `origin in ["cloud", "local", "novel-api"]`；其他 slot 只可選 `"cloud" | "local"`
- **API 端**：`PUT /api/settings` 比對：若 routing slot 不在白名單但 primary 對應 `novel-api` provider → 400 `INVALID_ROUTING_SLOT`

## LLM adapter 合約

- 觸發的 Agent：`chapter-writer`（spec 005）
- 觸發的 Skill：`polish-prose`（spec 012）
- 上層需提供的上下文：見「欄位對應」段
- 串流：**是**（plain text）
- 失敗處置：**不自動降級到 messages-array fallback**（structured params 不相容）；UI toast 引導使用者切換 routing

## 非功能性

- **效能**：首 chunk 1~3s；balance 查詢 1~3s
- **容量**：單次 request body < 100 KB（5 欄位 + version）
- **可用性**：餘額查詢失敗不阻擋 generate；generate 時餘額不足才 throw `quota_exhausted`
- **可觀察性**：呼叫端記 `model="xiaohuangwen:latest"` + 字數；API key 過濾（沿用 ADR-0004 redact 規則）

## 安全考量

- API key 過濾：log / error message 中替換為 `[REDACTED]`
- API key 儲存：只進 `~/.novel-writer/settings.yaml`（CLAUDE.md 強制規範）
- abort 不退費：UI 在「取消」按鈕旁顯示「⚠️ 已送出字數仍會扣費」警語（spec 005 / 012 補）

## 開發任務拆解

- [ ] **types**: `packages/llm-adapter/src/types.ts` — `ModelCapabilities.hasStructuredNovelGenerate` / `StructuredNovelProvider` / `StructuredNovelGenerateParams` / `StructuredNovelPolishParams` / `LLMErrorCode` 擴張 / `Provider.origin` 擴張（依 SA-R2「Type 分層原則」— adapter 介面型別歸 adapter package）
- [ ] **adapter-1**: `packages/llm-adapter/src/providers/xiaohuangwen.ts` — `XiaohuangwenAdapter` 實作（含 stream parser / error mapping / abort）
- [ ] **adapter-2**: `packages/llm-adapter/src/router.ts` — `LLMRouter.generateNovel` / `polishNovel` 方法
- [ ] **adapter-3**: 既有 6 個 provider adapter 補 `capabilities().hasStructuredNovelGenerate = false`
- [ ] **be-1**: `apps/api/src/services/chapter-writer.ts` 加 dispatch（capability flag 判斷）— 對應 spec 005 修訂
- [ ] **be-2**: `apps/api/src/services/context-collector.ts` 加 `collectStructuredInputs()` 方法 — 對應「欄位對應」段
- [ ] **be-3**: `apps/api/src/routes/build-prompt.ts` 回傳分支 — 對應 spec 005 修訂
- [ ] **be-4**: `apps/api/src/routes/generate.ts` 接受 `structuredInputs` request body — 對應 spec 005 修訂
- [ ] **be-5**: `apps/api/src/routes/settings.ts` 加 `GET .../balance/:providerId` — 對應 spec 009 修訂
- [ ] **qa-1**: adapter 單元測試（stream parse / error mapping / abort）
- [ ] **qa-2**: chapter-writer dispatch 整合測試（structured vs messages-array path）
- [ ] **qa-3**: routing slot 限制驗證測試（PUT /api/settings 拒絕非法 slot × provider 組合）
- [ ] **qa-4**: `.feature` step definitions for spec 011 scenarios（與 spec 005 / 009 共用）

## 變更紀錄

- `2026-05-17`：初版（M6 PM Q1~Q4 拍板後起草）。
