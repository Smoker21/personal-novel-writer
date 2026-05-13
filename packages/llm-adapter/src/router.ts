import { LLMError } from "./error.js";
import { hasImageContent, parseModelId } from "./types.js";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  RoutingPolicy,
  StreamChunk,
} from "./types.js";

export class LLMRouter {
  constructor(private readonly providers: Map<string, LLMProvider>) {}

  private getProvider(modelId: string): LLMProvider | undefined {
    const { provider } = parseModelId(modelId);
    return this.providers.get(provider);
  }

  /**
   * Returns the ordered list of model IDs to try.
   * - Primary is always first, regardless of vision capability.
   * - Fallbacks are filtered:
   *   - unregistered providers are removed
   *   - when images are present, providers with supportsVision=false are skipped
   */
  private resolveCandidates(request: GenerateRequest, policy: RoutingPolicy): string[] {
    const needsVision = hasImageContent(request.messages);

    // Primary is always included; unregistered primary fails at runtime
    const primaryOk = this.getProvider(policy.primary) !== undefined;
    if (!primaryOk) return [];

    const filteredFallbacks = policy.fallbacks.filter((modelId) => {
      const provider = this.getProvider(modelId);
      if (provider === undefined) return false;
      if (!needsVision) return true;
      const caps = provider.capabilities(modelId);
      return caps === null || caps.supportsVision;
    });

    return [policy.primary, ...filteredFallbacks];
  }

  /**
   * Streams from the first available model. Switches to next fallback on any
   * retryable error or model_lacks_capability — but only before any text
   * chunks have been emitted. Emits a `degraded` chunk when switching.
   */
  async *stream(request: GenerateRequest, policy: RoutingPolicy): AsyncIterable<StreamChunk> {
    const candidates = this.resolveCandidates(request, policy);

    if (candidates.length === 0) {
      throw new LLMError(
        "model_not_found",
        parseModelId(policy.primary).provider,
        "No capable provider available for this request",
        false,
      );
    }

    for (let i = 0; i < candidates.length; i++) {
      const modelId = candidates[i]!;
      const provider = this.getProvider(modelId)!;
      const req: GenerateRequest = { ...request, modelId };

      let textEmitted = false;
      let failed = false;
      let failError: LLMError | null = null;
      const buffered: StreamChunk[] = [];

      try {
        for await (const chunk of provider.stream(req)) {
          if (chunk.type === "text" && chunk.text.length > 0) {
            textEmitted = true;
          }
          buffered.push(chunk);
        }
      } catch (err) {
        const llmErr =
          err instanceof LLMError
            ? err
            : new LLMError("unknown", modelId, String(err), false, err as Error);
        const isLastCandidate = i === candidates.length - 1;

        if (
          textEmitted ||
          isLastCandidate ||
          (!llmErr.retryable && llmErr.code !== "model_lacks_capability")
        ) {
          // Re-throw: already mid-stream, no more fallbacks, or non-retryable
          throw llmErr;
        }
        failed = true;
        failError = llmErr;
      }

      if (!failed) {
        // Success — emit all buffered chunks
        if (i > 0) {
          yield { type: "degraded", fromModel: candidates[i - 1]!, toModel: modelId };
        }
        for (const chunk of buffered) {
          yield chunk;
        }
        return;
      }

      // Try next fallback
      const nextCandidate = candidates[i + 1];
      if (nextCandidate === undefined) {
        throw failError!;
      }
    }
  }

  /**
   * Generates a complete response, accumulating streamed chunks.
   */
  async generate(request: GenerateRequest, policy: RoutingPolicy): Promise<GenerateResponse> {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: GenerateResponse["finishReason"] = "error";
    let resolvedModelId = policy.primary;

    for await (const chunk of this.stream(request, policy)) {
      if (chunk.type === "text") text += chunk.text;
      else if (chunk.type === "usage") {
        inputTokens = chunk.usage.inputTokens;
        outputTokens = chunk.usage.outputTokens;
      } else if (chunk.type === "finish") {
        finishReason = chunk.finishReason;
        resolvedModelId = chunk.modelId;
      }
      // "degraded" chunks are silently ignored in the non-streaming path
    }

    return {
      text,
      usage: { inputTokens, outputTokens },
      finishReason,
      modelId: resolvedModelId,
    };
  }
}
