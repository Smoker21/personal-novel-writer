import { useState } from "react";
import { connectSse } from "../../lib/sse-client";
import { useDraftStore } from "../../stores/draft-store";
import { LlmNotConfiguredModal } from "../settings/LlmNotConfiguredModal";
import { type GenerateParams, PromptPreviewModal } from "./PromptPreviewModal";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

export function GenerateButton({ projectHash, chapterNumber }: Props) {
  const { status, setStatus, appendText, setAbort, setDraftId, setModel, setDegradedTo, reset } =
    useDraftStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showLlmModal, setShowLlmModal] = useState(false);
  const isStreaming = status === "streaming";
  const hasActiveDraft = status !== "idle";

  const handleStart = (params: GenerateParams) => {
    reset();
    setStatus("streaming");

    const body: Record<string, unknown> = {
      promptText: params.promptText,
      contextHash: params.contextHash,
      participants: params.participants,
      outline: params.outline,
      requirements: params.requirements,
    };
    if (params.modelOverride) body["modelOverride"] = params.modelOverride;
    if (params.temperatureOverride !== undefined)
      body["temperatureOverride"] = params.temperatureOverride;

    const abortFn = connectSse(
      `/api/projects/${projectHash}/chapters/${chapterNumber}/generate`,
      body,
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
            setShowLlmModal(true);
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
        onClick={() => setPreviewOpen(true)}
        disabled={isStreaming}
        className="flex items-center gap-1.5 rounded border border-indigo-700 bg-indigo-900/50 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-800/60 disabled:opacity-40 transition-colors"
      >
        ▶ 生成本章
      </button>
      <PromptPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        projectHash={projectHash}
        chapterNumber={chapterNumber}
        onGenerateStart={handleStart}
      />
      <LlmNotConfiguredModal
        agentName="chapter-writer"
        open={showLlmModal}
        onClose={() => setShowLlmModal(false)}
      />
    </>
  );
}
