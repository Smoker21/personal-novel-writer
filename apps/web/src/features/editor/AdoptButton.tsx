import { useState } from "react";
import { useDraftStore } from "../../stores/draft-store";

interface Props {
  projectHash: string;
  chapterNumber: number;
  draftId: string;
}

type Step = "idle" | "confirming" | "adopting" | "stale-confirm";

export function AdoptButton({ projectHash, chapterNumber, draftId }: Props) {
  const { setStatusJobId, setUndoEntryId } = useDraftStore();
  const [step, setStep] = useState<Step>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const doAdopt = async (force = false) => {
    setStep("adopting");
    setProgressMsg("寫主檔…");
    setError(null);

    try {
      setProgressMsg("採用中…");
      const res = await fetch(`/api/projects/${projectHash}/chapters/${chapterNumber}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, confirmed: true, ...(force ? { force: true } : {}) }),
      });

      if (res.status === 409) {
        const body = (await res.json()) as { code: string };
        if (body.code === "DRAFT_STALE") {
          setStep("stale-confirm");
          return;
        }
      }

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        setError(body.message ?? "採用失敗");
        setStep("idle");
        return;
      }

      const data = (await res.json()) as {
        statusUpdateJobId: string;
        undoEntry: { id: string };
      };
      setStatusJobId(data.statusUpdateJobId);
      setUndoEntryId(data.undoEntry.id);
      setStep("idle");
    } catch (e) {
      setError(String(e));
      setStep("idle");
    }
  };

  if (step === "confirming") {
    return (
      <div className="flex flex-col gap-2 p-2 rounded border border-neutral-600 bg-neutral-800 text-xs max-w-xs">
        <p className="text-neutral-200">採用此草稿將覆寫章節主檔。git 歷史可還原。</p>
        {error && <p className="text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="text-neutral-400 hover:text-neutral-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => doAdopt(false)}
            className="rounded bg-green-700 px-3 py-1.5 text-white hover:bg-green-600 transition-colors"
          >
            確認採用
          </button>
        </div>
      </div>
    );
  }

  if (step === "stale-confirm") {
    return (
      <div className="flex flex-col gap-2 p-2 rounded border border-amber-700 bg-neutral-800 text-xs max-w-xs">
        <p className="text-amber-300">您在草稿產生後修改了上下文。是否仍要採用此草稿？</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="text-neutral-400 hover:text-neutral-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => doAdopt(true)}
            className="rounded bg-amber-700 px-3 py-1.5 text-white hover:bg-amber-600 transition-colors"
          >
            強制採用
          </button>
        </div>
      </div>
    );
  }

  if (step === "adopting") {
    return (
      <button
        type="button"
        disabled
        className="rounded bg-green-800 px-3 py-1.5 text-xs text-green-300 opacity-70"
      >
        {progressMsg}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStep("confirming")}
      className="rounded bg-green-700 px-3 py-1.5 text-xs text-white hover:bg-green-600 transition-colors"
    >
      採用
    </button>
  );
}
