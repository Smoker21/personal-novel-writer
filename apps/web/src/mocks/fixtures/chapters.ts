import type {
  ChapterFile,
  ChapterListItem,
  CreateChapterResponse,
  SaveChapterResponse,
} from "@novel-writer/shared-types";

export const mockChapterList: ChapterListItem[] = [
  {
    number: 1,
    title: "梅雨初晴",
    path: "/mock/MyNovels/春日記事/chapters/chapter_0001_梅雨初晴.md",
    wordCount: 128,
    mtime: "2026-05-13T10:00:00Z",
    hasPromptFile: false,
  },
];

export const mockChapterFile: ChapterFile = {
  number: 1,
  title: "梅雨初晴",
  path: "/mock/MyNovels/春日記事/chapters/chapter_0001_梅雨初晴.md",
  content: "她推開書店木門時，雨剛好停了。",
  mtime: "2026-05-13T10:00:00Z",
  size: 42,
  participants: [],
  outline: null,
  requirements: null,
  hasFrontmatter: false,
};

export const mockSaveChapterResponse: SaveChapterResponse = {
  path: mockChapterFile.path,
  mtime: new Date().toISOString(),
  size: 100,
  commitSha: "abc123def",
  statusUpdateJobId: null,
  participants: [],
  outline: null,
  requirements: null,
};

export const mockCreateChapterResponse: CreateChapterResponse = {
  number: 2,
  title: "未命名",
  path: "/mock/MyNovels/春日記事/chapters/chapter_0002_未命名.md",
};
