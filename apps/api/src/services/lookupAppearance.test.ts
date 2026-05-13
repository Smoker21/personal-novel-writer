import type { CharacterFields } from "@novel-writer/shared-types";
import { describe, expect, it } from "vitest";
import { lookupAppearance } from "./character-fs.js";

function makeFields(overrides: Partial<CharacterFields> = {}): CharacterFields {
  return {
    name: "蘇晴",
    age: null,
    gender: null,
    pronoun: null,
    role: null,
    personalityTags: [],
    mbti: null,
    zodiac: null,
    bloodType: null,
    culturalBackground: null,
    heightCm: null,
    bodyType: null,
    hairAndColor: null,
    eyes: null,
    otherFeatures: null,
    clothing: null,
    portrait: { default: null, byChapter: {} },
    appearanceByChapter: {},
    dialoguePace: null,
    wordingPreference: null,
    writingAvoid: null,
    relations: null,
    intimateAppendix: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEdited: false,
    ...overrides,
  };
}

describe("lookupAppearance (qa-9)", () => {
  it("falls back to flat fields when appearanceByChapter is empty", () => {
    const fields = makeFields({ hairAndColor: "黑色長髮", eyes: "雙眼皮" });
    const result = lookupAppearance(fields, 3);
    expect(result).toContain("黑色長髮");
    expect(result).toContain("雙眼皮");
  });

  it("returns the exact matching chapter entry", () => {
    const fields = makeFields({ appearanceByChapter: { 3: "第3章雨夜外貌" } });
    expect(lookupAppearance(fields, 3)).toBe("第3章雨夜外貌");
  });

  it("returns latest entry ≤ currentChapter when exact match missing", () => {
    const fields = makeFields({ appearanceByChapter: { 1: "第1章外貌", 3: "第3章外貌" } });
    expect(lookupAppearance(fields, 4)).toBe("第3章外貌");
    expect(lookupAppearance(fields, 2)).toBe("第1章外貌");
  });

  it("falls back to flat fields when all entries > currentChapter", () => {
    const fields = makeFields({
      hairAndColor: "棕色短髮",
      appearanceByChapter: { 5: "第5章外貌" },
    });
    const result = lookupAppearance(fields, 3);
    expect(result).toContain("棕色短髮");
    expect(result).not.toContain("第5章");
  });

  it("picks the largest key ≤ N among multiple options", () => {
    const fields = makeFields({
      appearanceByChapter: { 1: "第1章", 3: "第3章", 5: "第5章", 7: "第7章" },
    });
    expect(lookupAppearance(fields, 6)).toBe("第5章");
    expect(lookupAppearance(fields, 7)).toBe("第7章");
    expect(lookupAppearance(fields, 1)).toBe("第1章");
  });

  it("returns placeholder when no fields at all", () => {
    const fields = makeFields();
    const result = lookupAppearance(fields, 1);
    expect(result).toBe("（無外貌描述）");
  });

  it("includes clothing with prefix 服裝：", () => {
    const fields = makeFields({ clothing: "白色棉質連衣裙" });
    const result = lookupAppearance(fields, 1);
    expect(result).toContain("服裝：白色棉質連衣裙");
  });
});
