# 0010. LLM adapter 結構化生成擴充

- Status: `Accepted`
- Date: `2026-05-17`
- Deciders: spec-architect, PM
- Related: [ADR-0004](./0004-llm-adapter.md)

## Context

[ADR-0004](./0004-llm-adapter.md) 釘死 `LLMProvider` interface 的核心抽象：以「messages array → text stream」為共同合約，所有 cloud / local provider 都實作 `generate / stream / capabilities / ping`，上層業務透過 `LLMRouter` 做降級。

M6 引入 **xiaohuangwen**（[https://www.xiaohuangwen.com](https://www.xiaohuangwen.com)）— 小說專用 API：

- API 內建 prompt engineering，**不接受 messages array**
- 接受結構化欄位：`plot / background / requirements / pre_summary / prev_segment`
- streaming 回傳 plain text（非 SSE JSON event）
- 計費以**字數**而非 token
- 僅支援章節寫作（`/api/v1/generate`）與潤稿（`/api/v1/polish`），不支援 chat / structured-data 任務

ADR-0004 的 messages-array 前提無法容納這類 provider。三條設計路線：

| 路線 | 內容 | 評估 |
|---|---|---|
| R1 | 新增 opt-in 子介面 `StructuredNovelProvider`；adapter 二擇一實作 | ✅ adapter 抽象不破；上層判 capability flag dispatch |
| R2 | 反向把 `plot/background/...` 塞回 messages 字串、走既有 `stream()` | 違反 xiaohuangwen API 設計動機（API 自己做 prompt engineering）；adapter 反向 parse 是 trick |
| R3 | XiaohuangwenAdapter 不走 `LLMProvider` interface，自成一類 | adapter 抽象洩漏；違 ADR-0004 motivation |

## Decision

採用 **R1**：擴充 `packages/llm-adapter`，新增 opt-in 結構化生成子介面，與既有 messages-array 介面**正交並存**。

### 新介面 — `StructuredNovelProvider`

```ts
// packages/llm-adapter/src/types.ts

export interface StructuredNovelGenerateParams {
  plot: string;                    // 必填：本章劇情大綱
  background?: string;             // 角色卡摘要 + story_status
  requirements?: string;           // 本章寫作需求
  pre_summary?: string;            // 前情提要
  prev_segment?: string;           // 前章末段
  version?: string;                // provider 特定（xiaohuangwen: "latest" | "stable"）
  abortSignal?: AbortSignal;
}

export interface StructuredNovelPolishParams {
  pre_output: string;              // 必填：當前章節 / 選段文字
  polish_input: string;            // 必填：潤稿指令
  version?: string;
  abortSignal?: AbortSignal;
}

export interface StructuredNovelProvider {
  generateNovel(params: StructuredNovelGenerateParams): AsyncIterable<StreamChunk>;
  polishNovel(params: StructuredNovelPolishParams): AsyncIterable<StreamChunk>;

  /** 餘額查詢（結構化 provider 通常以字數計費，需獨立 endpoint） */
  getBalance(): Promise<{ remainingWords: number; currency?: "words" | "credits" }>;
}
```

### `LLMProvider` 介面擴充

```ts
export interface ModelCapabilities {
  // ...既有欄位（contextWindow / maxOutputTokens / supportsToolCalls / supportsVision / cost*）

  /** M6 新增：true = provider 同時實作 StructuredNovelProvider 介面 */
  hasStructuredNovelGenerate: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly origin: "cloud" | "local" | "novel-api";  // M6 擴 "novel-api"

  // ...既有方法

  /**
   * M6 新增：純結構化 provider 可 throw OPERATION_NOT_SUPPORTED；
   * 普通 messages-array provider 一律實作。
   */
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
}
```

純 structured provider（如 xiaohuangwen）對 `stream()` / `generate()` 一律：

```ts
async *stream() {
  throw new LLMError(
    "operation_not_supported",
    this.id,
    "This provider only supports structured generation; use generateNovel()/polishNovel()",
    false,
  );
}
```

新增 error code：

```ts
export type LLMErrorCode =
  | ...既有
  | "operation_not_supported"   // M6：純 structured provider 收到 unstructured 請求
  | "quota_exhausted";          // M6：以字數 / credit 計費的 provider 餘額不足
```

### `LLMRouter` 擴充

```ts
export class LLMRouter {
  // ...既有方法

  /**
   * 結構化生成。policy.primary 必須對應有 hasStructuredNovelGenerate=true 的 provider。
   * 不在 fallbacks[] 之間自動切換（structured params 通常與 messages-array policy 不相容）。
   */
  generateNovel(
    params: StructuredNovelGenerateParams,
    policy: { primary: string; retryPerModel: number },
  ): AsyncIterable<StreamChunk> { ... }

  polishNovel(
    params: StructuredNovelPolishParams,
    policy: { primary: string; retryPerModel: number },
  ): AsyncIterable<StreamChunk> { ... }
}
```

**降級規則**（與 ADR-0004 的 messages-array path 不同）：

| 情境 | 行為 |
|---|---|
| primary `unauthorized` / `quota_exhausted` / `network` | **不自動降級** — structured params 不相容於 messages-array fallback；上層 service throw error，UI 顯示 toast 引導使用者切換 routing |
| stream 中途斷線（已 partial chunk） | 與 ADR-0004 一致：不重試，emit `{ type: "finish", finishReason: "error" }` |

### 上層業務 dispatch 策略

`spec 005` chapter-writer service：

```ts
const primaryProvider = providers.get(primaryProviderId);
if (primaryProvider.capabilities(model).hasStructuredNovelGenerate) {
  // 走 structured path
  return router.generateNovel(structuredInputs, { primary, retryPerModel });
} else {
  // 既有 build-prompt → messages-array path
  return router.stream({ systemPrompt, messages, ... }, policy);
}
```

`spec 012` polish-prose service 同理。

### Routing slot 限制

`agents.chapter-writer.routing.primary` 與 `agents.polish-prose.routing.primary` 可以指向 `origin === "novel-api"` 的 provider。

其他 routing slot（`status-updater` / `character-card-consolidator` / `status-shortener` / `character-image-extractor`）的 provider 下拉**過濾掉** `origin === "novel-api"` — UI 與 API 雙端驗證（spec 009）。

## Consequences

**Positive:**
- adapter 介面語意不破：messages-array provider 與 structured provider 正交並存
- 上層業務只需判 capability flag dispatch；不需要寫 adapter-specific 程式碼
- 未來若有第二個 structured-only provider（其他小說 API），可直接套用同一介面

**Negative:**
- `LLMRouter` 介面變寬（多兩個方法）
- spec 005 / 012 UI 端必須維護「promptText 編輯」與「結構化五欄編輯」兩條 UI 路徑
- structured path 不自動降級到 fallback — 使用者體感差於 messages-array path；以「明確 toast 引導切 routing」對應

**Neutral:**
- 為 xiaohuangwen 引入「字數計費」概念；ADR-0004 既有的「token cost」資料模型不擴張，xiaohuangwen 端 `usage.outputTokens = NaN` 表示不適用，前端依 capability flag 決定顯示「N 字」或「N tokens」

## Alternatives considered

### R2 — 反向 parse 回 messages
- Pros: 上層完全不變
- Cons: 違反 xiaohuangwen 設計動機；adapter 反向 parse 是 trick；當 provider 端 prompt engineering 升級時 adapter 跟不上
- 為何不選：違反「adapter 是機制、不是業務」原則

### R3 — Adapter 不走 LLMProvider，自成 service
- Pros: adapter 介面完全不擴
- Cons: 上層業務要寫雙路徑（凡是 chapter-writer / polish-prose 都要 if-else）；違 ADR-0004「上層業務不依賴具體 provider」
- 為何不選：抽象洩漏

### 直接重寫 ADR-0004
- Pros: 介面更整潔
- Cons: 既有 7 個 provider 全要動；M6 scope 風險大；既有 messages-array provider 沒理由改
- 為何不選：YAGNI

## References

- [ADR-0004](./0004-llm-adapter.md) — LLM adapter 基礎介面
- [Spec 011](../specs/011-xiaohuangwen-provider.md) — XiaohuangwenAdapter 實作規格
- [Spec 005](../specs/005-ai-write-chapter.md) — chapter-writer structured generate 分支
- [Spec 012](../specs/012-polish-prose-flow.md) — polish-prose 應用流程
- [Spec 009](../specs/009-settings-page.md) — Settings UI（xiaohuangwen provider + routing slot 限制）
- [M6-Handover-instruction.md](../milestones/M6-Handover-instruction.md)
