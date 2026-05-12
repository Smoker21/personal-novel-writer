import { describe, it, expect, vi, beforeEach } from "vitest";

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
import * as yaml from "js-yaml";
import { readSettings, writeSettings, mergeDefaults, maskApiKey, getApiKey } from "./settings-store.js";
import type { NovelWriterSettings } from "./settings-store.js";

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

    expect(settings.providers).toEqual({});
    expect(settings.defaults.routing.primary).toBe("anthropic:claude-sonnet-4-6");
    expect(settings.meta.schemaVersion).toBe(1);
  });

  it("merges stored settings with defaults", async () => {
    const stored: Partial<NovelWriterSettings> = {
      providers: { anthropic: { apiKey: "sk-ant-abc123" } },
    };
    readFile.mockResolvedValue("yaml-content" as unknown as string);
    yamlLoad.mockReturnValue(stored);

    const settings = await readSettings();

    expect(settings.providers.anthropic?.apiKey).toBe("sk-ant-abc123");
    // defaults should fill the missing fields
    expect(settings.defaults.routing.primary).toBe("anthropic:claude-sonnet-4-6");
  });

  it("returns defaults when yaml parses to null", async () => {
    readFile.mockResolvedValue("" as unknown as string);
    yamlLoad.mockReturnValue(null);

    const settings = await readSettings();
    expect(settings.providers).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// maskApiKey
// ---------------------------------------------------------------------------

describe("maskApiKey", () => {
  it("masks anthropic-style key correctly", () => {
    expect(maskApiKey("sk-ant-abc123")).toBe("sk-ant-...123");
  });

  it("masks openai-style key", () => {
    expect(maskApiKey("sk-proj-longkeyhere")).toBe("sk-proj-...ere");
  });

  it("returns *** for very short keys", () => {
    expect(maskApiKey("abc")).toBe("***");
  });

  it("handles key with no dash", () => {
    expect(maskApiKey("abc12345678")).toBe("abc...678");
  });
});

// ---------------------------------------------------------------------------
// mergeDefaults
// ---------------------------------------------------------------------------

describe("mergeDefaults", () => {
  it("does not overwrite existing fields", () => {
    const partial: Partial<NovelWriterSettings> = {
      defaults: {
        routing: {
          primary: "openai:gpt-4",
          fallbacks: ["anthropic:claude-sonnet-4-6"],
          retryPerModel: 1,
        },
      },
    };

    const result = mergeDefaults(partial);
    expect(result.defaults.routing.primary).toBe("openai:gpt-4");
    expect(result.defaults.routing.retryPerModel).toBe(1);
    // unspecified fields stay at defaults
    expect(result.providers).toEqual({});
    expect(result.meta.schemaVersion).toBe(1);
  });

  it("fills missing top-level keys from defaults", () => {
    const result = mergeDefaults({ recentProjects: [] });
    expect(result.defaults.routing.fallbacks).toEqual([]);
    expect(result.meta.firstLaunchWarningAcknowledged).toBe(false);
  });

  it("deep-merges nested objects without losing sibling fields", () => {
    const partial: Partial<NovelWriterSettings> = {
      meta: {
        firstLaunchWarningAcknowledged: true,
        schemaVersion: 1,
      },
    };
    const result = mergeDefaults(partial);
    expect(result.meta.firstLaunchWarningAcknowledged).toBe(true);
    expect(result.meta.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------

describe("getApiKey", () => {
  const baseSettings: NovelWriterSettings = {
    providers: {
      anthropic: { apiKey: "sk-ant-secret" },
      openai: { apiKey: "sk-openai-secret" },
    },
    defaults: {
      routing: { primary: "anthropic:claude-sonnet-4-6", fallbacks: [], retryPerModel: 3 },
    },
    recentProjects: [],
    meta: { firstLaunchWarningAcknowledged: false, schemaVersion: 1 },
  };

  it("returns the api key for a configured provider", () => {
    expect(getApiKey(baseSettings, "anthropic")).toBe("sk-ant-secret");
    expect(getApiKey(baseSettings, "openai")).toBe("sk-openai-secret");
  });

  it("returns undefined for an unknown provider", () => {
    expect(getApiKey(baseSettings, "unknown-provider")).toBeUndefined();
  });

  it("returns undefined for a provider with no apiKey set", () => {
    const noKey: NovelWriterSettings = {
      ...baseSettings,
      providers: { anthropic: {} },
    };
    expect(getApiKey(noKey, "anthropic")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// writeSettings (smoke test)
// ---------------------------------------------------------------------------

describe("writeSettings", () => {
  it("does not throw for a valid settings object", async () => {
    const settings = mergeDefaults({});
    await expect(writeSettings(settings)).resolves.toBeUndefined();
  });
});
