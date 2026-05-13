export type ProjectHash = string;

export interface ProjectMeta {
  title: string;
  createdAt: string;
  schemaVersion: 1;
  chapterNumbering?: { digits: number };
  defaultModels?: { agent?: string; skill?: string };
}

/** Minimal character record for initial project creation (pre-M2 schema). */
export interface InitialCharacterCard {
  slug: string;
  name: string;
  description: string;
}

export interface ChapterRef {
  number: number;
  title: string;
  path: string;
}

export interface RecentProject {
  hash: ProjectHash;
  path: string;
  title: string;
  lastOpenedAt: string;
  pinned: boolean;
  lastChapter?: number;
  chapterCount?: number;
}

export interface CreateNovelRequest {
  parentFolder: string;
  title: string;
  synopsis: string;
  characters: Array<{ name: string; description: string }>;
}

export interface CreateNovelResponse {
  project: { path: string; title: string; createdAt: string };
  firstChapter: ChapterRef;
}

export interface ProjectSummary {
  hash: string;
  path: string;
  title: string;
  schemaVersion: number;
  createdAt: string;
  chapterCount: number;
  lastChapter: number | null;
}

export interface ProjectOpenWarning {
  code: "no_git_repo" | "git_dirty" | "outdated_schema" | "missing_optional_file";
  message: string;
  suggestedAction?: string;
  fixAction?: { type: "init_git" | "create_file"; params?: Record<string, unknown> };
}

export interface OpenProjectRequest {
  path: string;
  source: "recent-list" | "browse";
  forceOpen?: boolean;
}

export interface OpenProjectResponse {
  project: ProjectSummary;
  warnings: ProjectOpenWarning[];
}

export type CreateNovelErrorCode =
  | "INVALID_INPUT"
  | "INVALID_PATH"
  | "WRITE_FORBIDDEN"
  | "PROJECT_CONFLICT"
  | "IO_ERROR";

export type OpenProjectErrorCode =
  | "INVALID_PATH"
  | "PATH_NOT_FOUND"
  | "MISSING_PROJECT_YAML"
  | "CORRUPTED_PROJECT_YAML"
  | "SCHEMA_VERSION_TOO_NEW"
  | "IO_ERROR";

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

// ── M3 採用流程 ───────────────────────────────────────────────────────────

export interface UndoEntry {
  id: string;
  type: "adopt-draft" | "apply-skill";
  projectHash: string;
  chapterNumber: number;
  draftId?: string;
  targetMainPath: string;
  promptMarkerStartOffset: number | null;
  label: string;
  createdAt: string;
  undone: boolean;
}

export interface AdoptRequest {
  draftId: string;
  confirmed: true;
  force?: boolean;
}

export interface AdoptResponse {
  mainPath: string;
  promptPath: string;
  statusUpdateJobId: string;
  undoEntry: { id: string; label: string };
}

export interface UnadoptRequest {
  undoEntryId: string;
}
