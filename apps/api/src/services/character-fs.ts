import { mkdir, readFile, readdir, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { CharacterCard, CharacterFields, CharacterListItem } from "@novel-writer/shared-types";
import { Document, parse as yamlParse, stringify as yamlStringify } from "yaml";
import { atomicWriteFile } from "./atomic-fs.js";

const CHARACTERS_DIR = "characters";
const ASSETS_DIR = join("characters", "_assets");
const INDEX_FILE = join("characters", "_index.md");
const PLACEHOLDER_BODY = "(尚未統整)";

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/** Parse the YAML frontmatter + body from a .md file string. */
function parseMd(raw: string): { fields: CharacterFields; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      fields: emptyFields(""),
      body: raw.trim(),
    };
  }
  const yamlStr = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const parsed = (yamlParse(yamlStr) as Record<string, unknown>) ?? {};
  return { fields: yamlToFields(parsed), body };
}

function emptyFields(name: string): CharacterFields {
  return {
    name,
    age: null,
    gender: null,
    pronoun: null,
    role: null,
    personalityTags: [],
    mbti: null,
    zodiac: null,
    bloodType: null,
    culturalBackground: null,
    heightCm: null,
    bodyType: null,
    hairAndColor: null,
    eyes: null,
    otherFeatures: null,
    clothing: null,
    portrait: { default: null, byChapter: {} },
    appearanceByChapter: {},
    dialoguePace: null,
    wordingPreference: null,
    writingAvoid: null,
    relations: null,
    intimateAppendix: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEdited: false,
  };
}

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v || null;
  return null;
}

function coerceNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  return null;
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function coerceRecord(v: unknown): Record<number, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const result: Record<number, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(k);
    if (Number.isFinite(n) && typeof val === "string") {
      result[n] = val;
    }
  }
  return result;
}

function yamlToFields(y: Record<string, unknown>): CharacterFields {
  const portrait = y["portrait"] as Record<string, unknown> | null | undefined;
  const intimate = y["intimateAppendix"] as Record<string, unknown> | null | undefined;
  return {
    name: String(y["name"] ?? ""),
    age: coerceNumber(y["age"]),
    gender: coerceString(y["gender"]),
    pronoun: coerceString(y["pronoun"]),
    role: coerceString(y["role"]),
    personalityTags: coerceStringArray(y["personalityTags"]),
    mbti: coerceString(y["mbti"]) as CharacterFields["mbti"],
    zodiac: coerceString(y["zodiac"]) as CharacterFields["zodiac"],
    bloodType: coerceString(y["bloodType"]) as CharacterFields["bloodType"],
    culturalBackground: coerceString(y["culturalBackground"]),
    heightCm: coerceNumber(y["heightCm"]),
    bodyType: coerceString(y["bodyType"]),
    hairAndColor: coerceString(y["hairAndColor"]),
    eyes: coerceString(y["eyes"]),
    otherFeatures: coerceString(y["otherFeatures"]),
    clothing: coerceString(y["clothing"]),
    portrait: {
      default: coerceString(portrait?.["default"]),
      byChapter: coerceRecord(portrait?.["byChapter"]),
    },
    appearanceByChapter: coerceRecord(y["appearanceByChapter"]),
    dialoguePace: coerceString(y["dialoguePace"]) as CharacterFields["dialoguePace"],
    wordingPreference: coerceString(y["wordingPreference"]),
    writingAvoid: coerceString(y["writingAvoid"]),
    relations: coerceString(y["relations"]),
    intimateAppendix: intimate
      ? {
          bodyMeasurements: coerceString(intimate["bodyMeasurements"]),
          preferences: coerceString(intimate["preferences"]),
        }
      : null,
    consolidatedAt: coerceString(y["consolidatedAt"]),
    consolidatedBy: coerceString(y["consolidatedBy"]),
    manuallyEdited: Boolean(y["manuallyEdited"]),
  };
}

function fieldsToYaml(fields: CharacterFields): string {
  const doc = new Document({
    name: fields.name,
    age: fields.age,
    gender: fields.gender,
    pronoun: fields.pronoun,
    role: fields.role,
    personalityTags: fields.personalityTags,
    mbti: fields.mbti,
    zodiac: fields.zodiac,
    bloodType: fields.bloodType,
    culturalBackground: fields.culturalBackground,
    heightCm: fields.heightCm,
    bodyType: fields.bodyType,
    hairAndColor: fields.hairAndColor,
    eyes: fields.eyes,
    otherFeatures: fields.otherFeatures,
    clothing: fields.clothing,
    portrait: fields.portrait,
    appearanceByChapter: fields.appearanceByChapter,
    dialoguePace: fields.dialoguePace,
    wordingPreference: fields.wordingPreference,
    writingAvoid: fields.writingAvoid,
    relations: fields.relations,
    intimateAppendix: fields.intimateAppendix,
    consolidatedAt: fields.consolidatedAt,
    consolidatedBy: fields.consolidatedBy,
    manuallyEdited: fields.manuallyEdited,
  });
  return yamlStringify(doc);
}

function buildMd(fields: CharacterFields, body: string): string {
  return `---\n${fieldsToYaml(fields)}---\n\n${body}\n`;
}

// ---------------------------------------------------------------------------
// _index.md helpers
// ---------------------------------------------------------------------------

async function readIndex(projectPath: string): Promise<Map<string, string>> {
  const indexPath = join(projectPath, INDEX_FILE);
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf-8");
  } catch {
    return new Map();
  }
  const map = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const m = line.match(/^- \[(.+?)\]\(\.\/(.+?)\.md\) — (.*?)$/);
    if (m) {
      const slug = m[2] ?? "";
      const summary = m[3] ?? "";
      map.set(slug, summary);
    }
  }
  return map;
}

async function writeIndex(projectPath: string, entries: Map<string, string>): Promise<void> {
  const lines = ["# 角色索引", ""];
  for (const [slug, summary] of entries) {
    lines.push(`- [${slug}](./${slug}.md) — ${summary}`);
  }
  const content = `${lines.join("\n")}\n`;
  await atomicWriteFile(join(projectPath, INDEX_FILE), content);
}

// ---------------------------------------------------------------------------
// Status.md skeleton
// ---------------------------------------------------------------------------

function buildStatusMd(name: string): string {
  return `# ${name} — 狀態

## 重要狀態變化
（按章節時序記錄）

## 與其他角色的關係

## 🔖 個人伏筆
**精簡時 AI 預設跳過此區。**

## ✨ 個人轉折點
**精簡時 AI 預設跳過此區。**
`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReadCharacterResult {
  slug: string;
  fields: CharacterFields;
  body: string;
  path: string;
}

export async function readCharacter(
  projectPath: string,
  slug: string,
): Promise<ReadCharacterResult | null> {
  const filePath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { fields, body } = parseMd(raw);
  return { slug, fields, body, path: filePath };
}

export async function listCharacters(projectPath: string): Promise<CharacterListItem[]> {
  const dir = join(projectPath, CHARACTERS_DIR);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const index = await readIndex(projectPath);
  const result: CharacterListItem[] = [];

  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    if (f === "_index.md" || f.endsWith("_status.md")) continue;
    const slug = f.slice(0, -3);
    const filePath = join(dir, f);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    const { fields } = parseMd(raw);
    result.push({
      slug,
      name: fields.name || slug,
      role: fields.role ?? null,
      age: fields.age ?? null,
      oneLineSummary: index.get(slug) ?? "",
    });
  }
  return result;
}

export interface CreateCharacterOptions {
  slug: string;
  fields: CharacterFields;
  body: string;
  oneLineSummary: string;
}

export async function createCharacter(
  projectPath: string,
  opts: CreateCharacterOptions,
): Promise<CharacterCard> {
  const { slug, fields, body, oneLineSummary } = opts;

  const charPath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  const statusPath = join(projectPath, CHARACTERS_DIR, `${slug}_status.md`);

  await mkdir(join(projectPath, CHARACTERS_DIR), { recursive: true });

  await Promise.all([
    atomicWriteFile(charPath, buildMd(fields, body || PLACEHOLDER_BODY)),
    atomicWriteFile(statusPath, buildStatusMd(fields.name)),
  ]);

  const index = await readIndex(projectPath);
  index.set(slug, oneLineSummary);
  await writeIndex(projectPath, index);

  return { slug, fields, body: body || PLACEHOLDER_BODY };
}

export interface UpdateCharacterOptions {
  fields?: Partial<CharacterFields>;
  body?: string;
  oneLineSummary?: string;
}

export async function updateCharacter(
  projectPath: string,
  slug: string,
  opts: UpdateCharacterOptions,
): Promise<CharacterCard | null> {
  const existing = await readCharacter(projectPath, slug);
  if (!existing) return null;

  const mergedFields: CharacterFields = opts.fields
    ? { ...existing.fields, ...opts.fields }
    : existing.fields;
  const newBody = opts.body !== undefined ? opts.body : existing.body;

  const charPath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  await atomicWriteFile(charPath, buildMd(mergedFields, newBody));

  if (opts.oneLineSummary !== undefined) {
    const index = await readIndex(projectPath);
    index.set(slug, opts.oneLineSummary);
    await writeIndex(projectPath, index);
  }

  return { slug, fields: mergedFields, body: newBody };
}

export async function renameCharacter(
  projectPath: string,
  oldSlug: string,
  newSlug: string,
  newName: string,
): Promise<CharacterCard | null> {
  const existing = await readCharacter(projectPath, oldSlug);
  if (!existing) return null;

  const oldMd = join(projectPath, CHARACTERS_DIR, `${oldSlug}.md`);
  const newMd = join(projectPath, CHARACTERS_DIR, `${newSlug}.md`);
  const oldStatus = join(projectPath, CHARACTERS_DIR, `${oldSlug}_status.md`);
  const newStatus = join(projectPath, CHARACTERS_DIR, `${newSlug}_status.md`);
  const oldAssets = join(projectPath, ASSETS_DIR, oldSlug);
  const newAssets = join(projectPath, ASSETS_DIR, newSlug);

  const updatedFields: CharacterFields = { ...existing.fields, name: newName };

  // Update portrait paths in frontmatter
  function updatePortraitPaths(fields: CharacterFields): CharacterFields {
    const updated = { ...fields };
    if (updated.portrait.default) {
      updated.portrait = {
        ...updated.portrait,
        default: updated.portrait.default.replace(`_assets/${oldSlug}/`, `_assets/${newSlug}/`),
        byChapter: Object.fromEntries(
          Object.entries(updated.portrait.byChapter).map(([k, v]) => [
            k,
            v.replace(`_assets/${oldSlug}/`, `_assets/${newSlug}/`),
          ]),
        ) as Record<number, string>,
      };
    }
    return updated;
  }

  const finalFields = updatePortraitPaths(updatedFields);

  // Write updated frontmatter + rename files
  await atomicWriteFile(newMd, buildMd(finalFields, existing.body));

  try {
    await rename(oldStatus, newStatus);
  } catch {
    // ok if status file doesn't exist
  }

  try {
    await rename(oldAssets, newAssets);
  } catch {
    // ok if _assets dir doesn't exist
  }

  // Remove old .md
  await unlink(oldMd).catch(() => undefined);

  // Update _index.md
  const index = await readIndex(projectPath);
  const summary = index.get(oldSlug) ?? "";
  index.delete(oldSlug);
  index.set(newSlug, summary);
  await writeIndex(projectPath, index);

  return { slug: newSlug, fields: finalFields, body: existing.body };
}

export async function deleteCharacter(projectPath: string, slug: string): Promise<boolean> {
  const charPath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  const statusPath = join(projectPath, CHARACTERS_DIR, `${slug}_status.md`);
  const assetsDir = join(projectPath, ASSETS_DIR, slug);

  try {
    await unlink(charPath);
  } catch {
    return false;
  }

  await unlink(statusPath).catch(() => undefined);
  await rm(assetsDir, { recursive: true, force: true }).catch(() => undefined);

  const index = await readIndex(projectPath);
  if (index.has(slug)) {
    index.delete(slug);
    await writeIndex(projectPath, index);
  }

  return true;
}

/** Update only the portrait fields in frontmatter (for portrait upload/extract/delete). */
export async function updatePortraitFields(
  projectPath: string,
  slug: string,
  updater: (fields: CharacterFields) => CharacterFields,
): Promise<CharacterCard | null> {
  const existing = await readCharacter(projectPath, slug);
  if (!existing) return null;
  const updatedFields = updater(existing.fields);
  const charPath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  await atomicWriteFile(charPath, buildMd(updatedFields, existing.body));
  return { slug, fields: updatedFields, body: existing.body };
}

// ── lookupAppearance（供 ContextCollector 使用；Spec 002b 算法）─────────────

/**
 * Resolve the appearance string for a character at a given chapter number.
 * Uses the largest appearanceByChapter key ≤ currentChapter; falls back to
 * flat appearance fields when none exist.
 */
export function lookupAppearance(fields: CharacterFields, currentChapter: number): string {
  const chapters = Object.keys(fields.appearanceByChapter)
    .map(Number)
    .filter((n) => n <= currentChapter)
    .sort((a, b) => b - a);

  if (chapters.length > 0) {
    return fields.appearanceByChapter[chapters[0]!] ?? "";
  }

  return (
    [
      fields.hairAndColor,
      fields.eyes,
      fields.bodyType,
      fields.otherFeatures,
      fields.clothing && `服裝：${fields.clothing}`,
    ]
      .filter(Boolean)
      .join("\n") || "（無外貌描述）"
  );
}
