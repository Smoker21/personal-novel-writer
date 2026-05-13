export interface SseCallbacks {
  onStarted?: (data: { draftId: string; model: string; contextHash: string }) => void;
  onChunk?: (text: string) => void;
  onUsage?: (data: { inputTokens: number; outputTokens: number }) => void;
  onDegraded?: (data: { fromModel: string; toModel: string; reason: string }) => void;
  onComplete?: (data: { draftId: string; totalChars: number; durationMs: number }) => void;
  onError?: (data: { code: string; message: string; retryable: boolean }) => void;
}

/**
 * Connect to an SSE endpoint via fetch + ReadableStream.
 * Returns an abort function. Reconnect is NOT automatic.
 */
export function connectSse(url: string, body: unknown, callbacks: SseCallbacks): () => void {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      callbacks.onError?.({ code: "NETWORK", message: String(e), retryable: true });
      return;
    }

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({ message: res.statusText }))) as {
        message?: string;
        code?: string;
      };
      callbacks.onError?.({
        code: errBody.code ?? "HTTP_ERROR",
        message: errBody.message ?? res.statusText,
        retryable: false,
      });
      return;
    }

    if (!res.body) {
      callbacks.onError?.({ code: "NO_BODY", message: "No response body", retryable: false });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE messages are delimited by \n\n
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const eventMatch = part.match(/^event: (.+)$/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!eventMatch?.[1] || !dataMatch?.[1]) continue;
          const event = eventMatch[1];
          try {
            const data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
            switch (event) {
              case "started":
                callbacks.onStarted?.(
                  data as Parameters<NonNullable<typeof callbacks.onStarted>>[0],
                );
                break;
              case "chunk":
                callbacks.onChunk?.(String((data as { text: unknown }).text ?? ""));
                break;
              case "usage":
                callbacks.onUsage?.(data as Parameters<NonNullable<typeof callbacks.onUsage>>[0]);
                break;
              case "degraded":
                callbacks.onDegraded?.(
                  data as Parameters<NonNullable<typeof callbacks.onDegraded>>[0],
                );
                break;
              case "complete":
                callbacks.onComplete?.(
                  data as Parameters<NonNullable<typeof callbacks.onComplete>>[0],
                );
                break;
              case "error":
                callbacks.onError?.(data as Parameters<NonNullable<typeof callbacks.onError>>[0]);
                break;
            }
          } catch {
            // malformed JSON in SSE data; skip
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      callbacks.onError?.({ code: "STREAM_ERROR", message: String(e), retryable: true });
    }
  })();

  return () => controller.abort();
}
