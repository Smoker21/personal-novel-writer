import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { countMessageTokens } from "@novel-writer/llm-adapter";
import type { ChapterContext, CharacterCardInContext } from "@novel-writer/shared-types";
import { listChapters, readChapter } from "./chapter-fs.js";
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
}

export async function collectChapterContext(opts: CollectOptions): Promise<ChapterContext> {
  const { projectPath, chapterNumber, modelContextWindow = 32_768 } = opts;

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

  // Required: at least one character
  if (charList.length === 0) {
    throw Object.assign(new Error("No characters found; add at least one character card"), {
      code: "MISSING_CONTEXT",
    });
  }

  // Build CharacterCardInContext with chapter-sensitive appearance
  const characters: CharacterCardInContext[] = [];
  for (const item of charList) {
    const char = await readCharacter(projectPath, item.slug);
    if (!char) continue;
    characters.push({
      slug: char.slug,
      name: char.fields.name,
      fields: char.fields,
      body: char.body,
      currentAppearance: lookupAppearance(char.fields, chapterNumber),
    });
  }

  // Outline from chapter outline file (if exists)
  const chapters = await listChapters(projectPath);
  const chapterEntry = chapters.find((c) => c.number === chapterNumber);
  if (!chapterEntry) {
    throw Object.assign(new Error(`Chapter ${chapterNumber} not found`), {
      code: "INVALID_CHAPTER",
    });
  }

  // Try to read an outline file (outline_NNNN.md or embedded in chapter prompt)
  const outlineN = String(chapterNumber).padStart(4, "0");
  const currentOutline =
    (await readFileSafe(join(projectPath, "outlines", `outline_${outlineN}.md`))) || null;

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
        currentOutline,
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
    currentOutline: currentOutline || null,
    previousChapterFullText: finalPrevChapter,
    contextHash,
  };
}
