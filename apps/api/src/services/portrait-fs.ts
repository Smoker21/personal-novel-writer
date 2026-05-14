import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import type { PortraitInfo, PortraitScope } from "@novel-writer/shared-types";
import sharp from "sharp";

const MAX_PIXELS = 4096;
const MAX_BYTES = 5 * 1024 * 1024;
const VALID_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function mimeToExt(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function assetDir(projectPath: string, slug: string): string {
  return join(projectPath, "characters", "_assets", slug);
}

function scopePrefix(scope: PortraitScope, chapterNumber: number | null): string {
  if (scope === "default") return "default";
  return `chapter_${String(chapterNumber ?? 0).padStart(4, "0")}`;
}

export async function savePortrait(
  projectPath: string,
  slug: string,
  scope: PortraitScope,
  chapterNumber: number | null,
  buffer: Buffer,
  mimeType: string,
): Promise<{
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  resized: boolean;
}> {
  let img = sharp(buffer);
  const meta = await img.metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;

  if (origW < 256 || origH < 256) {
    throw Object.assign(new Error("Image too small (< 256px)"), { code: "INVALID_DIMENSIONS" });
  }

  let resized = false;
  if (origW > MAX_PIXELS || origH > MAX_PIXELS) {
    img = img.resize(MAX_PIXELS, MAX_PIXELS, { fit: "inside", withoutEnlargement: true });
    resized = true;
  }

  let outBuffer = await img.toBuffer();
  let effectiveMimeType = mimeType;
  if (outBuffer.length > MAX_BYTES) {
    outBuffer = await sharp(outBuffer).jpeg({ quality: 85 }).toBuffer();
    effectiveMimeType = "image/jpeg";
    resized = true;
  }
  const finalMeta = await sharp(outBuffer).metadata();
  const ext = mimeToExt(effectiveMimeType);
  const prefix = scopePrefix(scope, chapterNumber);
  const dir = assetDir(projectPath, slug);

  await mkdir(dir, { recursive: true });

  // Remove any existing file for the same scope (handles ext change)
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (f.startsWith(prefix) && VALID_EXTS.has(extname(f).toLowerCase())) {
        await unlink(join(dir, f));
      }
    }
  } catch {
    // dir may not exist yet; mkdir above ensures it does after this block
  }

  const filename = `${prefix}${ext}`;
  const filePath = join(dir, filename);
  // atomicWriteFile expects string, but we have Buffer; write directly
  const tmpPath = `${filePath}.tmp`;
  const { writeFile, rename } = await import("node:fs/promises");
  await writeFile(tmpPath, outBuffer);
  await rename(tmpPath, filePath);

  const relativePath = `characters/_assets/${slug}/${filename}`;
  const format: "jpeg" | "png" | "webp" =
    finalMeta.format === "png" ? "png" : finalMeta.format === "webp" ? "webp" : "jpeg";

  return {
    path: relativePath,
    bytes: outBuffer.length,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    format,
    resized,
  };
}

export async function deletePortrait(
  projectPath: string,
  slug: string,
  scope: PortraitScope,
  chapterNumber: number | null,
): Promise<boolean> {
  const dir = assetDir(projectPath, slug);
  const prefix = scopePrefix(scope, chapterNumber);
  try {
    const files = await readdir(dir);
    let found = false;
    for (const f of files) {
      if (f.startsWith(prefix) && VALID_EXTS.has(extname(f).toLowerCase())) {
        await unlink(join(dir, f));
        found = true;
      }
    }
    return found;
  } catch {
    return false;
  }
}

export async function listPortraits(
  projectPath: string,
  slug: string,
): Promise<{
  default: PortraitInfo | null;
  byChapter: Array<PortraitInfo & { chapterNumber: number }>;
}> {
  const dir = assetDir(projectPath, slug);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return { default: null, byChapter: [] };
  }

  let defaultPortrait: PortraitInfo | null = null;
  const byChapter: Array<PortraitInfo & { chapterNumber: number }> = [];

  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!VALID_EXTS.has(ext)) continue;
    const fullPath = join(dir, f);
    const st = await stat(fullPath);
    const meta = await sharp(fullPath).metadata();
    const info: PortraitInfo = {
      path: `characters/_assets/${slug}/${f}`,
      bytes: st.size,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      format: (meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpeg") as
        | "jpeg"
        | "png"
        | "webp",
      uploadedAt: st.mtime.toISOString(),
      hasExtracted: false,
    };
    if (f.startsWith("default")) {
      defaultPortrait = info;
    } else {
      const m = f.match(/^chapter_(\d{4})/);
      if (m?.[1]) {
        byChapter.push({ ...info, chapterNumber: Number(m[1]) });
      }
    }
  }

  return { default: defaultPortrait, byChapter };
}
