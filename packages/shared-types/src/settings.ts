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
