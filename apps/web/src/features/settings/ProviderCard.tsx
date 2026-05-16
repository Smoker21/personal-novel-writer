import type { LLMProviderId, ProviderConfig, ProviderTestResult } from "@novel-writer/shared-types";
import { CLOUD_PROVIDERS } from "@novel-writer/shared-types";
import { useState } from "react";
import { ApiKeyField } from "./ApiKeyField";
import { ModelDropdown } from "./ModelDropdown";

interface Props {
  providerId: LLMProviderId;
  config: ProviderConfig;
  onChange: (config: ProviderConfig) => void;
}

const LABELS: Record<LLMProviderId, string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  google: "Google Gemini",
  xai: "xAI Grok",
  ollama: "Ollama（地端）",
  lmstudio: "LM Studio（地端）",
  "rwkv-runner": "RWKV Runner（地端）",
};

const ENDPOINT_PLACEHOLDERS: Partial<Record<LLMProviderId, string>> = {
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234",
  "rwkv-runner": "http://localhost:8000",
};

function friendlyError(providerId: LLMProviderId, msg: string): string {
  // M5 Spec 009 UX：地端 endpoint 連不到時換成「請確認 X 已啟動」
  const isLocal = !CLOUD_PROVIDERS.includes(providerId);
  if (isLocal && (msg.includes("fetch failed") || msg.includes("ECONNREFUSED"))) {
    return `無法連線到 ${LABELS[providerId]}，請確認該伺服器已啟動。`;
  }
  if (msg.includes("401") || msg.toLowerCase().includes("unauthor")) {
    return "API key 無效，請確認金鑰正確。";
  }
  return msg;
}

export function ProviderCard({ providerId, config, onChange }: Props) {
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  // M5: 預設展開（簡化心智）
  const [collapsed, setCollapsed] = useState(false);
  const isCloud = CLOUD_PROVIDERS.includes(providerId);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId, config }),
      });
      const result = (await res.json()) as ProviderTestResult;
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="border rounded p-4 space-y-2" data-testid={`provider-card-${providerId}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{LABELS[providerId]}</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
              data-testid={`provider-enable-${providerId}`}
            />
            啟用
          </label>
          {config.enabled && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-sm text-neutral-400 hover:text-neutral-200"
              title={collapsed ? "展開" : "收合"}
              aria-label={collapsed ? "展開" : "收合"}
            >
              {collapsed ? "▶" : "▼"}
            </button>
          )}
        </div>
      </div>

      {config.enabled && !collapsed && (
        <>
          {isCloud ? (
            <ApiKeyField
              providerId={providerId}
              maskedValue={config.apiKey ?? ""}
              onChange={(apiKey) => onChange({ ...config, apiKey })}
            />
          ) : (
            <input
              type="text"
              className="w-full px-2 py-1 border rounded text-sm font-mono"
              placeholder={ENDPOINT_PLACEHOLDERS[providerId] ?? "http://localhost:..."}
              value={config.endpoint ?? ""}
              onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
              data-testid={`provider-endpoint-${providerId}`}
            />
          )}
          <ModelDropdown
            providerId={providerId}
            value={config.defaultModel ?? ""}
            onChange={(defaultModel) => onChange({ ...config, defaultModel })}
            placeholder="預設模型（選填）"
            data-testid={`provider-default-model-${providerId}`}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="text-sm px-3 py-1 border rounded disabled:opacity-50"
              data-testid={`provider-test-${providerId}`}
            >
              {testing ? "測試中…" : "測試連線"}
            </button>
            {testResult?.ok === true && (
              <span className="text-sm text-green-600">
                ✓ 連線成功（延遲 {testResult.latencyMs}ms
                {testResult.modelCount ? `, ${testResult.modelCount} 個模型` : ""}）
              </span>
            )}
            {testResult?.ok === false && (
              <span className="text-sm text-red-600">
                ✗ {friendlyError(providerId, testResult.error)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
