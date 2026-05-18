import type { StatusJobEvent } from "@novel-writer/shared-types";

interface JobBucket {
  events: StatusJobEvent[];
  done: boolean;
  listeners: Array<(event: StatusJobEvent) => void>;
}

const BUCKETS = new Map<string, JobBucket>();

/**
 * M6-C L3: SSE idle timeout for `subscribeJob`.
 *
 * Old value (30s) was shorter than the worst-case LLM call time for the
 * status-updater (now hard-capped at 90s, see status-updater-service.ts),
 * which caused the iterator to yield `null` and close the SSE while the
 * job was still running. The client then sat on phase=running forever.
 *
 * 5 minutes covers any realistic single-LLM-call duration plus its
 * one-shot parse-retry. If the LLM stalls longer than that, the L1 90s
 * timeout will have already emitted `failed` and the iterator will exit
 * via the terminal-event branch instead.
 */
export const SSE_IDLE_TIMEOUT_MS = 300_000;

export function createJob(jobId: string): void {
  BUCKETS.set(jobId, { events: [], done: false, listeners: [] });
  // Auto-cleanup after 10 minutes
  setTimeout(() => BUCKETS.delete(jobId), 10 * 60 * 1000);
}

export function emitJobEvent(jobId: string, event: StatusJobEvent): void {
  const bucket = BUCKETS.get(jobId);
  if (!bucket) return;
  // M6-C: idempotency guard. Once a terminal event (`completed` / `failed`)
  // has been emitted, drop subsequent events. Without this, a dangling
  // LLM promise that resolves AFTER the 90s timeout would re-emit
  // `completed` (or duplicate `failed`) and confuse the client.
  if (bucket.done) return;
  bucket.events.push(event);
  for (const listener of bucket.listeners) listener(event);
  if (event.type === "completed" || event.type === "failed") bucket.done = true;
}

export async function* subscribeJob(jobId: string): AsyncIterable<StatusJobEvent> {
  const bucket = BUCKETS.get(jobId);
  if (!bucket) return;

  // Replay already-buffered events
  for (const ev of bucket.events) {
    yield ev;
    if (ev.type === "completed" || ev.type === "failed") return;
  }
  if (bucket.done) return;

  // Stream future events
  const queue: StatusJobEvent[] = [];
  let resolve: ((ev: StatusJobEvent | null) => void) | null = null;

  const listener = (event: StatusJobEvent) => {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r(event);
    } else {
      queue.push(event);
    }
  };
  bucket.listeners.push(listener);

  try {
    while (true) {
      if (queue.length > 0) {
        const ev = queue.shift()!;
        yield ev;
        if (ev.type === "completed" || ev.type === "failed") return;
      } else {
        const ev = await new Promise<StatusJobEvent | null>((res) => {
          resolve = res;
          setTimeout(() => {
            if (resolve === res) {
              resolve = null;
              res(null);
            }
          }, SSE_IDLE_TIMEOUT_MS);
        });
        if (ev === null) return; // timeout
        yield ev;
        if (ev.type === "completed" || ev.type === "failed") return;
      }
    }
  } finally {
    const idx = bucket.listeners.indexOf(listener);
    if (idx >= 0) bucket.listeners.splice(idx, 1);
  }
}
