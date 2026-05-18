import type { RecentProject } from "@novel-writer/shared-types";
import { canonicalizeProjectPath, hashProjectPath } from "./path-utils.js";
import { readSettings, writeSettings } from "./settings-store.js";

const MAX_ENTRIES = 10;

// Unified hash helper — wraps M5 path-utils for backward compat with existing callers
function hashPath(absPath: string): string {
  return hashProjectPath(absPath);
}

function sortByLastOpened(list: RecentProject[]): RecentProject[] {
  return [...list].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export async function addRecentProject(_hash: string, path: string, title: string): Promise<void> {
  const settings = await readSettings();
  const now = new Date().toISOString();
  // M5 (TD-3): always store canonical path
  const canonicalPath = canonicalizeProjectPath(path);
  const canonicalHash = hashProjectPath(canonicalPath);
  // Match by re-hashing stored paths (don't trust stored hash)
  const existing = settings.recentProjects.findIndex(
    (r) => hashProjectPath(r.path) === canonicalHash,
  );

  // Hoist prev to locals so TypeScript narrowing applies correctly under
  // exactOptionalPropertyTypes — avoids re-evaluating optional chain twice.
  const prev = existing >= 0 ? settings.recentProjects[existing] : undefined;
  const lastChapter = prev?.lastChapter;
  const chapterCount = prev?.chapterCount;

  const entry: RecentProject = {
    hash: canonicalHash,
    path: canonicalPath,
    title,
    lastOpenedAt: now,
    pinned: prev?.pinned ?? false,
    ...(lastChapter !== undefined ? { lastChapter } : {}),
    ...(chapterCount !== undefined ? { chapterCount } : {}),
  };

  let next: RecentProject[];
  if (existing >= 0) {
    next = settings.recentProjects.map((r, i) => (i === existing ? entry : r));
  } else {
    next = [entry, ...settings.recentProjects];
  }

  next = sortByLastOpened(next).slice(0, MAX_ENTRIES);
  await writeSettings({ ...settings, recentProjects: next });
}

export async function removeRecentProject(hash: string): Promise<boolean> {
  const settings = await readSettings();
  const next = settings.recentProjects.filter((r) => r.hash !== hash);
  if (next.length === settings.recentProjects.length) return false;
  await writeSettings({ ...settings, recentProjects: next });
  return true;
}

export async function clearRecentProjects(): Promise<number> {
  const settings = await readSettings();
  const removed = settings.recentProjects.length;
  await writeSettings({ ...settings, recentProjects: [] });
  return removed;
}

export async function updateRecentProjectMeta(
  hash: string,
  patch: Partial<Pick<RecentProject, "lastChapter" | "chapterCount" | "title">>,
): Promise<void> {
  const settings = await readSettings();
  const idx = settings.recentProjects.findIndex((r) => r.hash === hash);
  if (idx < 0) return;
  const updated = { ...settings.recentProjects[idx], ...patch } as RecentProject;
  const next = settings.recentProjects.map((r, i) => (i === idx ? updated : r));
  await writeSettings({ ...settings, recentProjects: next });
}

export async function relocateRecentProject(
  oldHash: string,
  newPath: string,
  newTitle: string,
): Promise<void> {
  const settings = await readSettings();
  const filtered = settings.recentProjects.filter((r) => r.hash !== oldHash);
  // M5 (TD-3): canonicalize new path before hashing & storing
  const canonicalPath = canonicalizeProjectPath(newPath);
  const newHash = hashProjectPath(canonicalPath);
  const newEntry: RecentProject = {
    hash: newHash,
    path: canonicalPath,
    title: newTitle,
    lastOpenedAt: new Date().toISOString(),
    pinned: false,
  };
  await writeSettings({ ...settings, recentProjects: [newEntry, ...filtered] });
}

export function computeProjectHash(absPath: string): string {
  return hashPath(absPath);
}

/**
 * M5 migration (TD-2 / TD-3):
 * Re-canonicalize all stored paths, re-hash to 16-char, and dedupe by hash.
 * Should be called once on app start.
 * Returns the number of entries changed (re-hashed / re-canonicalized / deduped).
 */
export async function migrateRecentProjects(): Promise<{
  rehashed: number;
  recanonicalized: number;
  deduped: number;
}> {
  const settings = await readSettings();
  if (settings.recentProjects.length === 0) {
    return { rehashed: 0, recanonicalized: 0, deduped: 0 };
  }

  let rehashed = 0;
  let recanonicalized = 0;

  // Step 1: re-canonicalize + re-hash each entry
  const updated: RecentProject[] = settings.recentProjects.map((entry) => {
    const canonical = canonicalizeProjectPath(entry.path);
    const newHash = hashProjectPath(canonical);
    if (canonical !== entry.path) recanonicalized++;
    if (newHash !== entry.hash) rehashed++;
    return { ...entry, path: canonical, hash: newHash };
  });

  // Step 2: dedupe by hash — keep max lastOpenedAt
  const byHash = new Map<string, RecentProject>();
  for (const entry of updated) {
    const existing = byHash.get(entry.hash);
    if (!existing || entry.lastOpenedAt > existing.lastOpenedAt) {
      byHash.set(entry.hash, entry);
    }
  }
  const deduped = updated.length - byHash.size;

  if (rehashed === 0 && recanonicalized === 0 && deduped === 0) {
    return { rehashed: 0, recanonicalized: 0, deduped: 0 };
  }

  const next = Array.from(byHash.values()).sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
  await writeSettings({ ...settings, recentProjects: next });

  return { rehashed, recanonicalized, deduped };
}
