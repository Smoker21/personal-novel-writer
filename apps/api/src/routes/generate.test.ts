/**
 * M6 PR B2 — generate route kind dispatch + KIND_MISMATCH validation。
 *
 * 涵蓋：
 *   - kind="structured" 對 messages provider → 400 KIND_MISMATCH
 *   - kind="messages" 對 structured provider → 400 KIND_MISMATCH
 *   - kind missing → zValidator 400
 *   - INVALID_CHAPTER / ROUTING_NOT_CONFIGURED 前置驗證
 *   - kind="structured" → 確實呼叫 router.generateNovel（不是 stream），含
 *     version 解析（policy.primary 的 model 部份）+ abortSignal 透傳
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateRouter } from "./generate.js";

function app() {
  return new Hono().route("/api/projects/:hash/chapters/:chapterNumber/generate", generateRouter);
}
const URL = "/api/projects/abcd1234/chapters/1/generate";

vi.mock("../services/project-resolver.js", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("../services/settings-store.js", () => ({
  readSettings: vi.fn(),
}));

vi.mock("../services/draft-cache.js", async () => {
  const actual = await vi.importActual<typeof import("../services/draft-cache.js")>(
    "../services/draft-cache.js",
  );
  return {
    ...actual,
    readDraft: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../services/router-factory.js", async () => {
  const actual = await vi.importActual<typeof import("../services/router-factory.js")>(
    "../services/router-factory.js",
  );
  return {
    ...actual,
    buildRouter: vi.fn(),
  };
});

import { resolveProjectPath } from "../services/project-resolver.js";
import { buildRouter } from "../services/router-factory.js";
import { readSettings } from "../services/settings-store.js";

function settingsWithRouting(primary: string) {
  return {
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
      chapterWriter: { primary, fallbacks: [] },
    },
    recentProjects: [],
    meta: { firstLaunchWarningAcknowledged: true },
  };
}

describe("generate route — kind dispatch & KIND_MISMATCH (M6 PR B2)", () => {
  let tmpHome: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), "gen-"));
    projectPath = join(tmpHome, "test");
    const { createProjectFiles } = await import("../services/project-fs.js");
    await createProjectFiles(
      {
        parentFolder: tmpHome,
        title: "test",
        synopsis: "故事大綱：春雨在圖書館遇見明哲。",
        characters: [{ name: "春雨", description: "20 歲文學系大學生" }],
      },
      projectPath,
    );
    execSync("git init -q", { cwd: projectPath });
    execSync('git config user.email "t@t.com"', { cwd: projectPath });
    execSync('git config user.name "t"', { cwd: projectPath });
    execSync("git add . && git commit -q -m seed", { cwd: projectPath });

    vi.mocked(resolveProjectPath).mockResolvedValue(projectPath);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns 400 KIND_MISMATCH when kind=structured but routing primary is messages-array provider", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      settingsWithRouting("anthropic:claude-haiku-4-5") as never,
    );
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "structured",
        structuredInputs: {
          plot: "p",
          background: "b",
          requirements: "r",
          pre_summary: "ps",
          prev_segment: "pv",
        },
        contextHash: "abc",
        participants: ["春雨"],
        outline: "p",
        requirements: "r",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("KIND_MISMATCH");
  });

  it("returns 400 KIND_MISMATCH when kind=messages but routing primary is structured-only provider", async () => {
    vi.mocked(readSettings).mockResolvedValue(settingsWithRouting("xiaohuangwen:latest") as never);
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "messages",
        promptText: "# System Prompt\n\nsys\n\n---\n\n# User Prompt\n\nhello",
        contextHash: "abc",
        participants: ["春雨"],
        outline: "p",
        requirements: "r",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("KIND_MISMATCH");
  });

  it("returns 400 when kind field is missing (zod discriminated-union validation)", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      settingsWithRouting("anthropic:claude-haiku-4-5") as never,
    );
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        promptText: "x",
        contextHash: "abc",
        participants: [],
        outline: null,
        requirements: null,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 INVALID_CHAPTER for non-existent chapter (kind=messages)", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      settingsWithRouting("anthropic:claude-haiku-4-5") as never,
    );
    const res = await app().request("/api/projects/abcd1234/chapters/999/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "messages",
        promptText: "x",
        contextHash: "abc",
        participants: [],
        outline: null,
        requirements: null,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_CHAPTER");
  });

  it("dispatches to router.generateNovel for kind=structured, passes version + abortSignal", async () => {
    vi.mocked(readSettings).mockResolvedValue(settingsWithRouting("xiaohuangwen:latest") as never);

    const generateNovelCalls: Array<{
      params: { plot: string; version?: string; abortSignal?: AbortSignal };
    }> = [];
    const generateNovel = vi.fn(
      async function* (params: {
        plot: string;
        version?: string;
        abortSignal?: AbortSignal;
      }): AsyncIterable<{ type: string; modelId?: string; finishReason?: string; text?: string }> {
        generateNovelCalls.push({ params });
        yield { type: "text", text: "結果片段。" };
        yield {
          type: "finish",
          finishReason: "end",
          modelId: "xiaohuangwen:latest",
        };
      },
    );
    const streamMock = vi.fn();

    vi.mocked(buildRouter).mockReturnValue({
      generateNovel,
      stream: streamMock,
    } as never);

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "structured",
        structuredInputs: {
          plot: "本章劇情",
          background: "背景",
          requirements: "需求",
          pre_summary: "前情",
          prev_segment: "前段",
        },
        contextHash: "abc",
        participants: ["春雨"],
        outline: "本章劇情",
        requirements: "需求",
      }),
    });

    expect(res.status).toBe(200);
    // Drain SSE body so the streamSSE handler runs to completion
    await res.text();

    expect(generateNovel).toHaveBeenCalledTimes(1);
    expect(streamMock).not.toHaveBeenCalled();

    const call = generateNovelCalls[0];
    expect(call).toBeDefined();
    expect(call?.params.plot).toBe("本章劇情");
    // version 從 policy.primary 解析（spec 011 §「欄位對應」）— "xiaohuangwen:latest" → "latest"
    expect(call?.params.version).toBe("latest");
    // abortSignal 必須透傳
    expect(call?.params.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("returns 400 ROUTING_NOT_CONFIGURED when chapter-writer routing absent (structured request)", async () => {
    vi.mocked(readSettings).mockResolvedValue({
      schemaVersion: 1,
      providers: {} as never,
      routing: {},
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: true },
    } as never);
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "structured",
        structuredInputs: {
          plot: "p",
          background: "",
          requirements: "",
          pre_summary: "",
          prev_segment: "",
        },
        contextHash: "abc",
        participants: [],
        outline: null,
        requirements: null,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROUTING_NOT_CONFIGURED");
  });
});
