import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createChapter,
  deleteChapter,
  listChapters,
  readChapter,
  renameChapter,
  saveChapter,
} from "./chapter-fs.js";

describe("chapter-fs", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "chapter-fs-"));
    mkdirSync(join(projectPath, "chapters"), { recursive: true });
  });
  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it("readChapter returns null when not found", async () => {
    const result = await readChapter(projectPath, 1);
    expect(result).toBeNull();
  });

  it("createChapter writes empty file with auto number", async () => {
    const ch = await createChapter(projectPath, "首章");
    expect(ch.number).toBe(1);
    expect(ch.title).toBe("首章");
    expect(existsSync(join(projectPath, "chapters", "chapter_0001_首章.md"))).toBe(true);

    const ch2 = await createChapter(projectPath);
    expect(ch2.number).toBe(2);
    expect(ch2.title).toBe("未命名");
  });

  it("readChapter returns content + title from filename", async () => {
    await createChapter(projectPath, "首章");
    writeFileSync(join(projectPath, "chapters", "chapter_0001_首章.md"), "hello content", "utf-8");
    const result = await readChapter(projectPath, 1);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("首章");
    expect(result?.content).toBe("hello content");
    expect(result?.size).toBeGreaterThan(0);
  });

  it("listChapters returns all chapters sorted by number", async () => {
    await createChapter(projectPath, "A");
    await createChapter(projectPath, "B");
    await createChapter(projectPath, "C");
    const list = await listChapters(projectPath);
    expect(list).toHaveLength(3);
    expect(list[0]?.number).toBe(1);
    expect(list[2]?.number).toBe(3);
  });

  it("saveChapter writes content without rename", async () => {
    const ch = await createChapter(projectPath, "原標題");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "新內容",
      title: "原標題",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = readFileSync(result.path, "utf-8");
      expect(content).toBe("新內容");
      expect(result.renamed).toBe(false);
    }
  });

  it("saveChapter with new title renames file", async () => {
    const ch = await createChapter(projectPath, "舊標題");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "x",
      title: "新標題",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renamed).toBe(true);
      expect(existsSync(join(projectPath, "chapters", "chapter_0001_新標題.md"))).toBe(true);
      expect(existsSync(join(projectPath, "chapters", "chapter_0001_舊標題.md"))).toBe(false);
    }
  });

  it("saveChapter returns MTIME_MISMATCH when expectedMtime differs", async () => {
    const ch = await createChapter(projectPath, "x");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "x",
      title: "x",
      expectedMtime: "1970-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MTIME_MISMATCH");
  });

  it("saveChapter returns INVALID_TITLE for empty title", async () => {
    const ch = await createChapter(projectPath, "x");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "x",
      title: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_TITLE");
  });

  it("renameChapter handles file rename", async () => {
    await createChapter(projectPath, "前");
    const result = await renameChapter(projectPath, 1, "後");
    expect(result.newPath).toContain("chapter_0001_後.md");
    expect(existsSync(result.oldPath)).toBe(false);
    expect(existsSync(result.newPath)).toBe(true);
  });

  it("deleteChapter removes the .md file", async () => {
    const ch = await createChapter(projectPath, "x");
    const result = await deleteChapter(projectPath, ch.number);
    expect(result.deletedPath).toContain("chapter_0001_x.md");
    expect(existsSync(result.deletedPath)).toBe(false);
  });
});
