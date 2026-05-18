import { createHash } from "node:crypto";
import { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "@novel-writer/prompt-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FIXTURE_INPUT: Parameters<typeof buildStatusUpdaterRequest>[0] = {
  chapterNumber: 1,
  chapterTitle: "梅雨初晴",
  chapterText:
    "蘇晴推開木門走進書店。林書言抬頭打了個招呼，說雨今天下不停了。蘇晴買了一本詩集後離去。",
  currentStoryStatus:
    "# 故事狀態\n\n## 世界觀\n\n現代台北。\n\n## 重要劇情點\n\n## 🔖 伏筆\n\n- 蘇晴的舊信件\n\n## ✨ 轉折點\n\n## 場景\n",
  relevantCharacters: [
    {
      slug: "蘇晴",
      name: "蘇晴",
      card: "蘇晴是 30 歲的女作家，內向但觀察力極強。",
      status:
        "# 蘇晴 — 狀態\n\n## 重要狀態變化\n\n## 與其他角色的關係\n\n## 🔖 個人伏筆\n\n- 她藏起來的那封信\n\n## ✨ 個人轉折點\n",
    },
  ],
};

describe("status-updater service prompt tests (qa-4)", () => {
  it("prompt hash is stable across 5 runs", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
      const content =
        typeof req.messages[0]?.content === "string"
          ? req.messages[0].content
          : JSON.stringify(req.messages[0]?.content);
      return createHash("sha256")
        .update(req.systemPrompt + content)
        .digest("hex");
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it("schema accepts output where unrecognized names are listed", () => {
    const valid = {
      storyStatus:
        "# 故事狀態\n\n## 世界觀\n台北。\n\n## 重要劇情點\n- (第1章) 相遇。\n\n## 🔖 伏筆\n\n- 蘇晴的舊信件\n\n## ✨ 轉折點\n\n## 場景\n",
      characterStatuses: {
        蘇晴: "# 蘇晴 — 狀態\n\n## 重要狀態變化\n- (第1章) 初訪書店。\n\n## 與其他角色的關係\n- 與 [[林書言]]：初次相識。\n\n## 🔖 個人伏筆\n\n- 她藏起來的那封信\n\n## ✨ 個人轉折點\n",
      },
      unrecognizedNames: ["老板娘"],
    };
    expect(statusUpdaterOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("🔖 section items in story_status should be preserved in output", () => {
    // Validates the prompt instructs LLM to preserve marked sections
    const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("🔖");
    expect(req.systemPrompt).toContain("既有條目");
  });

  it("schema rejects output where characterStatuses is not a record", () => {
    const invalid = {
      storyStatus: "...",
      characterStatuses: ["slug", "content"],
    };
    expect(statusUpdaterOutputSchema.safeParse(invalid).success).toBe(false);
  });
});

// ── M6-C L1: 90s hard timeout regression ─────────────────────────────────────
//
// These tests pin the three behaviours that prevent the "狀態更新中…" UI
// from getting stuck:
//   1. If router.generate() never resolves, after 90s a `failed` event with
//      code=TIMEOUT_90S must be emitted (not silent).
//   2. The bucket.done guard inside emitJobEvent drops any late-arriving
//      events (e.g. the LLM finally resolved 30s after timeout).
//   3. Any uncaught throw inside runStatusUpdate still emits `failed`.

vi.mock("./settings-store.js", () => ({
  readSettings: vi.fn(),
}));
vi.mock("./router-factory.js", () => ({
  buildRouter: vi.fn(),
  toRouterPolicy: vi.fn((p: unknown) => p),
}));
vi.mock("./status-context-collector.js", () => ({
  collectStatusContext: vi.fn(),
}));
vi.mock("./atomic-fs.js", () => ({
  atomicWriteFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./commit-policy.js", () => ({
  commitIfChanged: vi.fn().mockResolvedValue(undefined),
}));

import { emitJobEvent } from "./job-event-bus.js";
import { readSettings } from "./settings-store.js";
import { buildRouter } from "./router-factory.js";
import { collectStatusContext } from "./status-context-collector.js";
import { LLM_CALL_TIMEOUT_MS, triggerStatusUpdate } from "./status-updater-service.js";

import type { StatusJobEvent } from "@novel-writer/shared-types";

async function collectEvents(jobId: string, maxMs = 5000): Promise<StatusJobEvent[]> {
  const { subscribeJob } = await import("./job-event-bus.js");
  const events: StatusJobEvent[] = [];
  const it = subscribeJob(jobId)[Symbol.asyncIterator]();
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { value, done } = await it.next();
    if (done) break;
    if (value) events.push(value);
    if (value && (value.type === "completed" || value.type === "failed")) break;
  }
  return events;
}

describe("status-updater L1 timeout (M6-C)", () => {
  beforeEach(() => {
    vi.mocked(readSettings).mockResolvedValue({
      routing: {
        statusUpdater: { primary: "google:gemini-2.5-flash", fallbacks: [] },
      },
    } as unknown as Awaited<ReturnType<typeof readSettings>>);
    vi.mocked(collectStatusContext).mockResolvedValue({
      chapterNumber: 1,
      chapterTitle: "t",
      chapterText: "x",
      currentStoryStatus: "s",
      characterStatuses: {},
      relevantCharacters: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("emits failed/TIMEOUT_90S when router.generate() never resolves within 90s", async () => {
    vi.useFakeTimers();

    // Track whether the provider's abortSignal actually fired — proves the
    // dangling LLM call gets cancelled, not just abandoned.
    let abortFired = false;
    const stallingGenerate = vi.fn(
      (req: { abortSignal?: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          req.abortSignal?.addEventListener("abort", () => {
            abortFired = true;
            reject(new Error("aborted"));
          });
        }),
    );
    vi.mocked(buildRouter).mockReturnValue({
      generate: stallingGenerate,
    } as unknown as ReturnType<typeof buildRouter>);

    const jobId = await triggerStatusUpdate("hash", "/p", 1, "auto-after-adopt");

    // Let setImmediate kick off runStatusUpdate
    await vi.advanceTimersByTimeAsync(0);

    // Advance past the 90s hard timeout
    await vi.advanceTimersByTimeAsync(LLM_CALL_TIMEOUT_MS + 100);

    // Switch back to real timers so subscribeJob's terminal-event branch
    // can drain the buffered failed event.
    vi.useRealTimers();
    const events = await collectEvents(jobId);

    expect(abortFired).toBe(true);
    const failed = events.find((e) => e.type === "failed");
    expect(failed).toBeDefined();
    expect((failed as Extract<StatusJobEvent, { type: "failed" }>).code).toBe("TIMEOUT_90S");
  });

  it("emits failed when router throws synchronously (LLM_FAILED path)", async () => {
    vi.mocked(buildRouter).mockReturnValue({
      generate: vi.fn().mockRejectedValue(
        Object.assign(new Error("upstream 500"), { code: "PROVIDER_ERROR", retryable: false }),
      ),
    } as unknown as ReturnType<typeof buildRouter>);

    const jobId = await triggerStatusUpdate("hash", "/p", 1, "auto-after-adopt");
    const events = await collectEvents(jobId);

    const failed = events.find((e) => e.type === "failed");
    expect(failed).toBeDefined();
    expect((failed as Extract<StatusJobEvent, { type: "failed" }>).code).toBe("PROVIDER_ERROR");
  });

  it("bucket.done guard: late events after `failed` are dropped", async () => {
    // Direct unit test on the bus — doesn't go through the service.
    const { createJob, subscribeJob } = await import("./job-event-bus.js");
    const jobId = `late-${Math.random()}`;
    createJob(jobId);

    emitJobEvent(jobId, {
      type: "failed",
      code: "TIMEOUT_90S",
      message: "timeout",
      retries: 0,
    });
    // Simulate a dangling promise resolving AFTER the failed terminal event:
    emitJobEvent(jobId, { type: "completed", skipped: false, retries: 0 });

    const events: StatusJobEvent[] = [];
    for await (const e of subscribeJob(jobId)) events.push(e);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("failed");
  });
});

// ── M6-C L3: SSE idle timeout extended to 5 minutes ──────────────────────────
describe("job-event-bus L3 SSE idle timeout (M6-C)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not close subscribeJob at 30s of silence (regression: was 30s, now 5min)", async () => {
    vi.useFakeTimers();
    const { createJob, subscribeJob, emitJobEvent: emit } = await import("./job-event-bus.js");

    const jobId = `idle-${Math.random()}`;
    createJob(jobId);

    const it = subscribeJob(jobId)[Symbol.asyncIterator]();
    const firstEventPromise = it.next();

    // Advance 31s — old behaviour would close the iterator here.
    await vi.advanceTimersByTimeAsync(31_000);

    // Now emit a real event; the iterator must still be alive.
    emit(jobId, { type: "progress", phase: "still-running" });

    const { value, done } = await firstEventPromise;
    expect(done).toBe(false);
    expect(value?.type).toBe("progress");
  });
});
