/**
 * M5 Spec 005: POST /api/projects/:hash/chapters/:n/build-prompt
 *
 * 純函式：蒐集 context + 拼接 prompt + 回完整文字，不呼叫 LLM。
 * 前端把 promptText 顯示給使用者編輯後再呼叫 generate。
 */
import { zValidator } from "@hono/zod-validator";
import { countMessageTokens } from "@novel-writer/llm-adapter";
import { buildChapterWriterRequest } from "@novel-writer/prompt-library";
import { Hono } from "hono";
import { z } from "zod";
import { listChapters, readChapter } from "../services/chapter-fs.js";
import { listCharacters } from "../services/character-fs.js";
import {
  InvalidParticipantError,
  collectChapterContext,
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
    return c.json(
      { code: "INVALID_CHAPTER", message: `Chapter ${chapterNumber} not found` },
      400,
    );
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

  // M5 (Spec 009): per-routing-slot systemPromptOverride is the default;
  // per-chapter override in `body.systemPromptOverrideForChapter` takes precedence.
  const settingsOverride =
    routingConf.systemPromptOverride && routingConf.systemPromptOverride.trim().length > 0
      ? routingConf.systemPromptOverride
      : undefined;
  const effectiveSystemPromptOverride =
    body.systemPromptOverrideForChapter ?? settingsOverride;

  // Collect context with explicit participantSlugs / outline / requirements
  let context;
  try {
    context = await collectChapterContext({
      projectPath,
      chapterNumber,
      participantSlugs: body.participantSlugs,
      ...(body.outline !== undefined ? { outlineOverride: body.outline } : {}),
      ...(body.requirements !== undefined ? { requirementsOverride: body.requirements } : {}),
    });
  } catch (err) {
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

  // Participant matching info
  const allChars = await listCharacters(projectPath);
  const knownSlugs = new Map(allChars.map((c) => [c.slug, c.name]));
  const participants = context.participantSlugs.map((slug) => ({
    slug,
    name: knownSlugs.get(slug) ?? slug,
    matched: knownSlugs.has(slug),
  }));

  // Also check chapter frontmatter participants if no override supplied
  const ch = await readChapter(projectPath, chapterNumber);
  void ch; // currently unused; left as breadcrumb for future logic

  return c.json({
    promptText,
    systemPrompt: req.systemPrompt,
    userPrompt: userPromptText,
    contextHash: context.contextHash,
    estimatedTokens,
    modelId,
    participants,
  });
});

export { app as buildPromptRouter };
