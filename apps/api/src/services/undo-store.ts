import type { UndoEntry } from "@novel-writer/shared-types";
import { getDb } from "./cache-db.js";

/**
 * Create an undo entry. The caller provides all fields including `id`
 * (generated before calling so it can be embedded in prompt.md markers).
 */
export async function createUndoEntry(
  entry: Omit<UndoEntry, "createdAt" | "undone">,
): Promise<UndoEntry> {
  const full: UndoEntry = {
    id: entry.id,
    type: entry.type,
    projectHash: entry.projectHash,
    chapterNumber: entry.chapterNumber,
    ...(entry.draftId !== undefined ? { draftId: entry.draftId } : {}),
    targetMainPath: entry.targetMainPath,
    promptMarkerStartOffset: entry.promptMarkerStartOffset,
    label: entry.label,
    createdAt: new Date().toISOString(),
    undone: false,
  };
  const db = await getDb(entry.projectHash);
  db.prepare(
    `INSERT INTO undo_entries
      (id, type, project_hash, chapter_number, draft_id, target_main_path,
       prompt_marker_start_offset, label, created_at, undone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    full.id,
    full.type,
    full.projectHash,
    full.chapterNumber,
    full.draftId ?? null,
    full.targetMainPath,
    full.promptMarkerStartOffset,
    full.label,
    full.createdAt,
  );
  return full;
}

export async function getUndoEntry(projectHash: string, id: string): Promise<UndoEntry | null> {
  const db = await getDb(projectHash);
  const row = db
    .prepare(`SELECT * FROM undo_entries WHERE id = ? AND project_hash = ?`)
    .get(id, projectHash) as Record<string, unknown> | undefined;
  if (!row) return null;
  const draftIdRaw = row["draft_id"] as string | null;
  return {
    id: row["id"] as string,
    type: row["type"] as UndoEntry["type"],
    projectHash: row["project_hash"] as string,
    chapterNumber: row["chapter_number"] as number,
    ...(draftIdRaw ? { draftId: draftIdRaw } : {}),
    targetMainPath: row["target_main_path"] as string,
    promptMarkerStartOffset: row["prompt_marker_start_offset"] as number | null,
    label: row["label"] as string,
    createdAt: row["created_at"] as string,
    undone: Boolean(row["undone"]),
  };
}

export async function markUndone(projectHash: string, id: string): Promise<boolean> {
  const db = await getDb(projectHash);
  const result = db
    .prepare(`UPDATE undo_entries SET undone = 1 WHERE id = ? AND project_hash = ? AND undone = 0`)
    .run(id, projectHash);
  return result.changes > 0;
}
