import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getChapterByNumber,
  putChapter,
  putCommit,
  getSettings,
  isLlmConfigured,
  countChars,
} from '@/storage/projectStore';
import type { Chapter } from '@/types';
import { Button } from '@/components/Button';
import { SaveStateIndicator } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { LlmNotConfiguredModal } from '@/components/LlmNotConfiguredModal';
import { useDebouncedAutosave } from '@/hooks/useDebouncedAutosave';
import { useToasts } from '@/hooks/useToasts';
import { fakeStream } from '@/fake/streamGenerator';
import { FAKE_AI_CHAPTER_DRAFT } from '@/fake/sampleProse';

export function ChapterEditor() {
  const { slug = '', n = '1' } = useParams<{ slug: string; n: string }>();
  const number = Number(n);
  const navigate = useNavigate();
  const toasts = useToasts();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  // AI draft side panel state
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Modals / drawers
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  // Autosave to IDB
  const { state: saveState, markSaved, resetBaseline } = useDebouncedAutosave(content, {
    debounceMs: 1500,
    onAutosave: async (v) => {
      if (!chapter) return;
      await putChapter({ ...chapter, content: v, title, status: chapter.status === 'adopted' ? 'adopted' : chapter.status });
    },
  });

  // Load chapter
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ch = await getChapterByNumber(slug, number);
      if (cancelled) return;
      if (!ch) {
        toasts.pushError(`找不到第 ${number} 章`);
        navigate(`/p/${slug}`);
        return;
      }
      setChapter(ch);
      setContent(ch.content);
      setTitle(ch.title);
      resetBaseline(ch.content);
    })();
    return () => {
      cancelled = true;
      // Cleanup: stop any running stream when navigating away
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, number]);

  // Save (write to .md + commit + status update toasts)
  async function onSave() {
    if (!chapter) return;
    const now = Date.now();
    const updated: Chapter = {
      ...chapter,
      title,
      content,
      status: chapter.status === 'draft' ? 'saved' : chapter.status,
      savedAt: now,
      updatedAt: now,
      wordCount: countChars(content),
    };
    await putChapter(updated);
    setChapter(updated);
    markSaved(content);
    await putCommit({
      id: `commit-ch-${chapter.id}-${now}`,
      projectSlug: slug,
      fileKey: `chapter:${chapter.id}`,
      message: `chapter(${chapter.number}): 儲存`,
      authorTime: now,
      wordDelta: countChars(content) - countChars(chapter.content),
      snapshotContent: content,
      isCurrent: true,
    });
    const filename = `chapters/chapter_${String(chapter.number).padStart(4, '0')}_${title || '未命名'}.md`;
    toasts.pushSuccess(`已儲存到 ${filename}`);
  }

  // AI write entire chapter — fake stream
  async function onAiWrite() {
    const settings = await getSettings();
    if (!isLlmConfigured(settings)) {
      setLlmModalOpen(true);
      return;
    }
    setDraftOpen(true);
    setDraftText('');
    setStreaming(true);
    setStreamElapsed(0);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const startedAt = Date.now();

    try {
      for await (const ch of fakeStream(FAKE_AI_CHAPTER_DRAFT, {
        delayMs: 35,
        initialDelayMs: 700,
        signal: abortRef.current.signal,
      })) {
        setDraftText((s) => s + ch);
      }
    } finally {
      setStreaming(false);
      setStreamElapsed(Math.round((Date.now() - startedAt) / 1000));
    }
  }

  function abortStream() {
    abortRef.current?.abort();
  }

  function discardDraft() {
    setDraftOpen(false);
    setDraftText('');
  }

  async function onAdoptConfirm() {
    if (!chapter) return;
    setAdoptOpen(false);
    const now = Date.now();
    const updated: Chapter = {
      ...chapter,
      content: draftText,
      status: 'adopted',
      savedAt: now,
      updatedAt: now,
      wordCount: countChars(draftText),
    };
    await putChapter(updated);
    setChapter(updated);
    setContent(draftText);
    resetBaseline(draftText);
    setDraftOpen(false);

    await putCommit({
      id: `commit-ch-${chapter.id}-${now}`,
      projectSlug: slug,
      fileKey: `chapter:${chapter.id}`,
      message: `chapter(${chapter.number}): 採用 AI 草稿`,
      authorTime: now,
      wordDelta: countChars(draftText) - countChars(chapter.content),
      snapshotContent: draftText,
      isCurrent: true,
    });

    // Cascading toasts (per advisor: three sequenced toasts)
    toasts.pushSuccess('已採用 AI 草稿', 1800);
    setTimeout(() => toasts.pushSuccess('已儲存到 .md + git commit', 1800), 700);
    setTimeout(() => toasts.pushInfo('狀態更新中… (story_status / character_status)', 2400), 1500);
  }

  if (!chapter) {
    return <div className="p-8 text-ink-400 text-sm">載入中…</div>;
  }

  const wc = countChars(content);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="border-b border-ink-200 dark:border-ink-700 px-4 py-2 flex items-center gap-3 bg-white dark:bg-ink-800 shrink-0 flex-wrap">
        <div className="text-sm text-ink-400">第 {chapter.number} 章</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="章節標題（儲存後生效）"
          className="font-serif text-base bg-transparent border-b border-transparent hover:border-ink-200 dark:hover:border-ink-600 focus:border-accent focus:outline-none px-1 py-0.5 min-w-[160px]"
        />
        <SaveStateIndicator s={saveState} />
        <span className="text-xs text-ink-400">{wc.toLocaleString()} 字</span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Button variant="success" size="sm" onClick={onSave} disabled={saveState === 'clean' || saveState === 'saved'}>
            儲存
          </Button>
          <Button variant="primary" size="sm" onClick={onAiWrite} disabled={streaming}>
            ✨ AI 撰寫本章
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const settings = await getSettings();
              if (!isLlmConfigured(settings)) {
                setLlmModalOpen(true);
                return;
              }
              toasts.pushInfo('狀態更新中…');
              setTimeout(() => toasts.pushSuccess('狀態已更新'), 1200);
            }}
          >
            ⏱ 立刻更新狀態
          </Button>
          <Button variant="ghost" size="sm" title="Undo (Ctrl+Z)">⟲</Button>
          <Button variant="ghost" size="sm" title="Redo (Ctrl+Y)">⟳</Button>
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>📜 歷史</Button>
          <Link to={`/p/${slug}`} className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-sm px-1">
            ←
          </Link>
        </div>
      </div>

      {/* Body: editor + draft side panel */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 overflow-auto relative">
          <div className="max-w-editor mx-auto px-8 py-10">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="從這裡開始寫……或按右上「✨ AI 撰寫本章」讓 AI 起一個草稿。"
              spellCheck={false}
              disabled={streaming}
              className="w-full min-h-[60vh] resize-none bg-transparent outline-none font-prose text-ink-800 dark:text-ink-100 leading-[1.8] disabled:opacity-50"
              style={{ fontSize: '16px' }}
            />
          </div>
          {streaming && (
            <div className="absolute inset-0 bg-ink-50/40 dark:bg-ink-900/40 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-24">
              <div className="bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-card px-4 py-2 text-sm text-ink-600 dark:text-ink-200 shadow">
                AI 撰寫中…
              </div>
            </div>
          )}
        </div>

        {draftOpen && (
          <DraftPanel
            text={draftText}
            streaming={streaming}
            onAbort={abortStream}
            onAdopt={() => setAdoptOpen(true)}
            onDiscard={discardDraft}
            onRegenerate={onAiWrite}
            elapsed={streamElapsed}
          />
        )}
      </div>

      {/* Adopt confirmation modal */}
      <Modal
        open={adoptOpen}
        onClose={() => setAdoptOpen(false)}
        title="採用 AI 草稿？"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdoptOpen(false)}>取消</Button>
            <Button variant="primary" onClick={onAdoptConfirm}>採用</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-200">
          即將以 AI 草稿覆蓋當前章節內容（{wc.toLocaleString()} 字 → {countChars(draftText).toLocaleString()} 字）。
        </p>
        <ul className="text-xs text-ink-500 mt-3 space-y-1 list-disc pl-5">
          <li>① 寫入 chapters/chapter_{String(chapter.number).padStart(4, '0')}_{title || '未命名'}.md</li>
          <li>② git commit「chapter({chapter.number}): 採用 AI 草稿」</li>
          <li>③ 觸發 status-updater（自動更新 story / character status）</li>
        </ul>
      </Modal>

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fileKey={`chapter:${chapter.id}`}
        fileLabel={`chapter_${String(chapter.number).padStart(4, '0')}_${title || '未命名'}.md`}
        onRestore={(snap, msg) => {
          setContent(snap);
          toasts.pushInfo(`已還原到「${msg}」`);
        }}
      />
      <LlmNotConfiguredModal open={llmModalOpen} onClose={() => setLlmModalOpen(false)} />
    </div>
  );
}

// ---------------- Draft side panel ----------------

function DraftPanel({
  text,
  streaming,
  onAbort,
  onAdopt,
  onDiscard,
  onRegenerate,
  elapsed,
}: {
  text: string;
  streaming: boolean;
  onAbort: () => void;
  onAdopt: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
  elapsed: number;
}) {
  return (
    <aside className="w-[480px] shrink-0 border-l border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 flex flex-col drawer-in">
      <header className="px-4 py-3 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between">
        <div className="text-sm font-medium">✨ AI 草稿</div>
        {streaming && (
          <Button variant="destructive" size="sm" onClick={onAbort}>
            中止
          </Button>
        )}
      </header>
      <div className="flex-1 overflow-auto px-5 py-4 font-prose text-ink-700 dark:text-ink-200 whitespace-pre-wrap">
        <span>{text}</span>
        {streaming && <span className="stream-cursor" />}
      </div>
      {!streaming && text && (
        <footer className="border-t border-ink-200 dark:border-ink-700 px-4 py-3 space-y-2">
          <div className="text-xs text-ink-400">
            使用 anthropic:claude-sonnet-4-6 / {countChars(text).toLocaleString()} 字 / {elapsed} 秒
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={onAdopt}>採用</Button>
            <Button variant="secondary" size="sm" onClick={onRegenerate}>重產出</Button>
            <Button variant="ghost" size="sm" onClick={onDiscard}>丟棄</Button>
          </div>
        </footer>
      )}
    </aside>
  );
}
