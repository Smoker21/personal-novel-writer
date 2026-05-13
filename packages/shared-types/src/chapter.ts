export interface Chapter {
  number: number;
  title: string;
  content: string;
  charCount: number;
  mtime: string;
}

export interface ChapterSummary {
  number: number;
  title: string;
  charCount: number;
  mtime: string;
}

export interface ChapterFile {
  number: number;
  title: string;
  path: string;
  content: string;
  mtime: string;
  size: number;
}

export interface ChapterListItem {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
}

export interface SaveChapterRequest {
  content: string;
  title: string;
  expectedMtime?: string;
}

export interface SaveChapterResponse {
  path: string;
  mtime: string;
  size: number;
  commitSha: string | null;
  statusUpdateJobId: string | null;
}

export type SaveChapterErrorCode =
  | "INVALID_TITLE"
  | "MTIME_MISMATCH"
  | "RENAME_CONFLICT"
  | "IO_ERROR";

export interface CreateChapterRequest {
  title?: string;
}

export interface CreateChapterResponse {
  number: number;
  title: string;
  path: string;
}

/** 中文/英文/標點都算一個字；忽略空白與換行 */
export function countChars(text: string): number {
  return [...text].filter((c) => !/\s/.test(c)).length;
}
