import { LLMError } from "./error.js";
import { parseModelId } from "./types.js";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  RoutingPolicy,
  StreamChunk,
} from "./types.js";

export class LLMRouter {
  constructor(private readonly providers: Map<string, LLMProvider>) {}

  private getProvider(modelId: string): LLMProvider {
    const { provider } = parseModelId(modelId);
    const p = this.providers.get(provider);
    if (p === undefined) {
      throw new LLMError(
        "model_not_found",
        provider,
        `Provider "${provider}" not registered`,
        false,
      );
    }
    return p;
  }

  /**
   * M0: runs only primary model.
   * Fallback logic (retryPerModel, exponential back-off, local fallback) is
   * deferred to M1.
   */
  async generate(
    request: GenerateRequest,
    policy: RoutingPolicy,
  ): Promise<GenerateResponse> {
    const req: GenerateRequest = { ...request, modelId: policy.primary };
    return this.getProvider(policy.primary).generate(req);
  }

  /**
   * M0: streams only primary model.
   * Mid-stream fallback is intentionally not implemented (see ADR-0004).
   */
  async *stream(
    request: GenerateRequest,
    policy: RoutingPolicy,
  ): AsyncIterable<StreamChunk> {
    const req: GenerateRequest = { ...request, modelId: policy.primary };
    yield* this.getProvider(policy.primary).stream(req);
  }
}
