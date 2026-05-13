import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testProvider } from "./provider-tester.js";

type FetchSignature = typeof globalThis.fetch;

function mockFetch() {
  return vi.spyOn(globalThis, "fetch") as unknown as ReturnType<typeof vi.fn<FetchSignature>>;
}

describe("testProvider", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch();
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("anthropic — calls /v1/models with x-api-key header", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: [{}, {}] }), { status: 200 }));
    const result = await testProvider("anthropic", { enabled: true, apiKey: "sk-ant-xxx" });
    expect(result.ok).toBe(true);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    expect(String(call[0])).toContain("api.anthropic.com/v1/models");
    expect((call[1] as RequestInit).headers).toMatchObject({ "x-api-key": "sk-ant-xxx" });
  });

  it("openai — calls /v1/models with Bearer", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    const result = await testProvider("openai", { enabled: true, apiKey: "sk-xxx" });
    expect(result.ok).toBe(true);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-xxx");
  });

  it("google — embeds key in query string", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const result = await testProvider("google", { enabled: true, apiKey: "AIza-xxx" });
    expect(result.ok).toBe(true);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    expect(String(call[0])).toContain("key=AIza-xxx");
  });

  it("ollama — uses configured endpoint", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const result = await testProvider("ollama", {
      enabled: true,
      endpoint: "http://localhost:11434",
    });
    expect(result.ok).toBe(true);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    expect(String(call[0])).toContain("localhost:11434/v1/models");
  });

  it("returns error when status not ok", async () => {
    fetchSpy.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const result = await testProvider("anthropic", { enabled: true, apiKey: "wrong" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("401");
  });

  it("returns error when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Network failure"));
    const result = await testProvider("anthropic", { enabled: true, apiKey: "x" });
    expect(result.ok).toBe(false);
  });

  it("returns error when missing required config", async () => {
    const result = await testProvider("anthropic", { enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/api[_ ]key/i);
  });
});
