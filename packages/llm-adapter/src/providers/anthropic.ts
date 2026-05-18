import { readFile } from "node:fs/promises";
import Anthropic, {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages.js";
import { LLMError, redactSecrets } from "../error.js";
import type {
  Content,
  FinishReason,
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelCapabilities,
  ProviderModel,
  StreamChunk,
  Usage,
} from "../types.js";
import { parseModelId } from "../types.js";

// ---------------------------------------------------------------------------
// Model capability catalogue (M0 — Anthropic models only)
// ---------------------------------------------------------------------------

const MODELS: Record<string, ModelCapabilities> = {
  "claude-opus-4-7": {
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    hasStructuredNovelGenerate: false,
  },
  "claude-sonnet-4-6": {
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    hasStructuredNovelGenerate: false,
  },
  "claude-haiku-4-5": {
    contextWindow: 200_000,
    maxOutputTokens: 8_000,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    hasStructuredNovelGenerate: false,
  },
};

// ---------------------------------------------------------------------------
// Helper: map Anthropic stop_reason → FinishReason
// ---------------------------------------------------------------------------

function mapStopReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "end_turn":
      return "end";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop";
    case "tool_use":
      // No tool calls in M0; treat as normal end.
      return "end";
    default:
      return "end";
  }
}

// ---------------------------------------------------------------------------
// Helper: map Anthropic SDK errors → LLMError
// ---------------------------------------------------------------------------

function mapSdkError(err: unknown, provider: string, modelId: string): LLMError {
  // Abort signal fires as AbortError — surface as finish:abort, not an error.
  // (Callers that need the abort finish reason should catch separately.)
  if (err instanceof Error && err.name === "AbortError") {
    return new LLMError("network", provider, "Request aborted by caller", false, err);
  }

  if (err instanceof AuthenticationError) {
    return new LLMError("unauthorized", provider, redactSecrets(err.message), false, err);
  }

  if (err instanceof RateLimitError) {
    return new LLMError("rate_limit", provider, redactSecrets(err.message), true, err);
  }

  if (err instanceof BadRequestError) {
    const msg = err.message ?? "";
    if (msg.includes("context_length_exceeded") || msg.includes("too many tokens")) {
      return new LLMError("context_overflow", provider, redactSecrets(msg), false, err);
    }
    return new LLMError("unknown", provider, redactSecrets(msg), false, err);
  }

  if (err instanceof PermissionDeniedError) {
    return new LLMError("content_blocked", provider, redactSecrets(err.message), false, err);
  }

  if (err instanceof NotFoundError) {
    return new LLMError(
      "model_not_found",
      provider,
      `Model "${modelId}" not found on Anthropic`,
      false,
      err,
    );
  }

  // Network-level errors: fetch failed, ECONNRESET, etc.
  if (err instanceof APIConnectionError) {
    return new LLMError("network", provider, redactSecrets(err.message), true, err);
  }

  if (err instanceof Error) {
    const msg = err.message ?? "";
    if (
      msg.includes("fetch failed") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("network")
    ) {
      return new LLMError("network", provider, redactSecrets(msg), true, err);
    }
    return new LLMError("unknown", provider, redactSecrets(msg), false, err);
  }

  return new LLMError("unknown", provider, "Unknown error", false, err);
}

// ---------------------------------------------------------------------------
// Helper: build Anthropic content blocks from our Content type
// ---------------------------------------------------------------------------

async function buildAnthropicContent(
  content: string | Content[],
): Promise<Anthropic.MessageParam["content"]> {
  if (typeof content === "string") {
    return content;
  }

  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const c of content) {
    if (c.type === "text") {
      blocks.push({ type: "text", text: c.text });
    } else {
      // ImageContent
      const src = c.source;
      let data: string;
      let mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";

      if (src.kind === "path") {
        const buf = await readFile(src.path);
        data = buf.toString("base64");
        // Infer mime from extension
        const ext = src.path.split(".").pop()?.toLowerCase();
        mimeType =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "png"
              ? "image/png"
              : ext === "webp"
                ? "image/webp"
                : ext === "gif"
                  ? "image/gif"
                  : "image/jpeg";
      } else if (src.kind === "base64") {
        data = src.data;
        mimeType = src.mimeType;
      } else {
        // url — Anthropic SDK supports URL sources natively, but we
        // download-and-base64 to maintain uniformity across providers.
        const res = await fetch(src.url);
        const buf = Buffer.from(await res.arrayBuffer());
        data = buf.toString("base64");
        const ct = res.headers.get("content-type") ?? "image/jpeg";
        const ctBase = ct.split(";")[0]?.trim() ?? "image/jpeg";
        mimeType =
          ctBase === "image/jpeg"
            ? "image/jpeg"
            : ctBase === "image/png"
              ? "image/png"
              : ctBase === "image/webp"
                ? "image/webp"
                : ctBase === "image/gif"
                  ? "image/gif"
                  : "image/jpeg";
      }

      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data,
        },
      });
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// AnthropicProvider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly origin = "cloud" as const;

  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // -------------------------------------------------------------------------
  // stream — core implementation
  // -------------------------------------------------------------------------

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const { provider, model } = parseModelId(request.modelId);
    const fullModelId = request.modelId;

    // Build messages before params object — await is not valid inside an
    // object literal initializer for exactOptionalPropertyTypes.
    const builtMessages = await Promise.all(
      request.messages.map(async (m) => ({
        role: m.role as "user" | "assistant",
        content: await buildAnthropicContent(m.content),
      })),
    );

    // Build params carefully — exactOptionalPropertyTypes requires we omit
    // optional fields rather than passing undefined.
    const params: Anthropic.MessageStreamParams = {
      model,
      system: request.systemPrompt,
      messages: builtMessages,
      max_tokens: request.maxOutputTokens ?? 1024,
      stream: true,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.stopSequences !== undefined &&
        request.stopSequences.length > 0 && {
          stop_sequences: request.stopSequences,
        }),
    };

    // Accumulate usage across events.
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: FinishReason = "end";
    let aborted = false;

    // Track whether we have emitted any text so callers can decide on partial.
    let rawStream: ReturnType<typeof this.client.messages.stream> | undefined;

    try {
      const options: Anthropic.RequestOptions = {};
      if (request.abortSignal !== undefined) {
        options.signal = request.abortSignal;
      }

      rawStream = this.client.messages.stream(params, options);

      for await (const event of rawStream as AsyncIterable<MessageStreamEvent>) {
        // Check for abort between events.
        if (request.abortSignal?.aborted === true) {
          aborted = true;
          break;
        }

        switch (event.type) {
          case "message_start": {
            const u = event.message.usage;
            inputTokens = u.input_tokens;
            outputTokens = u.output_tokens ?? 0;
            break;
          }

          case "content_block_delta": {
            if (event.delta.type === "text_delta") {
              yield { type: "text", text: event.delta.text };
            }
            break;
          }

          case "message_delta": {
            outputTokens = event.usage.output_tokens;
            finishReason = mapStopReason(event.delta.stop_reason);
            break;
          }

          case "message_stop": {
            // Final confirmation; finishReason already set from message_delta.
            break;
          }

          default:
            // Ignore other event types (ping, content_block_start, etc.)
            break;
        }
      }
    } catch (err) {
      if (
        (err instanceof Error && err.name === "AbortError") ||
        request.abortSignal?.aborted === true
      ) {
        yield { type: "finish", finishReason: "abort", modelId: fullModelId };
        return;
      }
      throw mapSdkError(err, provider, fullModelId);
    }

    if (aborted) {
      yield { type: "finish", finishReason: "abort", modelId: fullModelId };
      return;
    }

    const usage: Usage = { inputTokens, outputTokens };
    yield { type: "usage", usage };
    yield { type: "finish", finishReason, modelId: fullModelId };
  }

  // -------------------------------------------------------------------------
  // generate — accumulates stream
  // -------------------------------------------------------------------------

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    let text = "";
    let usage: Usage | undefined;
    let finishReason: FinishReason = "error";
    let resolvedModelId = request.modelId;

    for await (const chunk of this.stream(request)) {
      if (chunk.type === "text") {
        text += chunk.text;
      } else if (chunk.type === "usage") {
        usage = chunk.usage;
      } else if (chunk.type === "finish") {
        finishReason = chunk.finishReason;
        resolvedModelId = chunk.modelId;
      }
    }

    if (usage === undefined) {
      usage = { inputTokens: 0, outputTokens: 0 };
    }

    return { text, usage, finishReason, modelId: resolvedModelId };
  }

  // -------------------------------------------------------------------------
  // capabilities
  // -------------------------------------------------------------------------

  capabilities(modelId: string): ModelCapabilities | null {
    try {
      const { model } = parseModelId(modelId);
      return MODELS[model] ?? null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // ping
  // -------------------------------------------------------------------------

  async ping(): Promise<{ ok: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.client.models.list();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }

  // -------------------------------------------------------------------------
  // listModels (M5 — Spec 009)
  // -------------------------------------------------------------------------

  async listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]> {
    try {
      const reqOpts: Anthropic.RequestOptions = {};
      if (opts?.signal !== undefined) reqOpts.signal = opts.signal;
      const result: ProviderModel[] = [];
      // Anthropic models.list returns a paginator; M5 spec keeps it simple — first page is enough
      const page = await this.client.models.list({ limit: 100 }, reqOpts);
      for (const m of page.data) {
        const caps = MODELS[m.id];
        const item: ProviderModel = { id: m.id };
        if (m.display_name) item.displayName = m.display_name;
        if (caps !== undefined) {
          item.contextWindow = caps.contextWindow;
          item.supportsVision = caps.supportsVision;
        }
        result.push(item);
      }
      return result;
    } catch (err) {
      throw mapSdkError(err, "anthropic", "");
    }
  }
}
