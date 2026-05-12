import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { atomicWriteFile } from "./atomic-fs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NovelWriterSettings {
  providers: {
    anthropic?: { apiKey?: string };
    openai?: { apiKey?: string };
    google?: { apiKey?: string };
    ollama?: { endpoint?: string };
    lmstudio?: { endpoint?: string };
  };
  defaults: {
    routing: {
      primary: string;
      fallbacks: string[];
      retryPerModel: number;
    };
  };
  recentProjects: Array<{ path: string; name: string; lastOpenedAt: string }>;
  meta: {
    firstLaunchWarningAcknowledged: boolean;
    schemaVersion: number;
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: NovelWriterSettings = {
  providers: {},
  defaults: {
    routing: {
      primary: "anthropic:claude-sonnet-4-6",
      fallbacks: [],
      retryPerModel: 3,
    },
  },
  recentProjects: [],
  meta: { firstLaunchWarningAcknowledged: false, schemaVersion: 1 },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function settingsFilePath(): string {
  return join(homedir(), ".novel-writer", "settings.yaml");
}

/**
 * Deep-merge `override` into `base`. Objects are recursed; arrays and
 * primitives in `override` fully replace the corresponding value in `base`.
 * Fields absent in `override` are kept from `base`.
 */
function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  const src = override as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    const srcVal = src[key];
    const baseVal = result[key];

    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }

  return result as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read settings from ~/.novel-writer/settings.yaml.
 * Returns defaults if the file does not exist or is empty.
 */
export async function readSettings(): Promise<NovelWriterSettings> {
  const filePath = settingsFilePath();
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return structuredClone(DEFAULTS);
    }
    throw err;
  }

  const parsed = yamlLoad(raw);
  if (parsed === null || parsed === undefined || typeof parsed !== "object") {
    return structuredClone(DEFAULTS);
  }

  return mergeDefaults(parsed as Partial<NovelWriterSettings>);
}

/**
 * Write settings to ~/.novel-writer/settings.yaml atomically.
 */
export async function writeSettings(settings: NovelWriterSettings): Promise<void> {
  const filePath = settingsFilePath();
  await mkdir(join(homedir(), ".novel-writer"), { recursive: true });
  const content = yamlDump(settings, { indent: 2 });
  await atomicWriteFile(filePath, content);
}

/**
 * Recursively merge DEFAULTS with a partial settings object.
 * Fields already present in `partial` take precedence.
 */
export function mergeDefaults(partial: Partial<NovelWriterSettings>): NovelWriterSettings {
  return deepMerge(DEFAULTS, partial);
}

/**
 * Mask an API key for display: show first segment + "..." + last 3 chars.
 * e.g. "sk-ant-abc123" → "sk-ant-...123"
 * For keys shorter than 8 chars, returns "***".
 */
export function maskApiKey(key: string): string {
  if (key.length < 8) return "***";

  // Find the last '-' prefix boundary (e.g. "sk-ant-")
  const lastDash = key.lastIndexOf("-");
  const prefix = lastDash >= 0 ? key.slice(0, lastDash + 1) : key.slice(0, 3);
  const suffix = key.slice(-3);
  return `${prefix}...${suffix}`;
}

/**
 * Retrieve the raw (unmasked) API key for a given provider.
 * Returns undefined if the provider is not configured or has no key.
 */
export function getApiKey(
  settings: NovelWriterSettings,
  provider: string,
): string | undefined {
  switch (provider) {
    case "anthropic":
      return settings.providers.anthropic?.apiKey;
    case "openai":
      return settings.providers.openai?.apiKey;
    case "google":
      return settings.providers.google?.apiKey;
    default:
      return undefined;
  }
}
