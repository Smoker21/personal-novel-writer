import type { StatusJobEvent } from "@novel-writer/shared-types";

interface JobBucket {
  events: StatusJobEvent[];
  done: boolean;
  listeners: Array<(event: StatusJobEvent) => void>;
}

const BUCKETS = new Map<string, JobBucket>();

export function createJob(jobId: string): void {
  BUCKETS.set(jobId, { events: [], done: false, listeners: [] });
  // Auto-cleanup after 10 minutes
  setTimeout(() => BUCKETS.delete(jobId), 10 * 60 * 1000);
}

export function emitJobEvent(jobId: string, event: StatusJobEvent): void {
  const bucket = BUCKETS.get(jobId);
  if (!bucket) return;
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
          }, 30_000);
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
