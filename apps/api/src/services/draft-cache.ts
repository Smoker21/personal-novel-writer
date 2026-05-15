import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DraftMetadata } from "@novel-writer/shared-types";
import { getDb } from "./cache-db.js";

function draftDir(projectHash: string, chapterNumber: number): string {
  const n = String(chapterNumber).padStart(4, "0");
  return join(homedir(), ".novel-writer", "cache", projectHash, "drafts", `chapter-${n}`);
}

export async function createDraft(meta: DraftMetadata): Promise<void> {
  const dir = draftDir(meta.projectHash, meta.chapterNumber);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "current.draft.md"), "", "utf-8");
  await writeFile(join(dir, "current.meta.json"), JSON.stringify(meta, null, 2), "utf-8");

  const db = await getDb(meta.projectHash);
  db.prepare(
    `INSERT OR REPLACE INTO drafts
      (draft_id, project_hash, chapter_number, status, model_id, context_hash, total_chars, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    meta.draftId,
    meta.projectHash,
    meta.chapterNumber,
    meta.status,
    meta.modelId,
    meta.contextHash,
    0,
    meta.createdAt,
  );
}

export async function appendDraftText(
  projectHash: string,
  chapterNumber: number,
  text: string,
): Promise<void> {
  const dir = draftDir(projectHash, chapterNumber);
  await appendFile(join(dir, "current.draft.md"), text, "utf-8");
}

export async function completeDraft(
  projectHash: string,
  chapterNumber: number,
  draftId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const dir = draftDir(projectHash, chapterNumber);
  const text = await readFile(join(dir, "current.draft.md"), "utf-8").catch(() => "");
  const completedAt = new Date().toISOString();

  const db = await getDb(projectHash);
  db.prepare(
    `UPDATE drafts
     SET status='complete', completed_at=?, total_chars=?, input_tokens=?, output_tokens=?
     WHERE draft_id=?`,
  ).run(completedAt, text.length, usage.inputTokens, usage.outputTokens, draftId);

  const metaRaw = await readFile(join(dir, "current.meta.json"), "utf-8").catch(() => "{}");
  const meta = JSON.parse(metaRaw) as DraftMetadata;
  await writeFile(
    join(dir, "current.meta.json"),
    JSON.stringify(
      { ...meta, status: "complete", completedAt, totalChars: text.length, usage },
      null,
      2,
    ),
    "utf-8",
  );
}

export async function abortDraft(
  projectHash: string,
  chapterNumber: number,
  draftId: string,
): Promise<void> {
  const dir = draftDir(projectHash, chapterNumber);
  const text = await readFile(join(dir, "current.draft.md"), "utf-8").catch(() => "");

  const db = await getDb(projectHash);
  db.prepare(`UPDATE drafts SET status='aborted', total_chars=? WHERE draft_id=?`).run(
    text.length,
    draftId,
  );

  const metaRaw = await readFile(join(dir, "current.meta.json"), "utf-8").catch(() => "{}");
  const meta = JSON.parse(metaRaw) as DraftMetadata;
  await writeFile(
    join(dir, "current.meta.json"),
    JSON.stringify({ ...meta, status: "aborted", totalChars: text.length }, null, 2),
    "utf-8",
  );
}

export async function readDraft(
  projectHash: string,
  chapterNumber: number,
): Promise<{ text: string; meta: DraftMetadata } | null> {
  const dir = draftDir(projectHash, chapterNumber);
  try {
    const [text, metaRaw] = await Promise.all([
      readFile(join(dir, "current.draft.md"), "utf-8"),
      readFile(join(dir, "current.meta.json"), "utf-8"),
    ]);
    return { text, meta: JSON.parse(metaRaw) as DraftMetadata };
  } catch {
    return null;
  }
}

export async function deleteDraft(projectHash: string, chapterNumber: number): Promise<boolean> {
  const dir = draftDir(projectHash, chapterNumber);
  try {
    await rm(dir, { recursive: true, force: true });
    const db = await getDb(projectHash);
    db.prepare("DELETE FROM drafts WHERE project_hash=? AND chapter_number=?").run(
      projectHash,
      chapterNumber,
    );
    return true;
  } catch {
    return false;
  }
}
