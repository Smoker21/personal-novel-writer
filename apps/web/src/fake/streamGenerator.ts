// Fake AI stream — yields one character at a time at a configurable cadence.
// Supports cancellation via AbortSignal.

export interface StreamOptions {
  delayMs?: number;       // per-char delay
  initialDelayMs?: number; // simulated "thinking" before first token
  signal?: AbortSignal;
}

export async function* fakeStream(
  text: string,
  opts: StreamOptions = {},
): AsyncGenerator<string, void, void> {
  const delay = opts.delayMs ?? 40;
  const initial = opts.initialDelayMs ?? 600;
  const signal = opts.signal;

  if (initial > 0) {
    await sleep(initial, signal);
  }

  for (let i = 0; i < text.length; i++) {
    if (signal?.aborted) return;
    yield text[i]!;
    await sleep(delay, signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(t);
      resolve(); // resolve gracefully so the generator can early-return
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
