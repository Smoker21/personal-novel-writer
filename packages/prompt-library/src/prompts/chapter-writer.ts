import type { GenerateRequest } from "@novel-writer/llm-adapter";
import type { ChapterContext } from "@novel-writer/shared-types";

const SYSTEM_PROMPT_BASE = `你是一個中文小說的章節寫手。你的任務是根據提供的上下文，產出一整章草稿。

請以**繁體中文**撰寫，避免簡體字與大陸用語（如「視頻、立馬、貓膩」），避免英文夾雜。

【嚴格規則 — 不可違反】

1. 只能使用「出場角色清單」中明確列出的人物姓名。
2. 不可新增未列出的人物姓名（含路人、配角）；若需要無名路人，用「店員」「鄰居」「一名男人」等職稱描述。
3. 不可修改既有角色姓名的任一字元。
4. 維持「人物狀態」中描述的角色當前內心狀態與關係。
5. 銜接「上一章完整內容」的結尾，不要重新介紹人物或重複情節。
6. 若提供「本章大綱」，嚴格依其情節走向；不可跑去寫不在大綱中的劇情。
7. 第三人稱限制視角；不直接描寫主視角角色視野外的事，除非大綱明確要求。
8. **角色當前外貌**：以「出場角色清單」中每個角色的 currentAppearance 欄位為準。涉及角色外貌、髮型、服裝細節時必須與 currentAppearance 一致。
9. **只輸出章節正文**。不要：
   - 加 Author's note、摘要、解釋
   - 加章節標題（# 標題）
   - 加 frontmatter（--- ... ---）
   - 加 code fence 包整段
   - 加「以下是…」「希望…」之類的對話前後綴

【字數規範】

依 targetWordCount 指定；未提供時預設 800~1500 中文字。允許 ±20% 偏差。

【上下文使用優先級】

1. user prompt 中明確指示 > 本章 outline > 既有 story_status > 角色卡 > synopsis
2. 即：使用者剛剛輸入的 userIntent 是最高優先；synopsis 是最遠的背景`;

const SYSTEM_PROMPT_WITH_STYLE_HEADER = `【若有提供寫作風格指南】

請嚴格遵守下方「寫作風格指南」段中的視角、對白、用詞、節奏、禁忌規範。風格指南優先於本系統提示的預設風格（但「嚴格規則」仍不可違反）。

`;

export interface ChapterWriterInput {
  context: ChapterContext;
  chapterNumber: number;
  chapterTitle: string;
  targetWordCount?: { min: number; max: number };
  userIntent?: string;
}

export function buildChapterWriterRequest(
  input: ChapterWriterInput,
  modelId: string,
): GenerateRequest {
  const { context, chapterNumber, chapterTitle, targetWordCount, userIntent } = input;

  const hasStyle = context.writingStyle.trim().length > 0;
  const systemPrompt = hasStyle
    ? `${SYSTEM_PROMPT_BASE}\n\n${SYSTEM_PROMPT_WITH_STYLE_HEADER}---\n寫作風格指南（來自 style.md）：\n\n${context.writingStyle}\n---`
    : SYSTEM_PROMPT_BASE;

  const wordCountDesc = targetWordCount
    ? `目標字數：${targetWordCount.min}~${targetWordCount.max} 中文字`
    : "目標字數：800~1500 中文字（±20%）";

  const parts: string[] = [];

  parts.push(`# 第 ${chapterNumber} 章：${chapterTitle}`);
  parts.push(`\n${wordCountDesc}`);

  // Synopsis
  parts.push("\n## 故事簡介\n\n" + context.synopsis);

  // Story status
  if (context.storyStatus.trim()) {
    parts.push("\n## 目前故事狀態\n\n" + context.storyStatus);
  }

  // Character statuses
  const statusEntries = Object.entries(context.characterStatuses).filter(([, v]) => v.trim());
  if (statusEntries.length > 0) {
    parts.push("\n## 人物狀態");
    for (const [slug, status] of statusEntries) {
      parts.push(`\n### ${slug}\n\n${status}`);
    }
  }

  // Characters with currentAppearance
  if (context.characters.length > 0) {
    parts.push("\n## 出場角色清單");
    for (const c of context.characters) {
      parts.push(`\n### ${c.name}（${c.slug}）`);
      if (c.body) parts.push(c.body);
      if (c.currentAppearance) {
        parts.push(`\n**當前外貌（currentAppearance）**：\n${c.currentAppearance}`);
      }
      if (c.fields.dialoguePace) parts.push(`對話節奏：${c.fields.dialoguePace}`);
      if (c.fields.wordingPreference) parts.push(`用詞偏好：${c.fields.wordingPreference}`);
      if (c.fields.writingAvoid) parts.push(`撰寫迴避：${c.fields.writingAvoid}`);
    }
  }

  // Outline
  if (context.currentOutline) {
    parts.push("\n## 本章大綱\n\n" + context.currentOutline);
  } else {
    parts.push("\n## 本章大綱\n\n（未提供大綱；請在符合故事狀態的前提下自由發揮）");
  }

  // Previous chapter
  if (context.previousChapterFullText) {
    parts.push("\n## 上一章完整內容\n\n" + context.previousChapterFullText);
  } else {
    parts.push("\n## 上一章完整內容\n\n（這是第一章，無前章內容）");
  }

  // User intent
  if (userIntent?.trim()) {
    parts.push(`\n## 使用者額外指示\n\n${userIntent}`);
  }

  parts.push(
    "\n---\n\n現在，請開始撰寫第 " +
      chapterNumber +
      " 章的草稿。本章從新進度繼續，不重述前章。只輸出章節正文。",
  );

  const userPrompt = parts.join("\n");

  return {
    modelId,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4096,
    temperature: 0.7,
  };
}
