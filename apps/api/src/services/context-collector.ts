import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  countMessageTokens,
  type StructuredNovelGenerateParams,
} from "@novel-writer/llm-adapter";
import type { ChapterContext, CharacterCardInContext } from "@novel-writer/shared-types";
import { readChapter } from "./chapter-fs.js";
import { listCharacters, lookupAppearance, readCharacter } from "./character-fs.js";

async function readFileSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

export interface CollectOptions {
  projectPath: string;
  chapterNumber: number;
  modelContextWindow?: number;
  /**
   * M5 (Spec 005): only include character cards + statuses for these slugs.
   * - undefined → fall back to chapter frontmatter `participants` (if any) or all characters (backward compat).
   * - empty array → no character cards in context.
   */
  participantSlugs?: string[];
  /** M5: override chapter outline (build-prompt request can supply). Falls back to chapter.outline. */
  outlineOverride?: string | null;
  /** M5: override chapter requirements. Falls back to chapter.requirements. */
  requirementsOverride?: string | null;
}

export class InvalidParticipantError extends Error {
  code = "INVALID_PARTICIPANT" as const;
  missingSlugs: string[];
  constructor(missing: string[]) {
    super(`Unknown participant slug(s): ${missing.join(", ")}`);
    this.missingSlugs = missing;
  }
}

export async function collectChapterContext(opts: CollectOptions): Promise<ChapterContext> {
  const {
    projectPath,
    chapterNumber,
    modelContextWindow = 32_768,
    participantSlugs,
    outlineOverride,
    requirementsOverride,
  } = opts;

  // Required: synopsis
  const synopsis = await readFileSafe(join(projectPath, "synopsis.md"));
  if (!synopsis.trim()) {
    throw Object.assign(new Error("synopsis.md is empty or missing"), { code: "MISSING_CONTEXT" });
  }

  // Optional: style.md
  const writingStyle = await readFileSafe(join(projectPath, "style.md"));

  // Optional: story status
  const storyStatus = await readFileSafe(join(projectPath, "status", "story_status.md"));

  // Character statuses: one file per character slug
  const charList = await listCharacters(projectPath);
  const characterStatuses: Record<string, string> = {};
  for (const c of charList) {
    const statusPath = join(projectPath, "characters", `${c.slug}_status.md`);
    const content = await readFileSafe(statusPath);
    if (content.trim()) {
      characterStatuses[c.slug] = content;
    }
  }

  // Required: at least one character in the project
  if (charList.length === 0) {
    throw Object.assign(new Error("No characters found; add at least one character card"), {
      code: "MISSING_CONTEXT",
    });
  }

  // Resolve effective participant list (M5 Spec 005):
  // - explicit participantSlugs from caller → use directly (after validation)
  // - undefined → fall back to chapter frontmatter `participants`
  // - chapter frontmatter empty → fall back to all characters (M4 backward compat)
  const chapterEntry = await readChapter(projectPath, chapterNumber);
  if (!chapterEntry) {
    throw Object.assign(new Error(`Chapter ${chapterNumber} not found`), {
      code: "INVALID_CHAPTER",
    });
  }
  let effectiveSlugs: string[];
  if (participantSlugs !== undefined) {
    effectiveSlugs = participantSlugs;
  } else if (chapterEntry.participants.length > 0) {
    effectiveSlugs = chapterEntry.participants;
  } else {
    effectiveSlugs = charList.map((c) => c.slug);
  }

  // Validate slugs exist
  const knownSlugs = new Set(charList.map((c) => c.slug));
  const missing = effectiveSlugs.filter((s) => !knownSlugs.has(s));
  if (missing.length > 0) {
    throw new InvalidParticipantError(missing);
  }

  // Build CharacterCardInContext for effective participants
  const characters: CharacterCardInContext[] = [];
  for (const slug of effectiveSlugs) {
    const char = await readCharacter(projectPath, slug);
    if (!char) continue;
    characters.push({
      slug: char.slug,
      name: char.fields.name,
      fields: char.fields,
      body: char.body,
      currentAppearance: lookupAppearance(char.fields, chapterNumber),
    });
  }

  // Outline: prefer override > chapter frontmatter > legacy outline file
  const outlineN = String(chapterNumber).padStart(4, "0");
  const legacyOutline =
    (await readFileSafe(join(projectPath, "outlines", `outline_${outlineN}.md`))) || null;
  const currentOutline =
    outlineOverride !== undefined ? outlineOverride : (chapterEntry.outline ?? legacyOutline);

  // Requirements: prefer override > chapter frontmatter
  const currentRequirements =
    requirementsOverride !== undefined ? requirementsOverride : chapterEntry.requirements;

  // Previous chapter full text
  let previousChapterFullText: string | null = null;
  if (chapterNumber > 1) {
    const prev = await readChapter(projectPath, chapterNumber - 1);
    if (prev) previousChapterFullText = prev.content || null;
  }

  // Token guard (rough estimate)
  const MAX_TOKENS = Math.floor(modelContextWindow * 0.75);
  const allText = [
    synopsis,
    writingStyle,
    storyStatus,
    ...Object.values(characterStatuses),
    ...characters.map((c) => `${c.body}\n${c.currentAppearance}`),
    currentOutline ?? "",
    previousChapterFullText ?? "",
  ].join("\n");

  const estimatedTokens = await countMessageTokens("", [{ role: "user", content: allText }]);

  let finalCharacters = characters;
  let finalPrevChapter = previousChapterFullText;

  if (estimatedTokens > MAX_TOKENS) {
    // Reduction step 1: cap characters to 5
    finalCharacters = characters.slice(0, 5);
  }

  if (estimatedTokens > MAX_TOKENS && finalPrevChapter) {
    // Reduction step 2: truncate previous chapter to last 2000 chars
    finalPrevChapter = finalPrevChapter.slice(-2000);
  }

  if (estimatedTokens > MAX_TOKENS * 1.2) {
    throw Object.assign(new Error("Context too large to fit model window"), {
      code: "CONTEXT_TOO_LARGE",
    });
  }

  const contextHash = createHash("sha256")
    .update(
      JSON.stringify({
        synopsis,
        writingStyle,
        storyStatus,
        characterStatuses,
        characters: finalCharacters.map((c) => ({ slug: c.slug, appearance: c.currentAppearance })),
        participantSlugs: effectiveSlugs,
        currentOutline,
        currentRequirements,
        previousChapterFullText: finalPrevChapter,
      }),
    )
    .digest("hex")
    .slice(0, 12);

  return {
    synopsis,
    writingStyle,
    storyStatus,
    characterStatuses,
    characters: finalCharacters,
    participantSlugs: effectiveSlugs,
    currentOutline: currentOutline || null,
    currentRequirements,
    previousChapterFullText: finalPrevChapter,
    contextHash,
  };
}

// ---------------------------------------------------------------------------
// M6 (Spec 005 / 011 / ADR-0010): structured-path input 蒐集。
//
// 對應 xiaohuangwen `POST /api/v1/generate` 5 欄；apps/api 端組裝（adapter 只負責呼 API）。
// 欄位對應表（spec 011）：
//   plot         ← chapter front-matter `outline`（缺則空字串）
//   background   ← 選定 characters 的 body 拼接 + story_status 摘要
//   requirements ← chapter front-matter `requirements`
//   pre_summary  ← story_status.md「## 故事摘要」段
//   prev_segment ← 前章 .md 末段（最後 2000 codepoint，與 text-count.ts 一致）
// ---------------------------------------------------------------------------

/** 從 story_status.md 抽出「## 故事摘要」段（不含 heading）；找不到回空字串。 */
export function extractStorySummarySection(storyStatus: string): string {
  if (!storyStatus) return "";
  const heading = "## 故事摘要";
  const idx = storyStatus.indexOf(heading);
  if (idx === -1) return "";
  const after = storyStatus.slice(idx + heading.length);
  // 取到下一個 `## ` heading 為止；若無則到結尾
  const nextHeadingMatch = after.match(/\n##\s/);
  const body = nextHeadingMatch ? after.slice(0, nextHeadingMatch.index) : after;
  return body.trim();
}

/** 取字串末尾 N 個 codepoint（與 text-count.ts 規則一致；不切 surrogate pair）。 */
export function lastCodepoints(text: string, n: number): string {
  const cps = [...text];
  if (cps.length <= n) return text;
  return cps.slice(cps.length - n).join("");
}

/** 把 characters 與 story_status 拼成 background 欄位。 */
function buildBackground(context: ChapterContext): string {
  const parts: string[] = [];
  for (const c of context.characters) {
    // body 已含「## 角色描述（手動）」+「## AI 統整敘述」兩段（見 character-fs.joinBody）
    parts.push(`# ${c.name} (${c.slug})\n\n${c.body}\n\n外貌：${c.currentAppearance}`);
  }
  if (context.storyStatus.trim()) {
    parts.push(`# 故事狀態\n\n${context.storyStatus}`);
  }
  return parts.join("\n\n---\n\n");
}

/**
 * 蒐集結構化 path 的 5 欄輸入。內部呼叫 `collectChapterContext` 重用既有
 * synopsis / characters / status / previous-chapter 載入邏輯。
 */
export async function collectStructuredInputs(
  opts: CollectOptions,
): Promise<{ inputs: StructuredNovelGenerateParams; contextHash: string }> {
  const context = await collectChapterContext(opts);

  const inputs: StructuredNovelGenerateParams = {
    plot: context.currentOutline ?? "",
    background: buildBackground(context),
    requirements: context.currentRequirements ?? "",
    pre_summary: extractStorySummarySection(context.storyStatus),
    prev_segment: context.previousChapterFullText
      ? lastCodepoints(context.previousChapterFullText, 2000)
      : "",
  };

  return { inputs, contextHash: context.contextHash };
}
