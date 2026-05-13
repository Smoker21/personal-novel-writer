import { describe, expect, it } from "vitest";
import { lookupAppearance } from "./llm.js";
import { defaultCharacterFields } from "./character.js";

describe("lookupAppearance", () => {
  it("returns fallback string when no byChapter and no flat fields", () => {
    const fields = defaultCharacterFields("A");
    expect(lookupAppearance(fields, 1)).toBe("（無外貌描述）");
  });

  it("concatenates flat appearance fields when no byChapter", () => {
    const fields = defaultCharacterFields("B");
    fields.hairAndColor = "黑直髮";
    fields.eyes = "琥珀色";
    fields.bodyType = "纖細";
    const result = lookupAppearance(fields, 1);
    expect(result).toContain("黑直髮");
    expect(result).toContain("琥珀色");
    expect(result).toContain("纖細");
  });

  it("includes clothing with prefix when present", () => {
    const fields = defaultCharacterFields("C");
    fields.hairAndColor = "褐色";
    fields.clothing = "學生制服";
    const result = lookupAppearance(fields, 3);
    expect(result).toContain("服裝：學生制服");
  });

  it("returns byChapter entry when currentChapter matches exactly", () => {
    const fields = defaultCharacterFields("D");
    fields.appearanceByChapter = { 1: "雨夜版" };
    expect(lookupAppearance(fields, 1)).toBe("雨夜版");
  });

  it("returns largest K ≤ currentChapter when multiple entries exist", () => {
    const fields = defaultCharacterFields("E");
    fields.appearanceByChapter = { 1: "雨夜版", 5: "春日版" };
    // currentChapter=3 → max K≤3 is 1
    expect(lookupAppearance(fields, 3)).toBe("雨夜版");
  });

  it("returns latest applicable entry — spring version at chapter 5+", () => {
    const fields = defaultCharacterFields("F");
    fields.appearanceByChapter = { 1: "雨夜版", 5: "春日版" };
    expect(lookupAppearance(fields, 5)).toBe("春日版");
    expect(lookupAppearance(fields, 10)).toBe("春日版");
  });

  it("falls back to flat fields when all byChapter entries are above currentChapter", () => {
    const fields = defaultCharacterFields("G");
    fields.appearanceByChapter = { 5: "春日版" };
    fields.hairAndColor = "灰色短髮";
    // currentChapter=3 → no K≤3 → fallback
    const result = lookupAppearance(fields, 3);
    expect(result).toContain("灰色短髮");
    expect(result).not.toContain("春日版");
  });
});
