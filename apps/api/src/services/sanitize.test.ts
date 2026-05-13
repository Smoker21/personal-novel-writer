import { describe, expect, it } from "vitest";
import { sanitizeSlug, sanitizeTitle, isWindowsReservedName } from "./sanitize.js";

describe("sanitizeSlug", () => {
  it("keeps CJK characters", () => {
    expect(sanitizeSlug("林川")).toBe("林川");
  });
  it("keeps ASCII letters and digits", () => {
    expect(sanitizeSlug("Anna2")).toBe("Anna2");
  });
  it("removes filesystem-unsafe chars", () => {
    expect(sanitizeSlug('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });
  it("collapses internal whitespace to underscore", () => {
    expect(sanitizeSlug("Anna   Smith")).toBe("Anna_Smith");
  });
  it("trims leading/trailing whitespace", () => {
    expect(sanitizeSlug("  Anna  ")).toBe("Anna");
  });
  it("NFC normalizes composed forms", () => {
    // U+00E9 (composed) and U+0065+U+0301 (decomposed) both → "é"
    expect(sanitizeSlug("Café")).toBe("Café");
    expect(sanitizeSlug("Café")).toBe("Café");
  });
  it("throws when result is empty", () => {
    expect(() => sanitizeSlug("///")).toThrow(/empty/i);
    expect(() => sanitizeSlug("   ")).toThrow(/empty/i);
  });
});

describe("sanitizeTitle", () => {
  it("same rules as sanitizeSlug", () => {
    expect(sanitizeTitle("春日記事")).toBe("春日記事");
    expect(sanitizeTitle("My/Novel")).toBe("MyNovel");
  });
  it("appends -novel suffix when result is Windows reserved name", () => {
    expect(sanitizeTitle("CON")).toBe("CON-novel");
    expect(sanitizeTitle("aux")).toBe("aux-novel");
    expect(sanitizeTitle("nul")).toBe("nul-novel");
  });
});

describe("isWindowsReservedName", () => {
  it("detects reserved DOS names case-insensitively", () => {
    expect(isWindowsReservedName("CON")).toBe(true);
    expect(isWindowsReservedName("con")).toBe(true);
    expect(isWindowsReservedName("PRN")).toBe(true);
    expect(isWindowsReservedName("COM1")).toBe(true);
    expect(isWindowsReservedName("LPT9")).toBe(true);
  });
  it("returns false for normal names", () => {
    expect(isWindowsReservedName("hello")).toBe(false);
    expect(isWindowsReservedName("春日")).toBe(false);
  });
});
