import { execSync, spawn } from "node:child_process";
import type { GitBinaryInfo, GitStatus } from "@novel-writer/shared-types";
import { Hono } from "hono";
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
