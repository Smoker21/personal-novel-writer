import { zValidator } from "@hono/zod-validator";
import type {
  ApiErrorBody,
  ChapterFile,
  ChapterListItem,
  CreateChapterResponse,
  SaveChapterResponse,
} from "@novel-writer/shared-types";
import { Hono } from "hono";
import { z } from "zod";
import {
  createChapter,
  deleteChapter,
  listChapters,
  readChapter,
  renameChapter,
  saveChapter,
} from "../services/chapter-fs.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { resolveProjectPath } from "../services/project-resolver.js";

const saveSchema = z.object({
  content: z.string(),
  title: z.string().trim().min(1),
  expectedMtime: z.string().optional(),
});

const createSchema = z.object({ title: z.string().optional() });
const renameSchema = z.object({ title: z.string().trim().min(1) });
const deleteSchema = z.object({ confirmed: z.literal(true) });

async function getProjectPath(hash: string): Promise<string | null> {
  return resolveProjectPath(hash);
}

export const chapters = new Hono()
  .get("/", async (c) => {
    const hash = c.req.param("hash") ?? "";
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const list = await listChapters(projectPath);
    const items: ChapterListItem[] = list.map((entry) => ({
      number: entry.number,
      title: entry.title,
      path: entry.path,
      wordCount: entry.wordCount,
      mtime: entry.mtime,
      hasPromptFile: entry.hasPromptFile,
    }));
    return c.json({ chapters: items });
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const { title } = c.req.valid("json");
    const ch = await createChapter(projectPath, title);
    const body: CreateChapterResponse = { number: ch.number, title: ch.title, path: ch.path };
    return c.json(body, 201);
  })
  .get("/:n", async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const result = await readChapter(projectPath, n);
    if (!result) {
      return c.json<ApiErrorBody>({ code: "CHAPTER_NOT_FOUND", message: "" }, 404);
    }
    const body: ChapterFile = result;
    return c.json(body);
  })
  .put("/:n", zValidator("json", saveSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const params = c.req.valid("json");
    const result = await saveChapter({
      projectPath,
      chapterNumber: n,
      content: params.content,
      title: params.title,
      ...(params.expectedMtime !== undefined ? { expectedMtime: params.expectedMtime } : {}),
    });
    if (!result.ok) {
      const status: 400 | 409 = result.code === "INVALID_TITLE" ? 400 : 409;
      return c.json<ApiErrorBody>({ code: result.code, message: result.message }, status);
    }
    let commitSha: string | null = null;
    try {
      const commit = await commitIfChanged(projectPath, "save-chapter", params.title);
      commitSha = commit?.sha ?? null;
    } catch (err) {
      console.warn(`commit-policy failed: ${String(err)}`);
    }
    // Trigger status-updater asynchronously (auto-after-save)
    let statusUpdateJobId: string | null = null;
    try {
      const { triggerStatusUpdate } = await import("../services/status-updater-service.js");
      statusUpdateJobId = await triggerStatusUpdate(hash, projectPath, n, "auto-after-save");
    } catch {
      // Non-fatal: status-updater failure doesn't block save
    }

    const body: SaveChapterResponse = {
      path: result.path,
      mtime: result.mtime,
      size: result.size,
      commitSha,
      statusUpdateJobId,
    };
    return c.json(body);
  })
  .post("/:n/rename", zValidator("json", renameSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const { title } = c.req.valid("json");
    try {
      const result = await renameChapter(projectPath, n, title);
      let commitSha = "";
      try {
        const commit = await commitIfChanged(projectPath, "rename-chapter", title);
        commitSha = commit?.sha ?? "";
      } catch (err) {
        console.warn(`commit failed: ${String(err)}`);
      }
      return c.json({ oldPath: result.oldPath, newPath: result.newPath, commitSha });
    } catch (err) {
      return c.json<ApiErrorBody>(
        { code: "IO_ERROR", message: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  })
  .delete("/:n", zValidator("json", deleteSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    try {
      await deleteChapter(projectPath, n);
      let commitSha = "";
      try {
        const commit = await commitIfChanged(projectPath, "save-chapter", `delete chapter ${n}`);
        commitSha = commit?.sha ?? "";
      } catch {
        // ignore
      }
      return c.json({ commitSha });
    } catch (err) {
      return c.json<ApiErrorBody>(
        { code: "IO_ERROR", message: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });
