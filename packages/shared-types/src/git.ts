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
