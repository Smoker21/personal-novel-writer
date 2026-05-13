import { stat } from "node:fs/promises";

export async function getChapterMtime(filePath: string): Promise<string | null> {
  try {
    const s = await stat(filePath);
    return s.mtime.toISOString();
  } catch {
    return null;
  }
}
