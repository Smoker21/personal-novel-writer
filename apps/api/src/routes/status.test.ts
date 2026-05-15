import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusRouter } from "./status.js";

vi.mock("../services/project-resolver.js", () => ({
  resolveProjectPath: vi.fn(),
}));

import { resolveProjectPath } from "../services/project-resolver.js";

describe("status routes — write (TD-1)", () => {
  let tmpHome: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), "status-write-"));
    projectPath = join(tmpHome, "test");
    const { createProjectFiles } = await import("../services/project-fs.js");
    await createProjectFiles(
      {
        parentFolder: tmpHome,
        title: "test",
        synopsis: "s",
        characters: [{ name: "Alice", description: "an alice" }],
      },
      projectPath,
    );
    // Initialize git for commit testing
    execSync("git init -q", { cwd: projectPath });
    execSync('git config user.email "test@test.com"', { cwd: projectPath });
    execSync('git config user.name "test"', { cwd: projectPath });
    execSync("git add . && git commit -q -m seed", { cwd: projectPath });
    vi.mocked(resolveProjectPath).mockResolvedValue(projectPath);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("POST /write writes story_status.md", async () => {
    const res = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileType: "story",
        content: "## 重要劇情點\n手寫內容\n",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      path: string;
      mtime: string;
      size: number;
      commitSha: string | null;
    };
    expect(body.path).toContain("story_status.md");
    expect(body.size).toBeGreaterThan(0);
    expect(body.commitSha).toBeTruthy();
  });

  it("POST /write writes character status when slug exists", async () => {
    const res = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileType: "character",
        characterSlug: "Alice",
        content: "# Alice — 狀態\n\n## 重要狀態變化\n第1章手寫\n",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /write returns 404 when character slug not found", async () => {
    const res = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileType: "character",
        characterSlug: "Nonexistent",
        content: "test",
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CHARACTER_NOT_FOUND");
  });

  it("POST /write returns 400 when content empty", async () => {
    const res = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileType: "story",
        content: "",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /write returns 400 when character without slug", async () => {
    const res = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileType: "character",
        content: "x",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /write returns 409 when mtime mismatches", async () => {
    // First write to create file
    const writeRes = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileType: "story", content: "v1" }),
    });
    const { path } = (await writeRes.json()) as { path: string };

    // Externally modify the file
    writeFileSync(path, "externally modified", "utf-8");

    // Try write with stale expectedMtime
    const res = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileType: "story",
        content: "v2",
        expectedMtime: "1990-01-01T00:00:00.000Z",
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MTIME_MISMATCH");
  });

  it("POST /write returns commitSha=null when content unchanged", async () => {
    // First write
    const r1 = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileType: "story", content: "same" }),
    });
    expect(r1.status).toBe(200);

    // Second write with identical content
    const r2 = await statusRouter.request("/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileType: "story", content: "same" }),
    });
    expect(r2.status).toBe(200);
    const body = (await r2.json()) as { commitSha: string | null };
    expect(body.commitSha).toBeNull();
  });
});
