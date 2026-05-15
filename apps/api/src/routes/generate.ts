import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { GenerateRequest } from "@novel-writer/llm-adapter";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { listChapters } from "../services/chapter-fs.js";
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

// M5 (Spec 005): new request shape — user-edited prompt + audit metadata
const generateSchema = z.object({
  promptText: z.string().min(1),
  contextHash: z.string(),
  participants: z.array(z.string()),
  outline: z.string().nullable(),
  requirements: z.string().nullable(),
  modelOverride: z.string().optional(),
  temperatureOverride: z.number().min(0).max(2).optional(),
});

/**
 * Split a build-prompt promptText back into systemPrompt + userPrompt.
 * The build-prompt endpoint outputs: "# System Prompt\n\n<sys>\n\n---\n\n# User Prompt\n\n<user>"
 * If user kept the markers, we split cleanly; if they edited away the markers,
 * the entire promptText is sent as user message (no system prompt).
 */
function splitPromptText(promptText: string): { systemPrompt: string; userPrompt: string } {
  const sysHeader = "# System Prompt\n\n";
  const sep = "\n\n---\n\n# User Prompt\n\n";
  if (promptText.startsWith(sysHeader)) {
    const sepIdx = promptText.indexOf(sep, sysHeader.length);
    if (sepIdx > -1) {
      return {
        systemPrompt: promptText.slice(sysHeader.length, sepIdx),
        userPrompt: promptText.slice(sepIdx + sep.length),
      };
    }
  }
  return { systemPrompt: "", userPrompt: promptText };
}

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

      // M5: context already collected in build-prompt stage; promptText is user-edited.
      // We trust the client's contextHash + audit fields (participants/outline/requirements)
      // as a record of what the prompt was based on.

      // 1. Create draft record
      await createDraft({
        draftId,
        projectHash,
        chapterNumber,
        chapterTitle: chapter.title,
        agentName: "chapter-writer",
        modelId: policy.primary,
        contextHash: body.contextHash,
        status: "running",
        createdAt: new Date().toISOString(),
        totalChars: 0,
      });

      await stream.writeSSE({
        event: "started",
        data: JSON.stringify({ draftId, model: policy.primary, contextHash: body.contextHash }),
      });

      // 2. Build LLM request from user-edited promptText
      const { systemPrompt, userPrompt } = splitPromptText(body.promptText);
      const req: GenerateRequest = {
        modelId: policy.primary,
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxOutputTokens: 4096,
        temperature: body.temperatureOverride ?? 0.7,
        abortSignal: abortController.signal,
      };

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
