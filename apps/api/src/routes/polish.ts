/**
 * POST /api/projects/:hash/chapters/:chapterNumber/polish
 *
 * polish-prose Skill endpoint（spec 012）。
 * 收框選段落 + 前後文 + 潤稿指令 → SSE 串流潤稿結果。
 *
 * SSE event sequence:
 *   started  → { polishId, model }
 *   chunk    → { text }
 *   usage    → { inputTokens, outputTokens }
 *   complete → { polishId, totalChars, durationMs }
 *   error    → { code, message, retryable }  （on failure）
 *
 * HTTP errors（inline，回 JSON 非 SSE）:
 *   400 INVALID_INPUT             — selectedText 空或 > 5000 codepoint
 *   400 ROUTING_NOT_CONFIGURED    — agents.polishProse routing 未設
 *   404 PROJECT_NOT_FOUND         — projectHash 不在 recentProjects
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { resolveProjectPath } from "../services/project-resolver.js";
import { polishProse } from "../services/polish-prose.js";
import { readSettings } from "../services/settings-store.js";
import { safeWriteSSE } from "../services/sse-safe.js";

const polishSchema = z.object({
  selectedText: z
    .string()
    .min(1, "selectedText 不能為空")
    .refine((s) => [...s].length <= 5000, {
      message: "selectedText 超過 5000 codepoint，請分段潤稿",
    }),
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional(),
  /** 空字串 = 自由潤飾（spec 012 §「API 合約」+ skill spec §3） */
  polishInput: z.string(),
});

const app = new Hono();

app.post("/", async (c) => {
  const projectHash = c.req.param("hash") ?? "";

  // Parse + validate body manually so we can return { code: "INVALID_INPUT" }
  // per spec 012 §Errors （zValidator 預設不回 code 欄位）
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ code: "INVALID_INPUT", message: "Request body must be JSON" }, 400);
  }
  const parsed = polishSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return c.json(
      {
        code: "INVALID_INPUT",
        message: firstIssue?.message ?? "Invalid request body",
        issues: parsed.error.issues,
      },
      400,
    );
  }
  const body = parsed.data;

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const settings = await readSettings();
  const routingConf = settings.routing.polishProse;
  if (!routingConf) {
    return c.json(
      { code: "ROUTING_NOT_CONFIGURED", message: "polish-prose routing 未設定" },
      400,
    );
  }

  return streamSSE(c, async (stream) => {
    const polishId = randomUUID();
    const abortController = new AbortController();

    stream.onAbort(() => {
      abortController.abort();
    });

    const startedAt = Date.now();

    await safeWriteSSE(stream, {
      event: "started",
      data: JSON.stringify({ polishId, model: routingConf.primary }),
    });

    let totalChars = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const chunkIter = polishProse({
        selectedText: body.selectedText,
        polishInput: body.polishInput,
        routing: routingConf,
        settings,
        abortSignal: abortController.signal,
        ...(body.contextBefore !== undefined && { contextBefore: body.contextBefore }),
        ...(body.contextAfter !== undefined && { contextAfter: body.contextAfter }),
      });

      for await (const chunk of chunkIter) {
        if (stream.aborted) {
          abortController.abort();
          return;
        }

        if (chunk.type === "text") {
          totalChars += chunk.text.length;
          await safeWriteSSE(stream, {
            event: "chunk",
            data: JSON.stringify({ text: chunk.text }),
          });
        } else if (chunk.type === "usage") {
          inputTokens = chunk.usage.inputTokens;
          outputTokens = chunk.usage.outputTokens;
          await safeWriteSSE(stream, {
            event: "usage",
            data: JSON.stringify(chunk.usage),
          });
        } else if (chunk.type === "finish") {
          if (chunk.finishReason === "abort") {
            return;
          }
        }
        // "degraded" — polish-prose 無 fallback（spec 012 §「LLM adapter 合約」）；靜默忽略
      }

      await safeWriteSSE(stream, {
        event: "complete",
        data: JSON.stringify({
          polishId,
          totalChars,
          durationMs: Date.now() - startedAt,
          inputTokens,
          outputTokens,
        }),
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; retryable?: boolean };
      await safeWriteSSE(stream, {
        event: "error",
        data: JSON.stringify({
          code: err.code ?? "UNKNOWN",
          message: err.message ?? String(e),
          retryable: err.retryable ?? false,
        }),
      });
    }
  });
});

export { app as polishRouter };
