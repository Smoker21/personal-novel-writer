import { describe, expect, it } from "vitest";
import { countChars } from "./chapter.js";

describe("countChars", () => {
  it("counts ASCII letters", () => {
    expect(countChars("hello")).toBe(5);
  });
  it("counts CJK characters as one each", () => {
    expect(countChars("梅雨初晴")).toBe(4);
  });
  it("ignores whitespace and newlines", () => {
    expect(countChars("a b\nc\td")).toBe(4);
  });
  it("counts emoji as one (uses code points)", () => {
    expect(countChars("😀abc")).toBe(4);
  });
  it("returns 0 for empty string", () => {
    expect(countChars("")).toBe(0);
  });
});
