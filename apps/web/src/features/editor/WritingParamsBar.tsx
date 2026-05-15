import type { AppSettings } from "@novel-writer/shared-types";
import { useEffect, useMemo, useState } from "react";
import { ExpandableTextarea } from "../../components";
import { useEditorStore } from "../../stores/editor-store";

export function WritingParamsBar() {
  const modelOverride = useEditorStore((s) => s.modelOverride);
  const setModelOverride = useEditorStore((s) => s.setModelOverride);
  const temperatureOverride = useEditorStore((s) => s.temperatureOverride);
  const setTemperatureOverride = useEditorStore((s) => s.setTemperatureOverride);
  const systemPromptOverrideForChapter = useEditorStore((s) => s.systemPromptOverrideForChapter);
  const setSystemPromptOverrideForChapter = useEditorStore(
    (s) => s.setSystemPromptOverrideForChapter,
  );

  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json() as Promise<AppSettings>)
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const modelOptions = useMemo(() => {
    if (!settings?.routing.chapterWriter) return [];
    const seen = new Set<string>();
    const opts: string[] = [];
    for (const m of [
      settings.routing.chapterWriter.primary,
      ...settings.routing.chapterWriter.fallbacks,
    ]) {
      if (m && !seen.has(m)) {
        seen.add(m);
        opts.push(m);
      }
    }
    return opts;
  }, [settings]);

  const defaultModel = settings?.routing.chapterWriter?.primary ?? "(未設定)";

  return (
    <div className="space-y-2 rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
      <div className="text-xs font-medium text-neutral-400">寫作參數（本章覆寫）</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="wp-model" className="text-xs text-neutral-500">
            Model
          </label>
          <select
            id="wp-model"
            value={modelOverride ?? ""}
            onChange={(e) => setModelOverride(e.target.value || null)}
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">(預設 — {defaultModel})</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="wp-temp" className="text-xs text-neutral-500">
            Temperature {temperatureOverride === null ? "(預設 0.7)" : `= ${temperatureOverride}`}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="wp-temp"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperatureOverride ?? 0.7}
              onChange={(e) => setTemperatureOverride(Number(e.target.value))}
              className="flex-1"
            />
            {temperatureOverride !== null && (
              <button
                type="button"
                onClick={() => setTemperatureOverride(null)}
                className="text-xs text-neutral-400 hover:text-neutral-200"
                title="清除覆寫"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="wp-sysprompt" className="text-xs text-neutral-500">
          System prompt 本章覆寫 <span className="text-neutral-600">(切章/reload 後消失)</span>
        </label>
        <ExpandableTextarea
          id="wp-sysprompt"
          value={systemPromptOverrideForChapter}
          onChange={setSystemPromptOverrideForChapter}
          placeholder="例：本章視角改用第一人稱（春雨）；節奏放慢；多用內心戲。"
          label="System prompt 本章覆寫"
          ariaLabel="System prompt 本章覆寫"
          minRowsInline={3}
        />
      </div>
    </div>
  );
}
