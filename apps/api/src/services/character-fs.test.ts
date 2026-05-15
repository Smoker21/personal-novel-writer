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
    sexualScenePerformance: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEditedSections: { manualDescription: false, aiSummary: false },
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

  it("create → read roundtrip preserves all fields", async () => {
    const fields = {
      ...minimalFields("蘇晴"),
      mbti: "INFJ" as const,
      personalityTags: ["內向", "敏感"],
    };
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields,
      manualDescription: "測試 body",
      aiSummary: "",
      oneLineSummary: "30 歲女作家",
    });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result).not.toBeNull();
    expect(result?.fields.mbti).toBe("INFJ");
    expect(result?.fields.personalityTags).toEqual(["內向", "敏感"]);
    expect(result?.manualDescription).toBe("測試 body");
  });

  it("creates _status.md skeleton alongside character file", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      manualDescription: "",
      aiSummary: "",
      oneLineSummary: "",
    });
    const statusRaw = await readFile(join(tmpDir, "characters", "蘇晴_status.md"), "utf-8");
    expect(statusRaw).toContain("蘇晴 — 狀態");
  });

  it("returns null for non-existent character", async () => {
    const result = await readCharacter(tmpDir, "不存在");
    expect(result).toBeNull();
  });

  it("_index.md lists characters after create", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      manualDescription: "",
      aiSummary: "",
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
      manualDescription: "",
      aiSummary: "",
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
      manualDescription: "",
      aiSummary: "",
      oneLineSummary: "",
    });
    await createCharacter(tmpDir, {
      slug: "林書言",
      fields: minimalFields("林書言"),
      manualDescription: "",
      aiSummary: "",
      oneLineSummary: "",
    });
    const list = await listCharacters(tmpDir);
    expect(list.map((c) => c.slug).sort()).toEqual(["林書言", "蘇晴"].sort());
  });

  it("updateCharacter merges partial fields", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      manualDescription: "原始描述",
      aiSummary: "",
      oneLineSummary: "",
    });
    await updateCharacter(tmpDir, "蘇晴", { fields: { mbti: "INFJ" } });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.fields.mbti).toBe("INFJ");
    expect(result?.manualDescription).toBe("原始描述");
  });

  it("updateCharacter replaces manualDescription", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      manualDescription: "原始描述",
      aiSummary: "",
      oneLineSummary: "",
    });
    await updateCharacter(tmpDir, "蘇晴", { manualDescription: "新描述" });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.manualDescription).toBe("新描述");
  });

  it("updateCharacter writes aiSummary independently", async () => {
    await createCharacter(tmpDir, {
      slug: "蘇晴",
      fields: minimalFields("蘇晴"),
      manualDescription: "手動段",
      aiSummary: "",
      oneLineSummary: "",
    });
    await updateCharacter(tmpDir, "蘇晴", { aiSummary: "AI 統整內容" });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.manualDescription).toBe("手動段");
    expect(result?.aiSummary).toBe("AI 統整內容");
  });

  it("rename moves .md and updates name in frontmatter", async () => {
    await createCharacter(tmpDir, {
      slug: "林川",
      fields: minimalFields("林川"),
      manualDescription: "",
      aiSummary: "",
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
      manualDescription: "",
      aiSummary: "",
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
    await createCharacter(tmpDir, {
      slug: "林川",
      fields,
      manualDescription: "",
      aiSummary: "",
      oneLineSummary: "",
    });
    await renameCharacter(tmpDir, "林川", "林書言", "林書言");
    const result = await readCharacter(tmpDir, "林書言");
    expect(result?.fields.portrait.default).toBe("characters/_assets/林書言/default.jpg");
    expect(result?.fields.portrait.byChapter[1]).toBe("characters/_assets/林書言/chapter_0001.jpg");
  });

  it("deleteCharacter returns false for non-existent character", async () => {
    const result = await deleteCharacter(tmpDir, "不存在")
    expect(result).toBe(false);
  });

  // ── Regression（手測抓到）: 空 manualDescription 不應被寫成 placeholder ───
  it("create with empty manualDescription does NOT write '(尚未填寫角色描述)' into .md", async () => {
    await createCharacter(tmpDir, {
      slug: "空描述角色",
      fields: minimalFields("空描述角色"),
      manualDescription: "",
      aiSummary: "",
      oneLineSummary: "",
    });
    const raw = await readFile(join(tmpDir, "characters", "空描述角色.md"), "utf-8");
    expect(raw).not.toContain("(尚未填寫");
    expect(raw).not.toContain("(尚未統整");

    const result = await readCharacter(tmpDir, "空描述角色");
    expect(result?.manualDescription).toBe("");
    expect(result?.aiSummary).toBe("");
  });

  it("read of legacy '(尚未統整)' / '(尚未填寫角色描述)' placeholder body returns empty", async () => {
    const legacyM3 = `---
name: 舊角色M3
---

(尚未統整)
`;
    const legacyM5Buggy = `---
name: 舊角色M5
---

## 角色描述（手動）

(尚未填寫角色描述)

## AI 統整敘述

`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "characters", "舊角色M3.md"), legacyM3, "utf-8");
    await writeFile(join(tmpDir, "characters", "舊角色M5.md"), legacyM5Buggy, "utf-8");

    const m3 = await readCharacter(tmpDir, "舊角色M3");
    expect(m3?.manualDescription).toBe("");
    expect(m3?.aiSummary).toBe("");

    const m5 = await readCharacter(tmpDir, "舊角色M5");
    expect(m5?.manualDescription).toBe("");
    expect(m5?.aiSummary).toBe("");
  });

  // M5: migration — 舊 schema 讀容錯
  it("migrates legacy intimateAppendix to sexualScenePerformance on read", async () => {
    const legacy = `---
name: 蘇晴
age: 30
intimateAppendix:
  bodyMeasurements: B85
  preferences: 被動
manuallyEdited: true
---

舊版 body 內容（無 heading）
`;
    await mkdir(join(tmpDir, "characters"), { recursive: true });
    const filePath = join(tmpDir, "characters", "蘇晴.md");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, legacy, "utf-8");
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.fields.sexualScenePerformance).toEqual({
      bodyMeasurements: "B85",
      preferences: "被動",
    });
    expect(result?.fields.manuallyEditedSections).toEqual({
      manualDescription: true,
      aiSummary: false,
    });
    expect(result?.manualDescription).toContain("舊版 body 內容");
    expect(result?.aiSummary).toBe("");
  });
});
