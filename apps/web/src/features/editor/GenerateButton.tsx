import { useState } from "react";
import { connectSse } from "../../lib/sse-client";
import { useDraftStore } from "../../stores/draft-store";
import { LlmNotConfiguredModal } from "../settings/LlmNotConfiguredModal";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

export function GenerateButton({ projectHash, chapterNumber }: Props) {
  const { status, setStatus, appendText, setAbort, setDraftId, setModel, setDegradedTo, reset } =
    useDraftStore();
  const [showModal, setShowModal] = useState(false);
  const isStreaming = status === "streaming";
  const hasActiveDraft = status !== "idle";

  const handleGenerate = () => {
    reset();
    setStatus("streaming");

    const abortFn = connectSse(
      `/api/projects/${projectHash}/chapters/${chapterNumber}/generate`,
      { agentName: "chapter-writer" },
      {
        onStarted: (d) => {
          setDraftId(d.draftId);
          setModel(d.model);
        },
        onChunk: (text) => appendText(text),
        onDegraded: (d) => setDegradedTo(d.toModel),
        onComplete: () => setStatus("complete"),
        onError: (d) => {
          if (d.code === "ROUTING_NOT_CONFIGURED" || d.code === "HTTP_ERROR") {
            reset();
            setShowModal(true);
            return;
          }
          setStatus("errored");
        },
      },
    );

    setAbort(() => {
      abortFn();
      setStatus("aborted");
    });
  };

  if (hasActiveDraft) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isStreaming}
        className="flex items-center gap-1.5 rounded border border-indigo-700 bg-indigo-900/50 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-800/60 disabled:opacity-40 transition-colors"
      >
        AI 撰寫本章
      </button>
      <LlmNotConfiguredModal
        agentName="chapter-writer"
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
