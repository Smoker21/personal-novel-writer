import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
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
// Model registry
// ---------------------------------------------------------------------------

const MODELS: Record<string, ModelCapabilities> = {
  "gemini-2.5-pro": {
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.01,
    hasStructuredNovelGenerate: false,
  },
  "gemini-2.5-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.0000375,
    costPer1kOutput: 0.00015,
    hasStructuredNovelGenerate: false,
  },
  "gemini-2.0-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.0000375,
    costPer1kOutput: 0.00015,
    hasStructuredNovelGenerate: false,
  },
};

// ---------------------------------------------------------------------------
// Image content conversion
// ---------------------------------------------------------------------------

async function contentToGeminiParts(
  contents: Content[],
): Promise<Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const c of contents) {
    if (c.type === "text") {
      parts.push({ text: c.text });
    } else {
      const src = c.source;
      let mimeType: string;
      let data: string;
      if (src.kind === "url") {
        // Gemini doesn't accept remote URLs as inline data — fetch and base64-encode
        const resp = await fetch(src.url);
        const buf = await resp.arrayBuffer();
        data = Buffer.from(buf).toString("base64");
        mimeType = resp.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      } else if (src.kind === "base64") {
        data = src.data;
        mimeType = src.mimeType;
      } else {
        const buf = await readFile(src.path);
        data = buf.toString("base64");
        const ext = src.path.split(".").pop()?.toLowerCase();
        mimeType =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "png"
              ? "image/png"
              : ext === "webp"
                ? "image/webp"
                : "image/jpeg";
      }
      parts.push({ inlineData: { mimeType, data } });
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapGoogleError(err: unknown, modelId: string): LLMError {
  if (err instanceof Error) {
    const msg = err.message;
    const lower = msg.toLowerCase();
    if (err.name === "AbortError") {
      return new LLMError("network", "google", "Request aborted", false, err);
    }
    if (lower.includes("api_key") || lower.includes("unauthorized") || lower.includes("403")) {
      return new LLMError("unauthorized", "google", redactSecrets(msg), false, err);
    }
    if (lower.includes("quota") || lower.includes("429") || lower.includes("rate")) {
      return new LLMError("rate_limit", "google", redactSecrets(msg), true, err);
    }
    if (lower.includes("not found") || lower.includes("404")) {
      return new LLMError("model_not_found", "google", `Model "${modelId}" not found`, false, err);
    }
    if (lower.includes("context") || lower.includes("token") || lower.includes("too long")) {
      return new LLMError("context_overflow", "google", redactSecrets(msg), false, err);
    }
    if (
      lower.includes("safety") ||
      lower.includes("blocked") ||
      lower.includes("harm") ||
      lower.includes("finish_reason: safety")
    ) {
      return new LLMError("content_blocked", "google", redactSecrets(msg), false, err);
    }
    if (
      lower.includes("fetch failed") ||
      lower.includes("econnreset") ||
      lower.includes("etimedout")
    ) {
      return new LLMError("network", "google", redactSecrets(msg), true, err);
    }
    return new LLMError("unknown", "google", redactSecrets(msg), false, err);
  }
  return new LLMError("unknown", "google", "Unknown error", false, err);
}

// ---------------------------------------------------------------------------
// GoogleProvider
// ---------------------------------------------------------------------------

export class GoogleProvider implements LLMProvider {
  readonly id = "google";
  readonly origin = "cloud" as const;

  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  capabilities(modelId: string): ModelCapabilities | null {
    const idx = modelId.indexOf(":");
    const model = idx >= 0 ? modelId.slice(idx + 1) : modelId;
    return MODELS[model] ?? null;
  }

  async listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]> {
    try {
      // Gemini SDK has no native AbortSignal support on models.list — we
      // race against signal externally.
      const listPromise = this.client.models.list();
      const result: ProviderModel[] = [];
      const pager = await (opts?.signal !== undefined
        ? Promise.race([
            listPromise,
            new Promise<never>((_, reject) => {
              opts.signal?.addEventListener("abort", () =>
                reject(new LLMError("network", "google", "aborted", false)),
              );
            }),
          ])
        : listPromise);
      for await (const m of pager) {
        // Names look like "models/gemini-2.5-flash" — strip the prefix
        const fullName = m.name ?? "";
        const id = fullName.startsWith("models/") ? fullName.slice("models/".length) : fullName;
        if (!id) continue;
        // Filter to gemini-* generateContent-capable models (skip embedding/tts)
        if (!id.startsWith("gemini-")) continue;
        const supports = m.supportedActions ?? [];
        if (supports.length > 0 && !supports.includes("generateContent")) continue;

        const item: ProviderModel = { id };
        if (m.displayName) item.displayName = m.displayName;
        if (m.inputTokenLimit !== undefined) item.contextWindow = m.inputTokenLimit;
        const caps = MODELS[id];
        if (caps !== undefined) item.supportsVision = caps.supportsVision;
        result.push(item);
      }
      result.sort((a, b) => a.id.localeCompare(b.id));
      return result;
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw mapGoogleError(err, "");
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      // Minimal prompt to verify connectivity
      await this.client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const { model } = parseModelId(request.modelId);

    // Vision capability check
    const caps = this.capabilities(request.modelId);
    if (caps !== null && !caps.supportsVision) {
      const hasImg = request.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "image"),
      );
      if (hasImg) {
        throw new LLMError(
          "model_lacks_capability",
          "google",
          `Model "${model}" does not support vision`,
          false,
        );
      }
    }

    // Build Gemini contents array
    const contents: Array<{
      role: "user" | "model";
      parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
    }> = [];

    for (const msg of request.messages) {
      const role = msg.role === "assistant" ? "model" : "user";
      if (typeof msg.content === "string") {
        contents.push({ role, parts: [{ text: msg.content }] });
      } else {
        contents.push({ role, parts: await contentToGeminiParts(msg.content) });
      }
    }

    const config: {
      systemInstruction: string;
      maxOutputTokens: number;
      temperature?: number;
      stopSequences?: string[];
    } = {
      systemInstruction: request.systemPrompt,
      maxOutputTokens: request.maxOutputTokens ?? 4096,
    };
    if (request.temperature !== undefined) config.temperature = request.temperature;
    if (request.stopSequences !== undefined && request.stopSequences.length > 0) {
      config.stopSequences = request.stopSequences;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: FinishReason = "end";

    try {
      const streamResult = await this.client.models.generateContentStream({
        model,
        config,
        contents,
      });

      for await (const chunk of streamResult) {
        if (request.abortSignal?.aborted === true) {
          yield { type: "finish", finishReason: "abort", modelId: request.modelId };
          return;
        }

        const text = chunk.text;
        if (text) {
          yield { type: "text", text };
        }

        // Accumulate usage metadata
        const meta = chunk.usageMetadata;
        if (meta) {
          inputTokens = meta.promptTokenCount ?? inputTokens;
          outputTokens = meta.candidatesTokenCount ?? outputTokens;
        }

        // Detect content safety blocks
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason === "SAFETY") {
          throw new LLMError(
            "content_blocked",
            "google",
            "Response blocked by safety filters",
            false,
          );
        }
        if (candidate?.finishReason === "MAX_TOKENS") {
          finishReason = "max_tokens";
        }
      }
    } catch (err) {
      if (err instanceof LLMError) throw err;
      if (
        (err instanceof Error && err.name === "AbortError") ||
        request.abortSignal?.aborted === true
      ) {
        yield { type: "finish", finishReason: "abort", modelId: request.modelId };
        return;
      }
      throw mapGoogleError(err, request.modelId);
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
