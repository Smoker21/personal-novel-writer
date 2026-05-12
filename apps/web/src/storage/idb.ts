import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Project,
  Character,
  Chapter,
  StatusDoc,
  Commit,
  Settings,
} from '@/types';

interface NovelWriterDB extends DBSchema {
  projects: {
    key: string;             // slug
    value: Project;
    indexes: { 'by-lastOpened': number };
  };
  characters: {
    key: string;             // id
    value: Character;
    indexes: { 'by-project': string };
  };
  chapters: {
    key: string;             // id
    value: Chapter;
    indexes: { 'by-project': string; 'by-project-number': [string, number] };
  };
  status: {
    key: string;             // composite id
    value: StatusDoc;
    indexes: { 'by-project': string };
  };
  commits: {
    key: string;             // commit id
    value: Commit;
    indexes: { 'by-file': string; 'by-project': string };
  };
  settings: {
    key: string;             // 'singleton'
    value: Settings;
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'novel-writer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NovelWriterDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<NovelWriterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NovelWriterDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          const s = db.createObjectStore('projects', { keyPath: 'slug' });
          s.createIndex('by-lastOpened', 'lastOpenedAt');
        }
        if (!db.objectStoreNames.contains('characters')) {
          const s = db.createObjectStore('characters', { keyPath: 'id' });
          s.createIndex('by-project', 'projectSlug');
        }
        if (!db.objectStoreNames.contains('chapters')) {
          const s = db.createObjectStore('chapters', { keyPath: 'id' });
          s.createIndex('by-project', 'projectSlug');
          s.createIndex('by-project-number', ['projectSlug', 'number']);
        }
        if (!db.objectStoreNames.contains('status')) {
          const s = db.createObjectStore('status', { keyPath: 'id' });
          s.createIndex('by-project', 'projectSlug');
        }
        if (!db.objectStoreNames.contains('commits')) {
          const s = db.createObjectStore('commits', { keyPath: 'id' });
          s.createIndex('by-file', 'fileKey');
          s.createIndex('by-project', 'projectSlug');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const v = await db.get('meta', key);
  return v?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('meta', { key, value });
}
