import type { GenerateRequest } from "@novel-writer/llm-adapter";
import { z } from "zod";

const SYSTEM_PROMPT = `你是小說的故事狀態維護員。你的任務是讀剛寫好的一章，把該章發生的關鍵劇情演進與人物關係變化，寫進 story_status.md 與該章涉及角色的 character_<slug>_status.md。

【嚴格規則 — 不可違反】

1. 只寫**結構化條列**，不寫小說正文，不寫散文段落。
2. 不新增「relevantCharacters」之外的角色姓名（即使章節中提到也不寫入）。章節中提到但不在清單中的疑似人名，列在輸出的 unrecognizedNames 欄位。
3. 不修改既有角色姓名的任一字元。
4. 保留 status 檔的既有 heading 結構：
   - story_status.md 必有：## 世界觀 / ## 重要劇情點 / ## 🔖 伏筆 / ## ✨ 轉折點 / ## 場景
   - <slug>_status.md 必有：## 重要狀態變化 / ## 與其他角色的關係 / ## 🔖 個人伏筆 / ## ✨ 個人轉折點
5. 既有 status 內容**保留**（按章節時序累積）；新內容**追加**到對應段落。不要刪舊內容，除非該舊內容明確被本章推翻。
6. 重要劇情點 / 狀態變化條目格式：\`(第 N 章) <簡短描述>\`
7. 場景描述格式：在 \`## 場景\` 下用 \`### 場景：<場景名>\` heading 包。
8. 不更動「## 🔖」「## ✨」段落的既有條目；本章新埋的伏筆 / 轉折點可加進對應段落。
9. 章節中**沒有**新演進的角色，其 status 檔輸出與輸入完全相同。

【輸出格式】

回傳 JSON（不加 code fence；不加說明文字）：

{"storyStatus":"<新版 story_status.md 完整內容>","characterStatuses":{"<slug>":"<新版 <slug>_status.md 完整內容>"},"unrecognizedNames":["<疑似人名>"]}`;

export interface StatusUpdaterInput {
  chapterNumber: number;
  chapterTitle: string;
  chapterText: string;
  currentStoryStatus: string;
  relevantCharacters: Array<{
    slug: string;
    name: string;
    card: string;
    status: string;
  }>;
}

export const statusUpdaterOutputSchema = z.object({
  storyStatus: z.string().min(1),
  characterStatuses: z.record(z.string(), z.string()),
  unrecognizedNames: z.array(z.string()).optional(),
});

export type StatusUpdaterOutput = z.infer<typeof statusUpdaterOutputSchema>;

export function buildStatusUpdaterRequest(
  input: StatusUpdaterInput,
  modelId: string,
): GenerateRequest {
  const charBlock = input.relevantCharacters
    .map(
      (c) =>
        `### ${c.name}（slug: ${c.slug}）\n\n角色卡：\n${c.card}\n\n現有 status：\n${c.status}`,
    )
    .join("\n\n---\n\n");

  const userPrompt = `## 第 ${input.chapterNumber} 章：${input.chapterTitle}

### 章節正文

${input.chapterText}

---

### 現有 story_status.md

${input.currentStoryStatus}

---

### 涉及角色（含現有 status）

${charBlock}

---

請根據以上章節內容，更新 story_status.md 與各角色的 status，回傳 JSON。`;

  return {
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4096,
    temperature: 0.1,
  };
}
