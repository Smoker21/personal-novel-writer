import type { AppSettings, LLMProviderId, RoutingPolicy } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentRoutingCard } from "./AgentRoutingCard";
import { PresetButtons } from "./PresetButtons";
import { ProviderCard } from "./ProviderCard";
import { ResetConfirmDialog } from "./ResetConfirmDialog";

type RoutingKey = keyof AppSettings["routing"];

const AGENT_ROUTING_ITEMS: Array<{
  key: RoutingKey;
  agentSlug: string;
  label: string;
}> = [
  { key: "chapterWriter", agentSlug: "chapter-writer", label: "章節寫手（chapter-writer）" },
  {
    key: "characterCardConsolidator",
    agentSlug: "character-card-consolidator",
    label: "角色卡統整員（character-card-consolidator）",
  },
  {
    key: "characterImageExtractor",
    agentSlug: "character-image-extractor",
    label: "角色圖片解析員（character-image-extractor）",
  },
  { key: "statusUpdater", agentSlug: "status-updater", label: "狀態更新員（status-updater）" },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json() as Promise<AppSettings>)
      .then(setSettings);
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage("已儲存");
      } else {
        const body = (await res.json()) as { message?: string };
        setMessage(`儲存失敗：${body.message ?? res.statusText}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetOpen(false);
    await fetch("/api/settings/reset", { method: "POST" });
    const r = await fetch("/api/settings");
    setSettings((await r.json()) as AppSettings);
    setMessage("已重設");
  }

  function setRouting(key: RoutingKey, policy: RoutingPolicy) {
    if (!settings) return;
    setSettings({
      ...settings,
      routing: { ...settings.routing, [key]: policy },
    });
  }

  function applyPreset(values: {
    chapterWriter: string;
    characterCardConsolidator: string;
    characterImageExtractor: string;
    statusUpdater: string;
  }) {
    if (!settings) return;
    const newRouting: AppSettings["routing"] = { ...settings.routing };
    for (const [key, primary] of Object.entries(values)) {
      const k = key as RoutingKey;
      const existing = newRouting[k] ?? { primary: "", fallbacks: [] };
      // M5：preset 不覆寫 systemPromptOverride / temperature
      newRouting[k] = { ...existing, primary };
    }
    setSettings({ ...settings, routing: newRouting });
  }

  if (!settings) {
    return <div className="p-8 text-gray-500">載入設定中…</div>;
  }

  const enabledProviders = ALL_PROVIDER_IDS.filter((id) => settings.providers[id]?.enabled);

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-700">
          ← 首頁
        </Link>
        <h1 className="text-2xl font-semibold">設定</h1>
      </div>

      {/* Provider section */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">LLM Providers</h2>
        {ALL_PROVIDER_IDS.map((id: LLMProviderId) => (
          <ProviderCard
            key={id}
            providerId={id}
            config={settings.providers[id]}
            onChange={(cfg) =>
              setSettings({
                ...settings,
                providers: { ...settings.providers, [id]: cfg },
              })
            }
          />
        ))}
      </section>

      {/* Agent routing section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Agent 預設模型</h2>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-neutral-400">快速套用預設組合：</p>
          <PresetButtons onApply={applyPreset} />
        </div>
        <div className="space-y-2">
          {AGENT_ROUTING_ITEMS.map(({ key, agentSlug, label }) => (
            <AgentRoutingCard
              key={key}
              agentLabel={label}
              agentSlug={agentSlug}
              enabledProviders={enabledProviders}
              policy={settings.routing[key]}
              onChange={(policy) => setRouting(key, policy)}
            />
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 pt-4 border-t border-neutral-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
          data-testid="settings-save"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="px-4 py-2 border border-neutral-600 rounded hover:bg-neutral-800"
          data-testid="settings-reset"
        >
          重設為出廠預設
        </button>
        {message && <span className="text-sm text-neutral-400">{message}</span>}
      </div>

      <ResetConfirmDialog
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        onConfirm={handleReset}
      />
    </div>
  );
}
