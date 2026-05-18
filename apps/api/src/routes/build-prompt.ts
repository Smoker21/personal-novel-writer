/**
 * M5 Spec 005: POST /api/projects/:hash/chapters/:n/build-prompt
 *
 * 純函式：蒐集 context + 拼接 prompt + 回完整文字，不呼叫 LLM。
 * 前端把 promptText 顯示給使用者編輯後再呼叫 generate。
 *
 * M6 (ADR-0010 / spec 005 修訂)：Response 200 改 discriminated union — 依
 * routing primary 的 `hasStructuredNovelGenerate` capability flag 分支：
 *   - kind: "messages"   → 既有 promptText + systemPrompt + userPrompt
 *   - kind: "structured" → structuredInputs (plot / background / requirements / pre_summary / prev_segment)
 */
import { zValidator } from "@hono/zod-validator";
import { countMessageTokens } from "@novel-writer/llm-adapter";
import { buildChapterWriterRequest } from "@novel-writer/prompt-library";
import { Hono } from "hono";
import { z } from "zod";
import { listChapters } from "../services/chapter-fs.js";
import { listCharacters } from "../services/character-fs.js";
import { getModelKind } from "../services/chapter-writer-dispatch.js";
import {
  collectChapterContext,
  collectStructuredInputs,
  InvalidParticipantError,
} from "../services/context-collector.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { readSettings } from "../services/settings-store.js";

const buildPromptSchema = z.object({
  participantSlugs: z.array(z.string()),
  outline: z.string().nullable().optional(),
  requirements: z.string().nullable().optional(),
  modelOverride: z.string().optional(),
  temperatureOverride: z.number().min(0).max(2).optional(),
  systemPromptOverrideForChapter: z.string().optional(),
  userIntent: z.string().optional(),
});

const app = new Hono();

app.post("/", zValidator("json", buildPromptSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const chapters = await listChapters(projectPath);
  const chapter = chapters.find((ch) => ch.number === chapterNumber);
  if (!chapter) {
    return c.json({ code: "INVALID_CHAPTER", message: `Chapter ${chapterNumber} not found` }, 400);
  }

  const settings = await readSettings();
  const routingConf = settings.routing.chapterWriter;
  if (!routingConf) {
    return c.json(
      { code: "ROUTING_NOT_CONFIGURED", message: "chapter-writer routing not configured" },
      400,
    );
  }

  const body = c.req.valid("json");
  const modelId = body.modelOverride ?? routingConf.primary;
  const kind = getModelKind(modelId);

  // M5 (Spec 009): per-routing-slot systemPromptOverride is the default;
  // per-chapter override in `body.systemPromptOverrideForChapter` takes precedence.
  const settingsOverride =
    routingConf.systemPromptOverride && routingConf.systemPromptOverride.trim().length > 0
      ? routingConf.systemPromptOverride
      : undefined;
  const effectiveSystemPromptOverride = body.systemPromptOverrideForChapter ?? settingsOverride;

  // Helper to build participants array (M5 audit) — used in both branches.
  async function buildParticipants(
    slugs: string[],
  ): Promise<Array<{ slug: string; name: string; matched: boolean }>> {
    const allChars = await listCharacters(projectPath as string);
    const knownSlugs = new Map(allChars.map((c) => [c.slug, c.name]));
    return slugs.map((slug) => ({
      slug,
      name: knownSlugs.get(slug) ?? slug,
      matched: knownSlugs.has(slug),
    }));
  }

  // ── Structured path (M6) ────────────────────────────────────────────────
  if (kind === "structured") {
    try {
      const { inputs, contextHash } = await collectStructuredInputs({
        projectPath,
        chapterNumber,
        participantSlugs: body.participantSlugs,
        ...(body.outline !== undefined ? { outlineOverride: body.outline } : {}),
        ...(body.requirements !== undefined ? { requirementsOverride: body.requirements } : {}),
      });
      const participants = await buildParticipants(body.participantSlugs);
      return c.json({
        kind: "structured" as const,
        structuredInputs: inputs,
        contextHash,
        modelId,
        participants,
      });
    } catch (err) {
      return handleCollectError(c, err);
    }
  }

  // ── Messages path (既有) ───────────────────────────────────────────────
  let context: Awaited<ReturnType<typeof collectChapterContext>>;
  try {
    context = await collectChapterContext({
      projectPath,
      chapterNumber,
      participantSlugs: body.participantSlugs,
      ...(body.outline !== undefined ? { outlineOverride: body.outline } : {}),
      ...(body.requirements !== undefined ? { requirementsOverride: body.requirements } : {}),
    });
  } catch (err) {
    return handleCollectError(c, err);
  }

  // Build the prompt (system + user) — pure function, no LLM call
  const req = buildChapterWriterRequest(
    {
      context,
      chapterNumber,
      chapterTitle: chapter.title,
      ...(body.userIntent !== undefined ? { userIntent: body.userIntent } : {}),
      ...(effectiveSystemPromptOverride !== undefined
        ? { systemPromptOverrideForChapter: effectiveSystemPromptOverride }
        : {}),
      ...(body.temperatureOverride !== undefined
        ? { temperatureOverride: body.temperatureOverride }
        : {}),
    },
    modelId,
  );

  const userPromptText =
    typeof req.messages[0]?.content === "string"
      ? req.messages[0].content
      : JSON.stringify(req.messages[0]?.content);

  // Combined prompt for user editing (system + user merged with markdown separators)
  const promptText = `# System Prompt\n\n${req.systemPrompt}\n\n---\n\n# User Prompt\n\n${userPromptText}`;

  // Token estimate
  const estimatedTokens = await countMessageTokens(req.systemPrompt, [
    { role: "user", content: userPromptText },
  ]);

  const participants = await buildParticipants(context.participantSlugs);

  return c.json({
    kind: "messages" as const,
    promptText,
    systemPrompt: req.systemPrompt,
    userPrompt: userPromptText,
    contextHash: context.contextHash,
    estimatedTokens,
    modelId,
    participants,
  });
});

/** 把 context-collect 拋出的 typed error 轉成 400 response。 */
function handleCollectError(
  // biome-ignore lint/suspicious/noExplicitAny: hono context type 在此 file scope 內僅作 c.json 用
  c: any,
  err: unknown,
) {
  if (err instanceof InvalidParticipantError) {
    return c.json(
      {
        code: "INVALID_PARTICIPANT",
        message: err.message,
        missingSlugs: err.missingSlugs,
      },
      400,
    );
  }
  const e = err as { code?: string; message?: string };
  if (e.code === "MISSING_CONTEXT") {
    return c.json({ code: "MISSING_CONTEXT", message: e.message ?? "" }, 400);
  }
  if (e.code === "INVALID_CHAPTER") {
    return c.json({ code: "INVALID_CHAPTER", message: e.message ?? "" }, 400);
  }
  if (e.code === "CONTEXT_TOO_LARGE") {
    return c.json({ code: "CONTEXT_TOO_LARGE", message: e.message ?? "" }, 400);
  }
  throw err;
}

export { app as buildPromptRouter };
