import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters } from "./chapters.js";

vi.mock("../services/project-resolver.js", () => ({
  resolveProjectPath: vi.fn(),
}));

import { resolveProjectPath } from "../services/project-resolver.js";

describe("chapters routes", () => {
  let tmpHome: string;
  let projectPath: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  async function setupProject(): Promise<void> {
    const { createProjectFiles } = await import("../services/project-fs.js");
    await createProjectFiles(
      {
        parentFolder: tmpHome,
        title: "test",
        synopsis: "s",
        characters: [{ name: "a", description: "b" }],
      },
      projectPath,
    );
  }

  beforeEach(async () => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "chapters-home-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    projectPath = join(tmpHome, "test");
    await setupProject();
    vi.mocked(resolveProjectPath).mockResolvedValue(projectPath);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
    vi.restoreAllMocks();
  });

  it("GET / lists chapters (initial state has chapter 1)", async () => {
    const res = await chapters.request("/", {
      method: "GET",
      headers: { "x-project-hash": "h" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chapters: Array<{ number: number }> };
    expect(body.chapters.length).toBeGreaterThan(0);
  });

  it("POST / creates new chapter with next number", async () => {
    const res = await chapters.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "新章" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { number: number; title: string };
    expect(body.title).toBe("新章");
    expect(body.number).toBeGreaterThan(0);
  });

  it("GET /:n returns chapter content", async () => {
    const res = await chapters.request("/1", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { number: number; content: string };
    expect(body.number).toBe(1);
  });

  it("GET /:n returns 404 for missing chapter", async () => {
    const res = await chapters.request("/999", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("PUT /:n saves content + title", async () => {
    const res = await chapters.request("/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "new content", title: "新標題" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; mtime: string };
    expect(body.path).toContain("chapter_0001_新標題.md");
  });

  it("PUT /:n returns 400 INVALID_TITLE for empty title", async () => {
    const res = await chapters.request("/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x", title: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /:n returns 409 MTIME_MISMATCH", async () => {
    const res = await chapters.request("/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "x",
        title: "x",
        expectedMtime: "1970-01-01T00:00:00.000Z",
      }),
    });
    expect(res.status).toBe(409);
  });
});
