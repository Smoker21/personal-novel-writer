import { describe, expect, it } from "vitest";
import {
  scoreKeywordPresence,
  scoreNeighborProposal,
} from "../../src/scoring/rules/keyword-presence.js";

describe("scoreKeywordPresence", () => {
  it("5/5 when keyword present", () => {
    expect(
      scoreKeywordPresence("蘇晴帶來了母親的舊照片", { pattern: /照片/, description: "照片" })
        .score,
    ).toBe(5);
  });
  it("1/5 when missing", () => {
    expect(
      scoreKeywordPresence("蘇晴只是看了筆記本", { pattern: /照片/, description: "照片" }).score,
    ).toBe(1);
  });
});

describe("scoreNeighborProposal", () => {
  it("5/5 when neighbor + ask", () => {
    expect(scoreNeighborProposal("林書言提議幫蘇晴問認識的老鄰居").score).toBe(5);
  });
  it("3/5 when neighbor only", () => {
    expect(scoreNeighborProposal("巷子裡的老鄰居都已經搬走").score).toBe(3);
  });
  it("1/5 when missing", () => {
    expect(scoreNeighborProposal("純粹寫兩人對話").score).toBe(1);
  });
});
