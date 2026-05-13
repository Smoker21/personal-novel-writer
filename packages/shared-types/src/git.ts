export interface GitBinaryInfo {
  installed: boolean;
  path?: string;
  version?: string;
}

export type GitChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitFileChange {
  path: string;
  status: GitChangeStatus;
  oldPath?: string;
}

export interface GitStatus {
  clean: boolean;
  branch: string;
  detached: boolean;
  changes: GitFileChange[];
  ahead: number;
  behind: number;
}

// ── M3 git 歷史 UI ────────────────────────────────────────────────────────

export type GitCommitType = "init" | "chapter" | "character" | "status" | "style" | "meta";

export interface GitCommitFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  oldPath?: string;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  message: string;
  type: GitCommitType;
  files: GitCommitFile[];
}

export interface GitLogResponse {
  commits: GitCommit[];
  hasMore: boolean;
}

export interface GitShowResponse {
  content: string;
  size: number;
}

export interface GitDiffResponse {
  unifiedDiff: string;
  additions: number;
  deletions: number;
}

export interface GitRevertRequest {
  sha: string;
  file: string;
}

export interface GitManualCommitRequest {
  message: string;
  files?: string[];
}
