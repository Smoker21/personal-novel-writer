import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DBS = new Map<string, Database.Database>();

function dbPath(projectHash: string): string {
  return join(homedir(), ".novel-writer", "cache", projectHash, "index.db");
}

/**
 * Return (or create) the SQLite DB for the given project hash.
 * Schema is created on first access. Subsequent calls return the cached instance.
 */
export async function getDb(projectHash: string): Promise<Database.Database> {
  const cached = DBS.get(projectHash);
  if (cached !== undefined) return cached;

  const cacheDir = join(homedir(), ".novel-writer", "cache", projectHash);
  await mkdir(cacheDir, { recursive: true });

  const db = new Database(dbPath(projectHash));
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      draft_id     TEXT PRIMARY KEY,
      project_hash TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      status       TEXT NOT NULL,
      model_id     TEXT NOT NULL,
      context_hash TEXT NOT NULL,
      total_chars  INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at   TEXT NOT NULL,
      completed_at TEXT,
      error_code   TEXT,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_project_chapter
      ON drafts(project_hash, chapter_number);

    CREATE TABLE IF NOT EXISTS undo_entries (
      id             TEXT PRIMARY KEY,
      type           TEXT NOT NULL,
      project_hash   TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      draft_id       TEXT,
      target_main_path TEXT NOT NULL,
      prompt_marker_start_offset INTEGER,
      label          TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      undone         INTEGER NOT NULL DEFAULT 0
    );
  `);

  DBS.set(projectHash, db);
  return db;
}
