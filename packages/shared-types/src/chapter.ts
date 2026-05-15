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

/** Chapter front-matter (M5 新增 — Spec 003) */
export interface ChapterFrontmatter {
  /** 本章參與角色 slugs（Spec 005 context-collector + Spec 007 status-updater 都讀此欄位）*/
  participants: string[];
  /** 本章劇情大綱 — Spec 005 build-prompt 注入 user prompt */
  outline: string | null;
  /** 本章寫作需求 — Spec 005 build-prompt 注入 user prompt */
  requirements: string | null;
}

export interface ChapterFile {
  number: number;
  title: string;
  path: string;
  /** body only — frontmatter 已剝離；UI 直接顯示這段 */
  content: string;
  mtime: string;
  size: number;
  /** M5：解析後的 frontmatter（缺失 → 預設值） */
  participants: string[];
  outline: string | null;
  requirements: string | null;
  /** M5：原 .md 是否含 frontmatter（migration / debug 用） */
  hasFrontmatter: boolean;
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
  // M5 新增：optional frontmatter 欄位（undefined = 不動，null/[] = 清空）
  participants?: string[];
  outline?: string | null;
  requirements?: string | null;
}

export interface SaveChapterResponse {
  path: string;
  mtime: string;
  size: number;
  commitSha: string | null;
  statusUpdateJobId: string | null;
  // M5 echo back：寫入後的 frontmatter，給 UI 同步用
  participants: string[];
  outline: string | null;
  requirements: string | null;
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
