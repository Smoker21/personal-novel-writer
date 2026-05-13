export type ProjectHash = string;

export interface ProjectMeta {
  title: string;
  createdAt: string;
  schemaVersion: 1;
}

export interface RecentProject {
  hash: ProjectHash;
  path: string;
  title: string;
  lastOpenedAt: string;
  pinned: boolean;
}
