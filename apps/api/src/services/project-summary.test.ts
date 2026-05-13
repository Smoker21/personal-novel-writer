import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { summarizeProject } from "./project-summary.js";

describe("summarizeProject", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "summary-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns 0 chapters for empty chapters dir", async () => {
    mkdirSync(join(tmpRoot, "chapters"), { recursive: true });
    const result = await summarizeProject(tmpRoot);
    expect(result.chapterCount).toBe(0);
    expect(result.lastChapter).toBeNull();
  });

  it("counts chapters matching chapter_NNNN_*.md pattern", async () => {
    const dir = join(tmpRoot, "chapters");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "chapter_0001_首章.md"), "");
    writeFileSync(join(dir, "chapter_0002_次章.md"), "");
    writeFileSync(join(dir, "chapter_0003_末章.md"), "");
    writeFileSync(join(dir, "notes.md"), ""); // not a chapter
    const result = await summarizeProject(tmpRoot);
    expect(result.chapterCount).toBe(3);
  });

  it("returns null lastChapter when no chapters", async () => {
    mkdirSync(join(tmpRoot, "chapters"), { recursive: true });
    const result = await summarizeProject(tmpRoot);
    expect(result.lastChapter).toBeNull();
  });

  it("ignores non-matching files in chapters/", async () => {
    const dir = join(tmpRoot, "chapters");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "chapter_0001_a.md"), "");
    writeFileSync(join(dir, "draft.txt"), "");
    writeFileSync(join(dir, "chapter_xyz.md"), ""); // bad format
    const result = await summarizeProject(tmpRoot);
    expect(result.chapterCount).toBe(1);
  });

  it("returns 0 when chapters dir does not exist", async () => {
    const result = await summarizeProject(tmpRoot);
    expect(result.chapterCount).toBe(0);
    expect(result.lastChapter).toBeNull();
  });
});
