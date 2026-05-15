import { mkdir, readFile, readdir, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { CharacterCard, CharacterFields, CharacterListItem } from "@novel-writer/shared-types";
import { Document, parse as yamlParse, stringify as yamlStringify } from "yaml";
import { atomicWriteFile } from "./atomic-fs.js";

const CHARACTERS_DIR = "characters";
const ASSETS_DIR = join("characters", "_assets");
const INDEX_FILE = join("characters", "_index.md");

// M5 (spec 002): body 兩段 section heading
const MANUAL_HEADING = "## 角色描述（手動）";
const AI_HEADING = "## AI 統整敘述";
const MANUAL_HEADING_RE = /^##\s+角色描述（手動）\s*$/m;
const AI_HEADING_RE = /^##\s+AI 統整敘述\s*$/m;

/** Legacy placeholder used before bug fix; treat as empty on read. */
const LEGACY_PLACEHOLDER_RE = /^\s*\(尚未(?:統整|填寫角色描述)\)\s*$/;
function stripLegacyPlaceholder(s: string): string {
  return LEGACY_PLACEHOLDER_RE.test(s) ? "" : s;
}

/**
 * M5: Split body into manualDescription + aiSummary sections.
 * Migration policy: missing any `##` heading → treat all as manualDescription.
 */
export function splitBody(body: string): { manualDescription: string; aiSummary: string } {
  const manualMatch = body.match(MANUAL_HEADING_RE);
  const aiMatch = body.match(AI_HEADING_RE);

  if (!manualMatch && !aiMatch) {
    return { manualDescription: stripLegacyPlaceholder(body.trim()), aiSummary: "" };
  }

  if (manualMatch && aiMatch && (manualMatch.index ?? 0) < (aiMatch.index ?? 0)) {
    const manualStart = (manualMatch.index ?? 0) + manualMatch[0].length;
    const manual = body.slice(manualStart, aiMatch.index ?? body.length).trim();
    const aiStart = (aiMatch.index ?? 0) + aiMatch[0].length;
    const ai = body.slice(aiStart).trim();
    return {
      manualDescription: stripLegacyPlaceholder(manual),
      aiSummary: stripLegacyPlaceholder(ai),
    };
  }
  if (manualMatch && !aiMatch) {
    const manualStart = (manualMatch.index ?? 0) + manualMatch[0].length;
    return {
      manualDescription: stripLegacyPlaceholder(body.slice(manualStart).trim()),
      aiSummary: "",
    };
  }
  if (!manualMatch && aiMatch) {
    const aiStart = (aiMatch.index ?? 0) + aiMatch[0].length;
    return {
      manualDescription: stripLegacyPlaceholder(body.slice(0, aiMatch.index ?? 0).trim()),
      aiSummary: stripLegacyPlaceholder(body.slice(aiStart).trim()),
    };
  }
  return { manualDescription: stripLegacyPlaceholder(body.trim()), aiSummary: "" };
}

/** M5: assemble body from two sections, always writing both headings (even if empty). */
export function joinBody(manualDescription: string, aiSummary: string): string {
  return `${MANUAL_HEADING}\n\n${manualDescription}\n\n${AI_HEADING}\n\n${aiSummary}`.trim();
}

/** Parse the YAML frontmatter + body from a .md file string. */
function parseMd(raw: string): {
  fields: CharacterFields;
  manualDescription: string;
  aiSummary: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    const body = raw.trim();
    const { manualDescription, aiSummary } = splitBody(body);
    return { fields: emptyFields(""), manualDescription, aiSummary };
  }
  const yamlStr = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const parsed = (yamlParse(yamlStr) as Record<string, unknown>) ?? {};
  const { manualDescription, aiSummary } = splitBody(body);
  return { fields: yamlToFields(parsed), manualDescription, aiSummary };
}

export function emptyFields(name: string): CharacterFields {
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
    sexualScenePerformance: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEditedSections: { manualDescription: false, aiSummary: false },
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
  // M5 migration: 讀容錯 intimateAppendix → sexualScenePerformance
  const sexualSrc =
    (y["sexualScenePerformance"] as Record<string, unknown> | null | undefined) ??
    (y["intimateAppendix"] as Record<string, unknown> | null | undefined);
  // M5 migration: manuallyEdited boolean → manuallyEditedSections object
  const mesSrc = y["manuallyEditedSections"] as Record<string, unknown> | null | undefined;
  const manuallyEditedSections = mesSrc
    ? {
        manualDescription: Boolean(mesSrc["manualDescription"]),
        aiSummary: Boolean(mesSrc["aiSummary"]),
      }
    : {
        manualDescription: Boolean(y["manuallyEdited"]),
        aiSummary: false,
      };
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
    sexualScenePerformance: sexualSrc
      ? {
          bodyMeasurements: coerceString(sexualSrc["bodyMeasurements"]),
          preferences: coerceString(sexualSrc["preferences"]),
        }
      : null,
    consolidatedAt: coerceString(y["consolidatedAt"]),
    consolidatedBy: coerceString(y["consolidatedBy"]),
    manuallyEditedSections,
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
    sexualScenePerformance: fields.sexualScenePerformance,
    consolidatedAt: fields.consolidatedAt,
    consolidatedBy: fields.consolidatedBy,
    manuallyEditedSections: fields.manuallyEditedSections,
  });
  return yamlStringify(doc);
}

/** Build .md file content (frontmatter + body 兩 section). */
export function buildMd(
  fields: CharacterFields,
  manualDescription: string,
  aiSummary: string,
): string {
  const body = joinBody(manualDescription, aiSummary);
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

export function buildStatusMd(name: string): string {
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
  /** Server-assembled full body (含兩段 headings)；給 chapter-writer 與 grep 友善 */
  body: string;
  /** 「## 角色描述（手動）」段內容（不含 heading） */
  manualDescription: string;
  /** 「## AI 統整敘述」段內容（不含 heading） */
  aiSummary: string;
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
  const { fields, manualDescription, aiSummary } = parseMd(raw);
  return {
    slug,
    fields,
    body: joinBody(manualDescription, aiSummary),
    manualDescription,
    aiSummary,
    path: filePath,
  };
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
      portraitDefault: fields.portrait.default ?? null,
    });
  }
  return result;
}

export interface CreateCharacterOptions {
  slug: string;
  fields: CharacterFields;
  /** M5 兩段 body */
  manualDescription: string;
  aiSummary: string;
  oneLineSummary: string;
}

export async function createCharacter(
  projectPath: string,
  opts: CreateCharacterOptions,
): Promise<CharacterCard> {
  const { slug, fields, manualDescription, aiSummary, oneLineSummary } = opts;

  const charPath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  const statusPath = join(projectPath, CHARACTERS_DIR, `${slug}_status.md`);

  await mkdir(join(projectPath, CHARACTERS_DIR), { recursive: true });

  await Promise.all([
    atomicWriteFile(charPath, buildMd(fields, manualDescription, aiSummary)),
    atomicWriteFile(statusPath, buildStatusMd(fields.name)),
  ]);

  const index = await readIndex(projectPath);
  index.set(slug, oneLineSummary);
  await writeIndex(projectPath, index);

  return {
    slug,
    fields,
    body: joinBody(manualDescription, aiSummary),
    manualDescription,
    aiSummary,
  };
}

export interface UpdateCharacterOptions {
  fields?: Partial<CharacterFields>;
  /** M5: 改「## 角色描述（手動）」段；undefined = 不動 */
  manualDescription?: string;
  /** M5: 改「## AI 統整敘述」段；undefined = 不動 */
  aiSummary?: string;
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
  const newManual =
    opts.manualDescription !== undefined ? opts.manualDescription : existing.manualDescription;
  const newAiSummary = opts.aiSummary !== undefined ? opts.aiSummary : existing.aiSummary;

  const charPath = join(projectPath, CHARACTERS_DIR, `${slug}.md`);
  await atomicWriteFile(charPath, buildMd(mergedFields, newManual, newAiSummary));

  if (opts.oneLineSummary !== undefined) {
    const index = await readIndex(projectPath);
    index.set(slug, opts.oneLineSummary);
    await writeIndex(projectPath, index);
  }

  return {
    slug,
    fields: mergedFields,
    body: joinBody(newManual, newAiSummary),
    manualDescription: newManual,
    aiSummary: newAiSummary,
  };
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
  await atomicWriteFile(
    newMd,
    buildMd(finalFields, existing.manualDescription, existing.aiSummary),
  );

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

  return {
    slug: newSlug,
    fields: finalFields,
    body: joinBody(existing.manualDescription, existing.aiSummary),
    manualDescription: existing.manualDescription,
    aiSummary: existing.aiSummary,
  };
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
  await atomicWriteFile(
    charPath,
    buildMd(updatedFields, existing.manualDescription, existing.aiSummary),
  );
  return {
    slug,
    fields: updatedFields,
    body: joinBody(existing.manualDescription, existing.aiSummary),
    manualDescription: existing.manualDescription,
    aiSummary: existing.aiSummary,
  };
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
