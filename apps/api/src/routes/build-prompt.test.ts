import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPromptRouter } from "./build-prompt.js";

// Mount under the parent route so :hash + :chapterNumber params resolve in tests
function app() {
  return new Hono().route(
    "/api/projects/:hash/chapters/:chapterNumber/build-prompt",
    buildPromptRouter,
  );
}
const URL = "/api/projects/abcd1234/chapters/1/build-prompt";

vi.mock("../services/project-resolver.js", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("../services/settings-store.js", () => ({
  readSettings: vi.fn(),
}));

import { resolveProjectPath } from "../services/project-resolver.js";
import { readSettings } from "../services/settings-store.js";

describe("build-prompt route (M5 2b-3)", () => {
  let tmpHome: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), "buildp-"));
    projectPath = join(tmpHome, "test");
    const { createProjectFiles } = await import("../services/project-fs.js");
    await createProjectFiles(
      {
        parentFolder: tmpHome,
        title: "test",
        synopsis: "故事大綱：春雨在圖書館遇見明哲。",
        characters: [
          { name: "春雨", description: "20 歲文學系大學生" },
          { name: "明哲", description: "22 歲圖書館研究生工讀" },
        ],
      },
      projectPath,
    );
    execSync("git init -q", { cwd: projectPath });
    execSync('git config user.email "t@t.com"', { cwd: projectPath });
    execSync('git config user.name "t"', { cwd: projectPath });
    execSync("git add . && git commit -q -m seed", { cwd: projectPath });

    vi.mocked(resolveProjectPath).mockResolvedValue(projectPath);
    vi.mocked(readSettings).mockResolvedValue({
      schemaVersion: 1,
      providers: {
        anthropic: { enabled: true, apiKey: "test", defaultModel: "claude-haiku-4-5" },
        openai: { enabled: false },
        google: { enabled: false },
        xai: { enabled: false },
        ollama: { enabled: false, endpoint: "http://localhost:11434" },
        lmstudio: { enabled: false, endpoint: "http://localhost:1234" },
        "rwkv-runner": { enabled: false, endpoint: "http://localhost:8000" },
      },
      routing: {
        chapterWriter: { primary: "anthropic:claude-haiku-4-5", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: true },
    } as never);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns 200 with promptText + systemPrompt + userPrompt", async () => {
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantSlugs: ["春雨"],
        outline: "春雨找明哲查詢借閱歷史。",
        requirements: "約 1500 字，第三人稱有限視角。",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: "messages" | "structured";
      promptText: string;
      systemPrompt: string;
      userPrompt: string;
      contextHash: string;
      modelId: string;
      participants: Array<{ slug: string; name: string; matched: boolean }>;
    };
    expect(body.kind).toBe("messages");
    expect(body.promptText).toContain("System Prompt");
    expect(body.promptText).toContain("User Prompt");
    expect(body.userPrompt).toContain("春雨找明哲查詢借閱歷史。");
    expect(body.userPrompt).toContain("約 1500 字");
    expect(body.contextHash).toMatch(/^[a-f0-9]{12}$/);
    expect(body.modelId).toBe("anthropic:claude-haiku-4-5");
    expect(body.participants).toHaveLength(1);
    expect(body.participants[0]).toMatchObject({ slug: "春雨", matched: true });
  });

  it("returns 400 INVALID_PARTICIPANT for unknown slug", async () => {
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantSlugs: ["不存在的角色"],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; missingSlugs: string[] };
    expect(body.code).toBe("INVALID_PARTICIPANT");
    expect(body.missingSlugs).toContain("不存在的角色");
  });

  it("returns 400 INVALID_CHAPTER for non-existent chapter", async () => {
    const res = await app().request("/api/projects/abcd1234/chapters/999/build-prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantSlugs: ["春雨"],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_CHAPTER");
  });

  it("returns 400 ROUTING_NOT_CONFIGURED when chapter-writer routing absent", async () => {
    vi.mocked(readSettings).mockResolvedValueOnce({
      schemaVersion: 1,
      providers: {} as never,
      routing: {},
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: true },
    } as never);
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantSlugs: [] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROUTING_NOT_CONFIGURED");
  });

  it("returns 400 MISSING_CONTEXT when synopsis empty", async () => {
    // Overwrite synopsis to empty
    await writeFile(join(projectPath, "synopsis.md"), "", "utf-8");
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantSlugs: ["春雨"] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_CONTEXT");
  });

  // M6 (Spec 005 / ADR-0010): structured-path 分支
  it("returns kind=structured + structuredInputs when routing primary is xiaohuangwen", async () => {
    // Override routing to point to xiaohuangwen (structured-only provider)
    vi.mocked(readSettings).mockResolvedValueOnce({
      schemaVersion: 1,
      providers: {
        anthropic: { enabled: false },
        openai: { enabled: false },
        google: { enabled: false },
        xai: { enabled: false },
        ollama: { enabled: false, endpoint: "http://localhost:11434" },
        lmstudio: { enabled: false, endpoint: "http://localhost:1234" },
        "rwkv-runner": { enabled: false, endpoint: "http://localhost:8000" },
      },
      routing: {
        chapterWriter: { primary: "xiaohuangwen:latest", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: true },
    } as never);

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantSlugs: ["春雨"],
        outline: "春雨找明哲查詢借閱歷史。",
        requirements: "約 1500 字",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string;
      structuredInputs: {
        plot: string;
        background: string;
        requirements: string;
        pre_summary: string;
        prev_segment: string;
      };
      modelId: string;
      contextHash: string;
      participants: Array<{ slug: string; name: string; matched: boolean }>;
    };
    expect(body.kind).toBe("structured");
    expect(body.modelId).toBe("xiaohuangwen:latest");
    expect(body.structuredInputs.plot).toBe("春雨找明哲查詢借閱歷史。");
    expect(body.structuredInputs.requirements).toBe("約 1500 字");
    expect(body.structuredInputs.background).toContain("春雨");
    expect(body.contextHash).toMatch(/^[a-f0-9]{12}$/);
    expect(body.participants).toHaveLength(1);
    // messages-only fields must not appear in structured response
    expect((body as Record<string, unknown>)["promptText"]).toBeUndefined();
    expect((body as Record<string, unknown>)["estimatedTokens"]).toBeUndefined();
  });

  it("structured path returns 400 INVALID_PARTICIPANT for unknown slug", async () => {
    vi.mocked(readSettings).mockResolvedValueOnce({
      schemaVersion: 1,
      providers: {
        anthropic: { enabled: false },
        openai: { enabled: false },
        google: { enabled: false },
        xai: { enabled: false },
        ollama: { enabled: false, endpoint: "http://localhost:11434" },
        lmstudio: { enabled: false, endpoint: "http://localhost:1234" },
        "rwkv-runner": { enabled: false, endpoint: "http://localhost:8000" },
      },
      routing: {
        chapterWriter: { primary: "xiaohuangwen:latest", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: true },
    } as never);
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantSlugs: ["不存在的角色"] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; missingSlugs: string[] };
    expect(body.code).toBe("INVALID_PARTICIPANT");
    expect(body.missingSlugs).toContain("不存在的角色");
  });
});
