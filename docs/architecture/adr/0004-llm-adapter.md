# 0004. LLM adapter interface 設計

- Status: `Accepted`
- Date: `2026-05-10`
- Deciders: spec-architect

## Context

`packages/llm-adapter` 是 spec 005 / 006 / 007 與所有產品內 Agent / Skill 的共同依賴。介面若沒有先釘死，每個 spec 會做出不一致的假設。

跨切面需求：

- 統一抽象**雲端**（Anthropic / OpenAI / Gemini 等）與**地端**（Ollama / LM Studio 等 OpenAI-compatible）兩類 provider
- 一律提供 streaming（即使內部是分塊 polling）
- 一律提供 token usage 統計（給 spec 007 的 token 上限判斷用）
- 提供模型能力 metadata（context window、是否支援 vision / tool）讓上層做 routing
- 雲端失敗自動降級到地端（多次出現於 stories）
- 嚴格錯誤分類，禁止把 provider-specific exception 漏到上層

## Decision

### 模型 ID

格式 `<provider>:<model>`，例：

- `anthropic:claude-sonnet-4-6`
- `openai:gpt-4.1`
- `google:gemini-2.5-pro`
- `ollama:qwen2.5:14b`
- `lmstudio:qwen2.5-7b-instruct-q4`

`<model>` 中可含 `:`，解析時用 first-`:` split。

### `LLMProvider` interface

```ts
// packages/llm-adapter/src/types.ts

export type FinishReason =
  | "end"           // 正常結束
  | "max_tokens"    // 達到輸出上限
  | "stop"          // 命中 stop sequence
  | "abort"         // 被 client 中止
  | "error";        // provider 報錯

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  modelId: string;
  systemPrompt: string;
  messages: Message[];
  maxOutputTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  abortSignal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResponse {
  text: string;
  usage: Usage;
  finishReason: FinishReason;
  modelId: string;       // 實際使用的（可能因降級而與 request 不同）
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "finish"; finishReason: FinishReason; modelId: string };

export interface ModelCapabilities {
  contextWindow: number;       // tokens
  maxOutputTokens: number;
  supportsStreaming: boolean;  // 必為 true（adapter 保證）
  supportsToolCalls: boolean;
  supportsVision: boolean;
  costPer1kInput?: number;     // USD，雲端有；地端為 undefined
  costPer1kOutput?: number;
}

export interface LLMProvider {
  readonly id: string;         // "anthropic" | "openai" | ...
  readonly origin: "cloud" | "local";

  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  capabilities(modelId: string): ModelCapabilities | null;  // null = 不支援該 modelId

  /** 健康檢查；本機 provider 用來確認 endpoint 可達 */
  ping(): Promise<{ ok: boolean; latencyMs?: number }>;
}
```

**`generate` 的實作**強制以 `stream` 累積實作，避免兩條 code path 漂移：

```ts
async generate(req) {
  let text = "", usage, finishReason, modelId = req.modelId;
  for await (const chunk of this.stream(req)) {
    if (chunk.type === "text") text += chunk.text;
    else if (chunk.type === "usage") usage = chunk.usage;
    else if (chunk.type === "finish") {
      finishReason = chunk.finishReason;
      modelId = chunk.modelId;
    }
  }
  return { text, usage: usage!, finishReason: finishReason!, modelId };
}
```

### 錯誤型別

```ts
export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    public provider: string,
    message: string,
    public retryable: boolean,
    public cause?: unknown
  ) { super(message); }
}

export type LLMErrorCode =
  | "rate_limit"        // 雲端配額；retryable
  | "context_overflow"  // 輸入超 context window；不可重試（要先精簡）
  | "unauthorized"      // API key 錯 / 過期；不可重試
  | "network"           // 連線斷 / 超時；retryable
  | "content_blocked"   // provider 拒絕內容（成人 / 政治 / 安全）；不可重試
  | "model_not_found"   // 指定 modelId 該 provider 不認識；不可重試
  | "unknown";          // 其餘；retryable=false 為保守
```

provider 實作層**禁止**把 provider-specific exception（如 `Anthropic.RateLimitError`）漏到上層；一律包成 `LLMError`。

API key 與 endpoint 在錯誤訊息與 log 中**過濾**（替換為 `[REDACTED]`）。

### `LLMRouter` — 降級邏輯

上層業務（spec 005 / 006 / 007）不直接呼叫 `LLMProvider`，而是透過 `LLMRouter`：

```ts
export interface RoutingPolicy {
  primary: string;           // modelId，雲端首選
  fallbacks: string[];       // modelId 陣列，逐一嘗試（多為地端）
  retryPerModel: number;     // 預設 3，指數退避
}

export class LLMRouter {
  constructor(private providers: Map<string, LLMProvider>) {}

  async generate(request: GenerateRequest, policy: RoutingPolicy): Promise<GenerateResponse> { ... }
  
  stream(request: GenerateRequest, policy: RoutingPolicy): AsyncIterable<StreamChunk> {
    // 嘗試 primary；若失敗且 retryable=false 而 fallbacks 還有，切換 modelId 重試
    // 若已有 chunk 流出（partial）則不切換——避免上層收到不一致的串流
  }
}
```

**降級規則**：

| 情境 | 行為 |
|------|------|
| primary `unauthorized` | 不重試此 provider，立刻換 fallback |
| primary `rate_limit` | 重試 N 次（指數退避）；仍失敗則換 fallback |
| primary `network` | 重試 N 次；仍失敗則換 fallback |
| primary `content_blocked` | 立刻換 fallback（fallbacks 通常含地端） |
| primary `context_overflow` | **不**降級（換模型也是同樣問題）；丟錯讓上層精簡 |
| stream 中途斷線（已有 chunk 流出） | **不**降級；丟 `{ type: "finish", finishReason: "error" }` 讓上層決定是中止還是重試整段 |

### Token 計數

各 provider 用各自 SDK 給的 `usage`。地端 OpenAI-compatible 通常也會回 `usage`；若不可靠，本應用層用 `tiktoken` 或 `js-tiktoken` 做 fallback 估算（精度足以做 spec 007 的 token 上限判斷）。

`@anthropic-ai/sdk` 的 token counting 端點不在本應用使用範圍——個人工具不需 pre-flight count。

### 設定來源

`LLMProvider` 實例在啟動時從 `~/.novel-writer/settings.yaml` 構造：

```yaml
providers:
  anthropic:
    apiKey: sk-ant-...
  openai:
    apiKey: sk-...
  google:
    apiKey: ...
  ollama:
    endpoint: http://localhost:11434
  lmstudio:
    endpoint: http://localhost:1234/v1

defaults:
  routing:
    primary: anthropic:claude-sonnet-4-6
    fallbacks:
      - ollama:qwen2.5:14b
    retryPerModel: 3
```

每個 Agent / Skill 規格中可以覆寫 `defaults.routing`（見 `docs/agents/_template.md` 「模型建議」段）。

### 套件邊界（什麼**不**屬於本套件）

- ❌ 提示詞拼接：那是 `packages/prompt-library` 的事
- ❌ 業務級重試 / 降級策略：上層 service 視情境調 policy；adapter 只實作機制
- ❌ Tool calling 的高階流程（agent loop）：adapter 提供 `supportsToolCalls` capability，但不跑 ReAct loop
- ❌ Embedding：本應用未來若需向量檢索另開 adapter（Story 020），不混進本介面

## Consequences

**Positive:**

- 上層業務不依賴具體 provider，換 SDK 或加新 provider 不擴散
- 雲端 / 地端在型別上對等，使用者切換無代碼差異
- 錯誤分類對應降級規則，避免「為何這次失敗了？」
- API key 過濾減少日誌洩密風險

**Negative:**

- 強制 generate 走 stream 實作會在 non-streaming provider（理論上不存在但 OpenAI-compat 的 endpoint 可能 stream:false 才回應）下多一次包裝；但本應用情境影響可忽略
- `LLMRouter` 在串流 partial chunk 已流出後不降級，使用者體驗上會看到「LLM 寫到一半斷了」——這是刻意取捨，避免亂跳模型造成風格漂移

**Neutral:**

- 不抽象 cost ceiling（防止跑爆預算），個人工具暫時不需要；未來可在 Router 加一層

## Alternatives considered

### 沿用 Vercel AI SDK
- Pros: 開箱即用、廣為使用、有 React 整合
- Cons: 抽象在「文字 + tool calls」這個層，但對「降級」「provider 健康檢查」「成本計算」無 first-class 支援；地端 provider 走 OpenAI-compat 適配器有時不一致；未來受其升級節奏限制
- 為何不選：本專案需求是「乾淨的多 provider routing」，而非「最快搭起 chat UI」

### LangChain.js
- Pros: 抽象齊全
- Cons: 過度設計、套件笨重、TS 體驗不一致；對個人工具是天文級依賴
- 為何不選：YAGNI

### 直接呼叫各家 SDK，無 adapter
- Pros: 零抽象成本
- Cons: 業務邏輯散落、加新 provider 要改多處、降級邏輯重寫多次
- 為何不選：違反 CLAUDE.md「禁止把 LLM SDK 直接用在 controller / route handler」

## References

- [ADR-0002](./0002-agent-skill-naming.md)（Agent / Skill 命名）
- [ADR-0003](./0003-tech-stack.md)（技術棧）
- `.claude/agents/llm-integrator.md`（實作此介面的子代理職責）
