import type {
  CreateNovelResponse,
  OpenProjectResponse,
  ProjectSummary,
} from "@novel-writer/shared-types";

export const mockCreateNovelResponse: CreateNovelResponse = {
  project: {
    path: "/mock/MyNovels/春日記事",
    title: "春日記事",
    createdAt: new Date().toISOString(),
  },
  firstChapter: {
    number: 1,
    title: "未命名",
    path: "/mock/MyNovels/春日記事/chapters/chapter_0001_未命名.md",
  },
};

export const mockProjectSummary: ProjectSummary = {
  hash: "abc123def456",
  path: "/mock/MyNovels/春日記事",
  title: "春日記事",
  schemaVersion: 1,
  createdAt: "2026-05-01T00:00:00Z",
  chapterCount: 3,
  lastChapter: 2,
};

export const mockOpenProjectResponse: OpenProjectResponse = {
  project: mockProjectSummary,
  warnings: [],
};
