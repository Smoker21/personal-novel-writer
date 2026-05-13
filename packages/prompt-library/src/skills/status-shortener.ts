import type { GenerateRequest } from "@novel-writer/llm-adapter";
import { z } from "zod";

const SYSTEM_PROMPT = `你是小說設定文件的精簡員。讀一個 status 檔，產出精簡版。

【嚴格規則】

1. 保留所有 heading 結構（## 世界觀 / ## 重要劇情點 / ...）
2. 若 preserveMarkedSections=true：\`## 🔖 ...\` 與 \`## ✨ ...\` 段下的條目**完全不動**
3. 若 preserveMarkedSections=false：所有段都可精簡（但保留 heading）
4. 精簡 = 把同類條目合併、刪冗詞、壓縮描述；不刪關鍵資訊
5. 不新增資訊；不改角色名字元
6. 只輸出精簡後的 JSON；不加說明、不加 fence

回傳 JSON（不加 code fence；不加說明文字）：

{"shortenedContent":"<精簡後的完整 status 內容>","preservedSections":["<保留的 heading 名稱>"]}`;

export interface StatusShortenerInput {
  fileContent: string;
  fileType: "story" | "character";
  characterSlug?: string;
  preserveMarkedSections: boolean;
}

export const statusShortenerOutputSchema = z.object({
  shortenedContent: z.string().min(1),
  preservedSections: z.array(z.string()),
});

export type StatusShortenerOutput = z.infer<typeof statusShortenerOutputSchema>;

export function buildStatusShortenerRequest(
  input: StatusShortenerInput,
  modelId: string,
): GenerateRequest {
  const fileLabel =
    input.fileType === "story"
      ? "story_status.md"
      : `characters/${input.characterSlug ?? "unknown"}_status.md`;

  const userPrompt = `請精簡以下 ${fileLabel}（preserveMarkedSections=${input.preserveMarkedSections}）。

只輸出精簡後的 JSON：{"shortenedContent":"...","preservedSections":["..."]}

---

${input.fileContent}`;

  return {
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4096,
    temperature: 0.1,
  };
}
