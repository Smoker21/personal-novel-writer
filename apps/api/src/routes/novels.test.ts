import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { novels } from "./novels.js";

describe("POST /api/novels", () => {
  let tmpHome: string;
  let tmpParent: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "novels-home-"));
    tmpParent = mkdtempSync(join(tmpdir(), "novels-parent-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(tmpParent, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
  });

  async function post(body: unknown) {
    return novels.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("happy path creates project and returns 200", async () => {
    const res = await post({
      parentFolder: tmpParent,
      title: "春日記事",
      synopsis: "雨後初晴的故事。",
      characters: [{ name: "林川", description: "工程師" }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { path: string } };
    expect(existsSync(join(body.project.path, "project.yaml"))).toBe(true);
    expect(existsSync(join(body.project.path, "characters", "林川.md"))).toBe(true);
  });

  it("returns 400 INVALID_INPUT when title is empty", async () => {
    const res = await post({
      parentFolder: tmpParent,
      title: "  ",
      synopsis: "x",
      characters: [{ name: "a", description: "b" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 INVALID_INPUT when characters empty", async () => {
    const res = await post({
      parentFolder: tmpParent,
      title: "x",
      synopsis: "x",
      characters: [],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 INVALID_PATH when parentFolder is relative", async () => {
    const res = await post({
      parentFolder: "relative/path",
      title: "x",
      synopsis: "x",
      characters: [{ name: "a", description: "b" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PATH");
  });

  it("returns 403 WRITE_FORBIDDEN when parent missing", async () => {
    const res = await post({
      parentFolder: join(tmpParent, "nonexistent"),
      title: "x",
      synopsis: "x",
      characters: [{ name: "a", description: "b" }],
    });
    expect(res.status).toBe(403);
  });

  it("returns 409 PROJECT_CONFLICT when path exists", async () => {
    const body = {
      parentFolder: tmpParent,
      title: "dup",
      synopsis: "x",
      characters: [{ name: "a", description: "b" }],
    };
    const first = await post(body);
    expect(first.status).toBe(200);
    const second = await post(body);
    expect(second.status).toBe(409);
    const errBody = (await second.json()) as { code: string };
    expect(errBody.code).toBe("PROJECT_CONFLICT");
  });
});
