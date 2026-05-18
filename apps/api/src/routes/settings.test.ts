import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "./settings.js";

describe("settings routes", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "settings-routes-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(
      new Response(JSON.stringify({ data: [{}] }), { status: 200 }) as never,
    );
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else process.env["HOME"] = undefined;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
    else process.env["USERPROFILE"] = undefined;
    vi.restoreAllMocks();
  });

  it("GET / returns masked settings with schemaVersion 1", async () => {
    const res = await settings.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schemaVersion: number };
    expect(body.schemaVersion).toBe(1);
  });

  it("PUT / writes settings", async () => {
    const payload = {
      schemaVersion: 1,
      providers: {
        anthropic: { enabled: true, apiKey: "sk-ant-real" },
        openai: { enabled: false },
        google: { enabled: false },
        xai: { enabled: false },
        ollama: { enabled: false },
        lmstudio: { enabled: false },
        "rwkv-runner": { enabled: false },
      },
      routing: {},
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
  });

  it("POST /test-provider returns ok for valid config", async () => {
    const res = await settings.request("/test-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: "anthropic",
        config: { enabled: true, apiKey: "sk-ant-x" },
      }),
    });
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /reset wipes settings to defaults", async () => {
    const res = await settings.request("/reset", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("GET /secret/:provider returns 400 for invalid provider", async () => {
    const res = await settings.request("/secret/badname");
    expect(res.status).toBe(400);
  });

  // ── M6: INVALID_ROUTING_SLOT 白名單驗證 ──────────────────────────────────────

  const baseProviders = {
    anthropic: { enabled: true, apiKey: "sk-ant-real" },
    openai: { enabled: false },
    google: { enabled: false },
    xai: { enabled: false },
    ollama: { enabled: false },
    lmstudio: { enabled: false },
    "rwkv-runner": { enabled: false },
    xiaohuangwen: { enabled: true, apiKey: "xhw-key", version: "latest" },
  };

  it("PUT / 400 INVALID_ROUTING_SLOT when xiaohuangwen in statusUpdater slot (primary)", async () => {
    const payload = {
      schemaVersion: 1,
      providers: baseProviders,
      routing: {
        statusUpdater: { primary: "xiaohuangwen:latest", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_ROUTING_SLOT");
  });

  it("PUT / 400 INVALID_ROUTING_SLOT when xiaohuangwen in fallbacks of statusUpdater slot", async () => {
    const payload = {
      schemaVersion: 1,
      providers: baseProviders,
      routing: {
        statusUpdater: { primary: "anthropic:claude-haiku-4-5", fallbacks: ["xiaohuangwen:latest"] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_ROUTING_SLOT");
  });

  it("PUT / 200 when xiaohuangwen in chapterWriter slot (primary)", async () => {
    const payload = {
      schemaVersion: 1,
      providers: baseProviders,
      routing: {
        chapterWriter: { primary: "xiaohuangwen:latest", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
  });

  it("PUT / 200 when xiaohuangwen in polishProse slot (primary)", async () => {
    const payload = {
      schemaVersion: 1,
      providers: baseProviders,
      routing: {
        polishProse: { primary: "xiaohuangwen:latest", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
  });

  it("PUT / preserves polishProse routing key in GET response", async () => {
    const payload = {
      schemaVersion: 1,
      providers: baseProviders,
      routing: {
        polishProse: { primary: "xiaohuangwen:latest", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const getRes = await settings.request("/");
    const body = (await getRes.json()) as { routing: Record<string, unknown> };
    expect(body.routing["polishProse"]).toEqual({ primary: "xiaohuangwen:latest", fallbacks: [] });
  });

  // ── M6: GET /balance/:providerId ─────────────────────────────────────────────

  it("GET /balance/xiaohuangwen 200 with remainingWords", async () => {
    // First save settings with xiaohuangwen enabled
    await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        providers: baseProviders,
        routing: {},
        recentProjects: [],
        meta: { firstLaunchWarningAcknowledged: false },
      }),
    });

    // Mock the balance endpoint to return success
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "success", remaining_words: 12345 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    const res = await settings.request("/balance/xiaohuangwen");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { providerId: string; remainingWords: number; currency: string };
    expect(body.providerId).toBe("xiaohuangwen");
    expect(body.remainingWords).toBe(12345);
    expect(body.currency).toBe("words");
  });

  it("GET /balance/anthropic 400 BALANCE_NOT_SUPPORTED", async () => {
    const res = await settings.request("/balance/anthropic");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("BALANCE_NOT_SUPPORTED");
  });

  it("GET /balance/xiaohuangwen 400 PROVIDER_DISABLED when xiaohuangwen not configured", async () => {
    // Default settings has xiaohuangwen disabled with no apiKey
    const res = await settings.request("/balance/xiaohuangwen");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PROVIDER_DISABLED");
  });

  it("GET /balance/xiaohuangwen 401 UNAUTHORIZED when API key invalid", async () => {
    // Save settings with xiaohuangwen enabled
    await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        providers: baseProviders,
        routing: {},
        recentProjects: [],
        meta: { firstLaunchWarningAcknowledged: false },
      }),
    });

    vi.spyOn(globalThis, "fetch" as never).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }) as never,
    );

    const res = await settings.request("/balance/xiaohuangwen");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("GET /balance/unknown-provider 400 INVALID_PROVIDER", async () => {
    const res = await settings.request("/balance/not-a-provider");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PROVIDER");
  });

  // ── Regression（手測抓到）: routing 5 個 key 不被 zod schema strip ─────────
  it("PUT / preserves all 5 routing keys (regression: zod stripped non-listed keys)", async () => {
    const payload = {
      schemaVersion: 1,
      providers: {
        anthropic: { enabled: true, apiKey: "sk-ant-real", defaultModel: "claude-haiku-4-5" },
        openai: { enabled: false },
        google: { enabled: false },
        xai: { enabled: false },
        ollama: { enabled: false },
        lmstudio: { enabled: false },
        "rwkv-runner": { enabled: false },
      },
      routing: {
        chapterWriter: { primary: "anthropic:claude-haiku-4-5", fallbacks: [] },
        characterCardConsolidator: { primary: "anthropic:claude-haiku-4-5", fallbacks: [] },
        characterImageExtractor: { primary: "anthropic:claude-haiku-4-5", fallbacks: [] },
        statusUpdater: { primary: "anthropic:claude-haiku-4-5", fallbacks: [] },
        statusShortener: { primary: "anthropic:claude-haiku-4-5", fallbacks: [] },
      },
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const putRes = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(putRes.status).toBe(200);

    const getRes = await settings.request("/");
    const body = (await getRes.json()) as { routing: Record<string, unknown> };
    expect(Object.keys(body.routing).sort()).toEqual(
      [
        "chapterWriter",
        "characterCardConsolidator",
        "characterImageExtractor",
        "statusShortener",
        "statusUpdater",
      ].sort(),
    );
    expect(body.routing["characterCardConsolidator"]).toEqual({
      primary: "anthropic:claude-haiku-4-5",
      fallbacks: [],
    });
    expect(body.routing["characterImageExtractor"]).toEqual({
      primary: "anthropic:claude-haiku-4-5",
      fallbacks: [],
    });
    expect(body.routing["statusShortener"]).toEqual({
      primary: "anthropic:claude-haiku-4-5",
      fallbacks: [],
    });
  });
});
