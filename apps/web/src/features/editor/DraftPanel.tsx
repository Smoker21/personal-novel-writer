import { useEffect, useRef } from "react";
import { useDraftStore } from "../../stores/draft-store";
import { AdoptButton } from "./AdoptButton";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

export function DraftPanel({ projectHash, chapterNumber }: Props) {
  const {
    status,
    text,
    draftId,
    modelId,
    degradedTo,
    abort,
    reset,
    setText,
    setStatus,
    setDraftId,
  } = useDraftStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as text streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  // Restore draft on mount (app restart recovery)
  useEffect(() => {
    if (status !== "idle") return;
    fetch(`/api/projects/${projectHash}/chapters/${chapterNumber}/draft`)
      .then((r) =>
        r.ok ? (r.json() as Promise<{ text: string; status: string; draftId: string }>) : null,
      )
      .then((data) => {
        if (data?.text) {
          setText(data.text);
          setDraftId(data.draftId);
          setStatus(data.status as "complete" | "aborted");
        }
      })
      .catch(() => {});
  }, [projectHash, chapterNumber, status, setText, setDraftId, setStatus]);

  if (status === "idle") return null;

  const handleDiscard = async () => {
    if (!confirm("確定要丟棄此草稿？")) return;
    await fetch(`/api/projects/${projectHash}/chapters/${chapterNumber}/draft`, {
      method: "DELETE",
    });
    reset();
  };

  const handleRegenerate = async () => {
    await fetch(`/api/projects/${projectHash}/chapters/${chapterNumber}/draft`, {
      method: "DELETE",
    });
    reset();
    // Caller (GenerateButton parent) will need to re-trigger — reset to idle lets user click again
  };

  return (
    <div className="flex flex-col h-full border-l border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">AI 草稿</span>
          {status === "streaming" && (
            <span className="text-xs text-indigo-400 animate-pulse">串流中…</span>
          )}
          {status === "complete" && <span className="text-xs text-green-400">✓ 完成</span>}
          {status === "aborted" && <span className="text-xs text-amber-400">已中止</span>}
          {status === "errored" && <span className="text-xs text-red-400">錯誤</span>}
        </div>
        <div className="flex items-center gap-2">
          {degradedTo && <span className="text-xs text-amber-300">⚠ 已切換到地端模型</span>}
          {modelId && <span className="text-xs text-neutral-500">{modelId}</span>}
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-serif text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed"
      >
        {text || <span className="text-neutral-500">等待串流…</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 p-3 border-t border-neutral-700 shrink-0">
        {status === "streaming" && (
          <button
            type="button"
            onClick={() => {
              abort?.();
              setStatus("aborted");
            }}
            className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 transition-colors"
          >
            中止
          </button>
        )}
        {(status === "complete" || status === "aborted" || status === "errored") && (
          <>
            <button
              type="button"
              onClick={handleDiscard}
              className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              丟棄
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              重產出
            </button>
            {draftId && (
              <AdoptButton
                projectHash={projectHash}
                chapterNumber={chapterNumber}
                draftId={draftId}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
