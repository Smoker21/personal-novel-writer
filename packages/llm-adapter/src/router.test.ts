import { describe, expect, it } from "vitest";
import { LLMError } from "./error.js";
import { LLMRouter } from "./router.js";
import type {
  GenerateRequest,
  LLMProvider,
  ModelCapabilities,
  RoutingPolicy,
  StreamChunk,
} from "./types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProvider(
  id: string,
  caps: ModelCapabilities,
  behavior: { type: "success"; text: string } | { type: "throw"; error: LLMError },
): LLMProvider {
  return {
    id,
    origin: "cloud",
    capabilities: () => caps,
    ping: async () => ({ ok: true }),
    generate: async (req) => {
      let text = "";
      for await (const chunk of makeProvider(id, caps, behavior).stream(req)) {
        if (chunk.type === "text") text += chunk.text;
      }
      return {
        text,
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: "end",
        modelId: req.modelId,
      };
    },
    stream: async function* (req) {
      if (behavior.type === "throw") {
        throw behavior.error;
      }
      yield { type: "text", text: behavior.text } satisfies StreamChunk;
      yield { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } } satisfies StreamChunk;
      yield { type: "finish", finishReason: "end", modelId: req.modelId } satisfies StreamChunk;
    },
  };
}

const visionCaps: ModelCapabilities = {
  contextWindow: 128_000,
  maxOutputTokens: 4096,
  supportsStreaming: true,
  supportsToolCalls: false,
  supportsVision: true,
};

const textOnlyCaps: ModelCapabilities = {
  contextWindow: 128_000,
  maxOutputTokens: 4096,
  supportsStreaming: true,
  supportsToolCalls: false,
  supportsVision: false,
};

const imageRequest: GenerateRequest = {
  modelId: "p1:model",
  systemPrompt: "system",
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { kind: "url", url: "https://example.com/a.png" } },
        { type: "text", text: "describe it" },
      ],
    },
  ],
};

const textRequest: GenerateRequest = {
  modelId: "p1:model",
  systemPrompt: "system",
  messages: [{ role: "user", content: "hello" }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LLMRouter", () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("streams primary model when successful", async () => {
    const primary = makeProvider("p1", visionCaps, { type: "success", text: "hello" });
    const router = new LLMRouter(new Map([["p1", primary]]));
    const policy: RoutingPolicy = { primary: "p1:model", fallbacks: [], retryPerModel: 1 };

    const chunks: StreamChunk[] = [];
    for await (const c of router.stream(textRequest, policy)) {
      chunks.push(c);
    }

    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");
    expect(text).toBe("hello");
    expect(chunks.some((c) => c.type === "degraded")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Capability-aware fallback
  // -------------------------------------------------------------------------

  it("skips text-only fallback when request contains images", async () => {
    const primary = makeProvider("p1", textOnlyCaps, {
      type: "throw",
      error: new LLMError("model_lacks_capability", "p1", "no vision", false),
    });
    const fallback = makeProvider("p2", textOnlyCaps, {
      type: "success",
      text: "should not reach",
    });
    const visionFallback = makeProvider("p3", visionCaps, {
      type: "success",
      text: "vision result",
    });

    const router = new LLMRouter(
      new Map([
        ["p1", primary],
        ["p2", fallback],
        ["p3", visionFallback],
      ]),
    );
    const policy: RoutingPolicy = {
      primary: "p1:model",
      fallbacks: ["p2:model", "p3:model"],
      retryPerModel: 1,
    };

    const chunks: StreamChunk[] = [];
    for await (const c of router.stream(imageRequest, policy)) {
      chunks.push(c);
    }

    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");
    expect(text).toBe("vision result");

    // p2 was skipped; degraded goes from p1 to p3
    const degraded = chunks.find((c) => c.type === "degraded") as
      | { type: "degraded"; fromModel: string; toModel: string }
      | undefined;
    expect(degraded).toBeDefined();
    expect(degraded?.fromModel).toBe("p1:model");
    expect(degraded?.toModel).toBe("p3:model");
  });

  it("emits degraded chunk when fallback is used", async () => {
    const primary = makeProvider("p1", visionCaps, {
      type: "throw",
      error: new LLMError("rate_limit", "p1", "rate limited", true),
    });
    const fallback = makeProvider("p2", visionCaps, { type: "success", text: "fallback text" });

    const router = new LLMRouter(
      new Map([
        ["p1", primary],
        ["p2", fallback],
      ]),
    );
    const policy: RoutingPolicy = {
      primary: "p1:model",
      fallbacks: ["p2:model"],
      retryPerModel: 1,
    };

    const chunks: StreamChunk[] = [];
    for await (const c of router.stream(textRequest, policy)) {
      chunks.push(c);
    }

    const degraded = chunks.find((c) => c.type === "degraded") as
      | { type: "degraded"; fromModel: string; toModel: string }
      | undefined;
    expect(degraded).toBeDefined();
    expect(degraded?.fromModel).toBe("p1:model");
    expect(degraded?.toModel).toBe("p2:model");
  });

  it("throws when all fallbacks are exhausted", async () => {
    const primary = makeProvider("p1", visionCaps, {
      type: "throw",
      error: new LLMError("rate_limit", "p1", "rate limited", true),
    });
    const router = new LLMRouter(new Map([["p1", primary]]));
    const policy: RoutingPolicy = { primary: "p1:model", fallbacks: [], retryPerModel: 1 };

    await expect(async () => {
      for await (const _ of router.stream(textRequest, policy)) {
        // drain
      }
    }).rejects.toMatchObject({ code: "rate_limit" });
  });

  it("throws immediately on non-retryable error (unauthorized)", async () => {
    const primary = makeProvider("p1", visionCaps, {
      type: "throw",
      error: new LLMError("unauthorized", "p1", "bad key", false),
    });
    const fallback = makeProvider("p2", visionCaps, { type: "success", text: "should not reach" });

    const router = new LLMRouter(
      new Map([
        ["p1", primary],
        ["p2", fallback],
      ]),
    );
    const policy: RoutingPolicy = {
      primary: "p1:model",
      fallbacks: ["p2:model"],
      retryPerModel: 1,
    };

    await expect(async () => {
      for await (const _ of router.stream(textRequest, policy)) {
        // drain
      }
    }).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("throws when no provider is registered", async () => {
    const router = new LLMRouter(new Map());
    const policy: RoutingPolicy = { primary: "p1:model", fallbacks: [], retryPerModel: 1 };

    await expect(async () => {
      for await (const _ of router.stream(textRequest, policy)) {
        // drain
      }
    }).rejects.toMatchObject({ code: "model_not_found" });
  });

  // -------------------------------------------------------------------------
  // generate() accumulation
  // -------------------------------------------------------------------------

  it("generate() accumulates text from stream", async () => {
    const primary = makeProvider("p1", visionCaps, { type: "success", text: "hello world" });
    const router = new LLMRouter(new Map([["p1", primary]]));
    const policy: RoutingPolicy = { primary: "p1:model", fallbacks: [], retryPerModel: 1 };

    const result = await router.generate(textRequest, policy);
    expect(result.text).toBe("hello world");
    expect(result.usage.inputTokens).toBe(10);
  });
});
