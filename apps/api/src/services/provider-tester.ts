import type { LLMProviderId, ProviderConfig, ProviderTestResult } from "@novel-writer/shared-types";

const TIMEOUT_MS = 5000;

interface ProviderEndpoint {
  url: (config: ProviderConfig) => string;
  headers: (config: ProviderConfig) => Record<string, string>;
  parseCount: (json: unknown) => number | undefined;
  requires: "apiKey" | "endpoint";
}

const ENDPOINTS: Record<LLMProviderId, ProviderEndpoint> = {
  anthropic: {
    url: () => "https://api.anthropic.com/v1/models",
    headers: (c) => ({
      "x-api-key": c.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    }),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "apiKey",
  },
  openai: {
    url: () => "https://api.openai.com/v1/models",
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey ?? ""}` }),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "apiKey",
  },
  google: {
    url: (c) =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(c.apiKey ?? "")}`,
    headers: () => ({}),
    parseCount: (j) => (j as { models?: unknown[] }).models?.length,
    requires: "apiKey",
  },
  xai: {
    url: () => "https://api.x.ai/v1/models",
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey ?? ""}` }),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "apiKey",
  },
  ollama: {
    url: (c) => `${c.endpoint?.replace(/\/$/, "")}/v1/models`,
    headers: () => ({}),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "endpoint",
  },
  lmstudio: {
    url: (c) => `${c.endpoint?.replace(/\/$/, "")}/v1/models`,
    headers: () => ({}),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "endpoint",
  },
  "rwkv-runner": {
    url: (c) => `${c.endpoint?.replace(/\/$/, "")}/v1/models`,
    headers: () => ({}),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "endpoint",
  },
};

export async function testProvider(
  providerId: LLMProviderId,
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<ProviderTestResult> {
  const ep = ENDPOINTS[providerId];

  if (ep.requires === "apiKey" && !config.apiKey) {
    return { ok: false, error: "Missing api_key for cloud provider" };
  }
  if (ep.requires === "endpoint" && !config.endpoint) {
    return { ok: false, error: "Missing endpoint for local provider" };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = performance.now();
  try {
    const res = await fetch(ep.url(config), {
      method: "GET",
      headers: ep.headers(config),
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const json = (await res.json()) as unknown;
    const modelCount = ep.parseCount(json);
    return modelCount !== undefined ? { ok: true, latencyMs, modelCount } : { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, error: friendlyError(err, providerId, config) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function friendlyError(err: unknown, providerId: LLMProviderId, config: ProviderConfig): string {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: { code?: string } }).cause?.code ?? "";
  const isLocal =
    providerId === "ollama" || providerId === "lmstudio" || providerId === "rwkv-runner";
  const target = isLocal ? (config.endpoint ?? "endpoint") : providerLabel(providerId);

  if (msg.includes("aborted") || msg.includes("AbortError")) {
    return `連線超時（${TIMEOUT_MS / 1000} 秒內無回應）。請確認 ${target} 可達。`;
  }
  if (cause === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
    return isLocal
      ? `無法連線到 ${target}。請確認 ${providerLabel(providerId)} Server 已啟動。`
      : `無法連線到 ${target}（連線被拒絕）。`;
  }
  if (cause === "ENOTFOUND" || msg.includes("ENOTFOUND")) {
    return `找不到主機 ${target}（DNS 解析失敗）。請確認網址正確。`;
  }
  if (cause === "ETIMEDOUT" || msg.includes("ETIMEDOUT")) {
    return `連線 ${target} 超時。請確認網路狀態與 endpoint 設定。`;
  }
  if (msg.includes("fetch failed")) {
    return isLocal
      ? `無法連線到 ${target}。請確認 ${providerLabel(providerId)} Server 已啟動（endpoint: ${target}）。`
      : `無法連線到 ${target}。請檢查網路連線或 API key 是否正確。`;
  }
  return msg;
}

function providerLabel(id: LLMProviderId): string {
  const names: Record<LLMProviderId, string> = {
    anthropic: "Anthropic Claude",
    openai: "OpenAI",
    google: "Google Gemini",
    xai: "xAI Grok",
    ollama: "Ollama",
    lmstudio: "LM Studio",
    "rwkv-runner": "RWKV Runner",
  };
  return names[id];
}
