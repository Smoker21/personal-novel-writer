import type { GenerateRequest } from "@novel-writer/llm-adapter";
import type { CharacterFields } from "@novel-writer/shared-types";

const SYSTEM_PROMPT = `你是小說人物設定的統整員。讀使用者填的角色卡欄位（YAML frontmatter），產出
一段連貫的中文敘述，作為角色卡的 body 段。

【嚴格規則 — 不可違反】

1. **不發明事實**：只用使用者填的欄位內容，不臆測未填的設定。
2. **保留角色名字元**：name 欄位的字元在 body 中一字不差
3. **繁體中文**：避免簡體字、大陸用語、英文夾雜
4. **不加 disclaimer**：不寫「以下是角色設定…」「希望這個描述符合您…」之類
5. **不寫小說正文**：本任務是「設定敘述」，不是小說片段
6. **親密欄位的處理**：intimateAppendix 為 null 或有內容時，均不寫入 body
7. **避免「標籤式」描寫**：不直接列 personalityTags，改為描述具體行為和習慣
8. **wordingPreference / writingAvoid 必須轉述為描述**

【輸出格式】

回傳 JSON（不加 markdown code fence；不加說明文字；直接回 JSON）：

{"body":"<3-4 段中文敘述>","oneLineSummary":"<一句話，<40 字>"}

【body 結構建議】3-4 段，200-500 中文字：
- 段 1：個性與行為模式
- 段 2：容貌剪影
- 段 3：文化 / 背景（若欄位有填才寫）
- 段 4：與其他角色的關係（若欄位有填才寫）`;

function fieldsToYaml(fields: CharacterFields): string {
  const lines: string[] = [];

  const add = (key: string, val: unknown) => {
    if (val === null || val === undefined) return;
    if (Array.isArray(val)) {
      if (val.length === 0) return;
      lines.push(`${key}:`);
      for (const item of val) lines.push(`  - ${item}`);
      return;
    }
    if (typeof val === "object") return;
    lines.push(`${key}: ${String(val)}`);
  };

  add("name", fields.name);
  add("age", fields.age);
  add("gender", fields.gender);
  add("pronoun", fields.pronoun);
  add("role", fields.role);

  if (fields.personalityTags.length > 0) {
    lines.push("personalityTags:");
    for (const t of fields.personalityTags) lines.push(`  - ${t}`);
  }
  add("mbti", fields.mbti);
  add("zodiac", fields.zodiac);
  add("bloodType", fields.bloodType);
  if (fields.culturalBackground) {
    lines.push("culturalBackground: |");
    for (const line of fields.culturalBackground.split("\n")) lines.push(`  ${line}`);
  }

  add("heightCm", fields.heightCm);
  add("bodyType", fields.bodyType);
  if (fields.hairAndColor) {
    lines.push("hairAndColor: |");
    for (const line of fields.hairAndColor.split("\n")) lines.push(`  ${line}`);
  }
  if (fields.eyes) {
    lines.push("eyes: |");
    for (const line of fields.eyes.split("\n")) lines.push(`  ${line}`);
  }
  if (fields.otherFeatures) {
    lines.push("otherFeatures: |");
    for (const line of fields.otherFeatures.split("\n")) lines.push(`  ${line}`);
  }
  if (fields.clothing) {
    lines.push("clothing: |");
    for (const line of fields.clothing.split("\n")) lines.push(`  ${line}`);
  }

  add("dialoguePace", fields.dialoguePace);
  if (fields.wordingPreference) {
    lines.push("wordingPreference: |");
    for (const line of fields.wordingPreference.split("\n")) lines.push(`  ${line}`);
  }
  if (fields.writingAvoid) {
    lines.push("writingAvoid: |");
    for (const line of fields.writingAvoid.split("\n")) lines.push(`  ${line}`);
  }

  if (fields.relations) {
    lines.push("relations: |");
    for (const line of fields.relations.split("\n")) lines.push(`  ${line}`);
  }

  return lines.join("\n");
}

export function buildConsolidatorRequest(
  fields: CharacterFields,
  modelId: string,
): GenerateRequest {
  const userPrompt = `以下是角色卡欄位（YAML 格式）：

\`\`\`yaml
${fieldsToYaml(fields)}
\`\`\`

請根據以上欄位產出 JSON：{"body":"...","oneLineSummary":"..."}`;

  return {
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 1024,
    temperature: 0.3,
  };
}
