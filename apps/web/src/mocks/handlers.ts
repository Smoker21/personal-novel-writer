import { http, HttpResponse } from "msw";
import { mockCleanStatus, mockGitBinaryInstalled } from "./fixtures/git-status.js";
import { mockSettings } from "./fixtures/settings.js";

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
];
