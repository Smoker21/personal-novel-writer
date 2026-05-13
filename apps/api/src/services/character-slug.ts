import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isWindowsReservedName, sanitizeSlug } from "./sanitize.js";

/**
 * Resolve a slug from a character name.
 * Applies: NFC + remove unsafe chars + trim/collapse whitespace.
 * Throws if the result is empty (invalid name).
 */
export function computeSlug(name: string): string {
  try {
    const slug = sanitizeSlug(name);
    if (isWindowsReservedName(slug)) return `${slug}-character`;
    return slug;
  } catch {
    throw new Error(`INVALID_INPUT: name "${name}" cannot be converted to a valid slug`);
  }
}

/**
 * Scan the characters/ directory and return all existing character slugs.
 * (A slug is a file named <slug>.md, excluding _index.md and *_status.md)
 */
export async function listExistingSlugs(projectPath: string): Promise<Set<string>> {
  const dir = join(projectPath, "characters");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return new Set();
  }
  const slugs = new Set<string>();
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    if (f === "_index.md") continue;
    if (f.endsWith("_status.md")) continue;
    slugs.add(f.slice(0, -3));
  }
  return slugs;
}

/**
 * Resolve a unique slug for a new character, appending -2, -3... if needed.
 * excludeSlug: the slug to ignore during conflict check (used for rename).
 */
export async function resolveUniqueSlug(
  name: string,
  projectPath: string,
  excludeSlug?: string,
): Promise<string> {
  const base = computeSlug(name);
  const existing = await listExistingSlugs(projectPath);
  if (excludeSlug) existing.delete(excludeSlug);

  if (!existing.has(base)) return base;

  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
