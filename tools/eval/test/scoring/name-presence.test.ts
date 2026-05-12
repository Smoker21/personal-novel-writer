import { describe, expect, it } from "vitest";
import {
  detectExtraCharacterNames,
  scoreKnownNamesPreserved,
  scoreNoNewCharacters,
} from "../../src/scoring/rules/name-presence.js";

describe("detectExtraCharacterNames", () => {
  it("returns empty when only known names appear", () => {
    expect(
      detectExtraCharacterNames("蘇晴點點頭，林書言遞茶過來。"),
    ).toEqual([]);
  });
  it("flags repeated new surname-led names", () => {
    expect(
      detectExtraCharacterNames(
        "蘇晴與張小華一起走出書店。張小華笑了笑。後來張小華又走回來。",
      ),
    ).toContain("張小華");
  });
  it("ignores generic role words like 老闆 / 客人", () => {
    const found = detectExtraCharacterNames("林書言對老闆說，旁邊客人在看書。");
    expect(found).toEqual([]);
  });

  // Regression — false positives observed in 2026-05-10 RWKV run
  it("does NOT flag 謝謝您 / 任何人 (multi-occurrence non-name phrases)", () => {
    const text = "她說謝謝您。林書言對任何人都很客氣。任何人都會這樣。謝謝您的關心。";
    const found = detectExtraCharacterNames(text);
    expect(found).not.toContain("謝謝您");
    expect(found).not.toContain("任何人");
  });
  it("does NOT flag compound-before cases like 緊張地 / 工程系", () => {
    const text = "她緊張地看著他。她緊張地推開門。他在工程系上課。工程系的學生。";
    const found = detectExtraCharacterNames(text);
    expect(found).not.toContain("張地");
    expect(found).not.toContain("程系上");
  });
  it("does NOT flag one-shot phrase matches (frequency floor)", () => {
    const text = "蘇晴聽了很高興。她寫信感謝誇獎。馬上準備下一頁。";
    const found = detectExtraCharacterNames(text);
    expect(found).toEqual([]);
  });
  it("does NOT flag 牛仔褲 / 高中老 / 方便敘 (3-char phrase denylist)", () => {
    const text = "他穿著牛仔褲。她也穿著牛仔褲。回到高中老校友會。高中老校友的聚會。為了方便敘述，故事從這裡開始。方便敘述如下。";
    const found = detectExtraCharacterNames(text);
    expect(found).not.toContain("牛仔褲");
    expect(found).not.toContain("高中老");
    expect(found).not.toContain("方便敘");
  });

  it("does NOT flag 黃鶯 (bird name preceded by 一隻)", () => {
    const text = "一隻黃鶯從樹上飛過。又有一隻黃鶯從窗外飛來。";
    expect(detectExtraCharacterNames(text)).not.toContain("黃鶯從");
  });

  it("does NOT flag 男方/女方/双方 in simplified-Chinese drift output", () => {
    const text =
      "双方都应该在对话。如果男方试图闭嘴，女方立即制止。双方都应该保持沉默。男方试图穿衣，女方立即阻止。";
    const found = detectExtraCharacterNames(text);
    expect(found).not.toContain("方都应");
    expect(found).not.toContain("方试图");
    expect(found).not.toContain("方立即");
  });

  it("DOES flag a genuinely invented character that recurs (e.g. 趙立志 helper)", () => {
    const text =
      "趙立志走進辦公室。趙立志拿起報紙。後來趙立志對林書言說了幾句話。趙立志笑了起來。";
    expect(detectExtraCharacterNames(text)).toContain("趙立志");
  });
});

describe("scoreNoNewCharacters", () => {
  it("5/5 for clean", () => {
    expect(scoreNoNewCharacters("蘇晴與林書言對話。").score).toBe(5);
  });
  it("3/5 for one repeated extra name", () => {
    expect(
      scoreNoNewCharacters("蘇晴遇見了陳大寶。陳大寶說話了。陳大寶又笑了。").score,
    ).toBe(3);
  });
  it("1/5 for many distinct extras", () => {
    expect(
      scoreNoNewCharacters(
        "蘇晴遇見陳大寶。陳大寶後來又遇到張小芳。張小芳跟陳大寶聊了很久。",
      ).score,
    ).toBe(1);
  });
  it("5/5 when only one-shot false positives appear (no real names)", () => {
    expect(
      scoreNoNewCharacters("感謝誇獎，馬上準備離開，工程系上課了。").score,
    ).toBe(5);
  });
});

describe("scoreKnownNamesPreserved", () => {
  it("5/5 when both present", () => {
    expect(scoreKnownNamesPreserved("蘇晴與林書言走在巷子裡。").score).toBe(5);
  });
  it("3/5 when only one (could be scene-driven)", () => {
    expect(scoreKnownNamesPreserved("蘇晴一個人走在巷子裡。").score).toBe(3);
  });
  it("1/5 if name is mistyped", () => {
    expect(scoreKnownNamesPreserved("林書嚴給蘇晴遞茶。").score).toBe(1);
  });
});
