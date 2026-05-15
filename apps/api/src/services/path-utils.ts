/**
 * Path & hash utilities — M5 統一版（spec 008 TD-2 / TD-3）
 *
 * 之前 M4 有兩個 hash 函數（8-char vs 16-char），靠巧合運作。
 * M5 統一為 16-char + path.normalize + Windows drive letter 小寫化。
 *
 * 所有讀寫 hash 的 service 都必須使用此 module 的 helper。
 */
import { createHash } from "node:crypto";
import { normalize, resolve } from "node:path";

/**
 * Canonicalize path for hashing.
 * - normalize：統一斜線方向、解 ../.
 * - Windows：drive letter 小寫化（C:\ ↔ c:\ 視為相同）
 * - 不做 realpath（避免 symlink target 變更時 hash 變）
 */
export function normalizeForHash(p: string): string {
  const normalized = normalize(p);
  if (process.platform === "win32") {
    return normalized.replace(/^([A-Z]):/, (_, d) => `${(d as string).toLowerCase()}:`);
  }
  return normalized;
}

/**
 * Canonicalize path for storage in settings.yaml.
 * - normalize + resolve（處理相對路徑）
 * - 不做 case 轉換（保留使用者實際輸入給人看）
 */
export function canonicalizeProjectPath(p: string): string {
  return resolve(normalize(p));
}

/**
 * Compute a stable 16-character hex hash for a project path.
 * Path is canonicalized (absolute) + normalized before hashing so any equivalent
 * form (relative, mixed slashes, mixed-case drive letter on Windows) yields the same hash.
 */
export function hashProjectPath(projectPath: string): string {
  const canonical = canonicalizeProjectPath(projectPath);
  return createHash("sha256").update(normalizeForHash(canonical)).digest("hex").slice(0, 16);
}
