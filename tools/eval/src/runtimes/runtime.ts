export type InferenceMode = "chat" | "completions";

export interface RuntimeConfig {
  endpoint: string;
  modelId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /**
   * "chat"        → POST /v1/chat/completions with messages array
   * "completions" → POST /v1/completions with hand-crafted RWKV-style
   *                 `User: …\n\nAssistant: ` prompt string. Required for
   *                 RWKV-Runner because its chat-template munging breaks
   *                 long-form continuation tasks (TC-03 / TC-07 evidence).
   */
  mode?: InferenceMode;
  /**
   * Extra fields merged into the JSON request body (top-level).
   * Use for runtime-specific knobs like Qwen's thinking toggle:
   *   { chat_template_kwargs: { enable_thinking: false } }
   */
  extraBody?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature: number;
  topP: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens: number;
  stop?: string[];
}

export type FinishReason = "end" | "max_tokens" | "stop" | "error";

export interface ChatResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: FinishReason;
  durationMs: number;
}

export interface Runtime {
  readonly name: string;
  health(): Promise<{ ok: boolean; modelInfo?: string; error?: string }>;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export function mapFinishReason(s: string | null | undefined): FinishReason {
  switch (s) {
    case "stop":
    case "end":
      return "end";
    case "length":
    case "max_tokens":
      return "max_tokens";
    case "content_filter":
    case "error":
      return "error";
    default:
      return "end";
  }
}
