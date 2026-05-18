import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRwkvCompletionsPrompt, RwkvRunnerRuntime } from "../../src/runtimes/rwkv-runner.js";

const ENDPOINT = "http://test.local/v1";

describe("RwkvRunnerRuntime", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("health() returns ok when /models is 200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("ok-models-list", { status: 200 }),
      ) as unknown as typeof fetch;
    const r = new RwkvRunnerRuntime({ endpoint: ENDPOINT });
    const h = await r.health();
    expect(h.ok).toBe(true);
    expect(h.modelInfo).toContain("ok-models-list");
  });

  it("health() returns not-ok on 503", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("nope", { status: 503, statusText: "Service Unavailable" }),
      ) as unknown as typeof fetch;
    const r = new RwkvRunnerRuntime({ endpoint: ENDPOINT });
    const h = await r.health();
    expect(h.ok).toBe(false);
    expect(h.error).toContain("503");
  });

  it("health() returns not-ok on network error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const r = new RwkvRunnerRuntime({ endpoint: ENDPOINT });
    const h = await r.health();
    expect(h.ok).toBe(false);
    expect(h.error).toContain("ECONNREFUSED");
  });

  it("chat() sends OAI-shaped POST with sampling fields", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      captured.url = url as string;
      captured.init = init as RequestInit;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "hello back" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 7, completion_tokens: 11 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const r = new RwkvRunnerRuntime({ endpoint: ENDPOINT });
    const res = await r.chat({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      temperature: 1.0,
      topP: 0.6,
      presencePenalty: 0.4,
      frequencyPenalty: 0.4,
      maxTokens: 100,
      stop: ["\n\nUser:"],
    });
    expect(res.text).toBe("hello back");
    expect(res.usage.inputTokens).toBe(7);
    expect(res.usage.outputTokens).toBe(11);
    expect(res.finishReason).toBe("end");
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    expect(captured.url).toBe(`${ENDPOINT}/chat/completions`);
    const body = JSON.parse(captured.init?.body as string);
    expect(body.temperature).toBe(1.0);
    expect(body.top_p).toBe(0.6);
    expect(body.presence_penalty).toBe(0.4);
    expect(body.frequency_penalty).toBe(0.4);
    expect(body.max_tokens).toBe(100);
    expect(body.stream).toBe(false);
    expect(body.stop).toEqual(["\n\nUser:"]);
  });

  it("chat() in completions mode hits /v1/completions with hand-crafted prompt", async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      captured.url = url as string;
      captured.body = JSON.parse((init as RequestInit).body as string);
      return new Response(
        JSON.stringify({
          choices: [{ text: " 蘇晴推門進來。", finish_reason: "stop" }],
          usage: { prompt_tokens: 50, completion_tokens: 8 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const r = new RwkvRunnerRuntime({ endpoint: ENDPOINT, mode: "completions" });
    const res = await r.chat({
      messages: [
        { role: "system", content: "你是中文小說章節寫手。" },
        { role: "user", content: "寫一段 600 字的場景。" },
      ],
      temperature: 1.0,
      topP: 0.6,
      maxTokens: 1200,
    });
    expect(captured.url).toBe(`${ENDPOINT}/completions`);
    const body = captured.body as Record<string, unknown>;
    expect(typeof body.prompt).toBe("string");
    expect(body.prompt).toContain("User: 你是中文小說章節寫手。");
    expect(body.prompt).toContain("寫一段 600 字的場景。");
    expect(body.prompt.toString().endsWith("Assistant:")).toBe(true);
    expect(body.stop).toEqual(expect.arrayContaining(["\n\nUser:", "\n\nHuman:"]));
    // leading-space stripping
    expect(res.text).toBe("蘇晴推門進來。");
    expect(res.usage.outputTokens).toBe(8);
  });

  it("chat() throws on non-200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("oops", { status: 500 })) as unknown as typeof fetch;
    const r = new RwkvRunnerRuntime({ endpoint: ENDPOINT });
    await expect(
      r.chat({
        messages: [{ role: "user", content: "x" }],
        temperature: 0.5,
        topP: 0.5,
        maxTokens: 10,
      }),
    ).rejects.toThrow(/RWKV-Runner 500/);
  });
});

describe("formatRwkvCompletionsPrompt", () => {
  it("merges system + user into a single User: block", () => {
    const p = formatRwkvCompletionsPrompt([
      { role: "system", content: "你是寫手。" },
      { role: "user", content: "寫場景。" },
    ]);
    expect(p).toBe("User: 你是寫手。\n\n寫場景。\n\nAssistant:");
  });

  it("appends Assistant: marker when no assistant turn yet", () => {
    const p = formatRwkvCompletionsPrompt([{ role: "user", content: "hello" }]);
    expect(p.endsWith("\n\nAssistant:")).toBe(true);
  });

  it("preserves multi-turn assistant continuations", () => {
    const p = formatRwkvCompletionsPrompt([
      { role: "system", content: "sys" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
    expect(p).toContain("Assistant: a1");
    expect(p.endsWith("Assistant:")).toBe(true);
  });
});
