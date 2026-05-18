import { LLMError } from "./error.js";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ProviderBalance,
  RoutingPolicy,
  StreamChunk,
  StructuredNovelGenerateParams,
  StructuredNovelPolishParams,
  StructuredNovelProvider,
} from "./types.js";
import { hasImageContent, parseModelId } from "./types.js";

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
      // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee candidates[i] exists
      const modelId = candidates[i]!;
      // biome-ignore lint/style/noNonNullAssertion: getProvider always returns provider for valid modelId
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
          // biome-ignore lint/style/noNonNullAssertion: i > 0 guarantees candidates[i-1] exists
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
        // biome-ignore lint/style/noNonNullAssertion: failError is always set when failed is true
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

  // -------------------------------------------------------------------------
  // M6 (ADR-0010 / spec 011) — 結構化生成路徑
  //
  // 與 messages-array path 不同：不自動降級到 fallbacks[]，因 structured params
  // 通常與 messages-array policy 不相容（spec 011 / ADR-0010 line 131-136）。
  // 上層 service 自行處理錯誤後決定 UI 引導。
  // -------------------------------------------------------------------------

  /**
   * 取出 primary provider 並驗證 `hasStructuredNovelGenerate=true`。
   * 失敗 throw `LLMError`。
   */
  private resolveStructuredProvider(primaryModelId: string): {
    provider: LLMProvider & StructuredNovelProvider;
    modelId: string;
  } {
    const { provider: providerId, model } = parseModelId(primaryModelId);
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      throw new LLMError(
        "model_not_found",
        providerId,
        `Provider "${providerId}" not registered`,
        false,
      );
    }
    const caps = provider.capabilities(primaryModelId);
    if (caps === null || caps.hasStructuredNovelGenerate !== true) {
      throw new LLMError(
        "operation_not_supported",
        providerId,
        `Provider "${providerId}" (model "${model}") does not support structured novel generation`,
        false,
      );
    }
    // capability flag 為真即代表同時實作 StructuredNovelProvider
    return {
      provider: provider as LLMProvider & StructuredNovelProvider,
      modelId: primaryModelId,
    };
  }

  /**
   * 結構化章節生成（chapter-writer Agent path）。
   *
   * `policy.primary` 必須對應有 `hasStructuredNovelGenerate=true` 的 provider；
   * 否則 throw `LLMError("operation_not_supported", ...)`。
   *
   * **不**在 `fallbacks[]` 之間自動切換 — structured params 與 messages-array
   * policy 不相容。上層 service 自行重試 / 引導使用者切 routing。
   */
  async *generateNovel(
    params: StructuredNovelGenerateParams,
    policy: { primary: string; retryPerModel?: number },
  ): AsyncIterable<StreamChunk> {
    const { provider } = this.resolveStructuredProvider(policy.primary);
    yield* provider.generateNovel(params);
  }

  /**
   * 結構化潤稿（polish-prose Skill path）。
   *
   * 規則同 `generateNovel()`。
   */
  async *polishNovel(
    params: StructuredNovelPolishParams,
    policy: { primary: string; retryPerModel?: number },
  ): AsyncIterable<StreamChunk> {
    const { provider } = this.resolveStructuredProvider(policy.primary);
    yield* provider.polishNovel(params);
  }

  /**
   * 餘額查詢。providerId 不含 model 部份。
   * Provider 須實作 `StructuredNovelProvider`，否則 throw `operation_not_supported`。
   */
  async getBalance(providerId: string): Promise<ProviderBalance> {
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      throw new LLMError(
        "model_not_found",
        providerId,
        `Provider "${providerId}" not registered`,
        false,
      );
    }
    const maybe = provider as LLMProvider & Partial<StructuredNovelProvider>;
    if (typeof maybe.getBalance !== "function") {
      throw new LLMError(
        "operation_not_supported",
        providerId,
        `Provider "${providerId}" does not expose getBalance()`,
        false,
      );
    }
    return await maybe.getBalance();
  }
}
