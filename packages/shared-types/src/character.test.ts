import { describe, expect, it } from "vitest";
import { defaultCharacterFields } from "./character.js";

describe("defaultCharacterFields", () => {
  it("sets name correctly", () => {
    const f = defaultCharacterFields("蘇晴");
    expect(f.name).toBe("蘇晴");
  });

  it("initialises all nullable string fields to null", () => {
    const f = defaultCharacterFields("X");
    expect(f.age).toBeNull();
    expect(f.gender).toBeNull();
    expect(f.pronoun).toBeNull();
    expect(f.role).toBeNull();
    expect(f.mbti).toBeNull();
    expect(f.zodiac).toBeNull();
    expect(f.bloodType).toBeNull();
    expect(f.culturalBackground).toBeNull();
    expect(f.heightCm).toBeNull();
    expect(f.bodyType).toBeNull();
    expect(f.hairAndColor).toBeNull();
    expect(f.eyes).toBeNull();
    expect(f.otherFeatures).toBeNull();
    expect(f.clothing).toBeNull();
    expect(f.dialoguePace).toBeNull();
    expect(f.wordingPreference).toBeNull();
    expect(f.writingAvoid).toBeNull();
    expect(f.relations).toBeNull();
    expect(f.intimateAppendix).toBeNull();
    expect(f.consolidatedAt).toBeNull();
    expect(f.consolidatedBy).toBeNull();
  });

  it("initialises personalityTags as empty array", () => {
    const f = defaultCharacterFields("X");
    expect(f.personalityTags).toEqual([]);
  });

  it("initialises portrait with null default and empty byChapter", () => {
    const f = defaultCharacterFields("X");
    expect(f.portrait.default).toBeNull();
    expect(f.portrait.byChapter).toEqual({});
  });

  it("initialises appearanceByChapter as empty record", () => {
    const f = defaultCharacterFields("X");
    expect(f.appearanceByChapter).toEqual({});
  });

  it("initialises manuallyEdited as false", () => {
    const f = defaultCharacterFields("X");
    expect(f.manuallyEdited).toBe(false);
  });

  it("returns independent objects on each call (no shared reference)", () => {
    const a = defaultCharacterFields("A");
    const b = defaultCharacterFields("B");
    a.personalityTags.push("活潑");
    expect(b.personalityTags).toHaveLength(0);
    a.portrait.byChapter[1] = "test.jpg";
    expect(b.portrait.byChapter).toEqual({});
  });
});
