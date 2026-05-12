import { describe, expect, it } from "vitest";
import { scoreTraditionalChinese } from "../../src/scoring/rules/traditional-chinese.js";

describe("scoreTraditionalChinese", () => {
  it("5/5 for pure traditional", () => {
    const text = "蘇晴第一次走進言字書店時，雨剛好停了，她回頭看了一眼街道。" +
      "他們之間的對話像是慢慢拉近的潮汐，靜靜的，但有東西在改變。";
    expect(scoreTraditionalChinese(text).score).toBe(5);
  });
  it("4/5 for 1 simplified char in long traditional text", () => {
    // Inject exactly one simplified-only char (这) into a long traditional paragraph;
    // ratio should fall under partialRatio (0.5%) hence 4/5.
    const traditional = "蘇晴第一次走進言字書店是六月的午後。雨在她踏上騎樓那刻潑下來，她回頭看了一眼街道，索性把傘收進門邊的傘架。書店比她從外頭看的要深，書架排列像迷宮。她沿著文學日本的書脊慢慢走到店尾，看見一張木桌與桌後的男人。她認出那個地址——是她母親二十年前住過的巷子。她坐下翻著筆記本。雨在窗外密密落著，店裡的木桌與書架都安靜下來。她已經知道自己會再來，這是無需言明的事實，像潮水退去後留在沙灘上的微小痕跡。林書言沒有再說話，只在她翻到某頁停得太久時，輕輕咳了一下。";
    const text = traditional + "她想了一下这件事。"; // exactly one simplified char 这
    expect(scoreTraditionalChinese(text).score).toBe(4);
  });
  it("1/5 for heavy simplified", () => {
    const text =
      "这是一个简体字的句子，里面有很多简体字，她说她不会回来。这种感觉很糟，他没办法理解。";
    expect(scoreTraditionalChinese(text).score).toBe(1);
  });
  it("null when no Chinese chars", () => {
    expect(scoreTraditionalChinese("hello world").score).toBeNull();
  });
});
