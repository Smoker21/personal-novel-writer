import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
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

// POST /api/projects/:hash/status/update-from-chapter
app.post("/update-from-chapter", zValidator("json", updateSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const { chapterNumber, reason } = c.req.valid("json");
  const jobId = await triggerStatusUpdate(projectHash, projectPath, chapterNumber, reason);
  return c.json({ jobId }, 202);
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
