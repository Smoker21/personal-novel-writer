import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "@novel-writer/prompt-library";
import type { GenerateRequest, GenerateResponse } from "@novel-writer/llm-adapter";
import type { UpdateReason } from "@novel-writer/shared-types";
import { atomicWriteFile } from "./atomic-fs.js";
import { commitIfChanged } from "./commit-policy.js";
import { createJob, emitJobEvent } from "./job-event-bus.js";
import { buildRouter, toRouterPolicy } from "./router-factory.js";
import { readSettings } from "./settings-store.js";
import { collectStatusContext } from "./status-context-collector.js";

const BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

/**
 * M6-C L1: service-side hard timeout for each LLM call. After this, the
 * status-updater forcibly emits `failed` so the client doesn't sit on
 * "狀態更新中…" indefinitely when the upstream provider stalls / 502s.
 *
 * Total wall-clock budget = TIMEOUT_MS × (1 primary call + up to 1 parse-retry).
 */
export const LLM_CALL_TIMEOUT_MS = 90_000;

/**
 * Trigger a status-updater run in the background.
 * Returns a jobId immediately; client subscribes to GET /jobs/:jobId/events for progress.
 */
export async function triggerStatusUpdate(
  _projectHash: string,
  projectPath: string,
  chapterNumber: number,
  reason: UpdateReason,
): Promise<string> {
  const jobId = randomUUID();
  createJob(jobId);

  setImmediate(() => {
    void runStatusUpdate(jobId, projectPath, chapterNumber, reason);
  });

  return jobId;
}

/**
 * Wraps `router.generate()` with a hard timeout. If the timer fires first,
 * the AbortController cancels the provider call (provider impl honours
 * `request.abortSignal`) and we throw a typed `TimeoutError` that the caller
 * converts into a `failed` job event.
 *
 * Even if the provider ignores the signal, the timeout path returns
 * immediately — the dangling promise's late resolution is dropped by the
 * `bucket.done` guard inside `job-event-bus.emitJobEvent`.
 */
class TimeoutError extends Error {
  readonly code = "TIMEOUT_90S";
  readonly retryable = false;
  constructor(message = `LLM call exceeded ${LLM_CALL_TIMEOUT_MS}ms`) {
    super(message);
    this.name = "TimeoutError";
  }
}

async function generateWithTimeout(
  router: ReturnType<typeof buildRouter>,
  request: GenerateRequest,
  policy: Parameters<ReturnType<typeof buildRouter>["generate"]>[1],
  timeoutMs: number = LLM_CALL_TIMEOUT_MS,
): Promise<GenerateResponse> {
  const controller = new AbortController();
  const reqWithSignal: GenerateRequest = { ...request, abortSignal: controller.signal };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject FIRST so the race resolves with TimeoutError deterministically;
      // then abort the provider (fire-and-forget cleanup). If we aborted first,
      // the provider's AbortError reject would win the race and we'd lose the
      // TIMEOUT_90S code.
      reject(new TimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([router.generate(reqWithSignal, policy), timeoutPromise]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function runStatusUpdate(
  jobId: string,
  projectPath: string,
  chapterNumber: number,
  reason: UpdateReason,
): Promise<void> {
  try {
    const settings = await readSettings();
    const routingConf = settings.routing.statusUpdater;
    if (!routingConf) {
      emitJobEvent(jobId, {
        type: "failed",
        code: "ROUTING_NOT_CONFIGURED",
        message: "statusUpdater routing not set",
        retries: 0,
      });
      return;
    }

    emitJobEvent(jobId, { type: "started", model: routingConf.primary, chapterNumber });
    emitJobEvent(jobId, { type: "progress", phase: "collecting-context" });

    const context = await collectStatusContext(projectPath, chapterNumber);
    const genReq = buildStatusUpdaterRequest(
      {
        chapterNumber: context.chapterNumber,
        chapterTitle: context.chapterTitle,
        chapterText: context.chapterText,
        currentStoryStatus: context.currentStoryStatus,
        relevantCharacters: context.relevantCharacters,
      },
      routingConf.primary,
    );

    emitJobEvent(jobId, { type: "progress", phase: "calling-llm" });

    const router = buildRouter(settings);
    let responseText: string | null = null;
    let retries = 0;

    while (retries <= MAX_RETRIES) {
      try {
        const resp = await generateWithTimeout(router, genReq, toRouterPolicy(routingConf));
        responseText = resp.text;
        break;
      } catch (err) {
        const e = err as { retryable?: boolean; code?: string };
        if (!e.retryable || retries >= MAX_RETRIES) {
          emitJobEvent(jobId, {
            type: "failed",
            code: e.code ?? "LLM_FAILED",
            message: err instanceof Error ? err.message : String(err),
            retries,
          });
          return;
        }
        await sleep(BACKOFF_MS[retries] ?? 4000);
        retries++;
      }
    }

    if (!responseText) return;

    // Parse LLM output (strip code fence if present)
    const cleaned = responseText
      .trim()
      .replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1")
      .trim();

    let parsed: ReturnType<typeof statusUpdaterOutputSchema.parse>;
    try {
      parsed = statusUpdaterOutputSchema.parse(JSON.parse(cleaned));
    } catch {
      // One retry with format correction
      const retryReq = buildStatusUpdaterRequest(
        {
          chapterNumber: context.chapterNumber,
          chapterTitle: context.chapterTitle,
          chapterText: context.chapterText,
          currentStoryStatus: context.currentStoryStatus,
          relevantCharacters: context.relevantCharacters,
        },
        routingConf.primary,
      );
      retryReq.messages.push({ role: "assistant", content: responseText });
      retryReq.messages.push({
        role: "user",
        content: "請直接回傳 JSON，不要加 code fence 或說明文字。",
      });
      try {
        const retryResp = await generateWithTimeout(router, retryReq, toRouterPolicy(routingConf));
        const retryText = retryResp.text
          .trim()
          .replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1")
          .trim();
        parsed = statusUpdaterOutputSchema.parse(JSON.parse(retryText));
      } catch (retryErr) {
        const e = retryErr as { code?: string };
        // Distinguish TIMEOUT_90S from generic PARSE_FAILED so UI shows a useful reason.
        const code = e.code === "TIMEOUT_90S" ? "TIMEOUT_90S" : "PARSE_FAILED";
        const message =
          e.code === "TIMEOUT_90S"
            ? retryErr instanceof Error
              ? retryErr.message
              : String(retryErr)
            : "Cannot parse LLM output as valid JSON";
        emitJobEvent(jobId, {
          type: "failed",
          code,
          message,
          retries,
        });
        return;
      }
    }

    emitJobEvent(jobId, { type: "progress", phase: "writing-files" });

    // Write files only if content changed
    let changed = false;

    if (parsed.storyStatus !== context.currentStoryStatus) {
      await atomicWriteFile(join(projectPath, "status", "story_status.md"), parsed.storyStatus);
      changed = true;
    }

    for (const [slug, newContent] of Object.entries(parsed.characterStatuses)) {
      const oldContent = context.characterStatuses[slug] ?? "";
      if (newContent !== oldContent) {
        await atomicWriteFile(join(projectPath, "characters", `${slug}_status.md`), newContent);
        changed = true;
      }
    }

    if (changed) {
      await commitIfChanged(
        projectPath,
        "status",
        `update after ${reason} chapter ${chapterNumber}`,
      );
    }

    emitJobEvent(jobId, { type: "completed", skipped: !changed, retries });
  } catch (err) {
    // Belt-and-braces: any uncaught throw inside runStatusUpdate must still
    // emit `failed` so the client doesn't stall on "狀態更新中…" forever.
    const e = err as { code?: string };
    emitJobEvent(jobId, {
      type: "failed",
      code: e.code ?? "UNKNOWN",
      message: err instanceof Error ? err.message : String(err),
      retries: 0,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
