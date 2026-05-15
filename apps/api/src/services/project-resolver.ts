import { canonicalizeProjectPath, hashProjectPath } from "./path-utils.js";
import { readSettings, writeSettings } from "./settings-store.js";

// Re-export for compatibility with existing callers
export { hashProjectPath } from "./path-utils.js";

// ---------------------------------------------------------------------------
// resolveProjectPath
// ---------------------------------------------------------------------------

/**
 * Reverse-look up a project path from its hash.
 * Reads the current settings' recentProjects list.
 * Re-hashes each stored path so we don't depend on stored hash being current.
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
export async function touchProject(projectPath: string, title: string): Promise<void> {
  const settings = await readSettings();
  const canonical = canonicalizeProjectPath(projectPath);
  const hash = hashProjectPath(canonical);
  const lastOpenedAt = new Date().toISOString();

  const existingIdx = settings.recentProjects.findIndex(
    (p) => hashProjectPath(p.path) === hash,
  );

  if (existingIdx >= 0) {
    const entry = settings.recentProjects[existingIdx];
    if (entry !== undefined) {
      settings.recentProjects[existingIdx] = { ...entry, lastOpenedAt };
    }
  } else {
    settings.recentProjects.push({
      hash,
      path: canonical,
      title,
      lastOpenedAt,
      pinned: false,
    });
  }

  await writeSettings(settings);
}
