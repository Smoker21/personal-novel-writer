import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppSettings, LLMProviderId } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS, defaultSettings, maskApiKey } from "@novel-writer/shared-types";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import { atomicWriteFile } from "./atomic-fs.js";

function settingsFilePath(): string {
  return join(homedir(), ".novel-writer", "settings.yaml");
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...(base as Record<string, unknown>) } as Record<string, unknown>;
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
      result[key] = deepMerge<Record<string, unknown>>(
        baseVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result as T;
}

export async function readSettings(): Promise<AppSettings> {
  const filePath = settingsFilePath();
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return defaultSettings();
    }
    throw err;
  }
  if (raw.trim() === "") return defaultSettings();
  const parsed = yamlLoad(raw) as Partial<AppSettings> | null;
  if (!parsed) return defaultSettings();
  return deepMerge(defaultSettings(), parsed);
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  const filePath = settingsFilePath();
  await mkdir(join(homedir(), ".novel-writer"), { recursive: true });
  await atomicWriteFile(filePath, yamlDump(settings, { lineWidth: -1 }));
}

export function maskSettings(settings: AppSettings): AppSettings {
  const masked: AppSettings = {
    ...settings,
    providers: { ...settings.providers },
  };
  for (const id of ALL_PROVIDER_IDS) {
    const cfg = masked.providers[id];
    if (cfg.apiKey) {
      masked.providers[id] = { ...cfg, apiKey: maskApiKey(cfg.apiKey) };
    }
  }
  return masked;
}

export function getApiKey(settings: AppSettings, providerId: LLMProviderId): string {
  return settings.providers[providerId]?.apiKey ?? "";
}

// re-export maskApiKey for backwards compat
export { maskApiKey };
