import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { listChapters } from "../services/chapter-fs.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { collectChapterContext } from "../services/context-collector.js";
import { readDraft } from "../services/draft-cache.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import {
  appendToPromptFile,
  renderPromptMarkdown,
  truncatePromptFile,
} from "../services/prompt-md.js";
import { createUndoEntry } from "../services/undo-store.js";

const adoptSchema = z.object({
  draftId: z.string().min(1),
  confirmed: z.literal(true),
  force: z.boolean().optional(),
});

// Per-chapter in-flight lock to prevent double-adopt
const IN_FLIGHT = new Set<string>();
function lockKey(projectHash: string, chapterNumber: number) {
  return `${projectHash}:${chapterNumber}`;
}

const app = new Hono();

app.post("/", zValidator("json", adoptSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");
  const body = c.req.valid("json");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const key = lockKey(projectHash, chapterNumber);
  if (IN_FLIGHT.has(key)) {
    return c.json({ code: "ADOPT_IN_PROGRESS", message: "An adopt is already in progress" }, 409);
  }
  IN_FLIGHT.add(key);

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    // 1. Validate draft
    const draft = await readDraft(projectHash, chapterNumber);
    if (!draft) return c.json({ code: "DRAFT_NOT_FOUND" }, 404);
    if (draft.meta.status === "running") {
      return c.json({ code: "INVALID_DRAFT_STATUS", message: "Draft is still running" }, 400);
    }

    // 2. Compare context hash (skip if force=true)
    if (!body.force) {
      const ctx = await collectChapterContext({ projectPath, chapterNumber }).catch(() => null);
      if (ctx && ctx.contextHash !== draft.meta.contextHash) {
        return c.json(
          {
            code: "DRAFT_STALE",
            message: "Context changed since draft was generated. Use force=true to adopt anyway.",
          },
          409,
        );
      }
    }

    // 3. Find target chapter path
    const chapters = await listChapters(projectPath);
    const chapter = chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return c.json({ code: "INVALID_CHAPTER" }, 400);

    // chapter.path from listChapters() is already absolute (full path)
    const targetMainPath = chapter.path;

    // 4. Atomic write main file (tmp + rename)
    const tmpPath = `${targetMainPath}.tmp`;
    await writeFile(tmpPath, draft.text, "utf-8");
    await rename(tmpPath, targetMainPath);
    rollbacks.push(async () => {
      await unlink(targetMainPath).catch(() => undefined);
    });

    // 5. Append to prompt.md with marker
    const undoEntryId = randomUUID();
    const promptPath = join(
      projectPath,
      "chapters",
      `chapter_${String(chapterNumber).padStart(4, "0")}_prompt.md`,
    );
    const promptContent = renderPromptMarkdown({
      draftMeta: draft.meta,
      undoEntryId,
      adoptedAt: new Date().toISOString(),
    });
    const markerOffset = await appendToPromptFile(promptPath, promptContent);
    rollbacks.push(async () => {
      await truncatePromptFile(promptPath, markerOffset);
    });

    // 6. git commit
    await commitIfChanged(
      projectPath,
      "adopt",
      `adopt AI draft for chapter ${chapterNumber} ${chapter.title}`,
    );

    // 7. Trigger status-updater (fire-and-forget)
    let jobId = "no-status-job";
    try {
      const { triggerStatusUpdate } = await import("../services/status-updater-service.js");
      jobId = await triggerStatusUpdate(
        projectHash,
        projectPath,
        chapterNumber,
        "auto-after-adopt",
      );
    } catch {
      // Non-fatal
    }

    // 8. Record undo entry
    const undoEntry = await createUndoEntry({
      id: undoEntryId,
      type: "adopt-draft",
      projectHash,
      chapterNumber,
      draftId: draft.meta.draftId,
      targetMainPath: chapter.path,
      promptMarkerStartOffset: markerOffset,
      label: "採用 chapter-writer 草稿",
    });

    return c.json({
      mainPath: chapter.path,
      promptPath: `chapters/chapter_${String(chapterNumber).padStart(4, "0")}_prompt.md`,
      statusUpdateJobId: jobId,
      undoEntry: { id: undoEntry.id, label: undoEntry.label },
    });
  } catch (err) {
    for (const rb of [...rollbacks].reverse()) {
      await rb().catch(() => undefined);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ code: "IO_ERROR", message: msg }, 500);
  } finally {
    IN_FLIGHT.delete(key);
  }
});

export { app as adoptRouter };
