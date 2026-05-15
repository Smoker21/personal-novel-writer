import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Use vi.hoisted() to define mocks that are available when vi.mock() factory
// runs (vi.mock is hoisted to the top of the file by Vitest's transform).
// ---------------------------------------------------------------------------

const {
  MockAuthenticationError,
  MockRateLimitError,
  MockBadRequestError,
  MockAPIConnectionError,
  MockPermissionDeniedError,
  MockNotFoundError,
  mockMessagesStream,
  mockModelsList,
} = vi.hoisted(() => {
  class MockAuthenticationError extends Error {
    readonly status = 401;
    constructor() {
      super("401 Authentication failed");
      this.name = "AuthenticationError";
    }
  }

  class MockRateLimitError extends Error {
    readonly status = 429;
    constructor() {
      super("429 Rate limit exceeded");
      this.name = "RateLimitError";
    }
  }

  class MockBadRequestError extends Error {
    readonly status = 400;
    constructor(msg = "400 Bad Request") {
      super(msg);
      this.name = "BadRequestError";
    }
  }

  class MockAPIConnectionError extends Error {
    constructor() {
      super("fetch failed");
      this.name = "APIConnectionError";
    }
  }

  class MockPermissionDeniedError extends Error {
    readonly status = 403;
    constructor() {
      super("403 Permission denied");
      this.name = "PermissionDeniedError";
    }
  }

  class MockNotFoundError extends Error {
    readonly status = 404;
    constructor() {
      super("404 Not found");
      this.name = "NotFoundError";
    }
  }

  const mockMessagesStream = vi.fn();
  const mockModelsList = vi.fn().mockResolvedValue({ data: [] });

  return {
    MockAuthenticationError,
    MockRateLimitError,
    MockBadRequestError,
    MockAPIConnectionError,
    MockPermissionDeniedError,
    MockNotFoundError,
    mockMessagesStream,
    mockModelsList,
  };
});

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk — factory uses only the hoisted references above
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: mockMessagesStream };
    models = { list: mockModelsList };
  }

  return {
    default: FakeAnthropic,
    AuthenticationError: MockAuthenticationError,
    RateLimitError: MockRateLimitError,
    BadRequestError: MockBadRequestError,
    APIConnectionError: MockAPIConnectionError,
    PermissionDeniedError: MockPermissionDeniedError,
    NotFoundError: MockNotFoundError,
  };
});

import { LLMError } from "../error.js";
// NOW import provider (after mock is in place)
import { AnthropicProvider } from "./anthropic.js";

// ---------------------------------------------------------------------------
// Helper: build an async-iterable from a fixed array of events
// ---------------------------------------------------------------------------

function makeMockStream(events: MessageStreamEvent[]): AsyncIterable<MessageStreamEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<MessageStreamEvent> {
      let i = 0;
      return {
        next(): Promise<IteratorResult<MessageStreamEvent>> {
          if (i < events.length) {
            return Promise.resolve({ value: events[i++]!, done: false });
          }
          return Promise.resolve({ value: undefined as unknown as MessageStreamEvent, done: true });
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: typical happy-path event sequence
// ---------------------------------------------------------------------------

function makeHappyPathEvents(text: string): MessageStreamEvent[] {
  return [
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [],
        model: "claude-haiku-4-5",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    {
      type: "content_block_stop",
      index: 0,
    },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    {
      type: "message_stop",
    },
  ] as MessageStreamEvent[];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicProvider("sk-ant-test-key-placeholder-for-testing");
  });

  // -------------------------------------------------------------------------
  // capabilities()
  // -------------------------------------------------------------------------

  describe("capabilities()", () => {
    it("returns correct capabilities for claude-sonnet-4-6", () => {
      const caps = provider.capabilities("anthropic:claude-sonnet-4-6");
      expect(caps).not.toBeNull();
      expect(caps?.contextWindow).toBe(200_000);
      expect(caps?.maxOutputTokens).toBe(16_000);
      expect(caps?.supportsStreaming).toBe(true);
      expect(caps?.supportsToolCalls).toBe(true);
      expect(caps?.supportsVision).toBe(true);
      expect(caps?.costPer1kInput).toBe(0.003);
      expect(caps?.costPer1kOutput).toBe(0.015);
    });

    it("returns null for an unknown model", () => {
      expect(provider.capabilities("anthropic:unknown-model-xyz")).toBeNull();
    });

    it("returns correct capabilities for claude-haiku-4-5", () => {
      const caps = provider.capabilities("anthropic:claude-haiku-4-5");
      expect(caps?.maxOutputTokens).toBe(8_000);
    });

    it("returns correct capabilities for claude-opus-4-7", () => {
      const caps = provider.capabilities("anthropic:claude-opus-4-7");
      expect(caps?.maxOutputTokens).toBe(32_000);
      expect(caps?.costPer1kInput).toBe(0.015);
    });
  });

  // -------------------------------------------------------------------------
  // stream() — happy path
  // -------------------------------------------------------------------------

  describe("stream() happy path", () => {
    it("emits text, usage, and finish chunks in correct order", async () => {
      const events = makeHappyPathEvents("Hello world");
      mockMessagesStream.mockReturnValue(makeMockStream(events));

      const chunks: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const chunk of provider.stream({
        modelId: "anthropic:claude-haiku-4-5",
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
      const usageChunk = usageChunks[0];
      if (usageChunk?.["type"] === "usage") {
        const u = usageChunk["usage"] as { inputTokens: number; outputTokens: number };
        expect(u.inputTokens).toBe(10);
        expect(u.outputTokens).toBe(5);
      }

      expect(finishChunks).toHaveLength(1);
      const finishChunk = finishChunks[0];
      if (finishChunk?.["type"] === "finish") {
        expect(finishChunk["finishReason"]).toBe("end");
        expect(finishChunk["modelId"]).toBe("anthropic:claude-haiku-4-5");
      }
    });

    it("maps max_tokens stop_reason correctly", async () => {
      const events: MessageStreamEvent[] = [
        {
          type: "message_start",
          message: {
            id: "msg_2",
            type: "message",
            role: "assistant",
            content: [],
            model: "claude-haiku-4-5",
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 5, output_tokens: 0 },
          },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "truncated" },
        },
        {
          type: "message_delta",
          delta: { stop_reason: "max_tokens", stop_sequence: null },
          usage: { output_tokens: 10 },
        },
        { type: "message_stop" },
      ] as MessageStreamEvent[];

      mockMessagesStream.mockReturnValue(makeMockStream(events));

      const chunks: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const chunk of provider.stream({
        modelId: "anthropic:claude-haiku-4-5",
        systemPrompt: "Be helpful",
        messages: [{ role: "user", content: "Write a lot" }],
        maxOutputTokens: 10,
      })) {
        chunks.push(chunk);
      }

      const finish = chunks.find((c) => c["type"] === "finish");
      expect(finish?.["type"]).toBe("finish");
      expect(finish?.["finishReason"]).toBe("max_tokens");
    });
  });

  // -------------------------------------------------------------------------
  // generate() — accumulation
  // -------------------------------------------------------------------------

  describe("generate()", () => {
    it("accumulates streamed text into a single response", async () => {
      const events: MessageStreamEvent[] = [
        {
          type: "message_start",
          message: {
            id: "msg_3",
            type: "message",
            role: "assistant",
            content: [],
            model: "claude-haiku-4-5",
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 8, output_tokens: 0 },
          },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hel" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "lo!" },
        },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 3 },
        },
        { type: "message_stop" },
      ] as MessageStreamEvent[];

      mockMessagesStream.mockReturnValue(makeMockStream(events));

      const response = await provider.generate({
        modelId: "anthropic:claude-haiku-4-5",
        systemPrompt: "Reply in one word",
        messages: [{ role: "user", content: 'Say "Hello!"' }],
      });

      expect(response.text).toBe("Hello!");
      expect(response.usage.inputTokens).toBe(8);
      expect(response.usage.outputTokens).toBe(3);
      expect(response.finishReason).toBe("end");
      expect(response.modelId).toBe("anthropic:claude-haiku-4-5");
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe("error mapping", () => {
    function makeThrowingStream(err: Error): AsyncIterable<MessageStreamEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<MessageStreamEvent>> {
              return Promise.reject(err);
            },
          };
        },
      };
    }

    it("maps AuthenticationError → LLMError code unauthorized (non-retryable)", async () => {
      mockMessagesStream.mockReturnValue(makeThrowingStream(new MockAuthenticationError()));

      let caught: unknown;
      try {
        for await (const _ of provider.stream({
          modelId: "anthropic:claude-haiku-4-5",
          systemPrompt: "s",
          messages: [{ role: "user", content: "hi" }],
        })) {
          /* noop */
        }
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(LLMError);
      const llmErr = caught as LLMError;
      expect(llmErr.code).toBe("unauthorized");
      expect(llmErr.retryable).toBe(false);
      expect(llmErr.provider).toBe("anthropic");
    });

    it("maps RateLimitError → LLMError code rate_limit (retryable)", async () => {
      mockMessagesStream.mockReturnValue(makeThrowingStream(new MockRateLimitError()));

      let caught: unknown;
      try {
        for await (const _ of provider.stream({
          modelId: "anthropic:claude-haiku-4-5",
          systemPrompt: "s",
          messages: [{ role: "user", content: "hi" }],
        })) {
          /* noop */
        }
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(LLMError);
      const llmErr = caught as LLMError;
      expect(llmErr.code).toBe("rate_limit");
      expect(llmErr.retryable).toBe(true);
    });

    it("maps context_length_exceeded BadRequestError → context_overflow (non-retryable)", async () => {
      mockMessagesStream.mockReturnValue(
        makeThrowingStream(new MockBadRequestError("400 context_length_exceeded: input too long")),
      );

      let caught: unknown;
      try {
        for await (const _ of provider.stream({
          modelId: "anthropic:claude-haiku-4-5",
          systemPrompt: "s",
          messages: [{ role: "user", content: "hi" }],
        })) {
          /* noop */
        }
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(LLMError);
      const llmErr = caught as LLMError;
      expect(llmErr.code).toBe("context_overflow");
      expect(llmErr.retryable).toBe(false);
    });

    it("maps APIConnectionError → LLMError code network (retryable)", async () => {
      mockMessagesStream.mockReturnValue(makeThrowingStream(new MockAPIConnectionError()));

      let caught: unknown;
      try {
        for await (const _ of provider.stream({
          modelId: "anthropic:claude-haiku-4-5",
          systemPrompt: "s",
          messages: [{ role: "user", content: "hi" }],
        })) {
          /* noop */
        }
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(LLMError);
      const llmErr = caught as LLMError;
      expect(llmErr.code).toBe("network");
      expect(llmErr.retryable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AbortSignal
  // -------------------------------------------------------------------------

  describe("AbortSignal", () => {
    it("emits finish chunk with reason abort when AbortError is thrown", async () => {
      const abortErr = new Error("The operation was aborted.");
      abortErr.name = "AbortError";
      mockMessagesStream.mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<MessageStreamEvent>> {
              return Promise.reject(abortErr);
            },
          };
        },
      });

      const controller = new AbortController();
      controller.abort();

      const chunks: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const chunk of provider.stream({
        modelId: "anthropic:claude-haiku-4-5",
        systemPrompt: "s",
        messages: [{ role: "user", content: "hi" }],
        abortSignal: controller.signal,
      })) {
        chunks.push(chunk);
      }

      const finish = chunks.find((c) => c["type"] === "finish");
      expect(finish?.["type"]).toBe("finish");
      expect(finish?.["finishReason"]).toBe("abort");
    });

    it("emits abort finish chunk when signal fires mid-stream", async () => {
      const controller = new AbortController();
      const events = makeHappyPathEvents("partial text");
      let eventIndex = 0;

      mockMessagesStream.mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<MessageStreamEvent>> {
              // Abort after processing the first content_block_delta (index 2)
              if (eventIndex === 2) {
                controller.abort();
              }
              if (eventIndex < events.length) {
                const value = events[eventIndex++]!;
                return Promise.resolve({ value, done: false });
              }
              return Promise.resolve({
                value: undefined as unknown as MessageStreamEvent,
                done: true,
              });
            },
          };
        },
      });

      const chunks: Array<{ type: string; [k: string]: unknown }> = [];
      for await (const chunk of provider.stream({
        modelId: "anthropic:claude-haiku-4-5",
        systemPrompt: "s",
        messages: [{ role: "user", content: "hi" }],
        abortSignal: controller.signal,
      })) {
        chunks.push(chunk);
      }

      const finish = chunks.find((c) => c["type"] === "finish");
      expect(finish?.["type"]).toBe("finish");
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
