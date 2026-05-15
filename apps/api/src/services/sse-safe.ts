/**
 * Defensive SSE write helper.
 *
 * Hono's `streamSSE` callback may try to write after the client has disconnected
 * (e.g. user navigated away, browser closed tab, fetch aborted mid-stream).
 * Writing to an already-closed ReadableStream throws
 * `TypeError: Invalid state: ReadableStream is already closed`.
 *
 * `StreamingApi` exposes `aborted` (client disconnect) and `closed` (normal end)
 * — we skip writes when either is set, and catch any race that slips through.
 */
import type { SSEMessage, SSEStreamingApi } from "hono/streaming";

export async function safeWriteSSE(stream: SSEStreamingApi, msg: SSEMessage): Promise<boolean> {
  if (stream.aborted || stream.closed) return false;
  try {
    await stream.writeSSE(msg);
    return true;
  } catch {
    // Race between abort and write — stream became closed between the check
    // above and the actual `controller.enqueue`. Safe to swallow; subsequent
    // writes will short-circuit via `aborted`/`closed`.
    return false;
  }
}
