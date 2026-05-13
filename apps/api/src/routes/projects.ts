import { spawn } from "node:child_process";
import { zValidator } from "@hono/zod-validator";
import type { ApiErrorBody, OpenProjectResponse } from "@novel-writer/shared-types";
import { Hono } from "hono";
import { z } from "zod";
import { commitIfChanged } from "../services/commit-policy.js";
import { parseStatus } from "../services/git-status-parser.js";
import { git } from "../services/git.js";
import { summarizeProject } from "../services/project-summary.js";
import { validateProject } from "../services/project-validator.js";
import {
  addRecentProject,
  clearRecentProjects,
  computeProjectHash,
  relocateRecentProject,
  removeRecentProject,
  updateRecentProjectMeta,
} from "../services/recent-projects-store.js";

const openSchema = z.object({
  path: z.string().min(1),
  source: z.enum(["recent-list", "browse"]),
  forceOpen: z.boolean().optional(),
});

const removeSchema = z.object({ hash: z.string().min(1) });
const clearSchema = z.object({ confirmed: z.literal(true) });
const relocateSchema = z.object({ oldHash: z.string(), newPath: z.string() });
const initGitSchema = z.object({ path: z.string() });

function runGitStatus(projectPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["status", "--porcelain=v2", "--branch"], { cwd: projectPath });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c: Buffer) => {
      stdout += String(c);
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += String(c);
    });
    proc.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr))));
    proc.on("error", reject);
  });
}

export const projects = new Hono()
  .post("/open", zValidator("json", openSchema), async (c) => {
    const { path, source, forceOpen } = c.req.valid("json");
    const validation = await validateProject(path, forceOpen ?? false);
    if (!validation.ok) {
      return c.json<ApiErrorBody>(
        { code: validation.error.code, message: validation.message },
        validation.error.status as 400 | 404 | 422,
      );
    }

    // git dirty check (only if .git exists)
    const warnings = [...validation.data.warnings];
    if (!warnings.find((w) => w.code === "no_git_repo")) {
      try {
        const stdout = await runGitStatus(path);
        const status = parseStatus(stdout);
        if (!status.clean) {
          warnings.push({
            code: "git_dirty",
            message: `${status.changes.length} 個未提交變更`,
            suggestedAction: "請檢視 git status 後再繼續編輯",
          });
        }
      } catch {
        // ignore — already covered by no_git_repo
      }
    }

    const hash = computeProjectHash(path);
    const stats = await summarizeProject(path);

    // Update recent
    try {
      await addRecentProject(hash, path, validation.data.meta.title);
      await updateRecentProjectMeta(hash, { chapterCount: stats.chapterCount });
    } catch (err) {
      console.warn(`recent update failed: ${String(err)}`);
    }

    void source; // unused for now (used in analytics/logging later)
    const body: OpenProjectResponse = {
      project: {
        hash,
        path,
        title: validation.data.meta.title,
        schemaVersion: validation.data.meta.schemaVersion,
        createdAt: validation.data.meta.createdAt,
        chapterCount: stats.chapterCount,
        lastChapter: stats.lastChapter,
      },
      warnings,
    };
    return c.json(body, 200);
  })
  .post("/recent/remove", zValidator("json", removeSchema), async (c) => {
    const { hash } = c.req.valid("json");
    const removed = await removeRecentProject(hash);
    return c.json({ removed });
  })
  .post("/recent/clear", zValidator("json", clearSchema), async (c) => {
    const removedCount = await clearRecentProjects();
    return c.json({ cleared: true, removedCount });
  })
  .post("/recent/relocate", zValidator("json", relocateSchema), async (c) => {
    const { oldHash, newPath } = c.req.valid("json");
    const validation = await validateProject(newPath, false);
    if (!validation.ok) {
      return c.json<ApiErrorBody>(
        { code: validation.error.code, message: validation.message },
        validation.error.status as 400 | 404 | 422,
      );
    }
    await relocateRecentProject(oldHash, newPath, validation.data.meta.title);
    // delegate to opening logic
    const hash = computeProjectHash(newPath);
    const stats = await summarizeProject(newPath);
    const body: OpenProjectResponse = {
      project: {
        hash,
        path: newPath,
        title: validation.data.meta.title,
        schemaVersion: validation.data.meta.schemaVersion,
        createdAt: validation.data.meta.createdAt,
        chapterCount: stats.chapterCount,
        lastChapter: stats.lastChapter,
      },
      warnings: validation.data.warnings,
    };
    return c.json(body, 200);
  })
  .post("/init-git", zValidator("json", initGitSchema), async (c) => {
    const { path } = c.req.valid("json");
    const initResult = await git.init(path);
    if (!initResult.ok) {
      return c.json<ApiErrorBody>(
        { code: "IO_ERROR", message: initResult.error.stderr ?? "git init failed" },
        500,
      );
    }
    const commitResult = await commitIfChanged(path, "create-project", "initial commit");
    return c.json({ initialCommitSha: commitResult?.sha ?? null });
  });
