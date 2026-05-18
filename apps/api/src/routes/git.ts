import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import type { GitBinaryInfo, GitStatus } from "@novel-writer/shared-types";
import { Hono } from "hono";
import { z } from "zod";
import { atomicWriteFile } from "../services/atomic-fs.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { git as gitService } from "../services/git.js";
import { parseGitLog } from "../services/git-log-parser.js";
import { parseStatus } from "../services/git-status-parser.js";
import { resolveProjectPath } from "../services/project-resolver.js";

function checkGitBinary(): GitBinaryInfo {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const path = execSync(`${which} git`).toString().trim().split(/\r?\n/)[0] ?? "";
    const versionOut = execSync("git --version").toString();
    const m = versionOut.match(/\d+\.\d+\.\d+/);
    const version = m?.[0];
    return version !== undefined ? { installed: true, path, version } : { installed: true, path };
  } catch {
    return { installed: false };
  }
}

function runGitStatus(projectPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["status", "--porcelain=v2", "--branch"], {
      cwd: projectPath,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git status failed: ${stderr}`));
    });
    proc.on("error", reject);
  });
}

export const git = new Hono()
  .get("/check-binary", (c) => {
    return c.json(checkGitBinary());
  })
  .get("/projects/:hash/status", async (c) => {
    const hash = c.req.param("hash");
    const projectPath = await resolveProjectPath(hash);
    if (!projectPath) {
      return c.json({ error: "project not found" }, 404);
    }
    try {
      const stdout = await runGitStatus(projectPath);
      const status: GitStatus = parseStatus(stdout);
      return c.json(status);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

// ── Project-scoped git routes（掛在 /api/projects/:hash/git/）───────────────

export const gitProjectRouter = new Hono()
  .get("/log", async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const file = c.req.query("file");
    const limit = Number(c.req.query("limit") ?? "50");
    const before = c.req.query("before");
    const result = await parseGitLog(projectPath, {
      ...(file !== undefined ? { file } : {}),
      limit,
      ...(before !== undefined ? { before } : {}),
    });
    return c.json(result);
  })
  .get("/show", async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const sha = c.req.query("sha");
    const file = c.req.query("file");
    if (!sha || !file) return c.json({ code: "MISSING_PARAMS" }, 400);
    const result = await gitService.show(projectPath, sha, file);
    if (!result.ok) return c.json({ code: "NOT_FOUND" }, 404);
    return c.json({ content: result.value, size: result.value.length });
  })
  .get("/diff", async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const sha = c.req.query("sha");
    const file = c.req.query("file");
    const against = c.req.query("against") ?? "head";
    if (!sha || !file) return c.json({ code: "MISSING_PARAMS" }, 400);
    const diffArgs = against === "current" ? [sha, "--", file] : ["HEAD", sha, "--", file];
    const result = await gitService.diff(projectPath, diffArgs);
    const diffText = result.ok ? result.value : "";
    const additions = (diffText.match(/^\+[^+]/gm) ?? []).length;
    const deletions = (diffText.match(/^-[^-]/gm) ?? []).length;
    return c.json({ unifiedDiff: diffText, additions, deletions });
  })
  .post(
    "/revert",
    zValidator("json", z.object({ sha: z.string(), file: z.string() })),
    async (c) => {
      const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
      if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
      const { sha, file } = c.req.valid("json");
      const showResult = await gitService.show(projectPath, sha, file);
      if (!showResult.ok) return c.json({ code: "FILE_NOT_IN_COMMIT" }, 404);
      await atomicWriteFile(join(projectPath, file), showResult.value);
      const commitResult = await commitIfChanged(
        projectPath,
        "meta" as never,
        `revert ${file} to ${sha.slice(0, 7)}`,
      );
      return c.json({ revertCommitSha: commitResult?.sha ?? null });
    },
  )
  .post(
    "/commit-manual",
    zValidator(
      "json",
      z.object({ message: z.string().min(1), files: z.array(z.string()).optional() }),
    ),
    async (c) => {
      const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
      if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
      const { message, files } = c.req.valid("json");
      const addResult = await gitService.add(projectPath, files ?? ["."]);
      if (!addResult.ok) return c.json({ code: "IO_ERROR", message: addResult.error.stderr }, 500);
      const commitResult = await gitService.commit(projectPath, message);
      if (!commitResult.ok)
        return c.json({ code: "IO_ERROR", message: commitResult.error.stderr }, 500);
      return c.json({ commitSha: commitResult.value.sha });
    },
  );
