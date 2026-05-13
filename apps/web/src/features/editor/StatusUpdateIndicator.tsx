import { useEffect, useState } from "react";
import { useDraftStore } from "../../stores/draft-store";

interface Props {
  projectHash: string;
}

export function StatusUpdateIndicator({ projectHash }: Props) {
  const statusJobId = useDraftStore((s) => s.statusJobId);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!statusJobId) return;
    setPhase("running");
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectHash}/jobs/${statusJobId}/events`, {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const eventM = part.match(/^event: (.+)$/m);
            const dataM = part.match(/^data: (.+)$/m);
            if (!eventM?.[1] || !dataM?.[1]) continue;
            const event = eventM[1];
            const data = JSON.parse(dataM[1]) as Record<string, unknown>;
            if (event === "completed") {
              setPhase("done");
              setToast(data["skipped"] ? null : "狀態已更新");
              setTimeout(() => {
                setPhase("idle");
                setToast(null);
              }, 4000);
              return;
            }
            if (event === "failed") {
              setPhase("failed");
              setToast("狀態更新失敗");
              return;
            }
          }
        }
      } catch {
        // AbortError or network error — ignore
      }
    })();

    return () => controller.abort();
  }, [statusJobId, projectHash]);

  if (phase === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 shadow-lg text-xs">
      {phase === "running" && (
        <>
          <span className="animate-spin text-indigo-400 inline-block">⟳</span>
          <span className="text-neutral-300">狀態更新中…</span>
        </>
      )}
      {phase === "done" && toast && <span className="text-green-400">{toast}</span>}
      {phase === "failed" && <span className="text-red-400">{toast ?? "狀態更新失敗"}</span>}
    </div>
  );
}
