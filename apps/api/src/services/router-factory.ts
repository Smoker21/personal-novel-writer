import {
  AnthropicProvider,
  GoogleProvider,
  LLMRouter,
  LmStudioProvider,
  OllamaProvider,
  OpenAiProvider,
  XaiProvider,
} from "@novel-writer/llm-adapter";
import type { LLMProvider, RoutingPolicy as LLMRoutingPolicy } from "@novel-writer/llm-adapter";
import type {
  AppSettings,
  LLMProviderId,
  ProviderConfig,
  RoutingPolicy,
} from "@novel-writer/shared-types";

/**
 * Build an LLMRouter from the current app settings.
 * Only enabled providers are registered.
 */
export function buildRouter(settings: AppSettings): LLMRouter {
  const providers = new Map<string, LLMProvider>();

  const { providers: provConf } = settings;

  if (provConf["anthropic"]?.enabled && provConf["anthropic"]?.apiKey) {
    providers.set("anthropic", new AnthropicProvider(provConf["anthropic"].apiKey));
  }
  if (provConf["openai"]?.enabled && provConf["openai"]?.apiKey) {
    providers.set("openai", new OpenAiProvider(provConf["openai"].apiKey));
  }
  if (provConf["google"]?.enabled && provConf["google"]?.apiKey) {
    providers.set("google", new GoogleProvider(provConf["google"].apiKey));
  }
  if (provConf["xai"]?.enabled && provConf["xai"]?.apiKey) {
    providers.set("xai", new XaiProvider(provConf["xai"].apiKey));
  }
  if (provConf["ollama"]?.enabled) {
    const endpoint = provConf["ollama"].endpoint ?? "http://localhost:11434";
    providers.set("ollama", new OllamaProvider(endpoint));
  }
  if (provConf["lmstudio"]?.enabled) {
    const endpoint = provConf["lmstudio"].endpoint ?? "http://localhost:1234";
    providers.set("lmstudio", new LmStudioProvider(endpoint));
  }

  return new LLMRouter(providers);
}

/**
 * Convert a settings RoutingPolicy to an LLMRouter RoutingPolicy (adds retryPerModel default).
 */
export function toRouterPolicy(policy: RoutingPolicy): LLMRoutingPolicy {
  return {
    primary: policy.primary,
    fallbacks: policy.fallbacks,
    retryPerModel: 1,
  };
}

/**
 * M5: Build a single provider instance from a config (for listModels / test-provider).
 * Returns null for providers that are disabled or lack required credentials.
 */
export function buildProviderForListing(
  providerId: LLMProviderId,
  config: ProviderConfig,
): LLMProvider | null {
  if (!config.enabled) return null;
  switch (providerId) {
    case "anthropic":
      return config.apiKey ? new AnthropicProvider(config.apiKey) : null;
    case "openai":
      return config.apiKey ? new OpenAiProvider(config.apiKey) : null;
    case "google":
      return config.apiKey ? new GoogleProvider(config.apiKey) : null;
    case "xai":
      return config.apiKey ? new XaiProvider(config.apiKey) : null;
    case "ollama":
      return new OllamaProvider(config.endpoint ?? "http://localhost:11434");
    case "lmstudio":
      return new LmStudioProvider(config.endpoint ?? "http://localhost:1234");
    case "rwkv-runner":
      // OpenAI-compatible; piggy-back on LmStudioProvider's base + endpoint override
      return new LmStudioProvider(config.endpoint ?? "http://localhost:8000");
    default:
      return null;
  }
}
