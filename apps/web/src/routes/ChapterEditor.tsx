import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getChapterByNumber,
  getProject,
  listCharacters,
  getStoryStatus,
  putChapter,
  putCommit,
  getSettings,
  isLlmConfigured,
  countChars,
} from '@/storage/projectStore';
import type { Chapter, Character, Qwen3Params } from '@/types';
import { DEFAULT_QWEN3_PARAMS } from '@/types';
import { Button } from '@/components/Button';
import { SaveStateIndicator } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { LlmNotConfiguredModal } from '@/components/LlmNotConfiguredModal';
import { ContextPanel } from '@/components/ContextPanel';
import { DraftPanel } from '@/components/DraftPanel';
import { useDebouncedAutosave } from '@/hooks/useDebouncedAutosave';
import { useToasts } from '@/hooks/useToasts';
import { fakeStream } from '@/fake/streamGenerator';
import { FAKE_AI_CHAPTER_DRAFT } from '@/fake/sampleProse';

export function ChapterEditor() {
  const { slug = '', n = '1' } = useParams<{ slug: string; n: string }>();
  const number = Number(n);
  const navigate = useNavigate();
  const toasts = useToasts();

  // Chapter data
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  // AI panel state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // AI draft state
  const [draftText, setDraftText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const [draftManuallyEdited, setDraftManuallyEdited] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Context panel data (loaded from IDB on panel open)
  const [synopsis, setSynopsis] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [prevChapterTail, setPrevChapterTail] = useState('');
  const [storyStatusSnippet, setStoryStatusSnippet] = useState('');

  // Session-only state (not persisted to IDB)
  const [writingRequirements, setWritingRequirements] = useState('');
  const [params, setParams] = useState<Qwen3Params>({ ...DEFAULT_QWEN3_PARAMS });

  // Modals / drawers
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  // Autosave to IDB
  const { state: saveState, markSaved, resetBaseline } = useDebouncedAutosave(content, {
    debounceMs: 1500,
    onAutosave: async (v) => {
      if (!chapter) return;
      await putChapter({
        ...chapter,
        content: v,
        title,
        status: chapter.status === 'adopted' ? 'adopted' : chapter.status,
      });
    },
  });

  // Load chapter + context data
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

      // Reset session-only state when chapter changes
      setWritingRequirements('');
      setParams({ ...DEFAULT_QWEN3_PARAMS });
      setDraftText('');
      setDraftManuallyEdited(false);
      setAiPanelOpen(false);
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, number]);

  // Load context data when AI panel opens
  useEffect(() => {
    if (!aiPanelOpen) return;
    let cancelled = false;
    void (async () => {
      // Project synopsis
      const project = await getProject(slug);
      if (cancelled) return;
      setSynopsis(project?.synopsis ?? '');

      // Characters
      const chars = await listCharacters(slug);
      if (cancelled) return;
      setCharacters(chars);

      // Previous chapter tail (400 chars)
      if (number > 1) {
        const prevCh = await getChapterByNumber(slug, number - 1);
        if (!cancelled && prevCh?.content) {
          setPrevChapterTail(prevCh.content.slice(-400));
        } else if (!cancelled) {
          setPrevChapterTail('');
        }
      } else {
        if (!cancelled) setPrevChapterTail('');
      }

      // Story status (300 chars)
      const status = await getStoryStatus(slug);
      if (cancelled) return;
      setStoryStatusSnippet(status?.content.slice(0, 300) ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [aiPanelOpen, slug, number]);

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
    setAiPanelOpen(true);
    setDraftText('');
    setDraftManuallyEdited(false);
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
    abortRef.current?.abort();
    setDraftText('');
    setDraftManuallyEdited(false);
    setAiPanelOpen(false);
  }

  async function onRegenerate() {
    const settings = await getSettings();
    if (!isLlmConfigured(settings)) {
      setLlmModalOpen(true);
      return;
    }
    setDraftText('');
    setDraftManuallyEdited(false);
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
    setAiPanelOpen(false);

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
  const draftWc = countChars(draftText);

  // Derive character snippets for ContextPanel
  const characterSnippets = characters.map((c) => ({
    name: c.name,
    bodySnippet: c.body.slice(0, 120),
  }));

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
          <Button
            variant="success"
            size="sm"
            onClick={onSave}
            disabled={saveState === 'clean' || saveState === 'saved'}
          >
            儲存
          </Button>
          <Button variant="primary" size="sm" onClick={onAiWrite} disabled={streaming}>
            ✨ AI 撰寫本章
          </Button>
          {aiPanelOpen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                abortRef.current?.abort();
                setAiPanelOpen(false);
              }}
              title="關閉 AI 工作區"
            >
              ✕ 關閉 AI 工作區
            </Button>
          )}
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
          <Button variant="ghost" size="sm" title="Undo (Ctrl+Z)">
            ⟲
          </Button>
          <Button variant="ghost" size="sm" title="Redo (Ctrl+Y)">
            ⟳
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            📜 歷史
          </Button>
          <Link
            to={`/p/${slug}`}
            className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-sm px-1"
          >
            ←
          </Link>
        </div>
      </div>

      {/* Body: single or three-column */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* Col 1: Main editor (always visible) */}
        <div className={`${aiPanelOpen ? 'flex-1 min-w-0' : 'flex-1'} overflow-auto relative`}>
          <div className="max-w-editor mx-auto px-8 py-10">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="從這裡開始寫……或按右上「✨ AI 撰寫本章」讓 AI 起一個草稿。"
              spellCheck={false}
              className="w-full min-h-[60vh] resize-none bg-transparent outline-none font-prose text-ink-800 dark:text-ink-100 leading-[1.8]"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>

        {/* Col 2 & 3: AI workspace (only when aiPanelOpen) */}
        {aiPanelOpen && (
          <>
            {/* Col 2: Context & params — hidden on screens < xl */}
            <aside className="w-80 shrink-0 border-l border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 overflow-y-auto hidden xl:flex xl:flex-col drawer-in">
              <ContextPanel
                synopsis={synopsis}
                characters={characterSnippets}
                prevChapterTail={prevChapterTail}
                storyStatusSnippet={storyStatusSnippet}
                writingRequirements={writingRequirements}
                onWritingRequirementsChange={setWritingRequirements}
                params={params}
                onParamsChange={setParams}
              />
            </aside>

            {/* Col 3: AI draft */}
            <aside className="w-96 shrink-0 border-l border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 flex flex-col drawer-in overflow-hidden">
              <DraftPanel
                text={draftText}
                onChange={(v) => {
                  setDraftText(v);
                  setDraftManuallyEdited(true);
                }}
                streaming={streaming}
                manuallyEdited={draftManuallyEdited}
                wordCount={draftWc}
                elapsed={streamElapsed}
                modelLabel="anthropic:claude-sonnet-4-6"
                onAbort={abortStream}
                onAdopt={() => setAdoptOpen(true)}
                onDiscard={discardDraft}
                onRegenerate={onRegenerate}
              />
            </aside>
          </>
        )}
      </div>

      {/* Adopt confirmation modal */}
      <Modal
        open={adoptOpen}
        onClose={() => setAdoptOpen(false)}
        title="採用 AI 草稿？"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdoptOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={onAdoptConfirm}>
              採用
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-200">
          即將以 AI 草稿覆蓋當前章節內容（{wc.toLocaleString()} 字 →{' '}
          {draftWc.toLocaleString()} 字）。
          {draftManuallyEdited && (
            <span className="text-orange-600 dark:text-orange-400 ml-1">
              （草稿已手動修改）
            </span>
          )}
        </p>
        <ul className="text-xs text-ink-500 mt-3 space-y-1 list-disc pl-5">
          <li>
            ① 寫入 chapters/chapter_{String(chapter.number).padStart(4, '0')}_
            {title || '未命名'}.md
          </li>
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
