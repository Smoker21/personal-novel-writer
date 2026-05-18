import { appendFile, stat, truncate, unlink, writeFile } from "node:fs/promises";
import type { DraftMetadata } from "@novel-writer/shared-types";

// ── StructuredInputs 欄位（依 spec 006 M6） ──────────────────────────────────

export interface StructuredInputsForRender {
  plot?: string | null;
  background?: string | null;
  requirements?: string | null;
  pre_summary?: string | null;
  prev_segment?: string | null;
}

// ── PromptRenderOptions ───────────────────────────────────────────────────────

export interface PromptRenderOptions {
  draftMeta: DraftMetadata;
  undoEntryId: string;
  adoptedAt: string;
  /**
   * M6 (spec 006): discriminated kind for prompt.md two-path rendering.
   * Defaults to "messages" when omitted — preserves backwards compat for
   * M5 drafts that lack the kind field (feedback doc S-5 prior gap).
   */
  kind?: "messages" | "structured";
  /**
   * M6 (spec 006): structured path inputs.
   * Required when kind="structured"; ignored otherwise.
   */
  structuredInputs?: StructuredInputsForRender;
  /**
   * messages path: estimated tokens (from build-prompt phase).
   * Taken from draftMeta.usage.inputTokens when omitted.
   */
  estimatedTokens?: number;
  /**
   * structured path: estimated word count (billing unit for xiaohuangwen).
   * Falls back to draftMeta.totalChars when omitted.
   */
  estimatedWords?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NONE = "（無）";

function fieldBlock(label: string, value: string | null | undefined): string {
  const text = value && value.trim().length > 0 ? value : NONE;
  return `### ${label}\n${text}`;
}

// ── Frontmatter renderer ──────────────────────────────────────────────────────

function renderFrontmatter(
  draftMeta: DraftMetadata,
  adoptedAt: string,
  kind: "messages" | "structured",
  estimatedTokens: number | undefined,
  estimatedWords: number | undefined,
): string {
  const chapterPadded = String(draftMeta.chapterNumber).padStart(4, "0");
  const lines: string[] = [
    "---",
    `generatedAt: ${draftMeta.createdAt}`,
    `adoptedAt: ${adoptedAt}`,
    `agent: chapter-writer`,
    `modelId: ${draftMeta.modelId}`,
    `chapterNumber: ${chapterPadded}`,
    `chapterTitle: ${draftMeta.chapterTitle}`,
    `contextHash: ${draftMeta.contextHash}`,
    `kind: ${kind}`,
  ];

  if (kind === "messages") {
    const tokens = estimatedTokens ?? draftMeta.usage?.inputTokens ?? 0;
    lines.push(`estimatedTokens: ${tokens}`);
  } else {
    const words = estimatedWords ?? draftMeta.totalChars;
    lines.push(`estimatedWords: ${words}`);
  }

  lines.push("---");
  return lines.join("\n");
}

// ── Messages-path body renderer ───────────────────────────────────────────────

function renderMessagesBody(draftMeta: DraftMetadata): string {
  return `## Metadata

- inputTokens: ${draftMeta.usage?.inputTokens ?? 0}
- outputTokens: ${draftMeta.usage?.outputTokens ?? 0}
- totalChars: ${draftMeta.totalChars}`;
}

// ── Structured-path body renderer ─────────────────────────────────────────────

function renderStructuredBody(
  inputs: StructuredInputsForRender,
  modelId: string,
  totalChars: number,
): string {
  return `## 結構化生成欄位（M6）

> 使用 \`${modelId}\` 結構化 API 生成；不存在 promptText 概念。

${fieldBlock("plot（本章劇情）", inputs.plot)}

${fieldBlock("background（角色與狀態）", inputs.background)}

${fieldBlock("requirements（寫作需求）", inputs.requirements)}

${fieldBlock("pre_summary（故事摘要）", inputs.pre_summary)}

${fieldBlock("prev_segment（前章末段）", inputs.prev_segment)}

## Metadata

- totalChars: ${totalChars}`;
}

// ── Public: renderPromptMarkdown ──────────────────────────────────────────────

export function renderPromptMarkdown(opts: PromptRenderOptions): string {
  const {
    draftMeta,
    undoEntryId,
    adoptedAt,
    kind = "messages",
    structuredInputs,
    estimatedTokens,
    estimatedWords,
  } = opts;

  const frontmatter = renderFrontmatter(
    draftMeta,
    adoptedAt,
    kind,
    estimatedTokens,
    estimatedWords,
  );

  let body: string;
  if (kind === "structured") {
    body = renderStructuredBody(
      structuredInputs ?? {},
      draftMeta.modelId,
      draftMeta.totalChars,
    );
  } else {
    body = renderMessagesBody(draftMeta);
  }

  return `<!-- adopt-marker:${undoEntryId} -->
${frontmatter}

${body}
<!-- /adopt-marker -->`;
}

// ── File I/O helpers (unchanged from M5) ─────────────────────────────────────

/**
 * Append prompt markdown to the prompt file.
 * Returns the byte offset at which the new content starts (for rollback).
 */
export async function appendToPromptFile(promptPath: string, content: string): Promise<number> {
  let startOffset = 0;
  try {
    const st = await stat(promptPath);
    startOffset = st.size;
    await appendFile(promptPath, `\n\n---\n\n${content}`, "utf-8");
  } catch {
    await writeFile(promptPath, content, "utf-8");
  }
  return startOffset;
}

/**
 * Rollback: truncate prompt file back to startOffset.
 */
export async function truncatePromptFile(promptPath: string, startOffset: number): Promise<void> {
  if (startOffset === 0) {
    await unlink(promptPath).catch(() => undefined);
  } else {
    await truncate(promptPath, startOffset);
  }
}

/**
 * Append an Undo note to the prompt file.
 */
export async function appendUndoNote(promptPath: string, undoEntryId: string): Promise<void> {
  const note = `\n\n---\n\n**Undo 採用** at: ${new Date().toISOString()}\n原因：使用者在 client 端按 Ctrl+Z\nundoEntryId: ${undoEntryId}\n`;
  await appendFile(promptPath, note, "utf-8").catch(() => undefined);
}
