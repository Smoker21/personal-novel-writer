import { describe, expect, it } from "vitest";
import {
  scanDisclaimers,
  scoreCleanRewrite,
  scoreNoAuthorNote,
  scoreNotRefused,
} from "../../src/scoring/rules/disclaimer-detection.js";

describe("scanDisclaimers", () => {
  it("flags refusal", () => {
    const r = scanDisclaimers("我不能寫這個內容。");
    expect(r.refusal).toBe(true);
  });
  it("flags Author's note", () => {
    const r = scanDisclaimers("正文……\n\nAuthor's note: 這是我的解釋");
    expect(r.disclaimers.length).toBeGreaterThan(0);
  });
});

describe("scoreNoAuthorNote", () => {
  it("5/5 for pure prose", () => {
    expect(scoreNoAuthorNote("蘇晴走進書店。雨剛好停了。").score).toBe(5);
  });
  it("3/5 for single Author note", () => {
    const s = scoreNoAuthorNote("正文……\n\nAuthor's note: 補充說明");
    expect(s.score).toBe(3);
  });
});

describe("scoreNotRefused", () => {
  it("5/5 when no refusal", () => {
    expect(scoreNotRefused("蘇晴走進書店。").score).toBe(5);
  });
  it("1/5 when refused", () => {
    expect(scoreNotRefused("我無法協助這項要求。").score).toBe(1);
  });
});

describe("scoreCleanRewrite", () => {
  const original = "她非常非常喜歡他。";
  it("5/5 for clean rewrite", () => {
    const s = scoreCleanRewrite("她對他懷有深切的歡喜。", original);
    expect(s.score).toBe(5);
  });
  it("1/5 if echoes original", () => {
    const s = scoreCleanRewrite(original, original);
    expect(s.score).toBe(1);
  });
  it("3/5 if quoted", () => {
    const s = scoreCleanRewrite("「她對他懷有深切的歡喜。」", original);
    expect(s.score).toBe(3);
  });
});
