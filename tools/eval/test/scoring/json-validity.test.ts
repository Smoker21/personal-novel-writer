import { describe, expect, it } from "vitest";
import {
  scoreJsonValidity,
  scoreTC04Characters,
  scoreTC04Fields,
  tryParseJson,
} from "../../src/scoring/rules/json-validity.js";

describe("tryParseJson", () => {
  it("parses pure JSON", () => {
    const r = tryParseJson('{"a": 1}');
    expect(r.ok).toBe(true);
    expect(r.cleanedFromFence).toBeFalsy();
  });

  it("strips markdown fence", () => {
    const r = tryParseJson('```json\n{"a": 1}\n```');
    expect(r.ok).toBe(true);
    expect(r.cleanedFromFence).toBe(true);
  });

  it("extracts {...} from prose", () => {
    const r = tryParseJson('以下是 JSON：\n{"a": 1}\n希望這樣可以');
    expect(r.ok).toBe(true);
    expect(r.cleanedFromFence).toBe(true);
  });

  it("returns ok=false for non-JSON", () => {
    const r = tryParseJson("not json at all");
    expect(r.ok).toBe(false);
  });
});

describe("scoreJsonValidity", () => {
  it("5/5 for clean JSON", () => {
    const s = scoreJsonValidity('{"wordCount": 5}');
    expect(s.score).toBe(5);
  });
  it("3/5 when fence has to be stripped", () => {
    const s = scoreJsonValidity('```\n{"wordCount": 5}\n```');
    expect(s.score).toBe(3);
  });
  it("1/5 for unparsable", () => {
    const s = scoreJsonValidity("nope");
    expect(s.score).toBe(1);
  });
});

describe("scoreTC04Fields", () => {
  it("5/5 for full schema", () => {
    const s = scoreTC04Fields({
      wordCount: 30,
      characters: ["蘇晴", "林書言"],
      mood: "靜謐",
    });
    expect(s.score).toBe(5);
  });
  it("3/5 if mood too long", () => {
    const s = scoreTC04Fields({
      wordCount: 30,
      characters: ["蘇晴"],
      mood: "非常非常靜謐而沉重的氛圍延伸到夜晚",
    });
    expect(s.score).toBe(3);
  });
  it("1/5 if multiple fields missing", () => {
    const s = scoreTC04Fields({ wordCount: "30" } as unknown);
    expect(s.score).toBe(1);
  });
});

describe("scoreTC04Characters", () => {
  it("5/5 if exactly two known names", () => {
    const s = scoreTC04Characters({ characters: ["蘇晴", "林書言"] });
    expect(s.score).toBe(5);
  });
  it("3/5 if extra names included", () => {
    const s = scoreTC04Characters({ characters: ["蘇晴", "林書言", "謝伯"] });
    expect(s.score).toBe(3);
  });
  it("1/5 if a known name missing", () => {
    const s = scoreTC04Characters({ characters: ["蘇晴"] });
    expect(s.score).toBe(1);
  });
});
