import type { GenerateRequest } from "@novel-writer/llm-adapter";
import type { ImageMimeType } from "@novel-writer/shared-types";

const SYSTEM_PROMPT = `你是小說人物參考圖解析員。讀一張人物圖，產出結構化的外貌描述 JSON。

【嚴格規則 — 不可違反】

1. **只描寫圖中可見的**：不發明圖中沒有的細節。
2. **服裝按時代合理**：若 context 提供 storyGenre，服裝描述要符合該時代；衝突時照圖實寫並加 chapterNote。
3. **不判斷年齡 / 性別 / 個性**：這些靠使用者輸入。
4. **不命名**：不假設圖中人物叫什麼名字。
5. **confidence 標記要誠實**：對模糊的部分（暗光、側面照、遮擋）標 low；清楚的標 high。
6. **無 disclaimer**：不寫「以下是分析」「希望這個描述符合」之類。
7. **繁體中文**：避免簡體字、大陸用語、英文夾雜。

【章節脈絡判讀】

- chapterNumber=null（預設）：給「角色的基準外貌 + 通常會穿的服裝風格」
- chapterNumber=N：給「此章節版本的具體外貌 + 此章節穿的服裝」

【欄位填寫指引】

- hairAndColor：髮色 + 長度 + 樣式；3-30 字
- eyes：眼型 + 顏色 + 眼神特徵；3-30 字
- bodyType：身材印象；不寫精確身高體重
- otherFeatures：臉型 + 膚色 + 可見特徵；30-100 字
- clothing：上衣 / 下著 / 鞋 / 配件，具體（顏色 / 材質 / 剪裁）；30-150 字

【輸出格式】

回傳 JSON（不加 markdown code fence；不加說明文字；直接回 JSON）：

{"hairAndColor":"...","eyes":"...","bodyType":"...","otherFeatures":"...","clothing":"...","heightHint":"...（可選）","confidence":{"hairAndColor":"high|medium|low","eyes":"high|medium|low","bodyType":"high|medium|low","otherFeatures":"high|medium|low","clothing":"high|medium|low"},"chapterNote":"...（可選）"}`;

export interface ImageExtractorInput {
  image: {
    source:
      | { kind: "path"; path: string }
      | { kind: "base64"; data: string; mimeType: ImageMimeType };
  };
  context?: {
    chapterNumber: number | null;
    storyGenre?: string;
    characterName?: string;
    existingAppearance?: string;
  };
}

export function buildImageExtractorRequest(
  input: ImageExtractorInput,
  modelId: string,
): GenerateRequest {
  const ctx = input.context;
  const contextParts: string[] = [];

  if (ctx) {
    if (ctx.chapterNumber !== null && ctx.chapterNumber !== undefined) {
      contextParts.push(`章節：第 ${ctx.chapterNumber} 章`);
    }
    if (ctx.storyGenre) {
      contextParts.push(`故事類型：${ctx.storyGenre}`);
    }
    if (ctx.characterName) {
      contextParts.push(`角色名稱：${ctx.characterName}（僅供參考，不必在 JSON 中命名）`);
    }
    if (ctx.existingAppearance) {
      contextParts.push(`現有外貌描述（作為修補參考，非覆蓋依據）：\n${ctx.existingAppearance}`);
    }
  }

  const userText =
    contextParts.length > 0
      ? `請解析以下圖片中人物的外貌。\n\n脈絡資訊：\n${contextParts.join("\n")}\n\n請依格式回傳 JSON。`
      : "請解析以下圖片中人物的外貌，依格式回傳 JSON。";

  const src = input.image.source;
  const imageContent =
    src.kind === "path"
      ? { type: "image" as const, source: { kind: "path" as const, path: src.path } }
      : {
          type: "image" as const,
          source: { kind: "base64" as const, data: src.data, mimeType: src.mimeType },
        };

  return {
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [imageContent, { type: "text", text: userText }],
      },
    ],
    maxOutputTokens: 1024,
    temperature: 0.1,
  };
}
