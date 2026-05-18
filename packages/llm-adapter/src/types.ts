export type FinishReason = "end" | "max_tokens" | "stop" | "abort" | "error";

// ── Vision content types（依 ADR-0009） ──────────────────────────────────────

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source:
    | { kind: "path"; path: string }
    | { kind: "base64"; data: string; mimeType: ImageMimeType }
    | { kind: "url"; url: string };
}

export type Content = TextContent | ImageContent;

// ── Message（向後相容：content 可為 string 或 Content[]） ──────────────────

/** @alias ChatMessage */
export interface Message {
  role: "user" | "assistant";
  content: string | Content[];
}

/** Same as Message; use this name in new code. */
export type ChatMessage = Message;

// ── Request / Response ───────────────────────────────────────────────────────

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
  /** Actual model used — may differ from request when fallback occurred. */
  modelId: string;
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "finish"; finishReason: FinishReason; modelId: string }
  | { type: "degraded"; fromModel: string; toModel: string };

export interface ModelCapabilities {
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsVision: boolean;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  /**
   * M6 (ADR-0010 / spec 011)：true = provider 同時實作 `StructuredNovelProvider`，
   * 用結構化欄位呼叫 `generateNovel()` / `polishNovel()`；messages-array 一般 provider 一律 false。
   * 上層 service 依此 flag dispatch chapter-writer / polish-prose path。
   */
  hasStructuredNovelGenerate: boolean;
}

/**
 * M5 (Spec 009)：listModels 回傳項。
 * id 不含 provider 前綴；UI 拼接時 = `<providerId>:<id>`。
 */
export interface ProviderModel {
  id: string;
  displayName?: string;
  contextWindow?: number;
  supportsVision?: boolean;
}

export interface LLMProvider {
  readonly id: string;
  /**
   * M6 (ADR-0010)：擴 `"novel-api"` 分類，給結構化專用 provider（如 xiaohuangwen）用。
   * UI 端依此分類分組顯示 / 過濾 routing slot 候選。
   */
  readonly origin: "cloud" | "local" | "novel-api";

  generate(request: GenerateRequest): Promise<GenerateResponse>;
  /**
   * M6 (ADR-0010)：純 structured-only provider 可 throw
   * `LLMError("operation_not_supported", ...)`；messages-array provider 一律實作。
   */
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  capabilities(modelId: string): ModelCapabilities | null;
  ping(): Promise<{ ok: boolean; latencyMs?: number }>;
  /**
   * M5：列出此 provider 當前可用的模型 id 清單。
   * 不快取（呼叫端負責 cache）；可被 abort（建議 5s timeout）。
   * 失敗時 throw LLMError with code in {"unauthorized","network","timeout","unknown"}。
   */
  listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]>;
}

// ── Structured Novel Provider（M6 ADR-0010 / spec 011） ────────────────────

/**
 * 結構化章節生成欄位（chapter-writer Agent path）。
 *
 * 對應 spec 011 `POST /api/v1/generate` 請求 body。`background` / `requirements`
 * / `pre_summary` / `prev_segment` 由 context-collector 在 apps/api 端組裝後傳入。
 */
export interface StructuredNovelGenerateParams {
  /** 必填：本章劇情大綱（spec 003 chapter front-matter `outline`）。 */
  plot: string;
  /** 角色卡摘要 + story_status 拼接（context-collector 組）。 */
  background?: string;
  /** 本章寫作需求（spec 003 chapter front-matter `requirements`）。 */
  requirements?: string;
  /** 前情提要（story_status.md「## 故事摘要」段）。 */
  pre_summary?: string;
  /** 前章末段（context-collector 取最後 2000 codepoint）。 */
  prev_segment?: string;
  /** provider 特定版本字串。xiaohuangwen: "latest" | "stable"；預設 "latest"。 */
  version?: string;
  /** 用於外部取消的 AbortSignal。 */
  abortSignal?: AbortSignal;
}

/**
 * 結構化潤稿欄位（polish-prose Skill path）。
 *
 * 對應 spec 011 `POST /api/v1/polish` 請求 body。
 */
export interface StructuredNovelPolishParams {
  /** 必填：當前章節 / 選段文字。 */
  pre_output: string;
  /** 必填：潤稿指令。 */
  polish_input: string;
  version?: string;
  abortSignal?: AbortSignal;
}

/**
 * 餘額查詢結果。currency 預設 "words"（xiaohuangwen 以字數計費）；其他 structured
 * provider 可回 "credits"。
 */
export interface ProviderBalance {
  remainingWords: number;
  currency?: "words" | "credits";
}

/**
 * M6 (ADR-0010)：結構化生成介面。與 `LLMProvider` 正交並存；adapter 可二擇一
 * 或同時實作。capability flag `hasStructuredNovelGenerate=true` 即代表
 * 此 adapter 同時實作了 `StructuredNovelProvider`。
 */
export interface StructuredNovelProvider {
  generateNovel(params: StructuredNovelGenerateParams): AsyncIterable<StreamChunk>;
  polishNovel(params: StructuredNovelPolishParams): AsyncIterable<StreamChunk>;
  /**
   * 結構化 provider 通常以字數 / credit 計費，需獨立 endpoint 查餘額。
   * 失敗 throw `LLMError` (code: "unauthorized" / "network")。
   */
  getBalance(): Promise<ProviderBalance>;
}

export interface RoutingPolicy {
  primary: string;
  fallbacks: string[];
  retryPerModel: number;
}

/**
 * Parses a model ID of the form "provider:model" (first colon is the
 * delimiter; the model part may itself contain colons, e.g. "ollama:llama3:8b").
 *
 * Throws if the string contains no colon.
 */
export function parseModelId(modelId: string): { provider: string; model: string } {
  const idx = modelId.indexOf(":");
  if (idx === -1) {
    throw new Error(`Invalid modelId "${modelId}": expected format "<provider>:<model>"`);
  }
  return {
    provider: modelId.slice(0, idx),
    model: modelId.slice(idx + 1),
  };
}

/** Normalise a message content to Content[] (for providers that require it). */
export function contentToArray(content: string | Content[]): Content[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

/** True if the message array contains any image content. */
export function hasImageContent(messages: Message[]): boolean {
  return messages.some((m) => {
    if (typeof m.content === "string") return false;
    return m.content.some((c) => c.type === "image");
  });
}
