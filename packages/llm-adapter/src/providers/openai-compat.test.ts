import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Use vi.hoisted() so mock factories can reference these before import hoisting
// ---------------------------------------------------------------------------

const { MockAPIError, mockCreate, mockModelsList } = vi.hoisted(() => {
  class MockAPIError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  }

  const mockCreate = vi.fn();
  const mockModelsList = vi.fn().mockResolvedValue({ data: [] });

  return { MockAPIError, mockCreate, mockModelsList };
});

// ---------------------------------------------------------------------------
// Mock the openai SDK
// ---------------------------------------------------------------------------

vi.mock("openai", () => {
  class FakeOpenAI {
    chat = { completions: { create: mockCreate } };
    models = { list: mockModelsList };

    static APIError = MockAPIError;
  }

  return { default: FakeOpenAI };
});

import { LLMError } from "../error.js";
import type { ModelCapabilities } from "../types.js";
// Import after mock is in place
import { OpenAiCompatProvider } from "./openai-compat.js";

// ---------------------------------------------------------------------------
// Concrete test provider (no real API calls)
// ---------------------------------------------------------------------------

class TestProvider extends OpenAiCompatProvider {
  readonly id = "test";
  readonly origin = "cloud" as const;

  capabilities(modelId: string): ModelCapabilities | null {
    if (modelId.includes("vision")) {
      return {
        contextWindow: 8192,
        maxOutputTokens: 1024,
        supportsStreaming: true,
        supportsToolCalls: false,
        supportsVision: true,
      };
    }
    return {
      contextWindow: 8192,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      supportsToolCalls: false,
      supportsVision: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeChunk = {
  choices: Array<{
    delta: { content?: string };
    finish_reason: string | null;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
};

function makeFakeStream(chunks: FakeChunk[]): AsyncIterable<FakeChunk> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<FakeChunk> {
      let i = 0;
      return {
        next(): Promise<IteratorResult<FakeChunk>> {
          if (i < chunks.length) {
            // biome-ignore lint/style/noNonNullAssertion: checked by i < chunks.length
            return Promise.resolve({ value: chunks[i++]!, done: false });
          }
          return Promise.resolve({ value: undefined as unknown as FakeChunk, done: true });
        },
      };
    },
  };
}

function makeHappyPathChunks(text: string): FakeChunk[] {
  return [
    {
      choices: [{ delta: { content: text }, finish_reason: null }],
      usage: null,
    },
    {
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAiCompatProvider", () => {
  let provider: TestProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TestProvider("sk-test", "http://localhost:9999/v1");
  });

  // -------------------------------------------------------------------------
  // Vision capability guard
  // -------------------------------------------------------------------------

  describe("stream() — vision capability check", () => {
    it("throws model_lacks_capability when image sent to text-only model", async () => {
      const request = {
        modelId: "test:gpt-text",
        systemPrompt: "you are helpful",
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image" as const,
                source: { kind: "url" as const, url: "https://example.com/a.png" },
              },
            ],
          },
        ],
      };

      // stream() should throw before calling the API
      const iter = provider.stream(request)[Symbol.asyncIterator]();
      await expect(iter.next()).rejects.toMatchObject({ code: "model_lacks_capability" });
    });

    it("does not throw when image sent to vision-capable model", async () => {
      mockCreate.mockResolvedValueOnce(makeFakeStream(makeHappyPathChunks("ok")));

      const request = {
        modelId: "test:vision-model",
        systemPrompt: "you are helpful",
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image" as const,
                source: { kind: "url" as const, url: "https://example.com/a.png" },
              },
            ],
          },
        ],
      };

      const chunks: Array<{ type: string }> = [];
      for await (const chunk of provider.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === "finish")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Happy path streaming
  // -------------------------------------------------------------------------

  describe("stream() — happy path", () => {
    it("emits text, usage, and finish chunks in correct order", async () => {
      mockCreate.mockResolvedValueOnce(makeFakeStream(makeHappyPathChunks("Hello world")));

      const chunks: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const chunk of provider.stream({
        modelId: "test:some-model",
        systemPrompt: "Be helpful",
        messages: [{ role: "user", content: "Hi" }],
      })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c["type"] === "text");
      const usageChunks = chunks.filter((c) => c["type"] === "usage");
      const finishChunks = chunks.filter((c) => c["type"] === "finish");

      expect(textChunks).toHaveLength(1);
      expect(textChunks[0]).toEqual({ type: "text", text: "Hello world" });

      expect(usageChunks).toHaveLength(1);
      const u = usageChunks[0]?.["usage"] as { inputTokens: number; outputTokens: number };
      expect(u.inputTokens).toBe(10);
      expect(u.outputTokens).toBe(5);

      expect(finishChunks).toHaveLength(1);
      expect(finishChunks[0]?.["finishReason"]).toBe("end");
    });

    it('maps finish_reason "length" → "max_tokens"', async () => {
      const chunks: FakeChunk[] = [
        { choices: [{ delta: { content: "truncated" }, finish_reason: null }], usage: null },
        {
          choices: [{ delta: {}, finish_reason: "length" }],
          usage: { prompt_tokens: 5, completion_tokens: 10 },
        },
      ];
      mockCreate.mockResolvedValueOnce(makeFakeStream(chunks));

      const results: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const c of provider.stream({
        modelId: "test:some-model",
        systemPrompt: "s",
        messages: [{ role: "user", content: "hi" }],
        maxOutputTokens: 10,
      })) {
        results.push(c);
      }

      const finish = results.find((c) => c["type"] === "finish");
      expect(finish?.["finishReason"]).toBe("max_tokens");
    });
  });

  // -------------------------------------------------------------------------
  // generate() — accumulation
  // -------------------------------------------------------------------------

  describe("generate()", () => {
    it("accumulates streamed text into a single response", async () => {
      const multiChunks: FakeChunk[] = [
        { choices: [{ delta: { content: "Hel" }, finish_reason: null }], usage: null },
        { choices: [{ delta: { content: "lo!" }, finish_reason: null }], usage: null },
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 8, completion_tokens: 3 },
        },
      ];
      mockCreate.mockResolvedValueOnce(makeFakeStream(multiChunks));

      const response = await provider.generate({
        modelId: "test:some-model",
        systemPrompt: "Reply in one word",
        messages: [{ role: "user", content: 'Say "Hello!"' }],
      });

      expect(response.text).toBe("Hello!");
      expect(response.usage.inputTokens).toBe(8);
      expect(response.usage.outputTokens).toBe(3);
      expect(response.finishReason).toBe("end");
      expect(response.modelId).toBe("test:some-model");
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe("error mapping", () => {
    async function collectError(request: Parameters<typeof provider.stream>[0]): Promise<unknown> {
      try {
        for await (const _ of provider.stream(request)) {
          // drain
        }
      } catch (e) {
        return e;
      }
      return undefined;
    }

    const baseRequest = {
      modelId: "test:some-model",
      systemPrompt: "s",
      messages: [{ role: "user" as const, content: "hi" }],
    };

    it("maps APIError 401 → LLMError unauthorized (non-retryable)", async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(401, "401 Unauthorized"));
      const err = await collectError(baseRequest);
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("unauthorized");
      expect((err as LLMError).retryable).toBe(false);
    });

    it("maps APIError 429 → LLMError rate_limit (retryable)", async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(429, "429 Too Many Requests"));
      const err = await collectError(baseRequest);
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("rate_limit");
      expect((err as LLMError).retryable).toBe(true);
    });

    it("maps APIError 404 → LLMError model_not_found (non-retryable)", async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(404, "404 Not Found"));
      const err = await collectError(baseRequest);
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("model_not_found");
      expect((err as LLMError).retryable).toBe(false);
    });

    it("maps APIError 400 with context_length → LLMError context_overflow", async () => {
      mockCreate.mockRejectedValueOnce(
        new MockAPIError(400, "400 context_length exceeded: too long"),
      );
      const err = await collectError(baseRequest);
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("context_overflow");
    });

    it("maps fetch failed Error → LLMError network (retryable)", async () => {
      const netErr = new Error("fetch failed: ECONNRESET");
      mockCreate.mockRejectedValueOnce(netErr);
      const err = await collectError(baseRequest);
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("network");
      expect((err as LLMError).retryable).toBe(true);
    });

    it("maps AbortError → finish chunk with reason abort (no throw)", async () => {
      const abortErr = new Error("The operation was aborted.");
      abortErr.name = "AbortError";
      mockCreate.mockRejectedValueOnce(abortErr);

      const controller = new AbortController();
      controller.abort();

      const results: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const chunk of provider.stream({
        ...baseRequest,
        abortSignal: controller.signal,
      })) {
        results.push(chunk);
      }

      const finish = results.find((c) => c["type"] === "finish");
      expect(finish?.["finishReason"]).toBe("abort");
    });
  });

  // -------------------------------------------------------------------------
  // ping()
  // -------------------------------------------------------------------------

  describe("ping()", () => {
    it("returns ok:true with latency when models.list succeeds", async () => {
      mockModelsList.mockResolvedValueOnce({ data: [] });
      const result = await provider.ping();
      expect(result.ok).toBe(true);
      expect(typeof result.latencyMs).toBe("number");
    });

    it("returns ok:false when models.list throws", async () => {
      mockModelsList.mockRejectedValueOnce(new Error("connection refused"));
      const result = await provider.ping();
      expect(result.ok).toBe(false);
    });
  });
});
