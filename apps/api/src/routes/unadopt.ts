import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { commitIfChanged } from "../services/commit-policy.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { appendUndoNote } from "../services/prompt-md.js";
import { getUndoEntry, markUndone } from "../services/undo-store.js";

const app = new Hono();

app.post("/", zValidator("json", z.object({ undoEntryId: z.string().min(1) })), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");
  const { undoEntryId } = c.req.valid("json");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const entry = await getUndoEntry(projectHash, undoEntryId);
  if (!entry) return c.json({ code: "UNDO_ENTRY_NOT_FOUND" }, 404);
  if (entry.undone) return c.json({ code: "ALREADY_UNDONE" }, 400);

  await markUndone(projectHash, undoEntryId);

  // Append Undo note to prompt.md (best-effort; not fatal if missing)
  const promptPath = join(
    projectPath,
    "chapters",
    `chapter_${String(chapterNumber).padStart(4, "0")}_prompt.md`,
  );
  await appendUndoNote(promptPath, undoEntryId);
  await commitIfChanged(
    projectPath,
    "adopt",
    `unadopt chapter ${chapterNumber} (undo ${undoEntryId.slice(0, 8)})`,
  );

  return c.json({ promptNote: `Undo 採用 recorded at ${new Date().toISOString()}` });
});

export { app as unadoptRouter };
