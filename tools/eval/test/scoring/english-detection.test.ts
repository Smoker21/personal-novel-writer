import { describe, expect, it } from "vitest";
import {
  findEnglishWords,
  scoreEnglishAvoidance,
} from "../../src/scoring/rules/english-detection.js";

describe("findEnglishWords", () => {
  it("matches words including single letters", () => {
    expect(findEnglishWords("蘇晴 picked up a book.")).toEqual(["picked", "up", "a", "book"]);
  });
  it("ignores digits", () => {
    expect(findEnglishWords("第 1 章")).toEqual([]);
  });
});

describe("scoreEnglishAvoidance", () => {
  it("5/5 for no English", () => {
    expect(scoreEnglishAvoidance("純粹的中文段落").score).toBe(5);
  });
  it("4/5 for one or two", () => {
    expect(scoreEnglishAvoidance("中文 yes 加 ok").score).toBe(4);
  });
  it("3/5 for mid amount", () => {
    expect(scoreEnglishAvoidance("中文 yes ok hi go bye").score).toBe(3);
  });
  it("1/5 for heavy English", () => {
    expect(
      scoreEnglishAvoidance("Lorem ipsum dolor sit amet consectetur adipiscing elit").score,
    ).toBe(1);
  });
});
