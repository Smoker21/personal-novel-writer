import { describe, expect, it } from "vitest";
import { canonicalizeProjectPath, hashProjectPath, normalizeForHash } from "./path-utils.js";

describe("path-utils (M5 TD-2/3)", () => {
  describe("hashProjectPath", () => {
    it("returns 16-char hex string", () => {
      const h = hashProjectPath("F:/workspace/test/novel");
      expect(h).toMatch(/^[a-f0-9]{16}$/);
    });

    it("forward slash and back slash produce same hash on Windows", () => {
      if (process.platform !== "win32") return;
      const h1 = hashProjectPath("F:/workspace/test/novel");
      const h2 = hashProjectPath("F:\\workspace\\test\\novel");
      expect(h1).toBe(h2);
    });

    it("upper/lower case drive letter produces same hash on Windows", () => {
      if (process.platform !== "win32") return;
      const h1 = hashProjectPath("C:\\Users\\me\\novel");
      const h2 = hashProjectPath("c:\\Users\\me\\novel");
      expect(h1).toBe(h2);
    });

    it("different paths produce different hashes", () => {
      const h1 = hashProjectPath("/a/b/c");
      const h2 = hashProjectPath("/a/b/d");
      expect(h1).not.toBe(h2);
    });
  });

  describe("normalizeForHash", () => {
    it("resolves .. and . path components", () => {
      const n = normalizeForHash("/a/b/../c");
      expect(n.endsWith("a/c") || n.endsWith("a\\c")).toBe(true);
    });

    it("lowercases drive letter on Windows", () => {
      if (process.platform !== "win32") return;
      const n = normalizeForHash("F:\\workspace");
      expect(n[0]).toBe("f");
    });
  });

  describe("canonicalizeProjectPath", () => {
    it("returns absolute path", () => {
      const c = canonicalizeProjectPath("F:/workspace/novel");
      expect(c.startsWith("F:") || c.startsWith("f:") || c.startsWith("/")).toBe(true);
    });

    it("normalizes slashes", () => {
      if (process.platform === "win32") {
        const c = canonicalizeProjectPath("F:/workspace/novel");
        expect(c.includes("\\")).toBe(true);
      }
    });
  });
});
