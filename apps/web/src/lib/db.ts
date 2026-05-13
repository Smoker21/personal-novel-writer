import Dexie, { type Table } from "dexie";

export interface DraftRow {
  id: string;
  projectHash: string;
  chapterNumber: number;
  content: string;
  title: string;
  updatedAt: number;
  baseMtime: string;
}

class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;

  constructor() {
    super("novel-writer");
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber], updatedAt",
    });
  }
}

export const db = new NovelWriterDB();

export function draftKey(projectHash: string, chapterNumber: number): string {
  return `${projectHash}:chapter:${chapterNumber}:draft`;
}

export async function getDraft(
  projectHash: string,
  chapterNumber: number,
): Promise<DraftRow | undefined> {
  return db.drafts.get(draftKey(projectHash, chapterNumber));
}

export async function putDraft(row: DraftRow): Promise<void> {
  await db.drafts.put(row);
}

export async function deleteDraft(projectHash: string, chapterNumber: number): Promise<void> {
  await db.drafts.delete(draftKey(projectHash, chapterNumber));
}
