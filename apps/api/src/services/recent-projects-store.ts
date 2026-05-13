import { createHash } from "node:crypto";
import type { RecentProject } from "@novel-writer/shared-types";
import { readSettings, writeSettings } from "./settings-store.js";

const MAX_ENTRIES = 10;

function hashPath(absPath: string): string {
  return createHash("sha256").update(absPath).digest("hex").slice(0, 16);
}

function sortByLastOpened(list: RecentProject[]): RecentProject[] {
  return [...list].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
}

export async function addRecentProject(
  hash: string,
  path: string,
  title: string,
): Promise<void> {
  const settings = await readSettings();
  const now = new Date().toISOString();
  const existing = settings.recentProjects.findIndex((r) => r.hash === hash);

  // Hoist prev to locals so TypeScript narrowing applies correctly under
  // exactOptionalPropertyTypes — avoids re-evaluating optional chain twice.
  const prev = existing >= 0 ? settings.recentProjects[existing] : undefined;
  const lastChapter = prev?.lastChapter;
  const chapterCount = prev?.chapterCount;

  const entry: RecentProject = {
    hash,
    path,
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
  const newHash = hashPath(newPath);
  const newEntry: RecentProject = {
    hash: newHash,
    path: newPath,
    title: newTitle,
    lastOpenedAt: new Date().toISOString(),
    pinned: false,
  };
  await writeSettings({ ...settings, recentProjects: [newEntry, ...filtered] });
}

export function computeProjectHash(absPath: string): string {
  return hashPath(absPath);
}
