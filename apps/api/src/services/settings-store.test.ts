import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before importing the module under test.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/mock-home"),
}));

vi.mock("js-yaml", () => ({
  load: vi.fn(),
  dump: vi.fn().mockReturnValue("yaml-content"),
}));

// atomic-fs is imported by settings-store; mock it too to avoid real FS.
vi.mock("./atomic-fs.js", () => ({
  atomicWriteFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fsp from "node:fs/promises";
import { defaultSettings } from "@novel-writer/shared-types";
import type { AppSettings } from "@novel-writer/shared-types";
import * as yaml from "js-yaml";
import {
  getApiKey,
  maskApiKey,
  maskSettings,
  readSettings,
  writeSettings,
} from "./settings-store.js";

const readFile = vi.mocked(fsp.readFile);
const yamlLoad = vi.mocked(yaml.load);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// readSettings
// ---------------------------------------------------------------------------

describe("readSettings", () => {
  it("returns defaults when settings file does not exist", async () => {
    const notFound = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    readFile.mockRejectedValue(notFound);

    const settings = await readSettings();

    expect(settings.schemaVersion).toBe(1);
    expect(settings.providers.anthropic).toEqual({ enabled: false });
    expect(settings.providers.ollama.endpoint).toBe("http://localhost:11434");
    expect(settings.meta.firstLaunchWarningAcknowledged).toBe(false);
  });

  it("merges stored settings with defaults", async () => {
    const stored: Partial<AppSettings> = {
      providers: {
        ...defaultSettings().providers,
        anthropic: { enabled: true, apiKey: "sk-ant-abc123" },
      },
    };
    readFile.mockResolvedValue("yaml-content" as unknown as string);
    yamlLoad.mockReturnValue(stored);

    const settings = await readSettings();

    expect(settings.providers.anthropic.apiKey).toBe("sk-ant-abc123");
    expect(settings.providers.anthropic.enabled).toBe(true);
    // defaults should fill missing fields
    expect(settings.providers.openai.enabled).toBe(false);
    expect(settings.routing).toEqual({});
  });

  it("returns defaults when yaml parses to null", async () => {
    readFile.mockResolvedValue("" as unknown as string);
    yamlLoad.mockReturnValue(null);

    const settings = await readSettings();
    expect(settings.schemaVersion).toBe(1);
    expect(settings.providers.anthropic).toEqual({ enabled: false });
  });

  it("returns defaults when file is empty string", async () => {
    readFile.mockResolvedValue("   " as unknown as string);
    // readSettings returns early before calling yaml.load on whitespace-only input
    const settings = await readSettings();
    expect(settings.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// maskApiKey (re-exported from shared-types)
// ---------------------------------------------------------------------------

describe("maskApiKey", () => {
  it("masks a key with enough length (shared-types format: first6***last4)", () => {
    // shared-types maskApiKey: slice(0,6) + "***" + slice(-4)
    expect(maskApiKey("sk-ant-abc123")).toBe("sk-ant***c123");
  });

  it("returns *** for very short keys (length <= 8)", () => {
    expect(maskApiKey("abc")).toBe("***");
    expect(maskApiKey("abcdefgh")).toBe("***"); // exactly 8 chars → ***
  });

  it("returns empty string for undefined", () => {
    expect(maskApiKey(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// maskSettings
// ---------------------------------------------------------------------------

describe("maskSettings", () => {
  it("masks api keys in providers", () => {
    const settings: AppSettings = {
      ...defaultSettings(),
      providers: {
        ...defaultSettings().providers,
        anthropic: { enabled: true, apiKey: "sk-ant-realkey" },
      },
    };
    const masked = maskSettings(settings);
    expect(masked.providers.anthropic.apiKey).not.toBe("sk-ant-realkey");
    expect(masked.providers.anthropic.apiKey).toContain("***");
  });

  it("does not modify providers without apiKey", () => {
    const settings = defaultSettings();
    const masked = maskSettings(settings);
    expect(masked.providers.ollama.apiKey).toBeUndefined();
    expect(masked.providers.anthropic.apiKey).toBeUndefined();
  });

  it("does not mutate original settings", () => {
    const settings: AppSettings = {
      ...defaultSettings(),
      providers: {
        ...defaultSettings().providers,
        openai: { enabled: true, apiKey: "sk-openai-real" },
      },
    };
    maskSettings(settings);
    expect(settings.providers.openai.apiKey).toBe("sk-openai-real");
  });
});

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------

describe("getApiKey", () => {
  const baseSettings: AppSettings = {
    ...defaultSettings(),
    providers: {
      ...defaultSettings().providers,
      anthropic: { enabled: true, apiKey: "sk-ant-secret" },
      openai: { enabled: true, apiKey: "sk-openai-secret" },
    },
  };

  it("returns the api key for a configured provider", () => {
    expect(getApiKey(baseSettings, "anthropic")).toBe("sk-ant-secret");
    expect(getApiKey(baseSettings, "openai")).toBe("sk-openai-secret");
  });

  it("returns empty string for a provider with no apiKey set", () => {
    expect(getApiKey(baseSettings, "ollama")).toBe("");
  });

  it("returns empty string for a provider that is enabled but has no key", () => {
    const noKey: AppSettings = {
      ...baseSettings,
      providers: {
        ...baseSettings.providers,
        google: { enabled: true },
      },
    };
    expect(getApiKey(noKey, "google")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// writeSettings (smoke test)
// ---------------------------------------------------------------------------

describe("writeSettings", () => {
  it("does not throw for a valid settings object", async () => {
    const settings = defaultSettings();
    await expect(writeSettings(settings)).resolves.toBeUndefined();
  });
});
