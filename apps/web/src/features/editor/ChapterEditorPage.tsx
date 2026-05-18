/**
 * ChapterEditorPage — M5「AI 寫作工作台」整合頁面
 *
 * 結構：
 *   ├─ 左欄：ChapterList
 *   └─ 中欄：
 *       ├─ 工具列（首頁 / 角色 / TitleInput / Indicator / SaveButton / GenerateButton / Status / 歷史）
 *       ├─ 工作台面板（可摺疊）：ContextPreview / WritingParams / Outline / Requirements / ParticipantPicker
 *       └─ CM6 主編輯區 + DraftPanel（並排）
 *
 * 載入流程（依 spec 003）：
 *   Case A: 沒 draft              → 載入 .md；state = clean
 *   Case B: draft.content === .md → 載入 .md；刪 draft；state = clean
 *   Case C: draft.baseMtime === .md.mtime（正常 dirty）→ 載入 draft；state = browser-only；toast
 *   Case D: draft.baseMtime !== .md.mtime（外部修改）→ ConflictDialog
 */
import type { ChapterFile } from "@novel-writer/shared-types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { deleteDraft, draftKey, getDraft, putDraft } from "../../lib/db";
import { useWindowFocusEffect } from "../../lib/window-focus";
import { useDraftStore } from "../../stores/draft-store";
import { useEditorStore } from "../../stores/editor-store";
import { HistoryPanel } from "../git/HistoryPanel";
import { UpdateStatusButton } from "../status/UpdateStatusButton";
import { ChapterEditor } from "./ChapterEditor";
import { ChapterList } from "./ChapterList";
import { ConflictDialog } from "./ConflictDialog";
import { ContextPreviewPanel } from "./ContextPreviewPanel";
import { DraftPanel } from "./DraftPanel";
import { EditorStatusIndicator } from "./EditorStatusIndicator";
import { GenerateButton } from "./GenerateButton";
import { OutlineInput, RequirementsInput } from "./OutlineRequirementsInputs";
import { ParticipantPicker } from "./ParticipantPicker";
import { SaveButton } from "./SaveButton";
import { StatusUpdateIndicator } from "./StatusUpdateIndicator";
import { TitleInput } from "./TitleInput";
import { WritingParamsBar } from "./WritingParamsBar";

interface ConflictState {
  kind: "open" | "save";
  localContent: string;
  serverContent: string;
  serverMtime: string;
}

export function ChapterEditorPage() {
  const { hash } = useParams<{ hash: string }>();
  if (!hash) return <Navigate to="/" replace />;
  return <ChapterEditorPageInner projectHash={hash} />;
}

function ChapterEditorPageInner({ projectHash }: { projectHash: string }) {
  const store = useEditorStore();
  const draftStatus = useDraftStore((s) => s.status);
  const draftReset = useDraftStore((s) => s.reset);

  const [currentChapter, setCurrentChapter] = useState<number | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);

  const [initialContent, setInitialContent] = useState("");
  const [initialBaseMtime, setInitialBaseMtime] = useState("");
  const [initialTitle, setInitialTitle] = useState("");

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const getContentRef = useRef<() => string>(() => "");
  const loadingRef = useRef(false);

  function showToast(msg: string, duration = 3000) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }

  async function loadChapter(n: number) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    store.markLoading();
    setEditorReady(false);

    try {
      const res = await fetch(`/api/projects/${projectHash}/chapters/${n}`);
      if (!res.ok) {
        console.error("loadChapter: fetch failed", res.status);
        return;
      }
      const serverChapter = (await res.json()) as ChapterFile;
      const draft = await getDraft(projectHash, n);

      let contentToLoad = serverChapter.content;
      let caseLabel = "A";

      const baseFrontmatter = {
        baseParticipants: serverChapter.participants,
        baseOutline: serverChapter.outline,
        baseRequirements: serverChapter.requirements,
      };
      const fmEcho = {
        participants: serverChapter.participants,
        outline: serverChapter.outline,
        requirements: serverChapter.requirements,
      };

      if (!draft) {
        caseLabel = "A";
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: serverChapter.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
          ...baseFrontmatter,
        });
        store.markClean(serverChapter.mtime, serverChapter.content, serverChapter.title, fmEcho);
      } else if (draft.content === serverChapter.content) {
        caseLabel = "B";
        await deleteDraft(projectHash, n);
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: serverChapter.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
          ...baseFrontmatter,
        });
        store.markClean(serverChapter.mtime, serverChapter.content, serverChapter.title, fmEcho);
      } else if (draft.baseMtime === serverChapter.mtime) {
        caseLabel = "C";
        contentToLoad = draft.content;
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: draft.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
          ...baseFrontmatter,
        });
        store.setParticipants(draft.participants ?? serverChapter.participants);
        store.setOutline(draft.outline ?? serverChapter.outline);
        store.setRequirements(draft.requirements ?? serverChapter.requirements);
        store.markDirty(draft.content.replace(/\s/g, "").length, draft.updatedAt);
        showToast("這是上次未存入 .md 的草稿，按儲存才會寫入檔案");
      } else {
        caseLabel = "D";
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: draft.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
          ...baseFrontmatter,
        });
        setConflict({
          kind: "open",
          localContent: draft.content,
          serverContent: serverChapter.content,
          serverMtime: serverChapter.mtime,
        });
        contentToLoad = draft.content;
        setInitialContent(contentToLoad);
        setInitialBaseMtime(serverChapter.mtime);
        setInitialTitle(draft.title);
        setCurrentChapter(n);
        return;
      }

      console.log(`loadChapter Case ${caseLabel}: chapter=${n}`);

      setInitialContent(contentToLoad);
      setInitialBaseMtime(serverChapter.mtime);
      setInitialTitle(caseLabel === "C" && draft ? draft.title : serverChapter.title);
      setCurrentChapter(n);
      setEditorKey((k) => k + 1);
      setEditorReady(true);
    } finally {
      loadingRef.current = false;
    }
  }

  const handleWindowFocus = useCallback(() => {
    if (currentChapter !== null && editorReady) {
      void recheckMtime(currentChapter);
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: recheckMtime is intentionally stable across renders
  }, [currentChapter, editorReady, recheckMtime]); // eslint-disable-line react-hooks/exhaustive-deps

  useWindowFocusEffect(handleWindowFocus);

  async function recheckMtime(n: number) {
    if (!store.chapter) return;
    const res = await fetch(`/api/projects/${projectHash}/chapters/${n}`);
    if (!res.ok) return;
    const serverChapter = (await res.json()) as ChapterFile;
    if (serverChapter.mtime !== store.chapter.baseMtime) {
      const currentContent = getContentRef.current();
      setConflict({
        kind: "open",
        localContent: currentContent,
        serverContent: serverChapter.content,
        serverMtime: serverChapter.mtime,
      });
    }
  }

  function handleApplyServer() {
    if (!conflict || !store.chapter) return;
    const { serverContent, serverMtime } = conflict;
    setConflict(null);
    store.markClean(serverMtime, serverContent, store.chapter.fileTitle, {
      participants: store.chapter.baseParticipants,
      outline: store.chapter.baseOutline,
      requirements: store.chapter.baseRequirements,
    });
    setInitialContent(serverContent);
    setInitialBaseMtime(serverMtime);
    setInitialTitle(store.chapter.fileTitle);
    setEditorKey((k) => k + 1);
    setEditorReady(true);
    showToast("已載入伺服器版本");
  }

  function handleForceLocal() {
    if (!conflict || !store.chapter) return;
    setConflict(null);
    setEditorKey((k) => k + 1);
    setEditorReady(true);
    store.markDirty(conflict.localContent.replace(/\s/g, "").length, Date.now());
    showToast("保留本地草稿，請按儲存覆寫伺服器版本");
  }

  function handleCancelConflict() {
    setConflict(null);
    if (!editorReady && currentChapter !== null) {
      void loadChapter(currentChapter);
    }
  }

  const saveTriggerRef = useRef<(() => void) | null>(null);

  function handleEditorSave() {
    saveTriggerRef.current?.();
  }

  async function handleSaveConflict(serverContent: string) {
    const currentContent = getContentRef.current();
    setConflict({
      kind: "save",
      localContent: currentContent,
      serverContent,
      serverMtime: store.chapter?.baseMtime ?? "",
    });
  }

  function handleTitleChange(next: string) {
    store.setTitle(next);
  }

  function handleSelectChapter(n: number) {
    if (n === currentChapter) return;
    draftReset();
    setEditorReady(false);
    void loadChapter(n);
  }

  function handleCreateChapter() {
    /* ChapterList 建立後會 onSelectChapter，這裡不需額外處理 */
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 projectHash 變動時重做
  useEffect(() => {
    async function autoSelectFirstChapter() {
      const res = await fetch(`/api/projects/${projectHash}/chapters`);
      const emptyFm = { participants: [], outline: null, requirements: null };
      if (!res.ok) {
        store.markClean("", "", "", emptyFm);
        return;
      }
      const data = (await res.json()) as { chapters: Array<{ number: number }> };
      const first = data.chapters[0];
      if (first !== undefined) {
        void loadChapter(first.number);
      } else {
        store.markClean("", "", "", emptyFm);
      }
    }
    void autoSelectFirstChapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectHash]);

  // M5: frontmatter dirty autosave watcher — store.participants/outline/requirements 變動 → debounce 1.5s → putDraft
  const participants = useEditorStore((s) => s.participants);
  const outline = useEditorStore((s) => s.outline);
  const requirements = useEditorStore((s) => s.requirements);
  const chapter = useEditorStore((s) => s.chapter);

  useEffect(() => {
    if (!chapter || currentChapter === null || !editorReady) return;
    const dirty =
      JSON.stringify(participants) !== JSON.stringify(chapter.baseParticipants) ||
      outline !== chapter.baseOutline ||
      requirements !== chapter.baseRequirements;
    if (!dirty) return;
    const t = setTimeout(() => {
      const content = getContentRef.current();
      const now = Date.now();
      void putDraft({
        id: draftKey(projectHash, currentChapter),
        projectHash,
        chapterNumber: currentChapter,
        content,
        title: chapter.title,
        updatedAt: now,
        baseMtime: chapter.baseMtime,
        participants,
        outline,
        requirements,
      });
      store.markDirty(content.replace(/\s/g, "").length, now);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    participants,
    outline,
    requirements,
    chapter?.baseMtime,
    currentChapter,
    editorReady,
    chapter?.baseRequirements,
    store.markDirty,
    chapter?.baseParticipants,
    chapter?.baseOutline,
    chapter?.title,
    projectHash,
    chapter,
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <ChapterList
        projectHash={projectHash}
        currentChapter={currentChapter}
        onSelectChapter={handleSelectChapter}
        onCreateChapter={handleCreateChapter}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 工具列 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
          <Link to="/" className="shrink-0 text-sm text-indigo-400 hover:text-indigo-300">
            ← 首頁
          </Link>
          <Link
            to={`/editor/${projectHash}/characters`}
            className="shrink-0 rounded border border-indigo-800 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-900/30"
          >
            角色
          </Link>

          <div className="flex-1">
            <TitleInput value={store.chapter?.title ?? ""} onChange={handleTitleChange} />
          </div>

          <EditorStatusIndicator state={store.state} />

          <SaveButton
            getContent={() => getContentRef.current()}
            onConflict={handleSaveConflict}
            onSaveTriggerRef={(fn) => {
              saveTriggerRef.current = fn;
            }}
          />

          {currentChapter !== null && (
            <GenerateButton projectHash={projectHash} chapterNumber={currentChapter} />
          )}
          {currentChapter !== null && (
            <UpdateStatusButton projectHash={projectHash} chapterNumber={currentChapter} />
          )}
          {currentChapter !== null && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            >
              歷史
            </button>
          )}
        </div>

        {/* 工作台面板 + CM6 主編輯區（直向 stack） */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {currentChapter !== null && (
            <div className="shrink-0 overflow-y-auto border-b border-neutral-800 bg-neutral-950">
              <div className="px-4 py-2">
                <button
                  type="button"
                  onClick={() => setWorkbenchOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-neutral-300 hover:text-neutral-100"
                >
                  {workbenchOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  ✦ AI 寫作工作台
                </button>
              </div>
              {workbenchOpen && (
                <div
                  className="space-y-3 px-4 pb-3"
                  style={{ maxHeight: "55vh", overflowY: "auto" }}
                >
                  <ContextPreviewPanel
                    projectHash={projectHash}
                    chapterNumber={currentChapter}
                    participants={participants}
                  />
                  <WritingParamsBar />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <OutlineInput />
                    <RequirementsInput />
                  </div>
                  <ParticipantPicker projectHash={projectHash} chapterNumber={currentChapter} />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            <div
              className={`relative flex-1 overflow-hidden bg-white text-gray-900 ${
                draftStatus === "streaming" ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {store.state.kind === "loading" && !editorReady && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                  載入中…
                </div>
              )}

              {currentChapter === null && store.state.kind !== "loading" && !editorReady && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                  請從左側選擇或新建章節
                </div>
              )}

              {draftStatus === "streaming" && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">
                  AI 撰寫中…
                </div>
              )}

              {editorReady && currentChapter !== null && (
                <ChapterEditor
                  key={`${projectHash}:${currentChapter}:${editorKey}`}
                  projectHash={projectHash}
                  chapterNumber={currentChapter}
                  initialContent={initialContent}
                  baseMtime={initialBaseMtime}
                  initialTitle={initialTitle}
                  onContentRef={(fn) => {
                    getContentRef.current = fn;
                  }}
                  onSave={handleEditorSave}
                />
              )}
            </div>

            {currentChapter !== null && draftStatus !== "idle" && (
              <div className="w-1/2 shrink-0 overflow-hidden border-l border-neutral-800">
                <DraftPanel projectHash={projectHash} chapterNumber={currentChapter} />
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-neutral-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {conflict && (
        <ConflictDialog
          kind={conflict.kind}
          localContent={conflict.localContent}
          serverContent={conflict.serverContent}
          onApplyServer={handleApplyServer}
          onForceLocal={handleForceLocal}
          onCancel={handleCancelConflict}
        />
      )}

      <StatusUpdateIndicator projectHash={projectHash} />

      <HistoryPanel
        projectHash={projectHash}
        file={
          currentChapter !== null && store.chapter
            ? `chapters/chapter_${String(currentChapter).padStart(4, "0")}_${store.chapter.title}.md`
            : undefined
        }
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onReverted={() => {
          if (currentChapter !== null) {
            setEditorReady(false);
            void loadChapter(currentChapter);
          }
        }}
      />
    </div>
  );
}
