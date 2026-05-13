import type { ModelCapabilities } from "../types.js";
import { OpenAiCompatProvider } from "./openai-compat.js";

const MODELS: Record<string, ModelCapabilities> = {
  "grok-2-vision": {
    contextWindow: 8_192,
    maxOutputTokens: 4_096,
    supportsStreaming: true,
    supportsToolCalls: false,
    supportsVision: true,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.01,
  },
  "grok-2": {
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: false,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.01,
  },
  "grok-beta": {
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsVision: false,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
  },
};

export class XaiProvider extends OpenAiCompatProvider {
  readonly id = "xai";
  readonly origin = "cloud" as const;

  constructor(apiKey: string) {
    super(apiKey, "https://api.x.ai/v1");
  }

  capabilities(modelId: string): ModelCapabilities | null {
    const idx = modelId.indexOf(":");
    const model = idx >= 0 ? modelId.slice(idx + 1) : modelId;
    return MODELS[model] ?? null;
  }
}
