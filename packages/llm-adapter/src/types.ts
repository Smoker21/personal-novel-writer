export type FinishReason = "end" | "max_tokens" | "stop" | "abort" | "error";

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
  /** Actual model used — may differ from request when fallback occurred. */
  modelId: string;
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "finish"; finishReason: FinishReason; modelId: string };

export interface ModelCapabilities {
  contextWindow: number;
  maxOutputTokens: number;
  /** Always true — adapter guarantees streaming for every provider. */
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsVision: boolean;
  /** USD per 1 000 input tokens; undefined for local providers. */
  costPer1kInput?: number;
  /** USD per 1 000 output tokens; undefined for local providers. */
  costPer1kOutput?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly origin: "cloud" | "local";

  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  /** Returns null when the modelId is not known to this provider. */
  capabilities(modelId: string): ModelCapabilities | null;
  ping(): Promise<{ ok: boolean; latencyMs?: number }>;
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
    throw new Error(
      `Invalid modelId "${modelId}": expected format "<provider>:<model>"`,
    );
  }
  return {
    provider: modelId.slice(0, idx),
    model: modelId.slice(idx + 1),
  };
}
