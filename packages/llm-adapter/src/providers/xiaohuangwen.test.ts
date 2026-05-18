import { describe, expect, it } from "vitest";
import { LLMError } from "../error.js";
import type { StreamChunk } from "../types.js";
import { XiaohuangwenAdapter } from "./xiaohuangwen.js";

// ---------------------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/**
 * 建立一個假 fetch 並收集呼叫紀錄。`responder` 拿到 URL + init 回 Response（或 throw）。
 */
function makeFetch(responder: (call: FetchCall) => Response | Promise<Response>): {
  fn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fn = (async (input: unknown, init?: RequestInit) => {
    const call: FetchCall = { url: String(input), init };
    calls.push(call);
    return await responder(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/** 把字串切成多塊 chunk，回傳 ReadableStream<Uint8Array>。 */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      // biome-ignore lint/style/noNonNullAssertion: i < length guarantees defined
      controller.enqueue(enc.encode(chunks[i]!));
      i++;
    },
  });
}

/** 模擬 abort：cancel 時 reject 一個 AbortError。 */
function streamThatBlocksUntilAbort(signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        const err = new Error("aborted");
        (err as Error & { name: string }).name = "AbortError";
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    },
  });
}

/** 收集 AsyncIterable<StreamChunk> 全部 chunk。 */
async function drain(iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

// ---------------------------------------------------------------------------
// LLMProvider 介面合約 — 純 structured provider 拒接 messages-array
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter — LLMProvider surface", () => {
  it("origin = 'novel-api', id = 'xiaohuangwen'", () => {
    const a = new XiaohuangwenAdapter(
      "sk-fake",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    expect(a.id).toBe("xiaohuangwen");
    expect(a.origin).toBe("novel-api");
  });

  it("capabilities() 對 'latest' / 'stable' 回 hasStructuredNovelGenerate=true", () => {
    const a = new XiaohuangwenAdapter(
      "sk-fake",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    const caps = a.capabilities("xiaohuangwen:latest");
    expect(caps).not.toBeNull();
    expect(caps?.hasStructuredNovelGenerate).toBe(true);
    expect(caps?.supportsStreaming).toBe(true);
    expect(caps?.supportsVision).toBe(false);
    expect(a.capabilities("xiaohuangwen:stable")?.hasStructuredNovelGenerate).toBe(true);
  });

  it("capabilities() 對未知 version 回 null", () => {
    const a = new XiaohuangwenAdapter(
      "sk-fake",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    expect(a.capabilities("xiaohuangwen:unknown")).toBeNull();
  });

  it("listModels() 回硬編兩個 version（不打 HTTP）", async () => {
    const { fn, calls } = makeFetch(() => {
      throw new Error("should not fetch");
    });
    const a = new XiaohuangwenAdapter("sk-fake", "https://example.test", fn);
    const models = await a.listModels();
    expect(models.map((m) => m.id)).toEqual(["latest", "stable"]);
    expect(calls.length).toBe(0);
  });

  it("stream() 直接 throw operation_not_supported", async () => {
    const a = new XiaohuangwenAdapter(
      "sk-fake",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    await expect(async () => {
      for await (const _ of a.stream({
        modelId: "xiaohuangwen:latest",
        systemPrompt: "",
        messages: [],
      })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "operation_not_supported" });
  });

  it("generate() 直接 throw operation_not_supported", async () => {
    const a = new XiaohuangwenAdapter(
      "sk-fake",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    await expect(
      a.generate({ modelId: "xiaohuangwen:latest", systemPrompt: "", messages: [] }),
    ).rejects.toMatchObject({ code: "operation_not_supported" });
  });
});

// ---------------------------------------------------------------------------
// generateNovel — stream parse
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter.generateNovel — stream parse", () => {
  it("分批 chunk 正確 yield text + usage + finish", async () => {
    const { fn, calls } = makeFetch(() => {
      return new Response(streamFromChunks(["你好", "，世界", "。"]), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    });
    const a = new XiaohuangwenAdapter("sk-fake-key", "https://example.test", fn);

    const chunks = await drain(a.generateNovel({ plot: "戰鬥開始", requirements: "短一點" }));

    const texts = chunks
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text);
    expect(texts.join("")).toBe("你好，世界。");

    const usage = chunks.find((c) => c.type === "usage") as
      | { type: "usage"; usage: { outputTokens: number } }
      | undefined;
    expect(usage).toBeDefined();
    // codepoint 計：6 個字（你好，世界。）
    expect(usage?.usage.outputTokens).toBe(6);

    const finish = chunks.find((c) => c.type === "finish") as
      | { type: "finish"; finishReason: string; modelId: string }
      | undefined;
    expect(finish?.finishReason).toBe("end");
    expect(finish?.modelId).toBe("xiaohuangwen:latest");

    // 驗請求
    expect(calls.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    expect(calls[0]!.url).toBe("https://example.test/api/v1/generate");
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    const init = calls[0]!.init;
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-fake-key");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body["plot"]).toBe("戰鬥開始");
    expect(body["requirements"]).toBe("短一點");
    expect(body["version"]).toBe("latest");
  });

  it("空 plot throw（必填驗證）", async () => {
    const a = new XiaohuangwenAdapter(
      "sk",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "" })) {
        // drain
      }
    }).rejects.toBeInstanceOf(LLMError);
  });

  it("version=stable 透傳", async () => {
    const { fn, calls } = makeFetch(() => {
      return new Response(streamFromChunks(["x"]), { status: 200 });
    });
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await drain(a.generateNovel({ plot: "abc", version: "stable" }));
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    const body = JSON.parse(calls[0]!.init?.body as string) as Record<string, unknown>;
    expect(body["version"]).toBe("stable");
  });
});

// ---------------------------------------------------------------------------
// generateNovel — error mapping
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter.generateNovel — error mapping", () => {
  it("401 → unauthorized", async () => {
    const { fn } = makeFetch(() => new Response("invalid key", { status: 401 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("403 → unauthorized", async () => {
    const { fn } = makeFetch(() => new Response("forbidden", { status: 403 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("402 → quota_exhausted", async () => {
    const { fn } = makeFetch(() => new Response("payment required", { status: 402 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "quota_exhausted" });
  });

  it("body 含「餘額不足」→ quota_exhausted（即使 HTTP status 不是 402）", async () => {
    const { fn } = makeFetch(() => new Response("錯誤：餘額不足，請充值", { status: 400 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "quota_exhausted" });
  });

  it("429 → rate_limit (retryable)", async () => {
    const { fn } = makeFetch(() => new Response("too many requests", { status: 429 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    try {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("rate_limit");
      expect((err as LLMError).retryable).toBe(true);
    }
  });

  it("500 → network (retryable)", async () => {
    const { fn } = makeFetch(() => new Response("server error", { status: 500 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    try {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as LLMError).code).toBe("network");
      expect((err as LLMError).retryable).toBe(true);
    }
  });

  it("503 → network (retryable)", async () => {
    const { fn } = makeFetch(() => new Response("unavailable", { status: 503 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "network", retryable: true });
  });

  it("400 一般輸入錯誤 → unknown（spec 011 line 213）", async () => {
    const { fn } = makeFetch(() => new Response("bad input", { status: 400 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "unknown" });
  });

  it("fetch 拋出 → network (retryable)", async () => {
    const fn = (async () => {
      throw new Error("ECONNRESET socket hang up");
    }) as unknown as typeof fetch;
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "network", retryable: true });
  });

  it("錯誤訊息會 redact API key", async () => {
    const { fn } = makeFetch(
      () => new Response("Bearer sk-abcdefghijklmnopqrstuvwxyz1234567890 invalid", { status: 401 }),
    );
    const a = new XiaohuangwenAdapter(
      "sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "https://example.test",
      fn,
    );
    try {
      for await (const _ of a.generateNovel({ plot: "x" })) {
        // drain
      }
    } catch (err) {
      expect((err as LLMError).message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
      expect((err as LLMError).message).toContain("[REDACTED]");
    }
  });
});

// ---------------------------------------------------------------------------
// generateNovel — abort
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter.generateNovel — abort", () => {
  it("已 aborted 的 signal 立刻 yield finish:abort", async () => {
    const { fn, calls } = makeFetch(() => new Response(streamFromChunks(["x"]), { status: 200 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    const ctrl = new AbortController();
    ctrl.abort();
    const chunks = await drain(a.generateNovel({ plot: "p", abortSignal: ctrl.signal }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "finish", finishReason: "abort" });
    // 不該打 HTTP
    expect(calls.length).toBe(0);
  });

  it("stream 中途 abort → yield finish:abort 而非 throw", async () => {
    const ctrl = new AbortController();
    const { fn } = makeFetch(() => {
      return new Response(streamThatBlocksUntilAbort(ctrl.signal), { status: 200 });
    });
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);

    // 排程下一個 tick 觸發 abort
    setTimeout(() => ctrl.abort(), 5);

    const chunks: StreamChunk[] = [];
    for await (const c of a.generateNovel({ plot: "p", abortSignal: ctrl.signal })) {
      chunks.push(c);
    }
    const finish = chunks.find((c) => c.type === "finish");
    expect(finish).toMatchObject({ type: "finish", finishReason: "abort" });
  });
});

// ---------------------------------------------------------------------------
// polishNovel
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter.polishNovel", () => {
  it("傳 pre_output + polish_input 到 /api/v1/polish", async () => {
    const { fn, calls } = makeFetch(
      () => new Response(streamFromChunks(["潤完"]), { status: 200 }),
    );
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    const chunks = await drain(a.polishNovel({ pre_output: "原文", polish_input: "更口語" }));

    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");
    expect(text).toBe("潤完");

    expect(calls.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    expect(calls[0]!.url).toBe("https://example.test/api/v1/polish");
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    const body = JSON.parse(calls[0]!.init?.body as string) as Record<string, unknown>;
    expect(body["pre_output"]).toBe("原文");
    expect(body["polish_input"]).toBe("更口語");
    expect(body["version"]).toBe("latest");
  });

  it("空 pre_output throw", async () => {
    const a = new XiaohuangwenAdapter(
      "sk",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    await expect(async () => {
      for await (const _ of a.polishNovel({ pre_output: "", polish_input: "x" })) {
        // drain
      }
    }).rejects.toBeInstanceOf(LLMError);
  });

  it("空 polish_input throw", async () => {
    const a = new XiaohuangwenAdapter(
      "sk",
      "https://example.test",
      makeFetch(() => new Response("")).fn,
    );
    await expect(async () => {
      for await (const _ of a.polishNovel({ pre_output: "x", polish_input: "" })) {
        // drain
      }
    }).rejects.toBeInstanceOf(LLMError);
  });

  it("polishNovel 401 → unauthorized", async () => {
    const { fn } = makeFetch(() => new Response("invalid", { status: 401 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.polishNovel({ pre_output: "x", polish_input: "y" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("polishNovel 402 → quota_exhausted", async () => {
    const { fn } = makeFetch(() => new Response("no quota", { status: 402 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(async () => {
      for await (const _ of a.polishNovel({ pre_output: "x", polish_input: "y" })) {
        // drain
      }
    }).rejects.toMatchObject({ code: "quota_exhausted" });
  });

  it("polishNovel abort", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { fn, calls } = makeFetch(() => new Response(streamFromChunks(["x"]), { status: 200 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    const chunks = await drain(
      a.polishNovel({ pre_output: "x", polish_input: "y", abortSignal: ctrl.signal }),
    );
    expect(chunks).toEqual([
      { type: "finish", finishReason: "abort", modelId: "xiaohuangwen:latest" },
    ]);
    expect(calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter.getBalance", () => {
  it("200 + remaining_words → { remainingWords, currency: words }", async () => {
    const { fn, calls } = makeFetch(() => {
      return new Response(JSON.stringify({ status: "success", remaining_words: 9876 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const a = new XiaohuangwenAdapter("sk-bal", "https://example.test", fn);
    const balance = await a.getBalance();
    expect(balance.remainingWords).toBe(9876);
    expect(balance.currency).toBe("words");

    expect(calls.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    expect(calls[0]!.url).toBe("https://example.test/api/v1/balance");
    // biome-ignore lint/style/noNonNullAssertion: calls[0] exists
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-bal");
  });

  it("401 → unauthorized", async () => {
    const { fn } = makeFetch(() => new Response("nope", { status: 401 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(a.getBalance()).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("500 → network (retryable)", async () => {
    const { fn } = makeFetch(() => new Response("oops", { status: 500 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(a.getBalance()).rejects.toMatchObject({ code: "network", retryable: true });
  });

  it("回應缺 remaining_words → unknown", async () => {
    const { fn } = makeFetch(() => {
      return new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(a.getBalance()).rejects.toMatchObject({ code: "unknown" });
  });

  it("非 JSON body → network", async () => {
    const { fn } = makeFetch(() => new Response("<html>not json</html>", { status: 200 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(a.getBalance()).rejects.toMatchObject({ code: "network" });
  });

  it("fetch 拋出 → network (retryable)", async () => {
    const fn = (async () => {
      throw new Error("ETIMEDOUT");
    }) as unknown as typeof fetch;
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    await expect(a.getBalance()).rejects.toMatchObject({ code: "network", retryable: true });
  });
});

// ---------------------------------------------------------------------------
// ping — 走 balance 端點當 health check
// ---------------------------------------------------------------------------

describe("XiaohuangwenAdapter.ping", () => {
  it("balance 成功 → ok=true", async () => {
    const { fn } = makeFetch(
      () =>
        new Response(JSON.stringify({ status: "success", remaining_words: 100 }), { status: 200 }),
    );
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    const result = await a.ping();
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("balance 失敗 → ok=false（不 throw）", async () => {
    const { fn } = makeFetch(() => new Response("nope", { status: 401 }));
    const a = new XiaohuangwenAdapter("sk", "https://example.test", fn);
    const result = await a.ping();
    expect(result.ok).toBe(false);
  });
});
