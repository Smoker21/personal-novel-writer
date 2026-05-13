import Dexie, { type Table } from "dexie";

export interface DraftRow {
  id: string;                       // "<projectHash>:chapter:<N>:draft"
  projectHash: string;
  chapterNumber: number;
  content: string;
  updatedAt: number;
}

class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;

  constructor() {
    super("novel-writer-v2");        // 新 DB name，避免與 prototype 的 "novel-writer" 衝突
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber]",
    });
  }
}

export const db = new NovelWriterDB();
