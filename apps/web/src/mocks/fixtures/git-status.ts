import type { GitBinaryInfo, GitStatus } from "@novel-writer/shared-types";

export const mockCleanStatus: GitStatus = {
  clean: true,
  branch: "main",
  detached: false,
  changes: [],
  ahead: 0,
  behind: 0,
};

export const mockDirtyStatus: GitStatus = {
  clean: false,
  branch: "main",
  detached: false,
  changes: [{ path: "chapters/c1.md", status: "modified" }],
  ahead: 0,
  behind: 0,
};

export const mockGitBinaryInstalled: GitBinaryInfo = {
  installed: true,
  path: "/usr/bin/git",
  version: "2.44.0",
};
