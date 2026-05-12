import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getCharacter,
  putCharacter,
  deleteCharacter,
  getSettings,
  isLlmConfigured,
} from '@/storage/projectStore';
import type { Character } from '@/types';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { LlmNotConfiguredModal } from '@/components/LlmNotConfiguredModal';
import { useToasts } from '@/hooks/useToasts';
import { fakeStream } from '@/fake/streamGenerator';
import { FAKE_AI_CHARACTER_BODY } from '@/fake/sampleProse';
import { hashString } from '@/fake/seed';
import { formatRelativeTime } from '@/utils/time';

const BLOCKS = [
  { id: 'identity', label: '身分基礎', defaultOpen: true },
  { id: 'personality', label: '個性參考' },
  { id: 'appearance', label: '外貌參考' },
  { id: 'voice', label: '對話與寫作' },
  { id: 'relations', label: '關係' },
  { id: 'intimate', label: '親密場景描寫參考', warn: true },
] as const;

export function CharacterEdit() {
  const { slug = '', id = '' } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const toasts = useToasts();

  const [c, setC] = useState<Character | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ identity: true, personality: false, appearance: false, voice: false, relations: false, intimate: false });
  const [streaming, setStreaming] = useState(false);
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      const found = await getCharacter(id);
      if (!found) {
        toasts.pushError('找不到角色');
        navigate(`/p/${slug}/characters`);
        return;
      }
      setC(found);
    })();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function patch(p: Partial<Character>) {
    setC((cur) => (cur ? { ...cur, ...p } : cur));
  }

  function patchBody(newBody: string) {
    setC((cur) => {
      if (!cur) return cur;
      const manuallyEdited = !!cur.bodyLastGeneratedHash &&
        cur.bodyLastGeneratedHash !== hashString(newBody);
      return { ...cur, body: newBody, manuallyEdited };
    });
  }

  async function save() {
    if (!c) return;
    await putCharacter(c);
    toasts.pushSuccess(`已儲存 characters/${c.name}.md`);
  }

  async function aiGenerate() {
    const settings = await getSettings();
    if (!isLlmConfigured(settings)) {
      setLlmModalOpen(true);
      return;
    }
    if (!c) return;
    setStreaming(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    let acc = '';
    try {
      patchBody('');
      for await (const ch of fakeStream(FAKE_AI_CHARACTER_BODY, { delayMs: 30, initialDelayMs: 600, signal: abortRef.current.signal })) {
        acc += ch;
        setC((cur) => (cur ? { ...cur, body: acc } : cur));
      }
    } catch {
      toasts.pushError('AI 生成失敗');
    } finally {
      setStreaming(false);
      const finalHash = hashString(acc);
      setC((cur) =>
        cur
          ? {
              ...cur,
              body: acc,
              bodyLastModel: 'anthropic:claude-haiku-4-5',
              bodyLastGeneratedAt: Date.now(),
              bodyLastGeneratedHash: finalHash,
              manuallyEdited: false,
            }
          : cur,
      );
    }
  }

  async function doDelete() {
    if (!c) return;
    await deleteCharacter(c.id);
    setConfirmDelete(false);
    toasts.pushInfo('已刪除角色');
    navigate(`/p/${slug}/characters`);
  }

  if (!c) return <div className="p-8 text-ink-400 text-sm">載入中…</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to={`/p/${slug}/characters`} className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-sm">
            ← 角色列表
          </Link>
          <h1 className="text-2xl font-serif">{c.name || '未命名角色'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>📜 歷史</Button>
          <Button variant="success" size="sm" onClick={save}>儲存</Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>刪除</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT: structured fields */}
        <div className="space-y-3">
          {BLOCKS.map((b) => (
            <Block
              key={b.id}
              label={b.label}
              warn={'warn' in b ? !!b.warn : false}
              open={!!open[b.id]}
              onToggle={() => setOpen((s) => ({ ...s, [b.id]: !s[b.id] }))}
            >
              {b.id === 'identity' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="名稱 *">
                    <input value={c.name} onChange={(e) => patch({ name: e.target.value })} className={inp} />
                    {c.name && c.name !== '新角色' && (
                      <p className="text-xs text-ink-400 mt-1">將同步重命名 characters/&lt;old&gt;.md → {c.name}.md</p>
                    )}
                  </Field>
                  <Field label="年齡">
                    <input type="number" value={c.age ?? ''} onChange={(e) => patch({ age: e.target.value ? Number(e.target.value) : undefined })} className={inp} />
                  </Field>
                  <Field label="性別">
                    <input value={c.gender ?? ''} onChange={(e) => patch({ gender: e.target.value })} className={inp} />
                  </Field>
                  <Field label="代名詞">
                    <input value={c.pronoun ?? ''} onChange={(e) => patch({ pronoun: e.target.value })} className={inp} />
                  </Field>
                  <Field label="角色定位 (role)" full>
                    <input value={c.role ?? ''} onChange={(e) => patch({ role: e.target.value })} className={inp} placeholder="主角 / 配角 / 反派 / 路人" />
                  </Field>
                </div>
              )}

              {b.id === 'personality' && (
                <div className="space-y-3">
                  <Field label="個性標籤（逗號分隔）">
                    <input
                      value={c.personalityTags.join('，')}
                      onChange={(e) => patch({ personalityTags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
                      className={inp}
                      placeholder="內向，含蓄，敏感"
                    />
                    <ChipRow tags={c.personalityTags} />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="MBTI">
                      <select value={c.mbti ?? ''} onChange={(e) => patch({ mbti: e.target.value })} className={inp}>
                        <option value="">—</option>
                        {['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'].map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </Field>
                    <Field label="星座">
                      <input value={c.zodiac ?? ''} onChange={(e) => patch({ zodiac: e.target.value })} className={inp} />
                    </Field>
                    <Field label="血型">
                      <input value={c.bloodType ?? ''} onChange={(e) => patch({ bloodType: e.target.value })} className={inp} />
                    </Field>
                  </div>
                  <Field label="文化背景">
                    <textarea value={c.culturalBackground ?? ''} onChange={(e) => patch({ culturalBackground: e.target.value })} className={inp} rows={2} />
                  </Field>
                </div>
              )}

              {b.id === 'appearance' && (
                <div className="space-y-3">
                  <div className="flex gap-2 mb-2">
                    <button disabled className="text-xs px-2 py-1 rounded border border-ink-200 dark:border-ink-700 text-ink-400">📷 上傳參考圖（v0.2）</button>
                    <button disabled className="text-xs px-2 py-1 rounded border border-ink-200 dark:border-ink-700 text-ink-400">🎨 文字生圖（v0.3）</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="身高 (cm)">
                      <input type="number" value={c.heightCm ?? ''} onChange={(e) => patch({ heightCm: e.target.value ? Number(e.target.value) : undefined })} className={inp} />
                    </Field>
                    <Field label="體型">
                      <input value={c.bodyType ?? ''} onChange={(e) => patch({ bodyType: e.target.value })} className={inp} />
                    </Field>
                    <Field label="髮型與髮色" full>
                      <input value={c.hairAndColor ?? ''} onChange={(e) => patch({ hairAndColor: e.target.value })} className={inp} />
                    </Field>
                    <Field label="眼睛" full>
                      <input value={c.eyes ?? ''} onChange={(e) => patch({ eyes: e.target.value })} className={inp} />
                    </Field>
                    <Field label="其他特徵" full>
                      <textarea value={c.otherFeatures ?? ''} onChange={(e) => patch({ otherFeatures: e.target.value })} className={inp} rows={2} />
                    </Field>
                  </div>
                </div>
              )}

              {b.id === 'voice' && (
                <div className="space-y-3">
                  <Field label="說話節奏">
                    <select value={c.dialoguePace ?? ''} onChange={(e) => patch({ dialoguePace: (e.target.value || undefined) as Character['dialoguePace'] })} className={inp}>
                      <option value="">—</option>
                      <option value="slow">慢</option>
                      <option value="medium">中</option>
                      <option value="fast">快</option>
                    </select>
                  </Field>
                  <Field label="用詞偏好">
                    <textarea value={c.wordingPreference ?? ''} onChange={(e) => patch({ wordingPreference: e.target.value })} className={inp} rows={2} />
                  </Field>
                  <Field label="寫作時要避免">
                    <textarea value={c.writingAvoid ?? ''} onChange={(e) => patch({ writingAvoid: e.target.value })} className={inp} rows={2} />
                  </Field>
                </div>
              )}

              {b.id === 'relations' && (
                <Field label="與其他角色的關係 (用 [[角色名]] 連結)">
                  <textarea value={c.relations ?? ''} onChange={(e) => patch({ relations: e.target.value })} className={inp} rows={4} />
                </Field>
              )}

              {b.id === 'intimate' && (
                <Field label="親密場景描寫參考（只有要寫成人題材才填）">
                  <textarea value={c.intimateNotes ?? ''} onChange={(e) => patch({ intimateNotes: e.target.value })} className={inp} rows={3} />
                </Field>
              )}
            </Block>
          ))}
        </div>

        {/* RIGHT: AI body + character status link */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="border border-ink-200 dark:border-ink-700 rounded-card bg-white dark:bg-ink-800">
            <div className="px-4 py-3 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-medium text-sm">敘述（AI 統整）</div>
                {c.bodyLastGeneratedAt && (
                  <div className="text-xs text-ink-400 mt-0.5">
                    上次生成 {c.bodyLastModel ?? '—'} @ {formatRelativeTime(c.bodyLastGeneratedAt)}
                  </div>
                )}
              </div>
              <Button variant="primary" size="sm" loading={streaming} onClick={aiGenerate}>
                ✨ AI 生成角色描述
              </Button>
            </div>
            {c.manuallyEdited && (
              <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/30 text-status-warn dark:text-orange-200 text-xs border-b border-orange-200 dark:border-orange-800">
                ⚠ 此描寫已手動編輯，重新生成會覆蓋
              </div>
            )}
            <textarea
              value={c.body}
              onChange={(e) => patchBody(e.target.value)}
              disabled={streaming}
              className="w-full font-prose px-5 py-4 outline-none bg-transparent min-h-[420px] resize-none disabled:opacity-60"
              placeholder="按上方「✨ AI 生成」會根據左側欄位產生一段連貫描述；也可以直接手寫。"
            />
            <div className="px-4 py-2 border-t border-ink-200 dark:border-ink-700 text-xs text-ink-400 flex items-center justify-between">
              <span>{c.body.length.toLocaleString()} 字</span>
              <Link
                to={`/p/${slug}/status/characters/${c.id}`}
                className="text-accent hover:text-accent-hover"
              >
                查看角色狀態 →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="確認刪除？"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>取消</Button>
            <Button variant="destructive" onClick={doDelete}>確認刪除</Button>
          </>
        }
      >
        <p className="text-sm">將刪除角色「{c.name}」。可從 git 還原，但建議先確認。</p>
      </Modal>
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fileKey={`character:${c.id}`}
        fileLabel={`characters/${c.name}.md`}
      />
      <LlmNotConfiguredModal open={llmModalOpen} onClose={() => setLlmModalOpen(false)} />
    </div>
  );
}

const inp = 'w-full px-3 py-1.5 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm';

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={'block ' + (full ? 'col-span-2' : '')}>
      <span className="block text-xs font-medium text-ink-500 dark:text-ink-300 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Block({
  label,
  open,
  onToggle,
  warn,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={'border rounded-card overflow-hidden ' + (warn ? 'border-orange-200 dark:border-orange-800' : 'border-ink-200 dark:border-ink-700')}>
      <button
        type="button"
        onClick={onToggle}
        className={'w-full px-4 py-3 flex items-center justify-between text-sm font-medium ' + (warn ? 'bg-orange-50/50 dark:bg-orange-900/20' : 'bg-white dark:bg-ink-800')}
      >
        <span>
          {label}
          {warn && <span className="ml-2 text-xs text-status-warn font-normal">只有要寫成人題材才填</span>}
        </span>
        <span className="text-ink-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="p-4 bg-white dark:bg-ink-800 border-t border-ink-100 dark:border-ink-700">{children}</div>}
    </section>
  );
}

function ChipRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.map((t) => (
        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-accent-subtle text-accent-dark dark:bg-accent-dark/40 dark:text-accent-subtle">
          {t}
        </span>
      ))}
    </div>
  );
}
