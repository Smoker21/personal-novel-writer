import type { LLMProviderId, RoutingPolicy } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS, SYSTEM_PROMPT_OVERRIDE_ENABLED_AGENTS } from "@novel-writer/shared-types";
import { ExpandableTextarea } from "../../components/ExpandableTextarea";
import { ModelDropdown } from "./ModelDropdown";

interface Props {
  agentLabel: string;
  /** chapter-writer / characterCardConsolidator / characterImageExtractor / statusUpdater */
  agentSlug: string;
  /** Currently-enabled provider ids (for the provider dropdown). */
  enabledProviders: LLMProviderId[];
  policy: RoutingPolicy | undefined;
  onChange: (next: RoutingPolicy) => void;
}

function splitPrimary(primary: string): { provider: LLMProviderId | ""; model: string } {
  const idx = primary.indexOf(":");
  if (idx === -1) return { provider: "", model: "" };
  const provider = primary.slice(0, idx) as LLMProviderId;
  return { provider, model: primary.slice(idx + 1) };
}

/**
 * M5 (Spec 009) — AgentRoutingCard
 *
 * - primary 由 provider+model 兩段下拉組成
 * - systemPromptOverride textarea（structured-data Agent disable + 說明）
 * - temperature number input（0.0~2.0，空 = null = Agent 預設）
 */
export function AgentRoutingCard({
  agentLabel,
  agentSlug,
  enabledProviders,
  policy,
  onChange,
}: Props) {
  const current = policy ?? { primary: "", fallbacks: [] };
  const { provider, model } = splitPrimary(current.primary);

  const allowOverride = (SYSTEM_PROMPT_OVERRIDE_ENABLED_AGENTS as readonly string[]).includes(
    agentSlug,
  );

  function setProvider(p: LLMProviderId | "") {
    onChange({ ...current, primary: p === "" ? "" : `${p}:` });
  }
  function setModel(m: string) {
    if (provider === "") return;
    onChange({ ...current, primary: `${provider}:${m}` });
  }
  function setSystemPromptOverride(v: string) {
    onChange({ ...current, systemPromptOverride: v === "" ? null : v });
  }
  function setTemperature(raw: string) {
    if (raw.trim() === "") {
      onChange({ ...current, temperature: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(2, n));
    onChange({ ...current, temperature: clamped });
  }

  const notConfigured = current.primary === "" || provider === "";

  return (
    <div
      className="rounded-lg border border-neutral-700 p-4 space-y-3"
      data-testid={`routing-card-${agentSlug}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-200">{agentLabel}</p>
        {notConfigured && (
          <span className="text-xs text-amber-500">⚠️ 未設定 — 此 Agent 無法使用</span>
        )}
      </div>

      {/* primary: provider + model dual dropdown */}
      <div className="grid grid-cols-[160px_1fr] gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as LLMProviderId | "")}
          className="px-2 py-1.5 border rounded text-sm bg-white text-neutral-900"
          data-testid={`routing-provider-${agentSlug}`}
        >
          <option value="">未選 provider</option>
          {ALL_PROVIDER_IDS.filter((id) => enabledProviders.includes(id)).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        {provider !== "" ? (
          <ModelDropdown
            providerId={provider}
            value={model}
            onChange={setModel}
            placeholder="選擇模型"
            data-testid={`routing-model-${agentSlug}`}
          />
        ) : (
          <select disabled className="px-2 py-1.5 border rounded text-sm bg-neutral-800 opacity-60">
            <option>先選 provider</option>
          </select>
        )}
      </div>

      {/* temperature */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-neutral-400 whitespace-nowrap w-28">
          temperature
        </label>
        <input
          type="number"
          step={0.1}
          min={0}
          max={2}
          value={current.temperature ?? ""}
          onChange={(e) => setTemperature(e.target.value)}
          placeholder="空白 = Agent 預設"
          className="w-28 px-2 py-1 border rounded text-sm"
          data-testid={`routing-temperature-${agentSlug}`}
        />
        <input
          type="range"
          step={0.1}
          min={0}
          max={2}
          value={current.temperature ?? 1}
          onChange={(e) => setTemperature(e.target.value)}
          className="flex-1"
          disabled={current.temperature === null || current.temperature === undefined}
          aria-label={`${agentLabel} temperature slider`}
        />
      </div>

      {/* systemPromptOverride */}
      <div className="space-y-1">
        <label className="text-xs text-neutral-400">系統提示詞覆寫</label>
        {allowOverride ? (
          <ExpandableTextarea
            value={current.systemPromptOverride ?? ""}
            onChange={setSystemPromptOverride}
            minRowsInline={4}
            maxLength={4096}
            ariaLabel={`${agentLabel} system prompt override`}
            placeholder="例如：你是一個繁體中文的小說寫作者，擅長描寫男女情愛細節。"
          />
        ) : (
          <div className="text-xs text-neutral-500 italic px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50">
            此 Agent 為 structured-data，不受 system prompt 覆寫影響。
          </div>
        )}
      </div>
    </div>
  );
}
