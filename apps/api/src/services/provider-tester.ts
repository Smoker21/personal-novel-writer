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
    return modelCount !== undefined
      ? { ok: true, latencyMs, modelCount }
      : { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
