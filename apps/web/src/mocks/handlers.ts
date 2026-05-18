import { HttpResponse, http } from "msw";
import {
  mockChapterFile,
  mockChapterList,
  mockCreateChapterResponse,
  mockSaveChapterResponse,
} from "./fixtures/chapters";
import { mockCleanStatus, mockGitBinaryInstalled } from "./fixtures/git-status";
import { mockCreateNovelResponse, mockOpenProjectResponse } from "./fixtures/projects";
import { mockSettings } from "./fixtures/settings";

export const handlers = [
  http.get("/api/settings", () => HttpResponse.json(mockSettings)),
  http.put("/api/settings", () => HttpResponse.json({ ok: true })),
  http.post("/api/settings/test-provider", () =>
    HttpResponse.json({ ok: true, latencyMs: 142, modelCount: 8 }),
  ),
  http.post("/api/settings/reset", () => HttpResponse.json({ ok: true })),
  http.get("/api/settings/secret/:provider", () =>
    HttpResponse.json({ apiKey: "sk-ant-real-key-1234567890" }),
  ),
  http.get("/api/git/check-binary", () => HttpResponse.json(mockGitBinaryInstalled)),
  http.get("/api/git/projects/:hash/status", () => HttpResponse.json(mockCleanStatus)),
  http.post("/api/novels", () => HttpResponse.json(mockCreateNovelResponse)),
  http.post("/api/projects/open", () => HttpResponse.json(mockOpenProjectResponse)),
  http.post("/api/projects/recent/remove", () => HttpResponse.json({ removed: true })),
  http.post("/api/projects/recent/clear", () =>
    HttpResponse.json({ cleared: true, removedCount: 0 }),
  ),
  http.post("/api/projects/recent/relocate", () => HttpResponse.json(mockOpenProjectResponse)),
  http.post("/api/projects/init-git", () => HttpResponse.json({ initialCommitSha: "abc123def" })),
  http.get("/api/projects/:hash/chapters/", () => HttpResponse.json({ chapters: mockChapterList })),
  http.post("/api/projects/:hash/chapters/", () =>
    HttpResponse.json(mockCreateChapterResponse, { status: 201 }),
  ),
  http.get("/api/projects/:hash/chapters/:n", () => HttpResponse.json(mockChapterFile)),
  http.put("/api/projects/:hash/chapters/:n", () => HttpResponse.json(mockSaveChapterResponse)),
  http.post("/api/projects/:hash/chapters/:n/rename", () =>
    HttpResponse.json({ oldPath: "old", newPath: "new", commitSha: "x" }),
  ),
];
