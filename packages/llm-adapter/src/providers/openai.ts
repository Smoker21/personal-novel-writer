import type { ModelCapabilities } from "../types.js";
import { OpenAiCompatProvider } from "./openai-compat.js";

const MODELS: Record<string, ModelCapabilities> = {
  "gpt-4.1": {
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.008,
  },
  "gpt-4.1-mini": {
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.0004,
    costPer1kOutput: 0.0016,
  },
  "gpt-4o": {
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  "gpt-4o-mini": {
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
};

export class OpenAiProvider extends OpenAiCompatProvider {
  readonly id = "openai";
  readonly origin = "cloud" as const;

  constructor(apiKey: string) {
    super(apiKey, "https://api.openai.com/v1");
  }

  capabilities(modelId: string): ModelCapabilities | null {
    const idx = modelId.indexOf(":");
    const model = idx >= 0 ? modelId.slice(idx + 1) : modelId;
    return MODELS[model] ?? null;
  }

  /** Keep only chat-completion-capable models — `gpt-*` and `o*` series. */
  protected override shouldIncludeModel(id: string): boolean {
    return /^(gpt-|o\d)/.test(id);
  }
}
