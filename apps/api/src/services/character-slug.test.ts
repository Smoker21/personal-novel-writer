import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeSlug, resolveUniqueSlug } from "./character-slug.js";

describe("computeSlug", () => {
  it("preserves Chinese characters", () => {
    expect(computeSlug("蘇晴")).toBe("蘇晴");
    expect(computeSlug("林書言")).toBe("林書言");
  });

  it("removes filesystem-unsafe chars", () => {
    expect(computeSlug("lin/shu")).toBe("linshu");
    expect(computeSlug("a*b?c")).toBe("abc");
    expect(computeSlug('test"name')).toBe("testname");
    expect(computeSlug("a<b>c")).toBe("abc");
  });

  it("collapses whitespace to underscore", () => {
    expect(computeSlug("林 書 言")).toBe("林_書_言");
    expect(computeSlug("  空格  ")).toBe("空格");
  });

  it("appends -character for Windows reserved names", () => {
    expect(computeSlug("CON")).toBe("CON-character");
    expect(computeSlug("NUL")).toBe("NUL-character");
    expect(computeSlug("PRN")).toBe("PRN-character");
    expect(computeSlug("con")).toBe("con-character");
  });

  it("throws on empty result after sanitization", () => {
    expect(() => computeSlug("///")).toThrow();
    expect(() => computeSlug("***")).toThrow();
  });
});

describe("resolveUniqueSlug", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `slug-test-${Date.now()}`);
    await mkdir(join(tmpDir, "characters"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns base slug when no conflict", async () => {
    const slug = await resolveUniqueSlug("蘇晴", tmpDir);
    expect(slug).toBe("蘇晴");
  });

  it("appends -2 on first conflict", async () => {
    await writeFile(join(tmpDir, "characters", "蘇晴.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("蘇晴", tmpDir);
    expect(slug).toBe("蘇晴-2");
  });

  it("appends -3 when -2 also conflicts", async () => {
    await writeFile(join(tmpDir, "characters", "蘇晴.md"), "", "utf-8");
    await writeFile(join(tmpDir, "characters", "蘇晴-2.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("蘇晴", tmpDir);
    expect(slug).toBe("蘇晴-3");
  });

  it("excludeSlug allows rename to same slug", async () => {
    await writeFile(join(tmpDir, "characters", "蘇晴.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("蘇晴", tmpDir, "蘇晴");
    expect(slug).toBe("蘇晴");
  });

  it("ignores _status.md files when computing conflicts", async () => {
    await writeFile(join(tmpDir, "characters", "蘇晴_status.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("蘇晴", tmpDir);
    expect(slug).toBe("蘇晴");
  });

  it("ignores _index.md when computing conflicts", async () => {
    await writeFile(join(tmpDir, "characters", "_index.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("_index", tmpDir);
    expect(slug).toBe("_index");
  });
});
