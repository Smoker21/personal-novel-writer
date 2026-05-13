import { useState } from "react";
import type { LLMProviderId, ProviderConfig, ProviderTestResult } from "@novel-writer/shared-types";
import { CLOUD_PROVIDERS } from "@novel-writer/shared-types";
import { ApiKeyField } from "./ApiKeyField.js";

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

export function ProviderCard({ providerId, config, onChange }: Props) {
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testing, setTesting] = useState(false);
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
    <div className="border rounded p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{LABELS[providerId]}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
          />
          啟用
        </label>
      </div>

      {config.enabled && (
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
              className="w-full px-2 py-1 border rounded text-sm"
              placeholder="http://localhost:11434"
              value={config.endpoint ?? ""}
              onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
            />
          )}
          <input
            type="text"
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="預設模型（選填）"
            value={config.defaultModel ?? ""}
            onChange={(e) => onChange({ ...config, defaultModel: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="text-sm px-3 py-1 border rounded"
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
              <span className="text-sm text-red-600">✗ {testResult.error}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
