import { describe, expect, it } from "vitest";
import {
  scoreNotCopiedFromInput,
  scoreStatusBudget,
  scoreStatusFormat,
} from "../../src/scoring/rules/format-compliance.js";

const STATUS_GOOD = `## story_status.md
蘇晴避雨走進言字書店，遇見店主林書言。她在桌上一本舊筆記本中發現母親二十年前的地址。她借閱筆記本，林書言要求只能在店內看。

## character_status.md
- 蘇晴：對筆記本表現克制。內心動搖。
- 林書言：留意到她的反應，但分寸克制。
`;

describe("scoreStatusFormat", () => {
  it("5/5 when both ## headings present", () => {
    expect(scoreStatusFormat(STATUS_GOOD).score).toBe(5);
  });
  it("3/5 when only one heading", () => {
    expect(scoreStatusFormat("## story_status.md\n蘇晴避雨。").score).toBe(3);
  });
  it("1/5 when no headings", () => {
    expect(scoreStatusFormat("純文字描述").score).toBe(1);
  });
});

describe("scoreStatusBudget", () => {
  it("5/5 when both within ample budget", () => {
    const s = scoreStatusBudget(STATUS_GOOD, { storyMax: 1500, charMax: 2000 });
    expect(s.score).toBe(5);
  });
  it("1/5 when story over limit", () => {
    const big = `## story_status.md\n${"蘇".repeat(2000)}\n## character_status.md\n少量字。`;
    expect(scoreStatusBudget(big, { storyMax: 1500, charMax: 2000 }).score).toBe(1);
  });
});

describe("scoreNotCopiedFromInput", () => {
  it("5/5 when LCS very small", () => {
    const out = "新版的精煉敘述完全用提煉式語言重寫過。";
    const original = "毫無相關的章節原文，沒有重疊的長子字串。";
    expect(scoreNotCopiedFromInput(out, original, 30).score).toBe(5);
  });
  it("1/5 when output contains a long substring of original", () => {
    const original =
      "蘇晴第一次走進言字書店是六月的午後。雨在她踏上騎樓那刻潑下來，她回頭看了一眼街道，索性把傘收進門邊的傘架。書店比她從外頭看的要深。";
    const copied =
      "段落開始：蘇晴第一次走進言字書店是六月的午後。雨在她踏上騎樓那刻潑下來，她回頭看了一眼街道，索性把傘收進門邊的傘架。然後她坐下。";
    expect(scoreNotCopiedFromInput(copied, original, 30).score).toBe(1);
  });
});
