import { useEffect, useState } from "react";
import type { AppSettings, LLMProviderId } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS } from "@novel-writer/shared-types";
import { ProviderCard } from "./ProviderCard.js";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage(res.ok ? "已儲存" : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("確定要還原所有設定為出廠預設？")) return;
    await fetch("/api/settings/reset", { method: "POST" });
    const r = await fetch("/api/settings");
    setSettings((await r.json()) as AppSettings);
    setMessage("已重設");
  }

  if (!settings) {
    return <div className="p-8 text-gray-500">載入設定中…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-4">
      <h1 className="text-2xl font-semibold mb-4">設定</h1>

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

      <div className="flex items-center gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={handleReset} className="px-4 py-2 border rounded">
          重設為出廠預設
        </button>
        {message && <span className="text-sm text-gray-500">{message}</span>}
      </div>
    </div>
  );
}
