import PQueue from "p-queue";

const QUEUES = new Map<string, PQueue>();

/** Return (or create) a per-project FIFO queue with concurrency=1. */
export function getProjectQueue(projectHash: string): PQueue {
  let queue = QUEUES.get(projectHash);
  if (queue === undefined) {
    queue = new PQueue({ concurrency: 1 });
    QUEUES.set(projectHash, queue);
  }
  return queue;
}
