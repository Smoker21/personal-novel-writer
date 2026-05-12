import { getDb } from './idb';
import type {
  Project,
  Character,
  Chapter,
  StatusDoc,
  Commit,
  Settings,
  RecentProjectEntry,
} from '@/types';

// ---------- Project ----------

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  return db.getAll('projects');
}

export async function getProject(slug: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get('projects', slug);
}

export async function putProject(p: Project): Promise<void> {
  const db = await getDb();
  await db.put('projects', p);
}

export async function touchProject(slug: string): Promise<void> {
  const db = await getDb();
  const p = await db.get('projects', slug);
  if (!p) return;
  p.lastOpenedAt = Date.now();
  await db.put('projects', p);
}

export async function listRecentProjects(limit = 8): Promise<RecentProjectEntry[]> {
  const db = await getDb();
  const all = await db.getAll('projects');
  const sorted = [...all].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, limit);
  const result: RecentProjectEntry[] = [];
  for (const p of sorted) {
    const chapters = await db.getAllFromIndex('chapters', 'by-project', p.slug);
    result.push({
      slug: p.slug,
      name: p.name,
      path: p.path,
      lastOpenedAt: p.lastOpenedAt,
      chapterCount: chapters.length,
    });
  }
  return result;
}

// ---------- Character ----------

export async function listCharacters(projectSlug: string): Promise<Character[]> {
  const db = await getDb();
  return db.getAllFromIndex('characters', 'by-project', projectSlug);
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const db = await getDb();
  return db.get('characters', id);
}

export async function putCharacter(c: Character): Promise<void> {
  const db = await getDb();
  c.updatedAt = Date.now();
  await db.put('characters', c);
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('characters', id);
}

// ---------- Chapter ----------

export async function listChapters(projectSlug: string): Promise<Chapter[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('chapters', 'by-project', projectSlug);
  return all.sort((a, b) => a.number - b.number);
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  const db = await getDb();
  return db.get('chapters', id);
}

export async function getChapterByNumber(
  projectSlug: string,
  number: number,
): Promise<Chapter | undefined> {
  const db = await getDb();
  return db.getFromIndex('chapters', 'by-project-number', [projectSlug, number]);
}

export async function putChapter(ch: Chapter): Promise<void> {
  const db = await getDb();
  ch.updatedAt = Date.now();
  ch.wordCount = countChars(ch.content);
  await db.put('chapters', ch);
}

export async function deleteChapter(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('chapters', id);
}

export function countChars(s: string): number {
  // Chinese-friendly: count non-whitespace characters
  return s.replace(/\s/g, '').length;
}

// ---------- Status docs ----------

export async function getStoryStatus(projectSlug: string): Promise<StatusDoc | undefined> {
  const db = await getDb();
  return db.get('status', `${projectSlug}:story`);
}

export async function getCharacterStatus(
  projectSlug: string,
  charId: string,
): Promise<StatusDoc | undefined> {
  const db = await getDb();
  return db.get('status', `${projectSlug}:char:${charId}`);
}

export async function putStatus(s: StatusDoc): Promise<void> {
  const db = await getDb();
  s.updatedAt = Date.now();
  await db.put('status', s);
}

// ---------- Commits ----------

export async function listCommits(fileKey: string): Promise<Commit[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('commits', 'by-file', fileKey);
  return all.sort((a, b) => b.authorTime - a.authorTime);
}

export async function putCommit(c: Commit): Promise<void> {
  const db = await getDb();
  await db.put('commits', c);
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings | undefined> {
  const db = await getDb();
  return db.get('settings', 'singleton');
}

export async function putSettings(s: Settings): Promise<void> {
  const db = await getDb();
  await db.put('settings', s);
}

export function isLlmConfigured(s?: Settings): boolean {
  if (!s) return false;
  return s.providers.some(
    (p) => p.enabled && p.testStatus === 'success',
  );
}
