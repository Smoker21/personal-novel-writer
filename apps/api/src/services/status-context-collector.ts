import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readChapter } from "./chapter-fs.js";
import { listCharacters, readCharacter } from "./character-fs.js";

export interface StatusUpdateContext {
  chapterNumber: number;
  chapterTitle: string;
  chapterText: string;
  currentStoryStatus: string;
  characterStatuses: Record<string, string>;
  relevantCharacters: Array<{
    slug: string;
    name: string;
    card: string;
    status: string;
  }>;
}

async function readFileSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

export async function collectStatusContext(
  projectPath: string,
  chapterNumber: number,
): Promise<StatusUpdateContext> {
  const chapter = await readChapter(projectPath, chapterNumber);
  if (!chapter) throw Object.assign(new Error("Chapter not found"), { code: "INVALID_CHAPTER" });

  const currentStoryStatus = await readFileSafe(join(projectPath, "status", "story_status.md"));
  const charList = await listCharacters(projectPath);

  const characterStatuses: Record<string, string> = {};
  const relevantCharacters: StatusUpdateContext["relevantCharacters"] = [];

  for (const item of charList) {
    const char = await readCharacter(projectPath, item.slug);
    if (!char) continue;
    const statusPath = join(projectPath, "characters", `${item.slug}_status.md`);
    const statusContent = await readFileSafe(statusPath);
    characterStatuses[item.slug] = statusContent;

    // Include character if mentioned in chapter text (substring match) or few characters total
    if (chapter.content.includes(char.fields.name) || charList.length <= 3) {
      relevantCharacters.push({
        slug: item.slug,
        name: char.fields.name,
        card: char.body,
        status: statusContent,
      });
    }
  }

  return {
    chapterNumber,
    chapterTitle: chapter.title,
    chapterText: chapter.content,
    currentStoryStatus,
    characterStatuses,
    relevantCharacters,
  };
}
