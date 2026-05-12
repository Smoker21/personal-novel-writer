import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getCharacter,
  getCharacterStatus,
  putStatus,
  getSettings,
  isLlmConfigured,
} from '@/storage/projectStore';
import type { Character, StatusDoc } from '@/types';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { LlmNotConfiguredModal } from '@/components/LlmNotConfiguredModal';
import { useToasts } from '@/hooks/useToasts';

export function CharacterStatus() {
  const { slug = '', charId = '' } = useParams<{ slug: string; charId: string }>();
  const [c, setC] = useState<Character | null>(null);
  const [doc, setDoc] = useState<StatusDoc | null>(null);
  const [content, setContent] = useState('');
  const [shortenOpen, setShortenOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toasts = useToasts();

  useEffect(() => {
    void (async () => {
      const [ch, st] = await Promise.all([getCharacter(charId), getCharacterStatus(slug, charId)]);
      setC(ch ?? null);
      if (st) {
        setDoc(st);
        setContent(st.content);
      }
    })();
  }, [slug, charId]);

  async function save() {
    if (!doc) return;
    const updated = { ...doc, content };
    await putStatus(updated);
    setDoc(updated);
    toasts.pushSuccess(`已儲存 characters/${c?.name ?? '角色'}_status.md`);
  }

  async function aiShorten() {
    const s = await getSettings();
    if (!isLlmConfigured(s)) {
      setShortenOpen(false);
      setLlmOpen(true);
      return;
    }
    setBusy(true);
    setShortenOpen(false);
    setTimeout(() => {
      // identical strategy to StoryStatus
      setContent((cur) => cur.replace(/(\n[^#\n]+){2,}/g, (m) => '\n' + m.split('\n').filter(Boolean).slice(0, 1).join('\n')));
      setBusy(false);
      toasts.pushSuccess('已 AI 精簡（🔖 / ✨ 段已保留）');
    }, 1200);
  }

  if (!c || !doc) return <div className="p-8 text-ink-400 text-sm">載入中…</div>;

  return (
    <div className="max-w-editor mx-auto px-6 py-8">
      <Link
        to={`/p/${slug}/characters/${c.id}`}
        className="text-sm text-ink-400 hover:text-ink-700 dark:hover:text-ink-100"
      >
        ← 回角色卡
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-serif">👤 {c.name} — 狀態</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>📜 歷史</Button>
          <Button variant="secondary" size="sm" loading={busy} onClick={() => setShortenOpen(true)}>✨ AI 精簡</Button>
          <Button variant="success" size="sm" onClick={save}>儲存</Button>
        </div>
      </div>
      <div className="border border-ink-200 dark:border-ink-700 rounded-card bg-white dark:bg-ink-800">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full font-prose px-5 py-4 outline-none bg-transparent min-h-[420px] resize-none"
        />
      </div>

      <Modal
        open={shortenOpen}
        onClose={() => setShortenOpen(false)}
        title={`AI 精簡 ${c.name}_status.md`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShortenOpen(false)}>取消</Button>
            <Button variant="primary" onClick={aiShorten}>執行</Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-200">AI 會精簡此檔，但保留 🔖 / ✨ 段落不動。</p>
      </Modal>
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fileKey={`status:char:${c.id}`}
        fileLabel={`characters/${c.name}_status.md`}
        onRestore={(snap, msg) => {
          setContent(snap);
          toasts.pushInfo(`已還原到「${msg}」`);
        }}
      />
      <LlmNotConfiguredModal open={llmOpen} onClose={() => setLlmOpen(false)} />
    </div>
  );
}
