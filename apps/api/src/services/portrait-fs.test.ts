import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock sharp so tests don't require a real image
// ---------------------------------------------------------------------------

vi.mock("sharp", () => {
  const chain = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, format: "jpeg" }),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-image-data")),
  };
  return { default: vi.fn(() => chain) };
});

import { deletePortrait, listPortraits, savePortrait } from "./portrait-fs.js";

describe("portrait-fs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `portrait-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── savePortrait ──────────────────────────────────────────────────────────

  it("saves default portrait to correct path", async () => {
    const result = await savePortrait(
      tmpDir,
      "蘇晴",
      "default",
      null,
      Buffer.from("test"),
      "image/jpeg",
    );
    expect(result.path).toBe("characters/_assets/蘇晴/default.jpg");
    expect(result.format).toBe("jpeg");
    expect(result.resized).toBe(false);
  });

  it("saves chapter portrait with padded chapter number", async () => {
    const result = await savePortrait(
      tmpDir,
      "蘇晴",
      "chapter",
      1,
      Buffer.from("test"),
      "image/jpeg",
    );
    expect(result.path).toBe("characters/_assets/蘇晴/chapter_0001.jpg");
  });

  it("saves chapter 10 with correct padding", async () => {
    const result = await savePortrait(
      tmpDir,
      "蘇晴",
      "chapter",
      10,
      Buffer.from("test"),
      "image/jpeg",
    );
    expect(result.path).toBe("characters/_assets/蘇晴/chapter_0010.jpg");
  });

  it("uses .png extension for PNG mime type", async () => {
    const result = await savePortrait(
      tmpDir,
      "蘇晴",
      "default",
      null,
      Buffer.from("test"),
      "image/png",
    );
    expect(result.path).toContain("default.png");
    // format from mocked sharp always returns "jpeg" for sharp.metadata(); path ext is the source of truth
  });

  // ── deletePortrait ────────────────────────────────────────────────────────

  it("deletes existing portrait and returns true", async () => {
    await savePortrait(tmpDir, "蘇晴", "default", null, Buffer.from("test"), "image/jpeg");
    const deleted = await deletePortrait(tmpDir, "蘇晴", "default", null);
    expect(deleted).toBe(true);
  });

  it("returns false when portrait does not exist", async () => {
    const result = await deletePortrait(tmpDir, "蘇晴", "default", null);
    expect(result).toBe(false);
  });

  it("deletes chapter portrait only (not default)", async () => {
    await savePortrait(tmpDir, "蘇晴", "default", null, Buffer.from("test"), "image/jpeg");
    await savePortrait(tmpDir, "蘇晴", "chapter", 1, Buffer.from("test"), "image/jpeg");
    await deletePortrait(tmpDir, "蘇晴", "chapter", 1);
    // default should still be listable
    const list = await listPortraits(tmpDir, "蘇晴");
    expect(list.default).not.toBeNull();
    expect(list.byChapter).toHaveLength(0);
  });

  // ── listPortraits ─────────────────────────────────────────────────────────

  it("returns null default and empty byChapter when no portraits", async () => {
    const result = await listPortraits(tmpDir, "蘇晴");
    expect(result.default).toBeNull();
    expect(result.byChapter).toHaveLength(0);
  });

  it("lists default and chapter portraits correctly", async () => {
    await savePortrait(tmpDir, "蘇晴", "default", null, Buffer.from("test"), "image/jpeg");
    await savePortrait(tmpDir, "蘇晴", "chapter", 3, Buffer.from("test"), "image/jpeg");
    const result = await listPortraits(tmpDir, "蘇晴");
    expect(result.default).not.toBeNull();
    expect(result.byChapter).toHaveLength(1);
    expect(result.byChapter[0]?.chapterNumber).toBe(3);
  });
});
