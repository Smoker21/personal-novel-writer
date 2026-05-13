import { Hono } from "hono";
import { deleteDraft, readDraft } from "../services/draft-cache.js";
import { resolveProjectPath } from "../services/project-resolver.js";

const app = new Hono();

// GET .../draft — restore existing draft (for app restart recovery)
app.get("/", async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const result = await readDraft(projectHash, chapterNumber);
  if (!result) return c.json({ code: "NO_DRAFT" }, 404);

  return c.json({
    draftId: result.meta.draftId,
    text: result.text,
    status: result.meta.status,
    contextHash: result.meta.contextHash,
    createdAt: result.meta.createdAt,
    totalChars: result.text.length,
  });
});

// DELETE .../draft — discard draft
app.delete("/", async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const deleted = await deleteDraft(projectHash, chapterNumber);
  if (!deleted) return c.json({ code: "NO_DRAFT" }, 404);

  return c.json({ deleted: true });
});

export { app as draftRouter };
