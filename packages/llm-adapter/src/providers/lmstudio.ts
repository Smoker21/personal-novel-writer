import type { ModelCapabilities } from "../types.js";
import { OpenAiCompatProvider } from "./openai-compat.js";

// LM Studio loads models dynamically from the user's device.
// Vision capability is inferred from the model ID naming convention:
// models containing "vl" or "vision" in their ID support image input.
function inferCapabilities(modelId: string): ModelCapabilities {
  const lower = modelId.toLowerCase();
  const supportsVision =
    lower.includes("vl") || lower.includes("vision") || lower.includes("qwen3-vl");
  return {
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
    supportsStreaming: true,
    supportsToolCalls: false,
    supportsVision,
  };
}

export class LmStudioProvider extends OpenAiCompatProvider {
  readonly id = "lmstudio";
  readonly origin = "local" as const;

  constructor(endpoint = "http://localhost:1234") {
    // LM Studio's OpenAI-compatible endpoint doesn't require a real API key,
    // but the OpenAI SDK requires a non-empty string.
    super("lm-studio", `${endpoint.replace(/\/$/, "")}/v1`);
  }

  capabilities(modelId: string): ModelCapabilities | null {
    const idx = modelId.indexOf(":");
    const model = idx >= 0 ? modelId.slice(idx + 1) : modelId;
    return inferCapabilities(model);
  }
}
