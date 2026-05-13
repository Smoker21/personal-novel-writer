import type { CharacterFields } from "./character.js";

export interface CharacterCardInContext {
  slug: string;
  name: string;
  fields: CharacterFields;
  body: string;
  /**
   * 章節敏感外貌：
   *   1. 若 fields.appearanceByChapter[K] 存在且 K ≤ N，取最大 K
   *   2. 否則拼接扁平外貌欄位（hairAndColor / eyes / bodyType / otherFeatures / clothing）
   * chapter-writer 看到的「該角色當前長相」
   */
  currentAppearance: string;
}

export interface ChapterContext {
  synopsis: string;
  writingStyle: string;                              // style.md 完整內容；空字串為缺
  storyStatus: string;
  characterStatuses: Record<string, string>;         // slug → <slug>_status.md 內容
  characters: CharacterCardInContext[];
  currentOutline: string | null;
  previousChapterFullText: string | null;            // 第一章為 null
  contextHash: string;                               // sha256 of above
}

export interface DraftMetadata {
  draftId: string;
  projectHash: string;
  chapterNumber: number;
  chapterTitle: string;
  agentName: "chapter-writer";
  modelId: string;
  contextHash: string;
  status: "running" | "complete" | "aborted" | "errored";
  createdAt: string;
  completedAt?: string;
  totalChars: number;
  usage?: { inputTokens: number; outputTokens: number };
  errorCode?: string;
  errorMessage?: string;
}

export interface PromptSnapshot {
  agentName: string;
  agentVersion: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  context: {
    synopsisHash: string;
    writingStyleHash: string;                        // 2026-05-13 加
    storyStatusHash: string;
    characterStatusHashes: Record<string, string>;   // 一人一檔
    characterHashes: Record<string, string>;
    outlineHash: string | null;
    previousChapterFullTextHash: string | null;
    currentAppearanceHashes: Record<string, string>; // 2026-05-13 加
  };
  generatedAt: string;
  durationMs: number;
}

export interface GenerateChapterRequest {
  agentName: "chapter-writer";
  modelOverride?: string;
  userIntent?: string;
}

export type GenerateErrorCode =
  | "MISSING_CONTEXT"
  | "INVALID_CHAPTER"
  | "PROJECT_NOT_FOUND"
  | "DRAFT_IN_PROGRESS"
  | "CONTEXT_TOO_LARGE";

/** chapter-writer 章節敏感外貌 lookup */
export function lookupAppearance(fields: CharacterFields, currentChapter: number): string {
  const chapters = Object.keys(fields.appearanceByChapter)
    .map(Number)
    .filter((n) => n <= currentChapter)
    .sort((a, b) => b - a);
  const top = chapters[0];
  if (top !== undefined) {
    const v = fields.appearanceByChapter[top];
    if (v) return v;
  }
  const parts = [
    fields.hairAndColor,
    fields.eyes,
    fields.bodyType,
    fields.otherFeatures,
    fields.clothing ? `服裝：${fields.clothing}` : null,
  ].filter((s): s is string => Boolean(s));
  return parts.length > 0 ? parts.join("\n") : "（無外貌描述）";
}
