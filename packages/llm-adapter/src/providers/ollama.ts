import type { ModelCapabilities } from "../types.js";
import { OpenAiCompatProvider } from "./openai-compat.js";

// Vision capability inferred from model name; Ollama exposes multimodal models
// (e.g. llava, bakllava) alongside text-only ones.
function inferCapabilities(modelId: string): ModelCapabilities {
  const lower = modelId.toLowerCase();
  const supportsVision =
    lower.includes("llava") ||
    lower.includes("bakllava") ||
    lower.includes("vision") ||
    lower.includes("vl");
  return {
    contextWindow: 4_096,
    maxOutputTokens: 2_048,
    supportsStreaming: true,
    supportsToolCalls: false,
    supportsVision,
    hasStructuredNovelGenerate: false,
  };
}

export class OllamaProvider extends OpenAiCompatProvider {
  readonly id = "ollama";
  readonly origin = "local" as const;

  constructor(endpoint = "http://localhost:11434") {
    // Ollama's OpenAI-compatible endpoint does not require an API key.
    super("ollama", `${endpoint.replace(/\/$/, "")}/v1`);
  }

  capabilities(modelId: string): ModelCapabilities | null {
    const idx = modelId.indexOf(":");
    const model = idx >= 0 ? modelId.slice(idx + 1) : modelId;
    return inferCapabilities(model);
  }
}
