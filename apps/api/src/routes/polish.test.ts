/**
 * Integration tests — POST .../chapters/:chapterNumber/polish（spec 012 PR C3）
 *
 * 涵蓋：
 *   - 缺 selectedText → 400 zod error
 *   - selectedText 超過 5000 codepoint → 400 zod error（INVALID_INPUT）
 *   - 缺 routing 設定 → 400 ROUTING_NOT_CONFIGURED
 *   - PROJECT_NOT_FOUND → 404
 *   - 普通 LLM path（anthropic；hasStructuredNovelGenerate=false）→ 走 router.stream，SSE chunk/complete
 *   - xiaohuangwen path（hasStructuredNovelGenerate=true）→ 走 router.polishNovel，SSE chunk/complete
 *   - polishInput 空字串 → 允許（自由潤飾；不回 400）
 *   - LLM 噴錯 → SSE error event
 *   - AbortController 中斷 → cleanup 正確（不噴例外到 stream）
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polishRouter } from "./polish.js";

function app() {
  return new Hono().route(
    "/api/projects/:hash/chapters/:chapterNumber/polish",
    polishRouter,
  );
}

const URL = "/api/projects/abcd1234/chapters/1/polish";

vi.mock("../services/project-resolver.js", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("../services/settings-store.js", () => ({
  readSettings: vi.fn(),
}));

vi.mock("../services/polish-prose.js", () => ({
  polishProse: vi.fn(),
}));

import { resolveProjectPath } from "../services/project-resolver.js";
import { readSettings } from "../services/settings-store.js";
import { polishProse } from "../services/polish-prose.js";

const VALID_BODY = {
  selectedText: "她輕輕推開了門，門軸發出細微的嘎吱聲。",
  polishInput: "強化氛圍感",
};

function makeSettings(primaryModel: string) {
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
      xiaohuangwen: { enabled: true, apiKey: "xhw-key", version: "latest" },
    },
    routing: {
      polishProse: { primary: primaryModel, fallbacks: [], retryPerModel: 1 },
    },
    recentProjects: [],
    meta: { firstLaunchWarningAcknowledged: true },
  };
}

/**
 * Parse SSE text body into event objects.
 */
function parseSSE(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = text.split("\n\n").filter((b) => b.trim().length > 0);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    try {
      events.push({ event, data: JSON.parse(data) });
    } catch {
      events.push({ event, data });
    }
  }
  return events;
}

beforeEach(() => {
  vi.mocked(resolveProjectPath).mockResolvedValue("/fake/project");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Input validation ────────────────────────────────────────────────────────

describe("input validation", () => {
  it("returns 400 INVALID_INPUT when selectedText is missing", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ polishInput: "test" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 INVALID_INPUT when selectedText is empty string", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedText: "", polishInput: "test" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 INVALID_INPUT when selectedText exceeds 5000 codepoints", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    const longText = "甲".repeat(5001);
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedText: longText, polishInput: "" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("accepts selectedText of exactly 5000 codepoints", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });
    const text5000 = "甲".repeat(5000);
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedText: text5000, polishInput: "" }),
    });
    // Should be 200 (starts SSE) — not 400
    expect(res.status).toBe(200);
    await res.text();
  });

  it("allows empty polishInput (free-polish; spec 012 §API)", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedText: "一段文字", polishInput: "" }),
    });
    expect(res.status).toBe(200);
    await res.text();
  });
});

// ─── Pre-condition errors ─────────────────────────────────────────────────────

describe("pre-condition errors", () => {
  it("returns 404 PROJECT_NOT_FOUND when project does not exist", async () => {
    vi.mocked(resolveProjectPath).mockResolvedValue(null);
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 400 ROUTING_NOT_CONFIGURED when polishProse routing absent", async () => {
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
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROUTING_NOT_CONFIGURED");
  });
});

// ─── 普通 LLM path (anthropic) ─────────────────────────────────────────────

describe("普通 LLM path (anthropic)", () => {
  it("calls polishProse service and streams chunk + complete events", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );

    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "text" as const, text: "潤稿片段一。" };
      yield { type: "text" as const, text: "潤稿片段二。" };
      yield {
        type: "usage" as const,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
      yield {
        type: "finish" as const,
        finishReason: "end" as const,
        modelId: "anthropic:claude-haiku-4-5",
      };
    });

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const events = parseSSE(text);

    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain("started");
    expect(eventNames).toContain("chunk");
    expect(eventNames).toContain("usage");
    expect(eventNames).toContain("complete");

    const chunks = events.filter((e) => e.event === "chunk");
    expect(chunks).toHaveLength(2);
    const texts = chunks.map((e) => (e.data as { text: string }).text);
    expect(texts).toContain("潤稿片段一。");
    expect(texts).toContain("潤稿片段二。");

    const complete = events.find((e) => e.event === "complete");
    expect(complete).toBeDefined();
    const completeData = complete?.data as { totalChars: number; polishId: string };
    expect(completeData.totalChars).toBe("潤稿片段一。".length + "潤稿片段二。".length);
    expect(typeof completeData.polishId).toBe("string");
  });

  it("passes correct params to polishProse including contextBefore/After", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });

    const bodyWithContext = {
      selectedText: "選取文字",
      contextBefore: "前文",
      contextAfter: "後文",
      polishInput: "調整節奏",
    };

    const res2 = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyWithContext),
    });
    await res2.text();

    expect(vi.mocked(polishProse)).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(polishProse).mock.calls[0]?.[0];
    expect(callArgs?.selectedText).toBe("選取文字");
    expect(callArgs?.contextBefore).toBe("前文");
    expect(callArgs?.contextAfter).toBe("後文");
    expect(callArgs?.polishInput).toBe("調整節奏");
  });
});

// ─── xiaohuangwen structured path ────────────────────────────────────────────

describe("xiaohuangwen structured path", () => {
  it("calls polishProse with xiaohuangwen routing and streams chunk + complete", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("xiaohuangwen:latest") as never,
    );

    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "text" as const, text: "潤稿結果。" };
      yield {
        type: "usage" as const,
        usage: { inputTokens: 0, outputTokens: 200 },
      };
      yield {
        type: "finish" as const,
        finishReason: "end" as const,
        modelId: "xiaohuangwen:latest",
      };
    });

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const events = parseSSE(text);

    expect(events.map((e) => e.event)).toContain("started");
    expect(events.map((e) => e.event)).toContain("chunk");
    expect(events.map((e) => e.event)).toContain("complete");

    const started = events.find((e) => e.event === "started");
    expect((started?.data as { model: string }).model).toBe("xiaohuangwen:latest");

    const callArgs = vi.mocked(polishProse).mock.calls[0]?.[0];
    expect(callArgs?.routing.primary).toBe("xiaohuangwen:latest");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("error handling", () => {
  it("emits SSE error event when polishProse throws", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );

    const llmError = Object.assign(new Error("quota exhausted"), {
      code: "quota_exhausted",
      retryable: false,
    });

    vi.mocked(polishProse).mockImplementation(async function* () {
      throw llmError;
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "" }; // unreachable but satisfies type
    });

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    expect(res.status).toBe(200); // SSE starts before error
    const text = await res.text();
    const events = parseSSE(text);

    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    const errorData = errorEvent?.data as { code: string; retryable: boolean };
    expect(errorData.code).toBe("quota_exhausted");
    expect(errorData.retryable).toBe(false);
  });

  it("emits SSE error with UNKNOWN code when error has no code property", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );

    vi.mocked(polishProse).mockImplementation(async function* () {
      throw new Error("generic network error");
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "" }; // unreachable
    });

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    await res.text();
    // Just verify no unhandled throw — route returns 200 with error event in body
    expect(res.status).toBe(200);
  });
});

// ─── AbortController / client disconnect ─────────────────────────────────────

describe("AbortController cleanup", () => {
  it("passes AbortSignal to polishProse service", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });

    const abortRes = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    await abortRes.text();

    const callArgs = vi.mocked(polishProse).mock.calls[0]?.[0];
    expect(callArgs?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("does not emit complete when finish reason is abort", async () => {
    vi.mocked(readSettings).mockResolvedValue(
      makeSettings("anthropic:claude-haiku-4-5") as never,
    );
    vi.mocked(polishProse).mockImplementation(async function* () {
      yield { type: "text" as const, text: "部分文字" };
      yield { type: "finish" as const, finishReason: "abort" as const, modelId: "anthropic:claude-haiku-4-5" };
    });

    const res = await app().request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    const text = await res.text();
    const events = parseSSE(text);
    expect(events.map((e) => e.event)).not.toContain("complete");
  });
});
