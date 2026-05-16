import type { RecentProject } from "./project.js";

export type LLMProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "ollama"
  | "lmstudio"
  | "rwkv-runner";

export const ALL_PROVIDER_IDS: LLMProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "ollama",
  "lmstudio",
  "rwkv-runner",
];

export const CLOUD_PROVIDERS: LLMProviderId[] = ["anthropic", "openai", "google", "xai"];
export const LOCAL_PROVIDERS: LLMProviderId[] = ["ollama", "lmstudio", "rwkv-runner"];

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
}

export interface RoutingPolicy {
  primary: string;
  fallbacks: string[];
  /** M5：per-routing-slot 系統提示詞覆寫；null/空字串 = 不注入。structured-data Agent 強制忽略 */
  systemPromptOverride?: string | null;
  /** M5：per-routing-slot 預設溫度；null = 用 Agent 預設；Spec 005 「本章覆寫」可進一步覆蓋 */
  temperature?: number | null;
}

/** M5：接受 systemPromptOverride 注入的 Agent 白名單。不在此列表 → structured-data Agent，強制忽略 override。 */
export const SYSTEM_PROMPT_OVERRIDE_ENABLED_AGENTS = ["chapter-writer"] as const;

export type SystemPromptOverrideEnabledAgent = (typeof SYSTEM_PROMPT_OVERRIDE_ENABLED_AGENTS)[number];

/** M5：provider listModels 的回傳項。 */
export interface ProviderModel {
  id: string;
  displayName?: string;
  contextWindow?: number;
  supportsVision?: boolean;
}

/** M5：GET /api/settings/provider-models/:providerId response 形狀 */
export interface ListProviderModelsResponse {
  providerId: LLMProviderId;
  models: ProviderModel[];
  fetchedAt: string;
  fromCache: boolean;
}

export interface AppSettings {
  schemaVersion: 1;
  providers: Record<LLMProviderId, ProviderConfig>;
  routing: {
    chapterWriter?: RoutingPolicy;
    characterCardConsolidator?: RoutingPolicy;
    characterImageExtractor?: RoutingPolicy;
    statusUpdater?: RoutingPolicy;
    statusShortener?: RoutingPolicy;
  };
  recentProjects: RecentProject[];
  meta: {
    firstLaunchWarningAcknowledged: boolean;
  };
}

export type ProviderTestResult =
  | { ok: true; latencyMs: number; modelCount?: number }
  | { ok: false; error: string };

export function defaultSettings(): AppSettings {
  const emptyConfig: ProviderConfig = { enabled: false };
  return {
    schemaVersion: 1,
    providers: {
      anthropic: { ...emptyConfig },
      openai: { ...emptyConfig },
      google: { ...emptyConfig },
      xai: { ...emptyConfig },
      ollama: { ...emptyConfig, endpoint: "http://localhost:11434" },
      lmstudio: { ...emptyConfig, endpoint: "http://localhost:1234" },
      "rwkv-runner": { ...emptyConfig, endpoint: "http://localhost:8000" },
    },
    routing: {},
    recentProjects: [],
    meta: { firstLaunchWarningAcknowledged: false },
  };
}

export function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 6)}***${key.slice(-4)}`;
}
