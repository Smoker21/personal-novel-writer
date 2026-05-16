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
  readonly origin: "cloud" | "local";

  generate(request: GenerateRequest): Promise<GenerateResponse>;
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
