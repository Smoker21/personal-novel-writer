/**
 * Unit tests — polish-prose service（spec 012 PR C3）
 *
 * 這份測試直接測 polishProse() service，mock buildRouter 以驗證
 * capability-flag dispatch 邏輯：
 *   - hasStructuredNovelGenerate=true（xiaohuangwen）→ router.polishNovel() 被呼叫
 *   - hasStructuredNovelGenerate=false（anthropic）→ router.stream() 被呼叫
 *   - contextBefore / contextAfter 在普通 LLM path 注入 prompt；在 structured path 省略
 *   - version 從 modelId 解析（"xiaohuangwen:latest" → "latest"）
 *   - abortSignal 透傳
 *   - polishInput 空字串 → 走自由潤飾（不 throw）
 */
import { describe, expect, it, vi } from "vitest";
import { polishProse } from "./polish-prose.js";

vi.mock("./router-factory.js", () => ({
  buildRouter: vi.fn(),
  toRouterPolicy: vi.fn((policy) => ({ ...policy, retryPerModel: 1 })),
}));

import { buildRouter } from "./router-factory.js";

function makeSettings(primary: string) {
  return {
    schemaVersion: 1 as const,
    providers: {
      anthropic: { enabled: true, apiKey: "test", defaultModel: "claude-haiku-4-5" },
      openai: { enabled: false },
      google: { enabled: false },
      xai: { enabled: false },
      ollama: { enabled: false, endpoint: "http://localhost:11434" },
      lmstudio: { enabled: false, endpoint: "http://localhost:1234" },
      "rwkv-runner": { enabled: false, endpoint: "http://localhost:8000" },
      xiaohuangwen: { enabled: true, apiKey: "xhw-key", version: "latest" as const },
    },
    routing: {
      polishProse: { primary, fallbacks: [], retryPerModel: 1 },
    },
    recentProjects: [],
    meta: { firstLaunchWarningAcknowledged: true },
  };
}

async function collectChunks(iter: AsyncIterable<{ type: string }>): Promise<Array<{ type: string }>> {
  const result = [];
  for await (const chunk of iter) {
    result.push(chunk);
  }
  return result;
}

describe("polishProse service — structured path (xiaohuangwen)", () => {
  it("calls router.polishNovel (not router.stream) for xiaohuangwen primary", async () => {
    const polishNovelMock = vi.fn(async function* () {
      yield { type: "text" as const, text: "潤稿結果" };
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "xiaohuangwen:latest" };
    });
    const streamMock = vi.fn();

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: polishNovelMock,
      stream: streamMock,
    } as never);

    const settings = makeSettings("xiaohuangwen:latest");
    const routing = settings.routing.polishProse!;

    const iter = polishProse({
      selectedText: "原始段落文字",
      polishInput: "調整節奏",
      routing,
      settings: settings as never,
    });

    await collectChunks(iter);

    expect(polishNovelMock).toHaveBeenCalledTimes(1);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("passes pre_output = selectedText and polish_input = polishInput", async () => {
    const polishNovelCalls: Array<{ params: { pre_output: string; polish_input: string; version?: string } }> = [];
    const polishNovelMock = vi.fn(async function* (
      params: { pre_output: string; polish_input: string; version?: string },
    ) {
      polishNovelCalls.push({ params });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "xiaohuangwen:latest" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: polishNovelMock,
      stream: vi.fn(),
    } as never);

    const settings = makeSettings("xiaohuangwen:latest");
    await collectChunks(polishProse({
      selectedText: "她推開了門。",
      polishInput: "強化動作描寫",
      routing: settings.routing.polishProse!,
      settings: settings as never,
    }));

    const call = polishNovelCalls[0];
    expect(call?.params.pre_output).toBe("她推開了門。");
    expect(call?.params.polish_input).toBe("強化動作描寫");
  });

  it("parses version from modelId ('xiaohuangwen:latest' → 'latest')", async () => {
    const polishNovelCalls: Array<{ params: { version?: string } }> = [];
    const polishNovelMock = vi.fn(async function* (params: { version?: string }) {
      polishNovelCalls.push({ params });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "xiaohuangwen:latest" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: polishNovelMock,
      stream: vi.fn(),
    } as never);

    const settings = makeSettings("xiaohuangwen:latest");
    await collectChunks(polishProse({
      selectedText: "文字",
      polishInput: "",
      routing: settings.routing.polishProse!,
      settings: settings as never,
    }));

    expect(polishNovelCalls[0]?.params.version).toBe("latest");
  });

  it("does not pass contextBefore/contextAfter to polishNovel (spec 012 §9)", async () => {
    const polishNovelCalls: Array<{ params: Record<string, unknown> }> = [];
    const polishNovelMock = vi.fn(async function* (params: Record<string, unknown>) {
      polishNovelCalls.push({ params });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "xiaohuangwen:latest" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: polishNovelMock,
      stream: vi.fn(),
    } as never);

    const settings = makeSettings("xiaohuangwen:latest");
    await collectChunks(polishProse({
      selectedText: "文字",
      contextBefore: "前文",
      contextAfter: "後文",
      polishInput: "",
      routing: settings.routing.polishProse!,
      settings: settings as never,
    }));

    const callParams = polishNovelCalls[0]?.params;
    expect(callParams).not.toHaveProperty("contextBefore");
    expect(callParams).not.toHaveProperty("contextAfter");
  });

  it("passes abortSignal to polishNovel", async () => {
    const polishNovelCalls: Array<{ params: { abortSignal?: AbortSignal } }> = [];
    const polishNovelMock = vi.fn(async function* (params: { abortSignal?: AbortSignal }) {
      polishNovelCalls.push({ params });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "xiaohuangwen:latest" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: polishNovelMock,
      stream: vi.fn(),
    } as never);

    const controller = new AbortController();
    const settings = makeSettings("xiaohuangwen:latest");
    await collectChunks(polishProse({
      selectedText: "文字",
      polishInput: "",
      routing: settings.routing.polishProse!,
      settings: settings as never,
      abortSignal: controller.signal,
    }));

    expect(polishNovelCalls[0]?.params.abortSignal).toBe(controller.signal);
  });
});

describe("polishProse service — 普通 LLM path (anthropic)", () => {
  it("calls router.stream (not router.polishNovel) for non-structured provider", async () => {
    const streamMock = vi.fn(async function* () {
      yield { type: "text" as const, text: "潤稿結果" };
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });
    const polishNovelMock = vi.fn();

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: polishNovelMock,
      stream: streamMock,
    } as never);

    const settings = makeSettings("anthropic:claude-haiku-4-5");
    await collectChunks(polishProse({
      selectedText: "她輕輕推開了門。",
      polishInput: "強化動作描寫",
      routing: settings.routing.polishProse!,
      settings: settings as never,
    }));

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(polishNovelMock).not.toHaveBeenCalled();
  });

  it("injects contextBefore and contextAfter into user message for stream path", async () => {
    const streamCalls: Array<{ req: { messages: Array<{ role: string; content: string }> } }> = [];
    const streamMock = vi.fn(async function* (req: { messages: Array<{ role: string; content: string }> }) {
      streamCalls.push({ req });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: vi.fn(),
      stream: streamMock,
    } as never);

    const settings = makeSettings("anthropic:claude-haiku-4-5");
    await collectChunks(polishProse({
      selectedText: "選取的段落文字",
      contextBefore: "前文段落",
      contextAfter: "後文段落",
      polishInput: "調整節奏",
      routing: settings.routing.polishProse!,
      settings: settings as never,
    }));

    const userContent = streamCalls[0]?.req.messages[0]?.content ?? "";
    expect(userContent).toContain("前文段落");
    expect(userContent).toContain("後文段落");
    expect(userContent).toContain("選取的段落文字");
    expect(userContent).toContain("調整節奏");
  });

  it("uses 自由潤飾 fallback in prompt when polishInput is empty", async () => {
    const streamCalls: Array<{ req: { messages: Array<{ role: string; content: string }> } }> = [];
    const streamMock = vi.fn(async function* (req: { messages: Array<{ role: string; content: string }> }) {
      streamCalls.push({ req });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: vi.fn(),
      stream: streamMock,
    } as never);

    const settings = makeSettings("anthropic:claude-haiku-4-5");
    await collectChunks(polishProse({
      selectedText: "文字",
      polishInput: "",
      routing: settings.routing.polishProse!,
      settings: settings as never,
    }));

    const userContent = streamCalls[0]?.req.messages[0]?.content ?? "";
    expect(userContent).toContain("（無特別指令，請做保守潤飾）");
  });

  it("passes abortSignal to router.stream", async () => {
    const streamCalls: Array<{ req: { abortSignal?: AbortSignal } }> = [];
    const streamMock = vi.fn(async function* (req: { abortSignal?: AbortSignal }) {
      streamCalls.push({ req });
      yield { type: "finish" as const, finishReason: "end" as const, modelId: "anthropic:claude-haiku-4-5" };
    });

    vi.mocked(buildRouter).mockReturnValue({
      polishNovel: vi.fn(),
      stream: streamMock,
    } as never);

    const controller = new AbortController();
    const settings = makeSettings("anthropic:claude-haiku-4-5");
    await collectChunks(polishProse({
      selectedText: "文字",
      polishInput: "",
      routing: settings.routing.polishProse!,
      settings: settings as never,
      abortSignal: controller.signal,
    }));

    expect(streamCalls[0]?.req.abortSignal).toBe(controller.signal);
  });
});
