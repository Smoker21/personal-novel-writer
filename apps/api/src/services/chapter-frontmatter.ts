/**
 * Chapter front-matter parser/writer — M5 新增（spec 003）。
 *
 * 規則：
 * - frontmatter 由 `---\n` 開頭、`\n---\n`（或 `\n---` + EOF）結尾界定
 * - 解析失敗 → 視為無 frontmatter（fail-open）+ console.warn
 * - 寫入：三欄都是預設值（`[]` / `null` / `null`）→ 不寫 frontmatter
 * - 欄位順序固定：participants → outline → requirements
 * - 行尾統一 LF；frontmatter 與正文間以單一空行分隔
 */
import type { ChapterFrontmatter } from "@novel-writer/shared-types";
import yaml from "js-yaml";

export interface ParsedChapter {
  frontmatter: ChapterFrontmatter;
  body: string;
  hasFrontmatter: boolean;
}

export function emptyFrontmatter(): ChapterFrontmatter {
  return { participants: [], outline: null, requirements: null };
}

function isDefaultFrontmatter(fm: ChapterFrontmatter): boolean {
  return fm.participants.length === 0 && fm.outline === null && fm.requirements === null;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Parse chapter .md content into frontmatter + body. */
export function parseChapter(raw: string): ParsedChapter {
  const match = raw.match(FM_RE);
  if (!match) {
    return { frontmatter: emptyFrontmatter(), body: raw, hasFrontmatter: false };
  }
  const yamlBody = match[1] ?? "";
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlBody);
  } catch (err) {
    console.warn(`parseChapter: yaml parse failed, falling back to no-frontmatter: ${String(err)}`);
    return { frontmatter: emptyFrontmatter(), body: raw, hasFrontmatter: false };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { frontmatter: emptyFrontmatter(), body: raw, hasFrontmatter: false };
  }
  const obj = parsed as Record<string, unknown>;
  // YAML block scalar (`|`) preserves trailing newline; strip it to match round-trip semantics
  const stripTrailingNl = (v: unknown): string | null =>
    typeof v === "string" ? v.replace(/\n+$/, "") : null;
  const fm: ChapterFrontmatter = {
    participants: Array.isArray(obj["participants"])
      ? (obj["participants"] as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    outline: stripTrailingNl(obj["outline"]),
    requirements: stripTrailingNl(obj["requirements"]),
  };
  const body = raw.slice(match[0].length);
  return { frontmatter: fm, body, hasFrontmatter: true };
}

/**
 * Build a chapter .md file content from frontmatter + body.
 * If all frontmatter fields are default, no frontmatter is written (clean file).
 */
export function buildChapter(fm: ChapterFrontmatter, body: string): string {
  if (isDefaultFrontmatter(fm)) {
    return body;
  }
  // Build YAML manually to enforce field order: participants → outline → requirements
  const lines: string[] = ["---"];

  // participants
  if (fm.participants.length === 0) {
    lines.push("participants: []");
  } else {
    lines.push("participants:");
    for (const slug of fm.participants) {
      lines.push(`  - ${yamlStringSafe(slug)}`);
    }
  }

  // outline
  if (fm.outline === null) {
    lines.push("outline: null");
  } else {
    lines.push(`outline: |\n${indentMultiline(fm.outline, 2)}`);
  }

  // requirements
  if (fm.requirements === null) {
    lines.push("requirements: null");
  } else {
    lines.push(`requirements: |\n${indentMultiline(fm.requirements, 2)}`);
  }

  lines.push("---");
  lines.push(""); // single blank line between frontmatter and body
  return `${lines.join("\n")}\n${body.startsWith("\n") ? body.slice(1) : body}`;
}

function indentMultiline(s: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return s
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
}

function yamlStringSafe(s: string): string {
  // If contains special chars or starts with reserved tokens, quote it
  if (/[:#@&*!|>'"%`?\-\[\]{}]|^[\s'"]|[\s'"]$|^(true|false|null|~|yes|no|on|off)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

/**
 * Merge partial frontmatter updates onto existing.
 * undefined fields are not updated; null/empty arrays clear that field.
 */
export function applyFrontmatterPatch(
  existing: ChapterFrontmatter,
  patch: {
    participants?: string[];
    outline?: string | null;
    requirements?: string | null;
  },
): ChapterFrontmatter {
  return {
    participants: patch.participants ?? existing.participants,
    outline: patch.outline !== undefined ? patch.outline : existing.outline,
    requirements: patch.requirements !== undefined ? patch.requirements : existing.requirements,
  };
}
