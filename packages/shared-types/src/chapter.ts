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

/** 中文/英文/標點都算一個字；忽略空白與換行 */
export function countChars(text: string): number {
  return [...text].filter((c) => !/\s/.test(c)).length;
}
