import Dexie, { type Table } from "dexie";

export interface DraftRow {
  id: string;
  projectHash: string;
  chapterNumber: number;
  content: string;
  title: string;
  updatedAt: number;
  baseMtime: string;
  /** M5 (Spec 003): frontmatter dirty state autosave；切章不掉。undefined = 未在 UI 編輯過 */
  participants?: string[];
  outline?: string | null;
  requirements?: string | null;
}

class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;

  constructor() {
    super("novel-writer");
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber], updatedAt",
    });
    this.version(2)
      .stores({
        drafts: "id, projectHash, [projectHash+chapterNumber], updatedAt",
      })
      .upgrade(() => {
        // 三個 frontmatter 欄位皆為 optional；舊 row 不需 migration。
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
