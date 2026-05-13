import { appendFile, stat, truncate, unlink, writeFile } from "node:fs/promises";
import type { DraftMetadata } from "@novel-writer/shared-types";

export interface PromptRenderOptions {
  draftMeta: DraftMetadata;
  undoEntryId: string;
  adoptedAt: string;
}

export function renderPromptMarkdown(opts: PromptRenderOptions): string {
  const { draftMeta, undoEntryId, adoptedAt } = opts;
  return `<!-- adopt-marker:${undoEntryId} -->
---
generatedAt: ${draftMeta.createdAt}
adoptedAt: ${adoptedAt}
agent: chapter-writer
modelId: ${draftMeta.modelId}
chapterNumber: ${draftMeta.chapterNumber}
contextHash: ${draftMeta.contextHash}
---

## Metadata

- inputTokens: ${draftMeta.usage?.inputTokens ?? 0}
- outputTokens: ${draftMeta.usage?.outputTokens ?? 0}
- totalChars: ${draftMeta.totalChars}
<!-- /adopt-marker -->`;
}

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
