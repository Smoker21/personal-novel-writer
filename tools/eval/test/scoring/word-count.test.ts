import { describe, expect, it } from "vitest";
import { scoreWordCountRange, scoreWordCountRelative } from "../../src/scoring/rules/word-count.js";
import { countChineseChars } from "../../src/utils/text.js";

const stub = (n: number) => "啊".repeat(n);

describe("countChineseChars", () => {
  it("counts CJK only", () => {
    expect(countChineseChars("蘇晴 wrote a 章節 about 林書言")).toBe(7);
  });
});

describe("scoreWordCountRange", () => {
  it("5/5 inside range", () => {
    expect(scoreWordCountRange(stub(1000), { min: 800, max: 1200 }).score).toBe(5);
  });
  it("3/5 in tolerance", () => {
    expect(scoreWordCountRange(stub(1300), { min: 800, max: 1200 }).score).toBe(3);
  });
  it("1/5 way out", () => {
    expect(scoreWordCountRange(stub(2000), { min: 800, max: 1200 }).score).toBe(1);
  });
});

describe("scoreWordCountRange hardLimitOnly (TC-05)", () => {
  it("5/5 when ≤ max with > 30% margin", () => {
    expect(scoreWordCountRange(stub(80), { min: 0, max: 150, hardLimitOnly: true }).score).toBe(5);
  });
  it("4/5 when in limit but tight", () => {
    expect(scoreWordCountRange(stub(140), { min: 0, max: 150, hardLimitOnly: true }).score).toBe(4);
  });
  it("3/5 when slightly over (within 1.5×)", () => {
    expect(scoreWordCountRange(stub(180), { min: 0, max: 150, hardLimitOnly: true }).score).toBe(3);
  });
  it("1/5 when severely over", () => {
    expect(scoreWordCountRange(stub(400), { min: 0, max: 150, hardLimitOnly: true }).score).toBe(1);
  });
});

describe("scoreWordCountRelative", () => {
  it("5/5 when within tol/2", () => {
    expect(scoreWordCountRelative(stub(20), 20, 30).score).toBe(5);
  });
  it("3/5 when within tol", () => {
    expect(scoreWordCountRelative(stub(25), 20, 30).score).toBe(3);
  });
  it("1/5 when over tol", () => {
    expect(scoreWordCountRelative(stub(40), 20, 30).score).toBe(1);
  });
});
