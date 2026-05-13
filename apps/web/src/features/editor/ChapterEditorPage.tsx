/**
 * ChapterEditorPage — 三欄整合頁面
 *
 * 欄：[ChapterList（左）] | [CM6 ChapterEditor（中，主體）] | [工具列（右上角 TitleInput + Indicator + SaveButton）]
 *
 * 載入流程（依 spec 003）：
 *   Case A: 沒 draft              → 載入 .md；state = clean
 *   Case B: draft.content === .md → 載入 .md；刪 draft；state = clean
 *   Case C: draft.baseMtime === .md.mtime（正常 dirty）→ 載入 draft；state = browser-only；toast
 *   Case D: draft.baseMtime !== .md.mtime（外部修改）→ ConflictDialog
 */
import type { ChapterFile } from "@novel-writer/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { deleteDraft, getDraft } from "../../lib/db";
import { useWindowFocusEffect } from "../../lib/window-focus";
import { useEditorStore } from "../../stores/editor-store";
import { ChapterEditor } from "./ChapterEditor";
import { ChapterList } from "./ChapterList";
import { ConflictDialog } from "./ConflictDialog";
import { EditorStatusIndicator } from "./EditorStatusIndicator";
import { SaveButton } from "./SaveButton";
import { TitleInput } from "./TitleInput";

// ── 型別 ────────────────────────────────────────────────────────────────────

interface ConflictState {
  kind: "open" | "save";
  localContent: string;
  serverContent: string;
  serverMtime: string;
}

// ── 元件 ────────────────────────────────────────────────────────────────────

export function ChapterEditorPage() {
  const { hash } = useParams<{ hash: string }>();

  // hash 不存在（例如 /editor/created 沒 hash 的路由）→ 回首頁
  if (!hash) {
    return <Navigate to="/" replace />;
  }

  return <ChapterEditorPageInner projectHash={hash} />;
}

// ── 內部實作 ────────────────────────────────────────────────────────────────

interface InnerProps {
  projectHash: string;
}

function ChapterEditorPageInner({ projectHash }: InnerProps) {
  const store = useEditorStore();

  // 記錄目前選中的章節號
  const [currentChapter, setCurrentChapter] = useState<number | null>(null);

  // 已完成載入（章節讀取 + draft 比對完成）後才顯示編輯器
  const [editorReady, setEditorReady] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // 載入後給 ChapterEditor 的初始值
  const [initialContent, setInitialContent] = useState("");
  const [initialBaseMtime, setInitialBaseMtime] = useState("");
  const [initialTitle, setInitialTitle] = useState("");

  // Toast 訊息
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 衝突對話框
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // 父元件持有 getContent（由 ChapterEditor 透過 onContentRef 傳入）
  const getContentRef = useRef<() => string>(() => "");

  // 載入中 flag，避免重複 fetch
  const loadingRef = useRef(false);

  function showToast(msg: string, duration = 3000) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }

  // ── 載入章節（spec 003 Case A/B/C/D）──────────────────────────────────

  async function loadChapter(n: number) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    store.markLoading();
    setEditorReady(false);

    try {
      // 1. 從後端讀 .md
      const res = await fetch(`/api/projects/${projectHash}/chapters/${n}`);
      if (!res.ok) {
        console.error("loadChapter: fetch failed", res.status);
        return;
      }
      const serverChapter = (await res.json()) as ChapterFile;

      // 2. 從 IndexedDB 讀 draft
      const draft = await getDraft(projectHash, n);

      // 3. 依 spec 003 決定 Case
      let contentToLoad = serverChapter.content;
      let caseLabel = "A";

      if (!draft) {
        // Case A: 沒 draft → 載 .md，clean
        caseLabel = "A";
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: serverChapter.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
        });
        store.markClean(serverChapter.mtime, serverChapter.content, serverChapter.title);
      } else if (draft.content === serverChapter.content) {
        // Case B: draft 與 .md 內容一致 → 載 .md，刪 draft，clean
        caseLabel = "B";
        await deleteDraft(projectHash, n);
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: serverChapter.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
        });
        store.markClean(serverChapter.mtime, serverChapter.content, serverChapter.title);
      } else if (draft.baseMtime === serverChapter.mtime) {
        // Case C: draft 比 .md 新，正常 dirty → 載 draft，browser-only
        caseLabel = "C";
        contentToLoad = draft.content;
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: draft.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
        });
        store.markDirty(draft.content.replace(/\s/g, "").length, draft.updatedAt);
        showToast("這是上次未存入 .md 的草稿，按儲存才會寫入檔案");
      } else {
        // Case D: .md 被外部修改（baseMtime 不符）→ 顯示衝突對話框
        caseLabel = "D";
        // 先設 store，讓衝突對話框能知道章節資訊
        store.setProjectHash(projectHash);
        store.setChapter({
          number: n,
          title: draft.title,
          fileTitle: serverChapter.title,
          baseMtime: serverChapter.mtime,
          baseContent: serverChapter.content,
        });
        setConflict({
          kind: "open",
          localContent: draft.content,
          serverContent: serverChapter.content,
          serverMtime: serverChapter.mtime,
        });
        // 暫時以 draft.content 設好編輯器，讓對話框解決後再決定
        contentToLoad = draft.content;
        // 不 setEditorReady，等使用者選完再 mount 編輯器
        setInitialContent(contentToLoad);
        setInitialBaseMtime(serverChapter.mtime);
        setInitialTitle(draft.title);
        setCurrentChapter(n);
        return; // 等對話框
      }

      console.log(`loadChapter Case ${caseLabel}: chapter=${n}`);

      setInitialContent(contentToLoad);
      setInitialBaseMtime(serverChapter.mtime);
      setInitialTitle(caseLabel === "C" && draft ? draft.title : serverChapter.title);
      setCurrentChapter(n);
      // 用新 key 強制 ChapterEditor 重建（換章節時確保新 doc）
      setEditorKey((k) => k + 1);
      setEditorReady(true);
    } finally {
      loadingRef.current = false;
    }
  }

  // ── window focus 重檢（Case C/D 的 mtime 偵測）─────────────────────────

  const handleWindowFocus = useCallback(() => {
    if (currentChapter !== null && editorReady) {
      void recheckMtime(currentChapter);
    }
  }, [currentChapter, editorReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useWindowFocusEffect(handleWindowFocus);

  async function recheckMtime(n: number) {
    if (!store.chapter) return;
    const res = await fetch(`/api/projects/${projectHash}/chapters/${n}`);
    if (!res.ok) return;
    const serverChapter = (await res.json()) as ChapterFile;
    if (serverChapter.mtime !== store.chapter.baseMtime) {
      // .md 被外部修改了
      const currentContent = getContentRef.current();
      setConflict({
        kind: "open",
        localContent: currentContent,
        serverContent: serverChapter.content,
        serverMtime: serverChapter.mtime,
      });
    }
  }

  // ── 衝突對話框處理 ───────────────────────────────────────────────────────

  function handleApplyServer() {
    if (!conflict || !store.chapter) return;
    const { serverContent, serverMtime } = conflict;
    setConflict(null);
    store.markClean(serverMtime, serverContent, store.chapter.fileTitle);
    setInitialContent(serverContent);
    setInitialBaseMtime(serverMtime);
    setInitialTitle(store.chapter.fileTitle);
    setEditorKey((k) => k + 1);
    setEditorReady(true);
    showToast("已載入伺服器版本");
  }

  function handleForceLocal() {
    if (!conflict || !store.chapter) return;
    // 保留 local content，讓使用者按儲存覆寫
    setConflict(null);
    setEditorKey((k) => k + 1);
    setEditorReady(true);
    store.markDirty(conflict.localContent.replace(/\s/g, "").length, Date.now());
    showToast("保留本地草稿，請按儲存覆寫伺服器版本");
  }

  function handleCancelConflict() {
    setConflict(null);
    // 若之前 editorReady 則繼續，否則回到未載入狀態
    if (!editorReady && currentChapter !== null) {
      // 取消後用 .md 版本載入
      void loadChapter(currentChapter);
    }
  }

  // ── 儲存觸發（從 ChapterEditor Mod-s callback 呼叫 SaveButton.performSave）

  const saveTriggerRef = useRef<(() => void) | null>(null);

  function handleEditorSave() {
    saveTriggerRef.current?.();
  }

  // ── 衝突儲存（409 MTIME_MISMATCH）─────────────────────────────────────

  async function handleSaveConflict(serverContent: string) {
    const currentContent = getContentRef.current();
    setConflict({
      kind: "save",
      localContent: currentContent,
      serverContent,
      serverMtime: store.chapter?.baseMtime ?? "",
    });
  }

  // ── 標題變更 ─────────────────────────────────────────────────────────────

  function handleTitleChange(next: string) {
    store.setTitle(next);
  }

  // ── 選章節 ───────────────────────────────────────────────────────────────

  function handleSelectChapter(n: number) {
    if (n === currentChapter) return;
    // 立即 flush 前章 draft（ChapterEditor 的 cleanup 會呼叫）
    setEditorReady(false);
    void loadChapter(n);
  }

  function handleCreateChapter() {
    // ChapterList 建立後會 onSelectChapter，這裡不需額外處理
  }

  // ── 首次自動載入最近章節（首個章節）────────────────────────────────────

  // 用 useEffect 在 mount 後觸發，避免 render 階段的 side effect
  // biome-ignore lint/correctness/useExhaustiveDependencies: autoSelectFirstChapter 內已用 projectHash；只要 hash 變動才重做
  useEffect(() => {
    async function autoSelectFirstChapter() {
      const res = await fetch(`/api/projects/${projectHash}/chapters/`);
      if (!res.ok) return;
      const data = (await res.json()) as { chapters: Array<{ number: number }> };
      const first = data.chapters[0];
      if (first !== undefined) {
        void loadChapter(first.number);
      }
    }
    void autoSelectFirstChapter();
    // 只在 projectHash 改變時（即元件掛載後）執行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectHash]);

  // ── 渲染 ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900">
      {/* 左欄：章節列表 */}
      <ChapterList
        projectHash={projectHash}
        currentChapter={currentChapter}
        onSelectChapter={handleSelectChapter}
        onCreateChapter={handleCreateChapter}
      />

      {/* 中欄：編輯區 + 工具列 */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* 工具列 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
          <Link to="/" className="text-sm text-blue-600 underline shrink-0">
            ← 首頁
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
        </div>

        {/* 編輯器主體 */}
        <div className="flex-1 overflow-hidden relative">
          {store.state.kind === "loading" && !editorReady && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              載入中…
            </div>
          )}

          {currentChapter === null && store.state.kind !== "loading" && !editorReady && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              請從左側選擇或新建章節
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
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* 衝突對話框 */}
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
    </div>
  );
}
