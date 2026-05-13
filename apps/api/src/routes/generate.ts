import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { buildChapterWriterRequest } from "@novel-writer/prompt-library";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { listChapters } from "../services/chapter-fs.js";
import { collectChapterContext } from "../services/context-collector.js";
import {
  abortDraft,
  appendDraftText,
  completeDraft,
  createDraft,
  readDraft,
} from "../services/draft-cache.js";
import { getProjectQueue } from "../services/job-queue.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { buildRouter, toRouterPolicy } from "../services/router-factory.js";
import { readSettings } from "../services/settings-store.js";

const generateSchema = z.object({
  agentName: z.literal("chapter-writer"),
  modelOverride: z.string().optional(),
  userIntent: z.string().optional(),
});

const app = new Hono();

app.post("/", zValidator("json", generateSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const chapters = await listChapters(projectPath);
  const chapter = chapters.find((ch) => ch.number === chapterNumber);
  if (!chapter)
    return c.json({ code: "INVALID_CHAPTER", message: `Chapter ${chapterNumber} not found` }, 400);

  const settings = await readSettings();
  const routingConf = settings.routing.chapterWriter;
  if (!routingConf) {
    return c.json(
      { code: "ROUTING_NOT_CONFIGURED", message: "chapter-writer routing not configured" },
      400,
    );
  }

  const body = c.req.valid("json");
  const effectivePrimary = body.modelOverride ?? routingConf.primary;
  const policy = toRouterPolicy({ ...routingConf, primary: effectivePrimary });

  // Check if there's already a running draft
  const existing = await readDraft(projectHash, chapterNumber);
  if (existing?.meta.status === "running") {
    return c.json(
      { code: "DRAFT_IN_PROGRESS", message: "A draft is already being generated for this chapter" },
      409,
    );
  }

  return streamSSE(c, async (stream) => {
    const queue = getProjectQueue(projectHash);

    await queue.add(async () => {
      const draftId = randomUUID();
      const abortController = new AbortController();

      // Abort when client disconnects
      stream.onAbort(() => {
        abortController.abort();
      });

      // 1. Collect context
      let context: Awaited<ReturnType<typeof collectChapterContext>>;
      try {
        context = await collectChapterContext({ projectPath, chapterNumber });
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            code: err.code ?? "MISSING_CONTEXT",
            message: err.message ?? String(e),
            retryable: false,
          }),
        });
        return;
      }

      // 2. Create draft record
      await createDraft({
        draftId,
        projectHash,
        chapterNumber,
        chapterTitle: chapter.title,
        agentName: "chapter-writer",
        modelId: policy.primary,
        contextHash: context.contextHash,
        status: "running",
        createdAt: new Date().toISOString(),
        totalChars: 0,
      });

      await stream.writeSSE({
        event: "started",
        data: JSON.stringify({ draftId, model: policy.primary, contextHash: context.contextHash }),
      });

      // 3. Stream from LLM
      const writerInput = {
        context,
        chapterNumber,
        chapterTitle: chapter.title,
        ...(body.userIntent !== undefined ? { userIntent: body.userIntent } : {}),
      };
      const req = buildChapterWriterRequest(writerInput, policy.primary);
      req.abortSignal = abortController.signal;

      const router = buildRouter(settings);
      let inputTokens = 0;
      let outputTokens = 0;
      let usedModel = policy.primary;

      try {
        for await (const chunk of router.stream(req, policy)) {
          if (chunk.type === "text") {
            await appendDraftText(projectHash, chapterNumber, chunk.text);
            await stream.writeSSE({ event: "chunk", data: JSON.stringify({ text: chunk.text }) });
          } else if (chunk.type === "usage") {
            inputTokens = chunk.usage.inputTokens;
            outputTokens = chunk.usage.outputTokens;
            await stream.writeSSE({ event: "usage", data: JSON.stringify(chunk.usage) });
          } else if (chunk.type === "degraded") {
            usedModel = chunk.toModel;
            await stream.writeSSE({
              event: "degraded",
              data: JSON.stringify({
                fromModel: chunk.fromModel,
                toModel: chunk.toModel,
                reason: "fallback",
              }),
            });
          } else if (chunk.type === "finish") {
            if (chunk.finishReason === "abort") {
              await abortDraft(projectHash, chapterNumber, draftId);
              return;
            }
            usedModel = chunk.modelId;
          }
        }

        await completeDraft(projectHash, chapterNumber, draftId, { inputTokens, outputTokens });
        const finished = await readDraft(projectHash, chapterNumber);
        await stream.writeSSE({
          event: "complete",
          data: JSON.stringify({
            draftId,
            totalChars: finished?.text.length ?? 0,
            durationMs: 0,
            modelId: usedModel,
          }),
        });
      } catch (e: unknown) {
        await abortDraft(projectHash, chapterNumber, draftId);
        const err = e as { code?: string; message?: string; retryable?: boolean };
        await stream.writeSSE({
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
});

export { app as generateRouter };
