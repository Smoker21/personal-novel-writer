import type { LLMProviderId, ListProviderModelsResponse } from "@novel-writer/shared-types";
import { useCallback, useEffect, useState } from "react";

interface Props {
  providerId: LLMProviderId;
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
  /** Optional dom test-id. */
  "data-testid"?: string;
  /** If true, the dropdown stays disabled until models load (no fallback text input). */
  required?: boolean;
}

interface State {
  models: { id: string; displayName?: string }[];
  fetchedAt: string | null;
  fromCache: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * M5 (Spec 009) — Model 下拉選單。
 *
 * - 從 GET /api/settings/provider-models/:providerId 拉清單
 * - 24h cache 邏輯由 backend 負責；UI 只顯示 fetchedAt + fromCache 標記
 * - 「↻ refresh」按鈕觸發 ?refresh=true
 * - 載入中：disabled 顯示「載入模型清單…」
 * - 載入失敗：fallback 為文字輸入框（讓使用者照 typing 寫）
 */
export function ModelDropdown({
  providerId,
  value,
  onChange,
  placeholder = "選擇模型",
  required = false,
  ...rest
}: Props) {
  const testId = rest["data-testid"];
  const [state, setState] = useState<State>({
    models: [],
    fetchedAt: null,
    fromCache: false,
    loading: false,
    error: null,
  });

  const load = useCallback(
    async (refresh: boolean) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const url = `/api/settings/provider-models/${providerId}${refresh ? "?refresh=true" : ""}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ListProviderModelsResponse;
        setState({
          models: data.models,
          fetchedAt: data.fetchedAt,
          fromCache: data.fromCache,
          loading: false,
          error: null,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [providerId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const { models, fetchedAt, fromCache, loading, error } = state;

  // Failure → fall back to text input so the user is never blocked
  if (error !== null && !required) {
    return (
      <div className="space-y-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2 py-1 border rounded text-sm font-mono"
          data-testid={testId}
        />
        <div className="flex items-center gap-2 text-xs text-amber-500">
          <span>⚠️ 載入模型清單失敗：{error}</span>
          <button
            type="button"
            onClick={() => void load(true)}
            className="underline"
            disabled={loading}
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  // Selected value not in current models (deprecated / not yet refreshed) — keep it as orphan option
  const hasCurrentValue = value === "" || models.some((m) => m.id === value);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || (required && models.length === 0)}
          className="flex-1 px-2 py-1 border rounded text-sm bg-white text-neutral-900"
          data-testid={testId}
        >
          <option value="">{placeholder}</option>
          {!hasCurrentValue && (
            <option value={value}>
              {value}（清單外，可能已下線）
            </option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName ? `${m.displayName}（${m.id}）` : m.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          title="重新拉取模型清單"
          className="text-sm px-2 py-1 border rounded disabled:opacity-50"
          aria-label="重新拉取模型清單"
        >
          ↻
        </button>
      </div>
      <div className="text-xs text-neutral-500">
        {loading
          ? "載入模型清單…"
          : fetchedAt
            ? `${models.length} 個模型 · ${fromCache ? "快取" : "剛抓取"}（${new Date(fetchedAt).toLocaleString()}）`
            : ""}
      </div>
    </div>
  );
}
