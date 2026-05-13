import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CharacterFields } from "@novel-writer/shared-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  readCharacter,
  renameCharacter,
  updateCharacter,
} from "./character-fs.js";

function minimalFields(name: string): CharacterFields {
  return {
    name,
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
  };
}

describe("character-fs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `char-fs-${Date.now()}`);
    await mkdir(join(tmpDir, "characters"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── create + read roundtrip ──────────────────────────────────────────────

  it("create → read roundtrip preserves all fields", async () => {
    const fields = {
      ...minimalFields("蘇晴"),
      mbti: "INFJ" as const,
      personalityTags: ["內向", "敏感"],
    };
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields,
      body: "測試 body",
      oneLineSummary: "30 歲女作家",
    });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result).not.toBeNull();
    expect(result?.fields.mbti).toBe("INFJ");
    expect(result?.fields.personalityTags).toEqual(["內向", "敏感"]);
    expect(result?.body).toBe("測試 body");
  });

  it("creates _status.md skeleton alongside character file", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      body: "",
      oneLineSummary: "",
    });
    const statusRaw = await readFile(join(tmpDir, "characters", "蘇晴_status.md"), "utf-8");
    expect(statusRaw).toContain("蘇晴 — 狀態");
  });

  it("returns null for non-existent character", async () => {
    const result = await readCharacter(tmpDir, "不存在");
    expect(result).toBeNull();
  });

  // ── _index.md maintenance ────────────────────────────────────────────────

  it("_index.md lists characters after create", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      body: "",
      oneLineSummary: "主角",
    });
    const indexRaw = await readFile(join(tmpDir, "characters", "_index.md"), "utf-8");
    expect(indexRaw).toContain("[蘇晴](./蘇晴.md)");
    expect(indexRaw).toContain("主角");
  });

  it("_index.md removes entry on delete", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      body: "",
      oneLineSummary: "主角",
    });
    await deleteCharacter(tmpDir, "蘇晴");
    const indexRaw = await readFile(join(tmpDir, "characters", "_index.md"), "utf-8");
    expect(indexRaw).not.toContain("蘇晴");
  });

  it("listCharacters returns all characters", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      body: "",
      oneLineSummary: "",
    });
    await createCharacter(tmpDir, {
      slug: "林書言",
      fields: minimalFields("林書言"),
      body: "",
      oneLineSummary: "",
    });
    const list = await listCharacters(tmpDir);
    expect(list.map((c) => c.slug).sort()).toEqual(["林書言", "蘇晴"].sort());
  });

  // ── update ────────────────────────────────────────────────────────────────

  it("updateCharacter merges partial fields", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      body: "原始 body",
      oneLineSummary: "",
    });
    await updateCharacter(tmpDir, "蘇晴", { fields: { mbti: "INFJ" } });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.fields.mbti).toBe("INFJ");
    expect(result?.body).toBe("原始 body");
  });

  it("updateCharacter replaces body", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      body: "原始 body",
      oneLineSummary: "",
    });
    await updateCharacter(tmpDir, "蘇晴", { body: "新 body" });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.body).toBe("新 body");
  });

  // ── rename ────────────────────────────────────────────────────────────────

  it("rename moves .md and updates name in frontmatter", async () => {
    await createCharacter(tmpDir, {
      slug: "林川",
      fields: minimalFields("林川"),
      body: "",
      oneLineSummary: "配角",
    });
    await renameCharacter(tmpDir, "林川", "林書言", "林書言");
    expect(await readCharacter(tmpDir, "林川")).toBeNull();
    const renamed = await readCharacter(tmpDir, "林書言");
    expect(renamed?.fields.name).toBe("林書言");
  });

  it("rename updates _index.md entry", async () => {
    await createCharacter(tmpDir, {
      slug: "林川",
      fields: minimalFields("林川"),
      body: "",
      oneLineSummary: "配角",
    });
    await renameCharacter(tmpDir, "林川", "林書言", "林書言");
    const indexRaw = await readFile(join(tmpDir, "characters", "_index.md"), "utf-8");
    expect(indexRaw).toContain("林書言");
    expect(indexRaw).not.toContain("[林川]");
  });

  it("rename updates portrait paths in frontmatter", async () => {
    const fields = {
      ...minimalFields("林川"),
      portrait: {
        default: "characters/_assets/林川/default.jpg",
        byChapter: { 1: "characters/_assets/林川/chapter_0001.jpg" },
      },
    };
    await createCharacter(tmpDir, { slug: "林川", fields, body: "", oneLineSummary: "" });
    await renameCharacter(tmpDir, "林川", "林書言", "林書言");
    const result = await readCharacter(tmpDir, "林書言");
    expect(result?.fields.portrait.default).toBe("characters/_assets/林書言/default.jpg");
    expect(result?.fields.portrait.byChapter[1]).toBe("characters/_assets/林書言/chapter_0001.jpg");
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("deleteCharacter returns false for non-existent character", async () => {
    const result = await deleteCharacter(tmpDir, "不存在");
    expect(result).toBe(false);
  });
});
