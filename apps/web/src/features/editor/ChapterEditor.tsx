/**
 * ChapterEditor — CodeMirror 6 整合元件
 *
 * 設計重點：
 * - 以 useRef<EditorView> 持有 CM6 實例（非受控 React state）
 * - updateListener debounce 1500ms → putDraft + markDirty
 * - Mod-s keymap → onSave?.()
 * - window blur + beforeunload → 立即 flush
 * - onContentRef 讓父元件取得 getContent 函式
 * - 父元件應以 key={`${projectHash}:${chapterNumber}`} 強制重建
 */
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { draftKey, putDraft } from "../../lib/db";
import { useEditorStore } from "../../stores/editor-store";

interface Props {
  projectHash: string;
  chapterNumber: number;
  initialContent: string;
  baseMtime: string;
  initialTitle: string;
  /** 父元件透過此 callback 拿到 getContent 函式 */
  onContentRef: (getContent: () => string) => void;
  /** Ctrl/Cmd+S 觸發 */
  onSave?: () => void;
}

export function ChapterEditor({
  projectHash,
  chapterNumber,
  initialContent,
  baseMtime,
  initialTitle,
  onContentRef,
  onSave,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const store = useEditorStore();

  // 使用 ref 存最新的 baseMtime / title，讓 flush 函式拿到最新值
  const baseMtimeRef = useRef(baseMtime);
  const titleRef = useRef(initialTitle);
  baseMtimeRef.current = baseMtime;
  titleRef.current = store.chapter?.title ?? initialTitle;

  // M5: 從 store 即時讀 frontmatter 三欄帶入 DraftRow（切章時不掉）
  const snapshotFrontmatter = () => {
    const s = useEditorStore.getState();
    return {
      participants: s.participants,
      outline: s.outline,
      requirements: s.requirements,
    };
  };

  // flush：立即把目前內容寫入 IndexedDB（不等 debounce）
  const flush = () => {
    if (!isDirtyRef.current || !viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    const now = Date.now();
    void putDraft({
      id: draftKey(projectHash, chapterNumber),
      projectHash,
      chapterNumber,
      content,
      title: titleRef.current,
      updatedAt: now,
      baseMtime: baseMtimeRef.current,
      ...snapshotFrontmatter(),
    });
    store.markDirty(content.replace(/\s/g, "").length, now);
    isDirtyRef.current = false;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot CM6 init; deps intentionally empty
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          flush();
          onSave?.();
          return true;
        },
      },
      {
        key: "Mod-z",
        run: undo,
      },
      {
        key: "Mod-y",
        run: redo,
      },
      {
        key: "Mod-Shift-z",
        run: redo,
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      isDirtyRef.current = true;

      // 清掉上一個 debounce timer
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (!viewRef.current) return;
        const content = viewRef.current.state.doc.toString();
        const now = Date.now();
        void putDraft({
          id: draftKey(projectHash, chapterNumber),
          projectHash,
          chapterNumber,
          content,
          title: titleRef.current,
          updatedAt: now,
          baseMtime: baseMtimeRef.current,
          ...snapshotFrontmatter(),
        });
        store.markDirty(content.replace(/\s/g, "").length, now);
        isDirtyRef.current = false;
      }, 1500);
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        lineNumbers(),
        EditorView.lineWrapping,
        markdown(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        saveKeymap,
        updateListener,
        EditorView.theme({
          "&": { height: "100%", fontSize: "15px", fontFamily: "'Noto Serif TC', serif" },
          ".cm-scroller": { overflow: "auto", lineHeight: "1.8" },
          ".cm-content": { padding: "24px 32px", maxWidth: "720px", margin: "0 auto" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // 暴露 getContent 給父元件
    onContentRef(() => view.state.doc.toString());

    // blur → 立即 flush
    const handleBlur = () => flush();
    window.addEventListener("blur", handleBlur);

    // beforeunload → 立即 flush（不能 await）
    const handleBeforeUnload = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (isDirtyRef.current && viewRef.current) {
        const content = viewRef.current.state.doc.toString();
        const now = Date.now();
        // fire-and-forget：Dexie 佇列通常能在 unload 前完成
        void putDraft({
          id: draftKey(projectHash, chapterNumber),
          projectHash,
          chapterNumber,
          content,
          title: titleRef.current,
          updatedAt: now,
          baseMtime: baseMtimeRef.current,
          ...snapshotFrontmatter(),
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // 清 debounce timer 並 flush
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      flush();

      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      view.destroy();
      viewRef.current = null;
    };
    // 依賴陣列為空：每次 mount 只初始化一次；
    // 父元件需透過 key={`${projectHash}:${chapterNumber}`} 強制重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="flex-1 h-full overflow-hidden" aria-label="章節內容編輯區" />
  );
}
