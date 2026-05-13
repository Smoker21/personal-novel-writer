import { access, constants } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ApiErrorBody, CreateNovelResponse } from "@novel-writer/shared-types";
import { commitIfChanged } from "../services/commit-policy.js";
import { git } from "../services/git.js";
import { createProjectFiles } from "../services/project-fs.js";
import { addRecentProject, computeProjectHash } from "../services/recent-projects-store.js";
import { sanitizeTitle } from "../services/sanitize.js";

const createSchema = z.object({
  parentFolder: z.string().min(1),
  title: z.string().trim().min(1),
  synopsis: z.string().trim().min(1),
  characters: z
    .array(z.object({ name: z.string().trim().min(1), description: z.string().trim().min(1) }))
    .min(1),
});

async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const novels = new Hono().post(
  "/",
  zValidator("json", createSchema, (result, c) => {
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      return c.json<ApiErrorBody>(
        { code: "INVALID_INPUT", message: "validation failed", fieldErrors },
        400,
      );
    }
  }),
  async (c) => {
    const req = c.req.valid("json");

    if (!isAbsolute(req.parentFolder)) {
      return c.json<ApiErrorBody>(
        { code: "INVALID_PATH", message: "parentFolder must be absolute" },
        400,
      );
    }
    if (!(await exists(req.parentFolder)) || !(await isWritable(req.parentFolder))) {
      return c.json<ApiErrorBody>(
        { code: "WRITE_FORBIDDEN", message: "parentFolder does not exist or is not writable" },
        403,
      );
    }

    let sanitizedTitle: string;
    try {
      sanitizedTitle = sanitizeTitle(req.title);
    } catch (err) {
      return c.json<ApiErrorBody>(
        {
          code: "INVALID_INPUT",
          message: err instanceof Error ? err.message : "invalid title",
          fieldErrors: { title: "title sanitizes to empty string" },
        },
        400,
      );
    }

    const projectPath = join(req.parentFolder, sanitizedTitle);
    if (await exists(projectPath)) {
      return c.json<ApiErrorBody>(
        { code: "PROJECT_CONFLICT", message: `path already exists: ${projectPath}` },
        409,
      );
    }

    let created;
    try {
      created = await createProjectFiles(req, projectPath);
    } catch (err) {
      return c.json<ApiErrorBody>(
        { code: "IO_ERROR", message: err instanceof Error ? err.message : "io failure" },
        500,
      );
    }

    // git init + initial commit (best-effort)
    try {
      const initResult = await git.init(projectPath);
      if (initResult.ok) {
        await commitIfChanged(projectPath, "create-project", req.title);
      }
    } catch (err) {
      console.warn(`git init failed for ${projectPath}: ${String(err)}`);
    }

    // recent-projects best-effort
    try {
      const hash = computeProjectHash(projectPath);
      await addRecentProject(hash, projectPath, req.title);
    } catch (err) {
      console.warn(`addRecentProject failed: ${String(err)}`);
    }

    const body: CreateNovelResponse = {
      project: { path: projectPath, title: req.title, createdAt: created.meta.createdAt },
      firstChapter: {
        number: created.firstChapterNumber,
        title: created.firstChapterTitle,
        path: created.firstChapterPath,
      },
    };
    return c.json(body, 200);
  },
);
