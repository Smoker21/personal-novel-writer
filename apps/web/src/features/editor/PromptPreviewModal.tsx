import { useEffect, useState } from "react";
import { useEditorStore } from "../../stores/editor-store";

export interface BuildPromptResponse {
  promptText: string;
  systemPrompt: string;
  userPrompt: string;
  contextHash: string;
  estimatedTokens: number;
  modelId: string;
  participants: Array<{ slug: string; name: string; matched: boolean }>;
}

export interface GenerateParams {
  promptText: string;
  contextHash: string;
  participants: string[];
  outline: string | null;
  requirements: string | null;
  modelOverride?: string;
  temperatureOverride?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectHash: string;
  chapterNumber: number;
  onGenerateStart: (params: GenerateParams) => void;
}

type BuildState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: BuildPromptResponse }
  | { kind: "error"; code: string; message: string };

export function PromptPreviewModal({
  open,
  onClose,
  projectHash,
  chapterNumber,
  onGenerateStart,
}: Props) {
  const participants = useEditorStore((s) => s.participants);
  const outline = useEditorStore((s) => s.outline);
  const requirements = useEditorStore((s) => s.requirements);
  const modelOverride = useEditorStore((s) => s.modelOverride);
  const temperatureOverride = useEditorStore((s) => s.temperatureOverride);
  const systemPromptOverride = useEditorStore((s) => s.systemPromptOverrideForChapter);

  const [state, setState] = useState<BuildState>({ kind: "idle" });
  const [edited, setEdited] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setState({ kind: "loading" });
    void (async () => {
      const reqBody: Record<string, unknown> = {
        participantSlugs: participants,
        outline: outline,
        requirements: requirements,
      };
      if (modelOverride) reqBody["modelOverride"] = modelOverride;
      if (temperatureOverride !== null) reqBody["temperatureOverride"] = temperatureOverride;
      if (systemPromptOverride.trim().length > 0) {
        reqBody["systemPromptOverrideForChapter"] = systemPromptOverride;
      }
      try {
        const res = await fetch(
          `/api/projects/${projectHash}/chapters/${chapterNumber}/build-prompt`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(reqBody),
          },
        );
        if (!res.ok) {
          const err = (await res.json()) as { code?: string; message?: string };
          setState({
            kind: "error",
            code: err.code ?? "HTTP_ERROR",
            message: err.message ?? "build-prompt failed",
          });
          return;
        }
        const data = (await res.json()) as BuildPromptResponse;
        setState({ kind: "ready", data });
        setEdited(data.promptText);
      } catch (err) {
        setState({
          kind: "error",
          code: "NETWORK",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    temperatureOverride,
    requirements,
    systemPromptOverride.trim,
    participants,
    chapterNumber,
    projectHash,
    systemPromptOverride,
    outline,
    modelOverride,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = () => {
    if (state.kind !== "ready") return;
    onGenerateStart({
      promptText: edited,
      contextHash: state.data.contextHash,
      participants,
      outline,
      requirements,
      ...(modelOverride ? { modelOverride } : {}),
      ...(temperatureOverride !== null ? { temperatureOverride } : {}),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="flex max-h-[90vh] w-[90vw] max-w-5xl flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Prompt 預覽 / 編輯"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-2">
          <span className="text-sm font-medium text-neutral-200">
            Prompt 預覽 / 編輯（送出 generate 前最後一次調整）
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            ESC 取消
          </button>
        </div>

        {state.kind === "loading" && (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-neutral-400">
            正在組裝 prompt…
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-sm">
            <span className="font-medium text-red-400">建構失敗：{state.code}</span>
            <span className="text-neutral-400">{state.message}</span>
            {state.code === "INVALID_PARTICIPANT" && (
              <span className="text-xs text-neutral-500">
                有角色不存在；請回頭調整本章角色清單。
              </span>
            )}
            {state.code === "MISSING_CONTEXT" && (
              <span className="text-xs text-neutral-500">
                synopsis.md 內容不足；請先在專案內補上故事大綱。
              </span>
            )}
            {state.code === "ROUTING_NOT_CONFIGURED" && (
              <span className="text-xs text-neutral-500">
                chapter-writer 的 routing 尚未設定，請先到設定頁設定 LLM。
              </span>
            )}
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div className="flex shrink-0 items-center gap-4 border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
              <span>
                模型：<span className="text-neutral-200">{state.data.modelId}</span>
              </span>
              <span>
                估計 tokens：<span className="text-neutral-200">{state.data.estimatedTokens}</span>
              </span>
              <span>
                角色：
                {state.data.participants.length === 0
                  ? "（無）"
                  : state.data.participants
                      .map((p) => (p.matched ? p.name : `${p.name}(未找到)`))
                      .join("、")}
              </span>
              <span className="ml-auto text-neutral-500">
                contextHash: {state.data.contextHash}
              </span>
            </div>
            <textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              className="flex-1 w-full resize-none bg-neutral-900 px-4 py-3 font-mono text-sm text-neutral-100 focus:outline-none"
              aria-label="可編輯 prompt 全文"
            />
          </>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-700 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={state.kind !== "ready"}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            送出 generate
          </button>
        </div>
      </div>
    </div>
  );
}
