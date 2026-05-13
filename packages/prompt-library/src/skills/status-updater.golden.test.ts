import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildStatusShortenerRequest,
  buildStatusUpdaterRequest,
  statusShortenerOutputSchema,
  statusUpdaterOutputSchema,
} from "../index.js";

const FIXTURE: Parameters<typeof buildStatusUpdaterRequest>[0] = {
  chapterNumber: 1,
  chapterTitle: "梅雨初晴",
  chapterText:
    "蘇晴推開木門走進書店。林書言抬頭打了個招呼。兩人聊了一會兒雨停的可能性，最後蘇晴買了一本詩集離去。",
  currentStoryStatus:
    "# 故事狀態\n\n## 世界觀\n\n現代台北。\n\n## 重要劇情點\n\n## 🔖 伏筆\n\n## ✨ 轉折點\n\n## 場景\n",
  relevantCharacters: [
    {
      slug: "蘇晴",
      name: "蘇晴",
      card: "蘇晴是 30 歲的女作家，內向但觀察力極強。",
      status:
        "# 蘇晴 — 狀態\n\n## 重要狀態變化\n\n## 與其他角色的關係\n\n## 🔖 個人伏筆\n\n## ✨ 個人轉折點\n",
    },
  ],
};

describe("status-updater golden tests (qa-4/5)", () => {
  // ── status-updater ───────────────────────────────────────────────────────

  it("produces stable prompt hash across 5 runs", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildStatusUpdaterRequest(FIXTURE, "anthropic:claude-haiku-4-5");
      const content =
        typeof req.messages[0]?.content === "string"
          ? req.messages[0].content
          : JSON.stringify(req.messages[0]?.content);
      return createHash("sha256")
        .update(req.systemPrompt + content)
        .digest("hex");
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it("system prompt contains rule about not modifying character names", () => {
    const req = buildStatusUpdaterRequest(FIXTURE, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("不修改既有角色姓名");
  });

  it("system prompt contains rules about preserving 🔖/✨ sections", () => {
    const req = buildStatusUpdaterRequest(FIXTURE, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("🔖");
    expect(req.systemPrompt).toContain("✨");
  });

  it("user prompt includes chapter text and character status", () => {
    const req = buildStatusUpdaterRequest(FIXTURE, "anthropic:claude-haiku-4-5");
    const content = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
    expect(content).toContain("梅雨初晴");
    expect(content).toContain("蘇晴");
    expect(content).toContain("story_status.md");
  });

  it("schema accepts valid output", () => {
    const valid = {
      storyStatus:
        "# 故事狀態\n\n## 世界觀\n台北。\n\n## 重要劇情點\n- (第1章) 蘇晴初訪書店。\n\n## 🔖 伏筆\n\n## ✨ 轉折點\n\n## 場景\n",
      characterStatuses: {
        蘇晴: "# 蘇晴 — 狀態\n\n## 重要狀態變化\n- (第1章) 初訪書店，遇林書言。\n\n## 與其他角色的關係\n\n## 🔖 個人伏筆\n\n## ✨ 個人轉折點\n",
      },
    };
    expect(statusUpdaterOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("schema rejects output without storyStatus", () => {
    expect(statusUpdaterOutputSchema.safeParse({ characterStatuses: {} }).success).toBe(false);
  });

  // ── status-shortener ─────────────────────────────────────────────────────

  it("shortener: produces stable hash across 5 runs", () => {
    const input = {
      fileContent: "# story\n\n## 重要劇情點\n- (第1章) xxx\n\n## 🔖 伏筆\n- 重要伏筆A\n",
      fileType: "story" as const,
      preserveMarkedSections: true,
    };
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildStatusShortenerRequest(input, "anthropic:claude-haiku-4-5");
      const content = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
      return createHash("sha256")
        .update(req.systemPrompt + content)
        .digest("hex");
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it("shortener: user prompt mentions preserveMarkedSections=true", () => {
    const req = buildStatusShortenerRequest(
      { fileContent: "...", fileType: "story", preserveMarkedSections: true },
      "anthropic:claude-haiku-4-5",
    );
    const content = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
    expect(content).toContain("preserveMarkedSections=true");
  });

  it("shortener: schema accepts valid output", () => {
    const valid = { shortenedContent: "# 精簡後\n\n...", preservedSections: ["## 🔖 伏筆"] };
    expect(statusShortenerOutputSchema.safeParse(valid).success).toBe(true);
  });
});
