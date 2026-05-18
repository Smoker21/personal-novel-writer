import { useEffect, useState } from "react";
import { useDraftStore } from "../../stores/draft-store";

interface Props {
  projectHash: string;
}

/**
 * M6-C L2: client-side timeout = 60s.
 *
 * Server has its own 90s LLM hard timeout (status-updater-service.ts) + 5min
 * SSE idle timeout (job-event-bus.ts). The 60s client value is intentionally
 * SHORTER than the server's 90s — if the SSE connection itself broke (proxy
 * dropped, network hiccup), the server side may still complete the job and
 * buffer the final event for replay. We surface a "可能連線中斷" recovery UI
 * instead of spinning forever, with a re-subscribe button that replays.
 */
const CLIENT_TIMEOUT_MS = 60_000;

type Phase = "idle" | "running" | "done" | "failed" | "stalled";

export function StatusUpdateIndicator({ projectHash }: Props) {
  const statusJobId = useDraftStore((s) => s.statusJobId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [toast, setToast] = useState<string | null>(null);
  // Bumping this re-runs the effect → re-subscribes to the same jobId.
  // Server bucket is kept 10min so replay works as long as the user clicks
  // 重試 in time.
  const [_retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!statusJobId) return;
    setPhase("running");
    setToast(null);
    const controller = new AbortController();

    // 60s client-side watchdog — independent of any SSE-level keepalive.
    // Cleared as soon as a terminal event arrives (done/failed) or the
    // effect tears down (statusJobId cleared / unmount / retry).
    const stallTimer = setTimeout(() => {
      controller.abort();
      setPhase("stalled");
      setToast("可能連線中斷");
    }, CLIENT_TIMEOUT_MS);

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
              clearTimeout(stallTimer);
              setPhase("done");
              setToast(data["skipped"] ? null : "狀態已更新");
              setTimeout(() => {
                setPhase("idle");
                setToast(null);
              }, 4000);
              return;
            }
            if (event === "failed") {
              clearTimeout(stallTimer);
              setPhase("failed");
              const msg = typeof data["message"] === "string" ? (data["message"] as string) : "";
              const code = typeof data["code"] === "string" ? (data["code"] as string) : "";
              setToast(
                code === "TIMEOUT_90S"
                  ? "狀態更新逾時（90s）"
                  : msg
                    ? `狀態更新失敗：${msg}`
                    : "狀態更新失敗",
              );
              return;
            }
          }
        }
      } catch {
        // AbortError (from stall timer / unmount / new retryNonce) — ignore.
      }
    })();

    return () => {
      clearTimeout(stallTimer);
      controller.abort();
    };
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
      {phase === "stalled" && (
        <>
          <span className="text-amber-400">{toast ?? "可能連線中斷"}</span>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="ml-1 rounded border border-neutral-600 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700"
          >
            重試
          </button>
        </>
      )}
    </div>
  );
}
