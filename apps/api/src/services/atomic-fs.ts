import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Atomically write a string to filePath via write-tmp-then-rename.
 * Ensures the parent directory exists first.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  try {
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of the tmp file; ignore cleanup errors.
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}

/**
 * Atomically write a JSON-serialisable value to filePath.
 */
export async function atomicWriteJson<T>(filePath: string, data: T): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(data, null, 2));
}
