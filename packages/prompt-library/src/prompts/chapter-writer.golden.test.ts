import { createHash } from "node:crypto";
import type { ChapterContext } from "@novel-writer/shared-types";
import { describe, expect, it } from "vitest";
import { buildChapterWriterRequest } from "./chapter-writer.js";

const FIXTURE_CONTEXT: ChapterContext = {
  synopsis: "現代都市愛情故事，蘇晴與林書言因一場避雨相識，在書店與記憶的交織中緩慢靠近。",
  writingStyle: "",
  storyStatus: "第一章開始，兩人初次見面。蘇晴站在書店門口等雨停。",
  characterStatuses: {
    蘇晴: "情緒平靜，對眼前這個陌生書店老闆有初步好奇，但保持分寸。",
  },
  characters: [
    {
      slug: "蘇晴",
      name: "蘇晴",
      fields: {
        name: "蘇晴",
        age: 30,
        gender: "female",
        pronoun: "她",
        role: "主角",
        personalityTags: ["內向", "敏感"],
        mbti: "INFJ",
        zodiac: null,
        bloodType: null,
        culturalBackground: null,
        heightCm: 165,
        bodyType: "中等偏瘦",
        hairAndColor: "黑色長髮，平日綁低馬尾",
        eyes: "雙眼皮，眼尾微下垂",
        otherFeatures: "鵝蛋臉，膚色偏白",
        clothing: null,
        portrait: { default: null, byChapter: {} },
        appearanceByChapter: {},
        dialoguePace: "慢",
        wordingPreference: "半句話結尾，不喜歡把話說滿",
        writingAvoid: "避免讓她說過於肯定的句子",
        relations: null,
        intimateAppendix: null,
        consolidatedAt: null,
        consolidatedBy: null,
        manuallyEdited: false,
      },
      body: "蘇晴是 30 歲的女作家，內向但觀察力極強。",
      currentAppearance: "黑色長髮，平日綁低馬尾。雙眼皮，眼尾微下垂。中等偏瘦。鵝蛋臉，膚色偏白。",
    },
  ],
  participantSlugs: ["蘇晴"],
  currentOutline: null,
  currentRequirements: null,
  previousChapterFullText: null,
  contextHash: "abc123fixture",
};

describe("chapter-writer prompt golden test (qa-5)", () => {
  it("produces identical hash across 5 runs for same input", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildChapterWriterRequest(
        { context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" },
        "anthropic:claude-sonnet-4-6",
      );
      const content =
        typeof req.messages[0]?.content === "string"
          ? req.messages[0].content
          : JSON.stringify(req.messages[0]?.content);
      return createHash("sha256")
        .update(req.systemPrompt + content)
        .digest("hex");
    });
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  it("system prompt contains currentAppearance enforcement rule", () => {
    const req = buildChapterWriterRequest(
      { context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" },
      "anthropic:claude-sonnet-4-6",
    );
    expect(req.systemPrompt).toContain("currentAppearance");
  });

  it("inserts style.md section when writingStyle is non-empty", () => {
    const ctxWithStyle = {
      ...FIXTURE_CONTEXT,
      writingStyle: "風格：細膩寫實，第三人稱限制視角，不用全知視角。",
    };
    const req = buildChapterWriterRequest(
      { context: ctxWithStyle, chapterNumber: 1, chapterTitle: "梅雨初晴" },
      "anthropic:claude-sonnet-4-6",
    );
    expect(req.systemPrompt).toContain("寫作風格指南");
    expect(req.systemPrompt).toContain("細膩寫實");
  });

  it("omits style section when writingStyle is empty string", () => {
    const req = buildChapterWriterRequest(
      { context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" },
      "anthropic:claude-sonnet-4-6",
    );
    expect(req.systemPrompt).not.toContain("寫作風格指南");
  });

  it("includes currentAppearance in user prompt for each character", () => {
    const req = buildChapterWriterRequest(
      { context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" },
      "anthropic:claude-sonnet-4-6",
    );
    const userContent = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
    expect(userContent).toContain("currentAppearance");
    expect(userContent).toContain("黑色長髮，平日綁低馬尾");
  });

  it("includes userIntent in user prompt when provided", () => {
    const req = buildChapterWriterRequest(
      {
        context: FIXTURE_CONTEXT,
        chapterNumber: 1,
        chapterTitle: "梅雨初晴",
        userIntent: "讓蘇晴的視角更加細膩，多描寫細節",
      },
      "anthropic:claude-sonnet-4-6",
    );
    const userContent = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
    expect(userContent).toContain("讓蘇晴的視角更加細膩");
  });
});
