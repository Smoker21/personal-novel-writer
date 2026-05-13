import { readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { countChars } from "@novel-writer/shared-types";
import { sanitizeSlug } from "./sanitize.js";

const CHAPTER_PATTERN = /^chapter_(\d{4})_(.+)\.md$/;

export interface ChapterFile {
  number: number;
  title: string;
  path: string;
  content: string;
  mtime: string;
  size: number;
}

export interface ChapterListEntry {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
}

interface ChapterFileLocation {
  number: number;
  title: string;
  filename: string;
  fullPath: string;
}

async function findChapterFile(
  projectPath: string,
  n: number,
): Promise<ChapterFileLocation | null> {
  const chaptersDir = join(projectPath, "chapters");
  let files: string[];
  try {
    files = await readdir(chaptersDir);
  } catch {
    return null;
  }
  const numStr = String(n).padStart(4, "0");
  for (const file of files) {
    const match = file.match(CHAPTER_PATTERN);
    if (match?.[1] === numStr && match[2] !== "prompt") {
      return {
        number: n,
        title: match[2] ?? "",
        filename: file,
        fullPath: join(chaptersDir, file),
      };
    }
  }
  return null;
}

export async function readChapter(projectPath: string, n: number): Promise<ChapterFile | null> {
  const loc = await findChapterFile(projectPath, n);
  if (!loc) return null;
  const content = await readFile(loc.fullPath, "utf-8");
  const s = await stat(loc.fullPath);
  return {
    number: loc.number,
    title: loc.title,
    path: loc.fullPath,
    content,
    mtime: s.mtime.toISOString(),
    size: s.size,
  };
}

export async function listChapters(projectPath: string): Promise<ChapterListEntry[]> {
  const chaptersDir = join(projectPath, "chapters");
  let files: string[];
  try {
    files = await readdir(chaptersDir);
  } catch {
    return [];
  }
  const entries: ChapterListEntry[] = [];
  const seenNumbers = new Set<number>();
  for (const file of files) {
    const match = file.match(CHAPTER_PATTERN);
    if (!match || !match[1] || match[2] === "prompt") continue;
    const num = Number.parseInt(match[1], 10);
    if (seenNumbers.has(num)) continue;
    seenNumbers.add(num);
    const fullPath = join(chaptersDir, file);
    const [content, s] = await Promise.all([readFile(fullPath, "utf-8"), stat(fullPath)]);
    const promptFile = `chapter_${match[1]}_prompt.md`;
    const hasPromptFile = files.includes(promptFile);
    entries.push({
      number: num,
      title: match[2] ?? "",
      path: fullPath,
      wordCount: countChars(content),
      mtime: s.mtime.toISOString(),
      hasPromptFile,
    });
  }
  entries.sort((a, b) => a.number - b.number);
  return entries;
}

export async function createChapter(projectPath: string, title?: string): Promise<ChapterFile> {
  const existing = await listChapters(projectPath);
  const nextNum = existing.length > 0 ? Math.max(...existing.map((c) => c.number)) + 1 : 1;
  const finalTitle = title?.trim() || "未命名";
  const slugged = sanitizeSlug(finalTitle);
  const numStr = String(nextNum).padStart(4, "0");
  const filename = `chapter_${numStr}_${slugged}.md`;
  const fullPath = join(projectPath, "chapters", filename);
  await writeFile(fullPath, "", "utf-8");
  const s = await stat(fullPath);
  return {
    number: nextNum,
    title: slugged,
    path: fullPath,
    content: "",
    mtime: s.mtime.toISOString(),
    size: 0,
  };
}

export interface SaveChapterParams {
  projectPath: string;
  chapterNumber: number;
  content: string;
  title: string;
  expectedMtime?: string;
}

export type SaveChapterResult =
  | { ok: true; path: string; mtime: string; size: number; renamed: boolean }
  | { ok: false; code: "MTIME_MISMATCH" | "RENAME_CONFLICT" | "INVALID_TITLE"; message: string };

export async function saveChapter(params: SaveChapterParams): Promise<SaveChapterResult> {
  const { projectPath, chapterNumber, content, title, expectedMtime } = params;

  let slugged: string;
  try {
    slugged = sanitizeSlug(title);
  } catch (err) {
    return {
      ok: false,
      code: "INVALID_TITLE",
      message: err instanceof Error ? err.message : "invalid title",
    };
  }

  const loc = await findChapterFile(projectPath, chapterNumber);
  if (!loc) {
    return { ok: false, code: "MTIME_MISMATCH", message: "chapter not found" };
  }

  if (expectedMtime !== undefined) {
    const s = await stat(loc.fullPath);
    if (s.mtime.toISOString() !== expectedMtime) {
      return { ok: false, code: "MTIME_MISMATCH", message: "external modification detected" };
    }
  }

  const numStr = String(chapterNumber).padStart(4, "0");
  const newFilename = `chapter_${numStr}_${slugged}.md`;
  const newPath = join(projectPath, "chapters", newFilename);
  const renamed = newFilename !== loc.filename;

  if (renamed) {
    try {
      await stat(newPath);
      return { ok: false, code: "RENAME_CONFLICT", message: `target file exists: ${newFilename}` };
    } catch {
      // not exists, OK
    }
  }

  await writeFile(newPath, content, "utf-8");
  if (renamed && newPath !== loc.fullPath) {
    await rm(loc.fullPath, { force: true });
  }

  const s = await stat(newPath);
  return {
    ok: true,
    path: newPath,
    mtime: s.mtime.toISOString(),
    size: s.size,
    renamed,
  };
}

export async function renameChapter(
  projectPath: string,
  n: number,
  newTitle: string,
): Promise<{ oldPath: string; newPath: string }> {
  const loc = await findChapterFile(projectPath, n);
  if (!loc) throw new Error(`chapter ${n} not found`);
  const slugged = sanitizeSlug(newTitle);
  const numStr = String(n).padStart(4, "0");
  const newFilename = `chapter_${numStr}_${slugged}.md`;
  const newPath = join(projectPath, "chapters", newFilename);
  await rename(loc.fullPath, newPath);
  return { oldPath: loc.fullPath, newPath };
}

export async function deleteChapter(
  projectPath: string,
  n: number,
): Promise<{ deletedPath: string }> {
  const loc = await findChapterFile(projectPath, n);
  if (!loc) throw new Error(`chapter ${n} not found`);
  await rm(loc.fullPath, { force: true });
  return { deletedPath: loc.fullPath };
}
