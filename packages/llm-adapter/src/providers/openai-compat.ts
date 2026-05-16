import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { LLMError, redactSecrets } from "../error.js";
import type {
  FinishReason,
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  Message,
  ModelCapabilities,
  ProviderModel,
  StreamChunk,
  Usage,
} from "../types.js";
import { parseModelId } from "../types.js";

// ---------------------------------------------------------------------------
// Image content → OpenAI data URL
// ---------------------------------------------------------------------------

async function imageToDataUrl(
  src:
    | { kind: "path"; path: string }
    | { kind: "base64"; data: string; mimeType: string }
    | { kind: "url"; url: string },
): Promise<string> {
  if (src.kind === "url") {
    return src.url; // OpenAI accepts URLs directly
  }
  if (src.kind === "base64") {
    return `data:${src.mimeType};base64,${src.data}`;
  }
  // path → read + base64
  const buf = await readFile(src.path);
  const b64 = buf.toString("base64");
  const ext = src.path.split(".").pop()?.toLowerCase();
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

async function buildOpenAiMessages(
  messages: Message[],
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      if (m.role === "assistant") {
        result.push({ role: "assistant", content: m.content });
      } else {
        result.push({ role: "user", content: m.content });
      }
      continue;
    }
    // Multi-part content — only "user" role supports image_url parts in the OpenAI API
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const c of m.content) {
      if (c.type === "text") {
        parts.push({ type: "text", text: c.text });
      } else {
        const url = await imageToDataUrl(c.source);
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
    if (m.role === "assistant") {
      // Assistant messages with multi-part content — only text parts allowed;
      // collect as concatenated string (images in assistant turns not supported).
      const text = parts
        .filter((p): p is OpenAI.Chat.ChatCompletionContentPartText => p.type === "text")
        .map((p) => p.text)
        .join("");
      result.push({ role: "assistant", content: text });
    } else {
      result.push({ role: "user", content: parts });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapOpenAiError(err: unknown, provider: string, modelId: string): LLMError {
  if (err instanceof Error && err.name === "AbortError") {
    return new LLMError("network", provider, "Request aborted", false, err);
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    const msg = redactSecrets(err.message);
    if (status === 401 || status === 403) {
      return new LLMError("unauthorized", provider, msg, false, err);
    }
    if (status === 429) {
      return new LLMError("rate_limit", provider, msg, true, err);
    }
    if (status === 404) {
      return new LLMError("model_not_found", provider, `Model "${modelId}" not found`, false, err);
    }
    if (status === 400) {
      const lower = msg.toLowerCase();
      if (lower.includes("context_length") || lower.includes("maximum context")) {
        return new LLMError("context_overflow", provider, msg, false, err);
      }
      if (lower.includes("content_policy") || lower.includes("content filter")) {
        return new LLMError("content_blocked", provider, msg, false, err);
      }
    }
    return new LLMError("unknown", provider, msg, false, err);
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
      return new LLMError("network", provider, redactSecrets(msg), true, err);
    }
    return new LLMError("unknown", provider, redactSecrets(msg), false, err);
  }
  return new LLMError("unknown", provider, "Unknown error", false, err);
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export abstract class OpenAiCompatProvider implements LLMProvider {
  abstract readonly id: string;
  abstract readonly origin: "cloud" | "local";

  protected readonly client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL !== undefined && { baseURL }),
    });
  }

  abstract capabilities(modelId: string): ModelCapabilities | null;

  async ping(): Promise<{ ok: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.client.models.list();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }

  /**
   * M5 (Spec 009)：列出 provider 模型清單。
   * Subclass 可 override shouldIncludeModel 來過濾 model id（e.g. OpenAI 過濾 gpt- 與 o 系列）。
   */
  async listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]> {
    try {
      const reqOpts: OpenAI.RequestOptions = {};
      if (opts?.signal !== undefined) reqOpts.signal = opts.signal;
      const page = await this.client.models.list(reqOpts);
      const items: ProviderModel[] = [];
      for (const m of page.data) {
        if (this.shouldIncludeModel(m.id)) {
          const caps = this.capabilities(`${this.id}:${m.id}`);
          const item: ProviderModel = { id: m.id };
          if (caps !== null) {
            item.contextWindow = caps.contextWindow;
            item.supportsVision = caps.supportsVision;
          }
          items.push(item);
        }
      }
      // Stable sort by id ASC
      items.sort((a, b) => a.id.localeCompare(b.id));
      return items;
    } catch (err) {
      throw mapOpenAiError(err, this.id, "");
    }
  }

  /** Override in subclass to filter model list. Default: keep all. */
  protected shouldIncludeModel(_id: string): boolean {
    return true;
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const { provider, model } = parseModelId(request.modelId);

    // vision capability check
    const caps = this.capabilities(request.modelId);
    if (caps !== null && !caps.supportsVision) {
      const hasImg = request.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "image"),
      );
      if (hasImg) {
        throw new LLMError(
          "model_lacks_capability",
          provider,
          `Model "${model}" does not support vision`,
          false,
        );
      }
    }

    const openAiMessages = await buildOpenAiMessages(request.messages);

    // Build params incrementally to satisfy exactOptionalPropertyTypes
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages: [{ role: "system", content: request.systemPrompt }, ...openAiMessages],
      max_tokens: request.maxOutputTokens ?? 1024,
      stream: true,
      // Required to get usage data in streaming responses
      stream_options: { include_usage: true },
    };

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }
    if (request.stopSequences !== undefined && request.stopSequences.length > 0) {
      params.stop = request.stopSequences;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: FinishReason = "end";

    const requestOptions: OpenAI.RequestOptions = {};
    if (request.abortSignal !== undefined) {
      requestOptions.signal = request.abortSignal;
    }

    try {
      const rawStream = await this.client.chat.completions.create(params, requestOptions);

      for await (const chunk of rawStream) {
        if (request.abortSignal?.aborted === true) {
          yield { type: "finish", finishReason: "abort", modelId: request.modelId };
          return;
        }

        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield { type: "text", text: delta.content };
        }

        const usage = chunk.usage;
        if (usage !== null && usage !== undefined) {
          inputTokens = usage.prompt_tokens;
          outputTokens = usage.completion_tokens;
        }

        const stopReason = chunk.choices[0]?.finish_reason;
        if (stopReason !== null && stopReason !== undefined) {
          finishReason =
            stopReason === "length" ? "max_tokens" : stopReason === "stop" ? "end" : "end";
        }
      }
    } catch (err) {
      if (
        (err instanceof Error && err.name === "AbortError") ||
        request.abortSignal?.aborted === true
      ) {
        yield { type: "finish", finishReason: "abort", modelId: request.modelId };
        return;
      }
      throw mapOpenAiError(err, provider, request.modelId);
    }

    yield { type: "usage", usage: { inputTokens, outputTokens } };
    yield { type: "finish", finishReason, modelId: request.modelId };
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    let text = "";
    let usage: Usage | undefined;
    let finishReason: FinishReason = "error";
    let resolvedModelId = request.modelId;

    for await (const chunk of this.stream(request)) {
      if (chunk.type === "text") text += chunk.text;
      else if (chunk.type === "usage") usage = chunk.usage;
      else if (chunk.type === "finish") {
        finishReason = chunk.finishReason;
        resolvedModelId = chunk.modelId;
      }
    }

    return {
      text,
      usage: usage ?? { inputTokens: 0, outputTokens: 0 },
      finishReason,
      modelId: resolvedModelId,
    };
  }
}
