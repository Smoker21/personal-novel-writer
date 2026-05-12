import {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  Runtime,
  RuntimeConfig,
  mapFinishReason,
} from "./runtime.js";

interface OpenAIChatChoice {
  message: {
    role: string;
    content: string | null;
    /** Qwen3 / DeepSeek "thinking" payload — separate field from content. */
    reasoning_content?: string | null;
  };
  finish_reason?: string | null;
}

interface OpenAIChatResponse {
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface OpenAICompletionsChoice {
  text: string;
  finish_reason?: string | null;
}

interface OpenAICompletionsResponse {
  choices: OpenAICompletionsChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

const DEFAULT_TIMEOUT_MS = 600_000;
const RWKV_USER_TURN_STOP = ["\n\nUser:", "\n\nHuman:", "\nUser:", "\nHuman:"];

export class RwkvRunnerRuntime implements Runtime {
  readonly name = "rwkv-runner";

  constructor(private cfg: RuntimeConfig) {}

  async health(): Promise<{ ok: boolean; modelInfo?: string; error?: string }> {
    try {
      const res = await fetch(`${this.cfg.endpoint}/models`, {
        method: "GET",
        headers: this.cfg.headers,
      });
      if (!res.ok) {
        return { ok: false, error: `${res.status} ${res.statusText}` };
      }
      const text = await res.text();
      return { ok: true, modelInfo: text };
    } catch (err) {
      return { ok: false, error: String(err instanceof Error ? err.message : err) };
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    return this.withRetry(() => {
      if (this.cfg.mode === "completions") return this.completionsImpl(req);
      return this.chatImpl(req);
    });
  }

  /**
   * Node 18's experimental fetch sometimes throws "fetch failed" on long-running
   * requests against localhost (socket reset under keep-alive reuse). The backend
   * almost always still completes the work — but the client hand-off failed.
   * Retry once after a short delay; if the second attempt also fails, surface.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/fetch failed|ECONNRESET|socket hang up/i.test(msg)) throw err;
      // Wait briefly to let the backend drain the prior in-flight request
      // (sequential queue). 5s is enough for the backend to free the slot.
      await new Promise((r) => setTimeout(r, 5_000));
      return fn();
    }
  }

  private async chatImpl(req: ChatRequest): Promise<ChatResponse> {
    const t0 = performance.now();
    const controller = new AbortController();
    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        model: this.cfg.modelId ?? "rwkv",
        messages: req.messages,
        temperature: req.temperature,
        top_p: req.topP,
        presence_penalty: req.presencePenalty,
        frequency_penalty: req.frequencyPenalty,
        max_tokens: req.maxTokens,
        stop: req.stop,
        stream: false,
        ...(this.cfg.extraBody ?? {}),
      };

      const res = await fetch(`${this.cfg.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.cfg.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`RWKV-Runner ${res.status}: ${text}`);
      }

      const json = (await res.json()) as OpenAIChatResponse;
      const t1 = performance.now();
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error("RWKV-Runner returned no choices");
      }

      // Some Qwen3 / DeepSeek-style chat templates split the visible answer
      // into `content` and the chain-of-thought into `reasoning_content`.
      // If `enable_thinking: false` is honoured we get content; if the model
      // ignores the toggle (or for inspection) we still want SOMETHING back —
      // prefer content, fall back to reasoning_content with a marker.
      const content = choice.message.content;
      const reasoning = choice.message.reasoning_content;
      let text: string;
      if (content && content.trim()) {
        text = content;
      } else if (reasoning && reasoning.trim()) {
        text = `[reasoning_content fallback]\n${reasoning}`;
      } else {
        text = "";
      }

      return {
        text,
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
        finishReason: mapFinishReason(choice.finish_reason),
        durationMs: t1 - t0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async completionsImpl(req: ChatRequest): Promise<ChatResponse> {
    const t0 = performance.now();
    const controller = new AbortController();
    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const prompt = formatRwkvCompletionsPrompt(req.messages);
      const stop = mergeStop(req.stop, RWKV_USER_TURN_STOP);

      const body = {
        model: this.cfg.modelId ?? "rwkv",
        prompt,
        temperature: req.temperature,
        top_p: req.topP,
        presence_penalty: req.presencePenalty,
        frequency_penalty: req.frequencyPenalty,
        max_tokens: req.maxTokens,
        stop,
        stream: false,
        ...(this.cfg.extraBody ?? {}),
      };

      const res = await fetch(`${this.cfg.endpoint}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.cfg.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`RWKV-Runner /completions ${res.status}: ${text}`);
      }

      const json = (await res.json()) as OpenAICompletionsResponse;
      const t1 = performance.now();
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error("RWKV-Runner /completions returned no choices");
      }

      return {
        text: stripLeadingSpace(choice.text),
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
        finishReason: mapFinishReason(choice.finish_reason),
        durationMs: t1 - t0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Convert a messages array to the RWKV World prompt template.
 * Matches the format RWKV-Runner's own chat handler synthesises internally,
 * so we get the same semantics without the extra translation step.
 *
 *   User: <system content joined by blank lines>
 *
 *   <user content>
 *
 *   Assistant:
 */
export function formatRwkvCompletionsPrompt(messages: ChatMessage[]): string {
  const systems = messages.filter((m) => m.role === "system").map((m) => m.content.trim());
  const users = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const assistants = messages.filter((m) => m.role === "assistant").map((m) => m.content.trim());

  const userBlock = [...systems, ...users].filter(Boolean).join("\n\n");

  const turns: string[] = [];
  turns.push(`User: ${userBlock}`);
  for (const a of assistants) {
    turns.push(`Assistant: ${a}`);
    // (mid-conversation) — a follow-up User: turn would go here in multi-turn
    // chat, but our eval is single-turn so we just close with a fresh Assistant: marker.
  }
  turns.push("Assistant:");
  return turns.join("\n\n");
}

function mergeStop(userStop: string[] | undefined, defaults: string[]): string[] {
  const set = new Set<string>(defaults);
  for (const s of userStop ?? []) set.add(s);
  return [...set];
}

function stripLeadingSpace(text: string): string {
  // RWKV completion typically prepends a single space (the "Assistant: <space><reply>" convention).
  return text.replace(/^\s+/, "");
}
