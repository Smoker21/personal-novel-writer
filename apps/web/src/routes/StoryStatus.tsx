import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getStoryStatus,
  putStatus,
  getSettings,
  isLlmConfigured,
} from '@/storage/projectStore';
import type { StatusDoc } from '@/types';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { LlmNotConfiguredModal } from '@/components/LlmNotConfiguredModal';
import { useToasts } from '@/hooks/useToasts';

export function StoryStatus() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<StatusDoc | null>(null);
  const [content, setContent] = useState('');
  const [shortenOpen, setShortenOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [target, setTarget] = useState(50);
  const [busy, setBusy] = useState(false);
  const toasts = useToasts();

  useEffect(() => {
    void getStoryStatus(slug).then((d) => {
      if (d) {
        setDoc(d);
        setContent(d.content);
      }
    });
  }, [slug]);

  async function save() {
    if (!doc) return;
    const updated = { ...doc, content };
    await putStatus(updated);
    setDoc(updated);
    toasts.pushSuccess('已儲存 status/story_status.md');
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
    // fake: trim each non-protected paragraph by ~half, keep 🔖 / ✨ blocks
    setTimeout(() => {
      const sections = content.split(/(\n## )/);
      const out: string[] = [];
      let acc = '';
      for (const part of sections) {
        if (part.startsWith('\n## ') || sections.indexOf(part) === 0) {
          if (acc) out.push(acc);
          acc = part;
        } else {
          acc += part;
        }
      }
      if (acc) out.push(acc);

      const shortened = out
        .map((blk) => {
          const protectedBlk = blk.includes('🔖') || blk.includes('✨');
          if (protectedBlk) return blk;
          // crude shorten: keep heading line + first half of body
          const lines = blk.split('\n');
          const head = lines.slice(0, 2).join('\n');
          const body = lines.slice(2).join('\n');
          const cutTo = Math.max(40, Math.round(body.length * (target / 100)));
          return head + '\n' + body.slice(0, cutTo);
        })
        .join('');
      setContent(shortened);
      setBusy(false);
      toasts.pushSuccess('已 AI 精簡（🔖 / ✨ 段已保留）');
    }, 1200);
  }

  if (!doc) return <div className="p-8 text-ink-400 text-sm">載入中…</div>;

  return (
    <div className="max-w-editor mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-serif">📘 故事狀態 — story_status.md</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>📜 歷史</Button>
          <Button variant="secondary" size="sm" onClick={() => setShortenOpen(true)} loading={busy}>✨ AI 精簡</Button>
          <Button variant="success" size="sm" onClick={save}>儲存</Button>
        </div>
      </div>

      <div className="border border-ink-200 dark:border-ink-700 rounded-card bg-white dark:bg-ink-800 overflow-hidden">
        {/* Annotated preview view sits above the textarea — text is shown by the textarea below.
            The preview gives the visual "left bar" treatment to 🔖 / ✨ sections. */}
        <ProtectedSectionsPreview content={content} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full font-prose px-5 py-4 outline-none bg-transparent min-h-[420px] resize-none border-t border-ink-200 dark:border-ink-700"
          placeholder="story_status.md 內容…"
        />
      </div>

      <Modal
        open={shortenOpen}
        onClose={() => setShortenOpen(false)}
        title="AI 精簡 story_status.md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShortenOpen(false)}>取消</Button>
            <Button variant="primary" onClick={aiShorten}>執行</Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-200 mb-4 leading-relaxed">
          AI 會把整段精簡，但<strong>保留 🔖 伏筆 / ✨ 轉折點</strong> 段落不動。
        </p>
        <label className="block text-sm">
          <span className="block text-xs text-ink-500 mb-1">精簡目標長度（保留 % 內容）</span>
          <input
            type="range"
            min={20}
            max={90}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-ink-500">{target}%</span>
        </label>
      </Modal>
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fileKey="status:story"
        fileLabel="status/story_status.md"
        onRestore={(snap, msg) => {
          setContent(snap);
          toasts.pushInfo(`已還原到「${msg}」`);
        }}
      />
      <LlmNotConfiguredModal open={llmOpen} onClose={() => setLlmOpen(false)} />
    </div>
  );
}

function ProtectedSectionsPreview({ content }: { content: string }) {
  // List the protected section headings ('## 🔖 ...' / '## ✨ ...')
  const protectedSections = content
    .split('\n## ')
    .filter((s) => s.startsWith('🔖') || s.startsWith('✨'))
    .map((s) => '## ' + s);
  if (protectedSections.length === 0) return null;
  return (
    <div className="px-5 py-3 bg-ink-50 dark:bg-ink-900/40 text-xs text-ink-500 dark:text-ink-300">
      <div className="mb-1 text-ink-500">受 AI 精簡保護段落：</div>
      <div className="space-y-1">
        {protectedSections.map((s, i) => (
          <div key={i} className="status-protected font-serif text-[13px] line-clamp-1">
            {s.split('\n')[0]}
          </div>
        ))}
      </div>
    </div>
  );
}
