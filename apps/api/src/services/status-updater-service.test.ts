import { createHash } from "node:crypto";
import { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "@novel-writer/prompt-library";
import { describe, expect, it } from "vitest";

const FIXTURE_INPUT: Parameters<typeof buildStatusUpdaterRequest>[0] = {
  chapterNumber: 1,
  chapterTitle: "梅雨初晴",
  chapterText:
    "蘇晴推開木門走進書店。林書言抬頭打了個招呼，說雨今天下不停了。蘇晴買了一本詩集後離去。",
  currentStoryStatus:
    "# 故事狀態\n\n## 世界觀\n\n現代台北。\n\n## 重要劇情點\n\n## 🔖 伏筆\n\n- 蘇晴的舊信件\n\n## ✨ 轉折點\n\n## 場景\n",
  relevantCharacters: [
    {
      slug: "蘇晴",
      name: "蘇晴",
      card: "蘇晴是 30 歲的女作家，內向但觀察力極強。",
      status:
        "# 蘇晴 — 狀態\n\n## 重要狀態變化\n\n## 與其他角色的關係\n\n## 🔖 個人伏筆\n\n- 她藏起來的那封信\n\n## ✨ 個人轉折點\n",
    },
  ],
};

describe("status-updater service prompt tests (qa-4)", () => {
  it("prompt hash is stable across 5 runs", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
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

  it("schema accepts output where unrecognized names are listed", () => {
    const valid = {
      storyStatus:
        "# 故事狀態\n\n## 世界觀\n台北。\n\n## 重要劇情點\n- (第1章) 相遇。\n\n## 🔖 伏筆\n\n- 蘇晴的舊信件\n\n## ✨ 轉折點\n\n## 場景\n",
      characterStatuses: {
        蘇晴: "# 蘇晴 — 狀態\n\n## 重要狀態變化\n- (第1章) 初訪書店。\n\n## 與其他角色的關係\n- 與 [[林書言]]：初次相識。\n\n## 🔖 個人伏筆\n\n- 她藏起來的那封信\n\n## ✨ 個人轉折點\n",
      },
      unrecognizedNames: ["老板娘"],
    };
    expect(statusUpdaterOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("🔖 section items in story_status should be preserved in output", () => {
    // Validates the prompt instructs LLM to preserve marked sections
    const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("🔖");
    expect(req.systemPrompt).toContain("既有條目");
  });

  it("schema rejects output where characterStatuses is not a record", () => {
    const invalid = {
      storyStatus: "...",
      characterStatuses: ["slug", "content"],
    };
    expect(statusUpdaterOutputSchema.safeParse(invalid).success).toBe(false);
  });
});
