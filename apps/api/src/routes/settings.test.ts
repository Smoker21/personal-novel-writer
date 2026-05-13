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
    else delete process.env["HOME"];
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
    else delete process.env["USERPROFILE"];
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
});
