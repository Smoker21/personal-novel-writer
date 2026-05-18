/**
 * File-system helpers for ~/.novel-writer/settings.yaml manipulation in BDD tests.
 *
 * These helpers directly touch the file system, bypassing the API, to set up
 * Given preconditions (e.g. "settings.yaml does not exist").
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SETTINGS_PATH = join(homedir(), ".novel-writer", "settings.yaml");
export const SETTINGS_DIR = join(homedir(), ".novel-writer");

/** Read the raw YAML string, or null if file does not exist. */
export function readSettingsRaw(): string | null {
  if (!existsSync(SETTINGS_PATH)) return null;
  return readFileSync(SETTINGS_PATH, "utf-8");
}

/** Write raw YAML string to settings file, creating directory if needed. */
export function writeSettingsRaw(content: string): void {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, content, "utf-8");
}

/** Delete settings.yaml (simulate "first launch" state). No-op if not present. */
export function deleteSettings(): void {
  if (existsSync(SETTINGS_PATH)) {
    rmSync(SETTINGS_PATH);
  }
}

/** Return true if settings.yaml exists on disk. */
export function settingsExists(): boolean {
  return existsSync(SETTINGS_PATH);
}

/** Read settings.yaml and parse the `meta.firstLaunchWarningAcknowledged` field. */
export function readFirstLaunchAck(): boolean | null {
  const raw = readSettingsRaw();
  if (raw === null) return null;
  // Simple regex match to avoid adding yaml dependency here
  const match = /firstLaunchWarningAcknowledged:\s*(true|false)/.exec(raw);
  if (!match) return null;
  return match[1] === "true";
}

/** Return the raw ISO timestamp from `meta.firstLaunchWarningAcknowledgedAt`, or null. */
export function readFirstLaunchAckAt(): string | null {
  const raw = readSettingsRaw();
  if (raw === null) return null;
  const match = /firstLaunchWarningAcknowledgedAt:\s*'?([^'\n]+)'?/.exec(raw);
  const captured = match?.[1];
  return captured !== undefined ? captured.trim() : null;
}

/** Write a minimal settings.yaml with firstLaunchWarningAcknowledged = false. */
export function writeSettingsWithAckFalse(extraContent = ""): void {
  const yaml = `schemaVersion: 1
meta:
  firstLaunchWarningAcknowledged: false
providers: {}
routing: {}
recentProjects: []
${extraContent}`;
  writeSettingsRaw(yaml);
}

/** Write a settings.yaml with firstLaunchWarningAcknowledged = true. */
export function writeSettingsWithAckTrue(): void {
  const yaml = `schemaVersion: 1
meta:
  firstLaunchWarningAcknowledged: true
providers: {}
routing: {}
recentProjects: []
`;
  writeSettingsRaw(yaml);
}
