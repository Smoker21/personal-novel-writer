import { useEffect, useState } from 'react';
import { getSettings, putSettings } from '@/storage/projectStore';
import type { Settings as TSettings, ProviderSettings, AgentModelConfig } from '@/types';
import { Button } from '@/components/Button';
import { useToasts } from '@/hooks/useToasts';
import { useDarkMode } from '@/hooks/useDarkMode';

type Tab = 'providers' | 'models' | 'preferences' | 'about';

export function Settings() {
  const [s, setS] = useState<TSettings | null>(null);
  const [tab, setTab] = useState<Tab>('providers');
  const [dirty, setDirty] = useState(false);
  const toasts = useToasts();
  const [, setDark, toggleDark] = useDarkMode();

  useEffect(() => {
    void getSettings().then((v) => v && setS(v));
  }, []);

  function patch(p: Partial<TSettings>) {
    setS((cur) => (cur ? { ...cur, ...p } : cur));
    setDirty(true);
  }

  async function save() {
    if (!s) return;
    await putSettings(s);
    setDirty(false);
    toasts.pushSuccess('設定已儲存');
  }

  if (!s) return <div className="p-8 text-ink-400">載入中…</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-serif mb-6">設定</h1>
      {dirty && (
        <div className="mb-4 px-4 py-2 rounded-btn bg-orange-50 dark:bg-orange-900/30 text-status-warn dark:text-orange-200 text-sm flex items-center justify-between">
          <span>有未儲存變更</span>
          <Button variant="primary" size="sm" onClick={save}>儲存</Button>
        </div>
      )}

      <div className="flex gap-6">
        <nav className="w-44 shrink-0 space-y-1 text-sm">
          {(
            [
              ['providers', 'Providers'],
              ['models', '預設模型'],
              ['preferences', '個人偏好'],
              ['about', '關於'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={
                'w-full text-left px-3 py-2 rounded ' +
                (tab === k
                  ? 'bg-accent-subtle text-accent-dark dark:bg-accent-dark/40 dark:text-accent-subtle'
                  : 'text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-700')
              }
            >
              {l}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          {tab === 'providers' && (
            <ProvidersTab
              providers={s.providers}
              onChange={(providers) => patch({ providers })}
            />
          )}
          {tab === 'models' && (
            <ModelsTab
              providers={s.providers}
              agents={s.agents}
              onChange={(agents) => patch({ agents })}
            />
          )}
          {tab === 'preferences' && (
            <PreferencesTab
              prefs={s.preferences}
              onChange={(preferences) => patch({ preferences })}
              onToggleDark={() => {
                toggleDark();
                patch({ preferences: { ...s.preferences, darkMode: !s.preferences.darkMode } });
              }}
            />
          )}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

function ProvidersTab({
  providers,
  onChange,
}: {
  providers: ProviderSettings[];
  onChange: (next: ProviderSettings[]) => void;
}) {
  function patchOne(id: string, patch: Partial<ProviderSettings>) {
    onChange(providers.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function testConnection(id: string) {
    patchOne(id, { testStatus: 'testing', testError: undefined });
    setTimeout(() => {
      // fake: succeed if apiKey or endpoint present
      const p = providers.find((x) => x.id === id);
      const ok = !!(p && (p.apiKey || p.endpoint));
      patchOne(id, ok ? { testStatus: 'success' } : { testStatus: 'fail', testError: '缺少 API key 或 endpoint' });
    }, 1000);
  }

  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <ProviderCard
          key={p.id}
          p={p}
          onPatch={(patch) => patchOne(p.id, patch)}
          onTest={() => testConnection(p.id)}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  p,
  onPatch,
  onTest,
}: {
  p: ProviderSettings;
  onPatch: (patch: Partial<ProviderSettings>) => void;
  onTest: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const masked = p.apiKey
    ? p.apiKey.length > 8
      ? p.apiKey.slice(0, 7) + '••••••••' + p.apiKey.slice(-4)
      : '••••••••'
    : '';

  const hasEndpoint = ['lmstudio', 'ollama', 'rwkv-runner'].includes(p.id);

  return (
    <section className="border border-ink-200 dark:border-ink-700 rounded-card bg-white dark:bg-ink-800 overflow-hidden">
      <header className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.enabled}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
            />
            <span className="font-medium">{p.label}</span>
          </label>
          {p.testStatus === 'success' && <span className="text-status-saved text-sm">✓ 連線成功</span>}
          {p.testStatus === 'fail' && <span className="text-status-error text-sm">✕ {p.testError}</span>}
        </div>
      </header>
      {p.enabled && (
        <div className="p-4 space-y-3">
          {!hasEndpoint && (
            <div>
              <label className="block text-xs text-ink-500 mb-1">API key</label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={p.apiKey ?? ''}
                  placeholder={p.apiKey ? masked : 'sk-...'}
                  onChange={(e) => onPatch({ apiKey: e.target.value })}
                  className="flex-1 px-3 py-1.5 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm font-mono"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? '隱藏' : '顯示'}
                </Button>
              </div>
            </div>
          )}
          {hasEndpoint && (
            <div>
              <label className="block text-xs text-ink-500 mb-1">地端 endpoint</label>
              <input
                value={p.endpoint ?? ''}
                onChange={(e) => onPatch({ endpoint: e.target.value })}
                className="w-full px-3 py-1.5 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm font-mono"
                placeholder="http://localhost:1234/v1"
              />
            </div>
          )}
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={p.testStatus === 'testing'}
              onClick={onTest}
            >
              測試連線
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ModelsTab({
  providers,
  agents,
  onChange,
}: {
  providers: ProviderSettings[];
  agents: AgentModelConfig[];
  onChange: (next: AgentModelConfig[]) => void;
}) {
  const enabledProviders = providers.filter((p) => p.enabled);
  const allModelOptions = enabledProviders.flatMap((p) =>
    p.models.map((m) => ({ value: `${p.id}:${m}`, label: `${p.label} · ${m}` })),
  );

  function applyPreset(name: 'cloud' | 'cloud-fallback' | 'local' | 'test') {
    const cloud = allModelOptions.find((o) => o.value.startsWith('anthropic:'))?.value
      ?? allModelOptions.find((o) => o.value.startsWith('openai:'))?.value
      ?? allModelOptions[0]?.value;
    const local = allModelOptions.find((o) => o.value.startsWith('ollama:'))?.value
      ?? allModelOptions.find((o) => o.value.startsWith('lmstudio:'))?.value;
    const next = agents.map((a) => {
      switch (name) {
        case 'cloud':
          return { ...a, primary: cloud, fallbacks: [] };
        case 'cloud-fallback':
          return { ...a, primary: cloud, fallbacks: local ? [local] : [] };
        case 'local':
          return { ...a, primary: local, fallbacks: [] };
        case 'test':
          return { ...a, primary: allModelOptions[0]?.value, fallbacks: [] };
      }
    });
    onChange(next);
  }

  function patch(idx: number, p: Partial<AgentModelConfig>) {
    onChange(agents.map((a, i) => (i === idx ? { ...a, ...p } : a)));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="secondary" size="sm" onClick={() => applyPreset('cloud')}>全雲端</Button>
        <Button variant="secondary" size="sm" onClick={() => applyPreset('cloud-fallback')}>Cloud + 地端 fallback</Button>
        <Button variant="secondary" size="sm" onClick={() => applyPreset('local')}>全地端</Button>
        <Button variant="secondary" size="sm" onClick={() => applyPreset('test')}>測試版</Button>
      </div>
      {enabledProviders.length === 0 && (
        <p className="text-sm text-ink-400 mb-4">先去 Providers 啟用至少一個 provider，這裡才能選模型。</p>
      )}
      <div className="border border-ink-200 dark:border-ink-700 rounded-card overflow-hidden bg-white dark:bg-ink-800">
        {agents.map((a, i) => (
          <div key={a.agent} className="px-4 py-3 border-b border-ink-100 dark:border-ink-700 last:border-b-0">
            <div className="text-sm font-medium mb-2">{a.agent}</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="block text-ink-500 mb-1">primary</span>
                <select
                  value={a.primary ?? ''}
                  onChange={(e) => patch(i, { primary: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm"
                >
                  <option value="">—</option>
                  {allModelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="block text-xs">
                <span className="block text-ink-500 mb-1">fallbacks (用逗號分隔)</span>
                <input
                  value={a.fallbacks.join(',')}
                  onChange={(e) => patch(i, { fallbacks: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className="w-full px-2 py-1.5 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm font-mono"
                  placeholder="anthropic:claude-haiku-4-5,ollama:llama3.1"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreferencesTab({
  prefs,
  onChange,
  onToggleDark,
}: {
  prefs: TSettings['preferences'];
  onChange: (next: TSettings['preferences']) => void;
  onToggleDark: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <label className="flex items-center justify-between border border-ink-200 dark:border-ink-700 rounded-card px-4 py-3 bg-white dark:bg-ink-800">
        <div>
          <div className="font-medium">深色模式</div>
          <div className="text-xs text-ink-400">深色背景偏暖，編輯區字色為米色</div>
        </div>
        <input type="checkbox" checked={prefs.darkMode} onChange={onToggleDark} />
      </label>

      <label className="block border border-ink-200 dark:border-ink-700 rounded-card px-4 py-3 bg-white dark:bg-ink-800">
        <div className="font-medium mb-1">編輯器寬度</div>
        <select
          value={prefs.editorWidth}
          onChange={(e) => onChange({ ...prefs, editorWidth: e.target.value as TSettings['preferences']['editorWidth'] })}
          className="px-2 py-1 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm"
        >
          <option value="narrow">窄 (560px)</option>
          <option value="normal">標準 (720px)</option>
          <option value="wide">寬 (920px)</option>
        </select>
      </label>

      <label className="block border border-ink-200 dark:border-ink-700 rounded-card px-4 py-3 bg-white dark:bg-ink-800">
        <div className="font-medium mb-1">Autosave debounce</div>
        <input
          type="number"
          min={500}
          max={5000}
          step={100}
          value={prefs.autosaveDebounceMs}
          onChange={(e) => onChange({ ...prefs, autosaveDebounceMs: Number(e.target.value) })}
          className="px-2 py-1 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm w-32"
        />
        <span className="ml-2 text-xs text-ink-400">毫秒</span>
      </label>

      <label className="flex items-center justify-between border border-ink-200 dark:border-ink-700 rounded-card px-4 py-3 bg-white dark:bg-ink-800">
        <div>
          <div className="font-medium">採用 AI 草稿時略過確認對話框</div>
          <div className="text-xs text-ink-400">即使略過，也仍會 git commit，可從歷史還原</div>
        </div>
        <input
          type="checkbox"
          checked={prefs.skipAdoptionConfirm}
          onChange={(e) => onChange({ ...prefs, skipAdoptionConfirm: e.target.checked })}
        />
      </label>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="text-sm text-ink-600 dark:text-ink-200 space-y-3">
      <p><strong>Novel Writer</strong> v0.1 prototype</p>
      <p className="text-ink-400 text-xs">
        本機優先 / 隱私為先 / 沒有登入 / 沒有雲端帳號。
      </p>
      <p className="text-xs text-ink-400">
        這是 click-through prototype；所有「儲存」其實寫進瀏覽器 IndexedDB；所有 AI 回應都是 fake stream。
      </p>
    </div>
  );
}
