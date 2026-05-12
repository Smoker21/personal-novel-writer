import { createHash } from "node:crypto";
import { normalize } from "node:path";
import { readSettings, writeSettings } from "./settings-store.js";

// ---------------------------------------------------------------------------
// hashProjectPath
// ---------------------------------------------------------------------------

/**
 * Compute a stable 8-character hex hash for a project path.
 * The path is normalised before hashing so equivalent paths produce the same hash.
 */
export function hashProjectPath(projectPath: string): string {
  return createHash("sha256")
    .update(normalize(projectPath))
    .digest("hex")
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// resolveProjectPath
// ---------------------------------------------------------------------------

/**
 * Reverse-look up a project path from its hash.
 * Reads the current settings' recentProjects list.
 * Returns null if no match is found.
 */
export async function resolveProjectPath(projectHash: string): Promise<string | null> {
  const settings = await readSettings();

  for (const project of settings.recentProjects) {
    if (hashProjectPath(project.path) === projectHash) {
      return project.path;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// touchProject
// ---------------------------------------------------------------------------

/**
 * Add a project to recentProjects (or update its lastOpenedAt timestamp).
 * Persists the updated settings.
 */
export async function touchProject(projectPath: string, name: string): Promise<void> {
  const settings = await readSettings();
  const normalised = normalize(projectPath);
  const lastOpenedAt = new Date().toISOString();

  const existing = settings.recentProjects.findIndex((p) => normalize(p.path) === normalised);

  if (existing >= 0) {
    const entry = settings.recentProjects[existing];
    if (entry !== undefined) {
      settings.recentProjects[existing] = { ...entry, lastOpenedAt };
    }
  } else {
    settings.recentProjects.push({ path: normalised, name, lastOpenedAt });
  }

  await writeSettings(settings);
}
