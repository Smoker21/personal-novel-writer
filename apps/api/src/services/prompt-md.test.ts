import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DraftMetadata } from "@novel-writer/shared-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendToPromptFile,
  appendUndoNote,
  renderPromptMarkdown,
  truncatePromptFile,
} from "./prompt-md.js";

const DRAFT_META: DraftMetadata = {
  draftId: "test-id",
  projectHash: "abc123",
  chapterNumber: 1,
  chapterTitle: "梅雨初晴",
  agentName: "chapter-writer",
  modelId: "anthropic:claude-haiku-4-5",
  contextHash: "hash123",
  status: "complete",
  createdAt: "2026-05-13T10:00:00Z",
  totalChars: 1000,
  usage: { inputTokens: 500, outputTokens: 800 },
};

describe("prompt-md", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `prompt-md-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("renderPromptMarkdown includes adopt markers", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("<!-- adopt-marker:undo-1 -->");
    expect(content).toContain("<!-- /adopt-marker -->");
    expect(content).toContain("anthropic:claude-haiku-4-5");
  });

  it("appendToPromptFile creates new file, returns offset 0", async () => {
    const path = join(tmpDir, "prompt.md");
    const offset = await appendToPromptFile(path, "first content");
    expect(offset).toBe(0);
    const content = await readFile(path, "utf-8");
    expect(content).toBe("first content");
  });

  it("appendToPromptFile appends to existing file, returns correct offset", async () => {
    const path = join(tmpDir, "prompt.md");
    const initial = "initial\n";
    await writeFile(path, initial, "utf-8");
    const offset = await appendToPromptFile(path, "appended");
    expect(offset).toBe(initial.length);
    const content = await readFile(path, "utf-8");
    expect(content).toContain("initial");
    expect(content).toContain("appended");
  });

  it("truncatePromptFile restores to startOffset", async () => {
    const path = join(tmpDir, "prompt.md");
    const initial = "initial content";
    await writeFile(path, initial, "utf-8");
    await appendToPromptFile(path, "extra stuff");
    await truncatePromptFile(path, initial.length);
    const content = await readFile(path, "utf-8");
    expect(content).toBe(initial);
  });

  it("truncatePromptFile with offset 0 deletes file", async () => {
    const path = join(tmpDir, "prompt.md");
    await appendToPromptFile(path, "content");
    await truncatePromptFile(path, 0);
    const content = await readFile(path, "utf-8").catch(() => null);
    expect(content).toBeNull();
  });

  it("appendUndoNote adds undo note to file", async () => {
    const path = join(tmpDir, "prompt.md");
    await writeFile(path, "original", "utf-8");
    await appendUndoNote(path, "undo-123");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("Undo 採用");
    expect(content).toContain("undo-123");
  });
});
