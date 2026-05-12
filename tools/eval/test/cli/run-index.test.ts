import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Re-implement the tiny helpers here to keep them under unit test without
// exporting from cli.ts (which has a top-level commander side effect).
function withRunIndex(originalPath: string, idx: number): string {
  if (idx === 0) return originalPath;
  const lastDot = originalPath.lastIndexOf(".");
  const ext = originalPath.slice(lastDot);
  const stem = originalPath.slice(0, lastDot);
  return `${stem}.${String(idx).padStart(3, "0")}${ext}`;
}

function allocateRunIndex(paths: string[]): number {
  if (paths.every((p) => !existsSync(p))) return 0;
  for (let i = 1; i < 1000; i++) {
    if (paths.every((p) => !existsSync(withRunIndex(p, i)))) return i;
  }
  throw new Error("exhausted");
}

describe("withRunIndex", () => {
  it("returns original at idx 0", () => {
    expect(withRunIndex("/a/b/foo.md", 0)).toBe("/a/b/foo.md");
  });
  it("inserts 3-digit suffix before extension", () => {
    expect(withRunIndex("/a/b/foo.md", 7)).toBe("/a/b/foo.007.md");
  });
  it("works for multi-dot filenames (handles last ext only)", () => {
    expect(withRunIndex("/a/b/foo.report.json", 12)).toBe(
      "/a/b/foo.report.012.json",
    );
  });
});

describe("allocateRunIndex", () => {
  it("returns 0 when none of the paths exist", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "eval-rotate-"));
    const a = resolve(dir, "result.md");
    const b = resolve(dir, "result-output.md");
    expect(allocateRunIndex([a, b])).toBe(0);
  });

  it("returns 1 when original exists but .001 is free", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "eval-rotate-"));
    const a = resolve(dir, "result.md");
    await writeFile(a, "x", "utf-8");
    expect(allocateRunIndex([a])).toBe(1);
  });

  it("returns the lowest index where ALL provided paths are free", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "eval-rotate-"));
    const result = resolve(dir, "result.md");
    const output = resolve(dir, "result-output.md");
    await writeFile(result, "x", "utf-8");
    await writeFile(output, "x", "utf-8");
    await writeFile(withRunIndex(result, 1), "x", "utf-8");
    // Note: output.001 is NOT written → so the next free index is 2 (because
    // result.001 is taken even though output.001 isn't).
    expect(allocateRunIndex([result, output])).toBe(2);
  });
});
