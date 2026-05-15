import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { atomicWriteFile } from "../services/atomic-fs.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { shortenStatusFile } from "../services/status-shortener-service.js";
import { triggerStatusUpdate } from "../services/status-updater-service.js";

const app = new Hono();

const updateSchema = z.object({
  chapterNumber: z.number().int().positive(),
  reason: z.enum(["auto-after-adopt", "auto-after-save", "manual"]),
});

const shortenSchema = z.object({
  fileType: z.enum(["story", "character"]),
  characterSlug: z.string().optional(),
  preserveMarkedSections: z.boolean(),
  modelOverride: z.string().optional(),
});

const writeSchema = z
  .object({
    fileType: z.enum(["story", "character"]),
    characterSlug: z.string().optional(),
    content: z.string().min(1, "content cannot be empty"),
    expectedMtime: z.string().optional(),
  })
  .refine((v) => v.fileType !== "character" || !!v.characterSlug, {
    message: "characterSlug required when fileType=character",
    path: ["characterSlug"],
  });

// POST /api/projects/:hash/status/update-from-chapter
app.post("/update-from-chapter", zValidator("json", updateSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const { chapterNumber, reason } = c.req.valid("json");
  const jobId = await triggerStatusUpdate(projectHash, projectPath, chapterNumber, reason);
  return c.json({ jobId }, 202);
});

// POST /api/projects/:hash/status/write (M5 TD-1)
app.post("/write", zValidator("json", writeSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const { fileType, characterSlug, content, expectedMtime } = c.req.valid("json");

  // Compute target path
  const targetPath =
    fileType === "story"
      ? join(projectPath, "status", "story_status.md")
      : join(projectPath, "characters", `${characterSlug}_status.md`);

  // For character: ensure parent character.md exists (don't auto-create new char)
  if (fileType === "character") {
    const characterMd = join(projectPath, "characters", `${characterSlug}.md`);
    try {
      await access(characterMd);
    } catch {
      return c.json(
        { code: "CHARACTER_NOT_FOUND", message: `character ${characterSlug} not found` },
        404,
      );
    }
  }

  // Optional optimistic concurrency check
  if (expectedMtime !== undefined) {
    try {
      const s = await stat(targetPath);
      if (s.mtime.toISOString() !== expectedMtime) {
        return c.json(
          { code: "MTIME_MISMATCH", message: "file modified externally" },
          409,
        );
      }
    } catch {
      // File doesn't exist yet — that's fine, no mtime to compare
    }
  }

  // Atomic write
  try {
    await atomicWriteFile(targetPath, content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ code: "IO_ERROR", message: msg }, 500);
  }

  // Get post-write stat
  const s = await stat(targetPath);

  // Commit
  const label =
    fileType === "story" ? "manual edit story" : `manual edit character/${characterSlug}`;
  const commitResult = await commitIfChanged(projectPath, "status", label);

  return c.json({
    path: targetPath,
    mtime: s.mtime.toISOString(),
    size: s.size,
    commitSha: commitResult?.sha ?? null,
  });
});

// POST /api/projects/:hash/status/shorten
app.post("/shorten", zValidator("json", shortenSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  try {
    const req = c.req.valid("json");
    const result = await shortenStatusFile(projectPath, {
      fileType: req.fileType,
      preserveMarkedSections: req.preserveMarkedSections,
      ...(req.characterSlug !== undefined ? { characterSlug: req.characterSlug } : {}),
      ...(req.modelOverride !== undefined ? { modelOverride: req.modelOverride } : {}),
    });
    return c.json(result);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "ROUTING_NOT_CONFIGURED") {
      return c.json({ code: "ROUTING_NOT_CONFIGURED" }, 400);
    }
    return c.json({ code: "LLM_FAILED", message: e.message ?? String(err) }, 502);
  }
});

export { app as statusRouter };
