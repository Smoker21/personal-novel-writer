import { readdir } from "node:fs/promises";
import { join } from "node:path";

const CHAPTER_PATTERN = /^chapter_(\d+)_.*\.md$/;

export interface ProjectStats {
  chapterCount: number;
  lastChapter: number | null;
}

export async function summarizeProject(projectPath: string): Promise<ProjectStats> {
  const chaptersDir = join(projectPath, "chapters");
  let files: string[];
  try {
    files = await readdir(chaptersDir);
  } catch {
    return { chapterCount: 0, lastChapter: null };
  }

  const chapterNumbers: number[] = [];
  for (const file of files) {
    const num = file.match(CHAPTER_PATTERN)?.[1];
    if (num) {
      chapterNumbers.push(Number.parseInt(num, 10));
    }
  }

  return {
    chapterCount: chapterNumbers.length,
    lastChapter: chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : null,
  };
}
