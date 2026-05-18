/**
 * Provider-level (not project-level) cache for `listModels()` results.
 *
 * Spec 009 — 24h TTL, invalidated when apiKey or endpoint changes (sha256 prefix of
 * the credential is stored as the cache row's "source" so a key change forces refetch).
 */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LLMProviderId, ProviderConfig, ProviderModel } from "@novel-writer/shared-types";
import Database from "better-sqlite3";

const TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = join(homedir(), ".novel-writer", "cache");
const DB_PATH = join(CACHE_DIR, "index.db");

let db: Database.Database | null = null;

async function getDb(): Promise<Database.Database> {
  if (db !== null) return db;
  await mkdir(CACHE_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_models (
      provider_id        TEXT PRIMARY KEY,
      models_json        TEXT NOT NULL,
      fetched_at         TEXT NOT NULL,
      source_apikey_hash TEXT,
      source_endpoint    TEXT
    );
  `);
  return db;
}

function credentialHash(config: ProviderConfig): string {
  const apiKey = config.apiKey ?? "";
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

export interface CachedModels {
  models: ProviderModel[];
  fetchedAt: string;
  fromCache: true;
}

/**
 * Returns cached models iff:
 *  - row exists for providerId
 *  - fetched within 24h
 *  - apiKey/endpoint match the current config (otherwise treat as stale)
 *
 * Returns null on any miss / staleness.
 */
export async function readProviderModelsCache(
  providerId: LLMProviderId,
  config: ProviderConfig,
): Promise<CachedModels | null> {
  const d = await getDb();
  const row = d
    .prepare<
      [string],
      {
        models_json: string;
        fetched_at: string;
        source_apikey_hash: string | null;
        source_endpoint: string | null;
      }
    >(
      `SELECT models_json, fetched_at, source_apikey_hash, source_endpoint
       FROM provider_models WHERE provider_id = ?`,
    )
    .get(providerId);
  if (!row) return null;

  // TTL check
  const fetchedAtMs = Date.parse(row.fetched_at);
  if (!Number.isFinite(fetchedAtMs) || Date.now() - fetchedAtMs > TTL_MS) return null;

  // Credential parity check
  if (row.source_apikey_hash !== null && row.source_apikey_hash !== credentialHash(config)) {
    return null;
  }
  if (row.source_endpoint !== null && row.source_endpoint !== (config.endpoint ?? null)) {
    return null;
  }

  try {
    const models = JSON.parse(row.models_json) as ProviderModel[];
    return { models, fetchedAt: row.fetched_at, fromCache: true };
  } catch {
    return null;
  }
}

export async function writeProviderModelsCache(
  providerId: LLMProviderId,
  config: ProviderConfig,
  models: ProviderModel[],
): Promise<string> {
  const d = await getDb();
  const fetchedAt = new Date().toISOString();
  d.prepare(
    `INSERT INTO provider_models (provider_id, models_json, fetched_at, source_apikey_hash, source_endpoint)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       models_json = excluded.models_json,
       fetched_at = excluded.fetched_at,
       source_apikey_hash = excluded.source_apikey_hash,
       source_endpoint = excluded.source_endpoint`,
  ).run(
    providerId,
    JSON.stringify(models),
    fetchedAt,
    config.apiKey ? credentialHash(config) : null,
    config.endpoint ?? null,
  );
  return fetchedAt;
}

/** Forcefully drop a provider's cache row (e.g. after toggling enabled). */
export async function invalidateProviderModelsCache(providerId: LLMProviderId): Promise<void> {
  const d = await getDb();
  d.prepare(`DELETE FROM provider_models WHERE provider_id = ?`).run(providerId);
}
