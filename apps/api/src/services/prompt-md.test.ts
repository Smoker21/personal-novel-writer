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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DRAFT_META_MESSAGES: DraftMetadata = {
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

const DRAFT_META_STRUCTURED: DraftMetadata = {
  draftId: "struct-id",
  projectHash: "abc123",
  chapterNumber: 42,
  chapterTitle: "晚風初起",
  agentName: "chapter-writer",
  modelId: "xiaohuangwen:latest",
  contextHash: "hash456",
  status: "complete",
  createdAt: "2026-05-18T08:00:00Z",
  totalChars: 2000,
  // no usage — structured provider doesn't report tokens
};

const STRUCTURED_INPUTS = {
  plot: "蘇晴推開書店的木門，雨後的陽光斜射進來。",
  background: "蘇晴：書店店員，喜歡古典文學。林書言：常客，安靜寡言。",
  requirements: "約 1500 字。第三人稱有限視角。書卷氣語感。",
  pre_summary: "故事發生在梅雨季末的舊城區書店……",
  prev_segment: "林書言拿起那本舊版詩集，默默放回架上，轉身離開。",
};

// ── Messages path ─────────────────────────────────────────────────────────────

describe("renderPromptMarkdown — messages path", () => {
  it("includes adopt markers (open and close)", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("<!-- adopt-marker:undo-1 -->");
    expect(content).toContain("<!-- /adopt-marker -->");
  });

  it("frontmatter contains kind: messages", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("kind: messages");
  });

  it("frontmatter contains estimatedTokens (from usage.inputTokens by default)", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("estimatedTokens: 500");
    expect(content).not.toContain("estimatedWords");
  });

  it("frontmatter contains estimatedTokens (explicit override)", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
      estimatedTokens: 12345,
    });
    expect(content).toContain("estimatedTokens: 12345");
  });

  it("contains ## Metadata section with token counts", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("## Metadata");
    expect(content).toContain("inputTokens: 500");
    expect(content).toContain("outputTokens: 800");
    expect(content).toContain("totalChars: 1000");
  });

  it("contains modelId in frontmatter", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("anthropic:claude-haiku-4-5");
  });

  it("does NOT contain structured section header", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).not.toContain("結構化生成欄位");
  });

  it("backwards compat: omitting kind defaults to messages path (no breakage)", () => {
    // No kind supplied — existing M5 call sites stay on messages path.
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_MESSAGES,
      undoEntryId: "undo-legacy",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("kind: messages");
    expect(content).toContain("## Metadata");
    expect(content).not.toContain("結構化生成欄位");
  });

  it("estimatedTokens falls back to 0 when usage is missing", () => {
    // Build a meta without usage (optional field) by omitting it entirely
    // rather than setting to undefined (exactOptionalPropertyTypes)
    const { usage: _omit, ...rest } = DRAFT_META_MESSAGES;
    const metaNoUsage: DraftMetadata = { ...rest };
    const content = renderPromptMarkdown({
      draftMeta: metaNoUsage,
      undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
    });
    expect(content).toContain("estimatedTokens: 0");
  });
});

// ── Structured path ───────────────────────────────────────────────────────────

describe("renderPromptMarkdown — structured path", () => {
  it("frontmatter contains kind: structured", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).toContain("kind: structured");
  });

  it("frontmatter contains estimatedWords (from totalChars by default)", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).toContain("estimatedWords: 2000");
    expect(content).not.toContain("estimatedTokens");
  });

  it("frontmatter contains estimatedWords (explicit override)", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
      estimatedWords: 8000,
    });
    expect(content).toContain("estimatedWords: 8000");
  });

  it("contains 結構化生成欄位 section header", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).toContain("## 結構化生成欄位（M6）");
  });

  it("contains all 5 sub-section headings in order", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    const plotIdx = content.indexOf("### plot（本章劇情）");
    const bgIdx = content.indexOf("### background（角色與狀態）");
    const reqIdx = content.indexOf("### requirements（寫作需求）");
    const preIdx = content.indexOf("### pre_summary（故事摘要）");
    const prevIdx = content.indexOf("### prev_segment（前章末段）");

    expect(plotIdx).toBeGreaterThan(-1);
    expect(bgIdx).toBeGreaterThan(plotIdx);
    expect(reqIdx).toBeGreaterThan(bgIdx);
    expect(preIdx).toBeGreaterThan(reqIdx);
    expect(prevIdx).toBeGreaterThan(preIdx);
  });

  it("renders structured input field content", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).toContain("蘇晴推開書店的木門");
    expect(content).toContain("書店店員");
    expect(content).toContain("約 1500 字");
    expect(content).toContain("梅雨季末");
    expect(content).toContain("林書言拿起那本舊版詩集");
  });

  it("empty prev_segment (first chapter, no previous) renders （無）", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s2",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: {
        ...STRUCTURED_INPUTS,
        prev_segment: null,
      },
    });
    // The （無） placeholder should appear
    expect(content).toContain("（無）");
    // The prev_segment heading should still be present
    expect(content).toContain("### prev_segment");
  });

  it("empty plot renders （無）", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s3",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: {
        plot: "",
        background: "some bg",
        requirements: "some req",
      },
    });
    expect(content).toContain("（無）");
  });

  it("all fields empty (structuredInputs omitted) renders all （無）", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s4",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
    });
    // All 5 headings present, each followed by （無）
    // Note: headings include the Chinese label suffix, e.g. "### plot（本章劇情）"
    expect(content).toContain("### plot（本章劇情）\n（無）");
    expect(content).toContain("### background（角色與狀態）\n（無）");
    expect(content).toContain("### requirements（寫作需求）\n（無）");
    expect(content).toContain("### pre_summary（故事摘要）\n（無）");
    expect(content).toContain("### prev_segment（前章末段）\n（無）");
  });

  it("includes adopt markers (open and close)", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).toContain("<!-- adopt-marker:undo-s1 -->");
    expect(content).toContain("<!-- /adopt-marker -->");
  });

  it("does NOT contain estimatedTokens in structured path", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).not.toContain("estimatedTokens");
  });

  it("includes model provider name in generated-with note", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META_STRUCTURED,
      undoEntryId: "undo-s1",
      adoptedAt: "2026-05-18T08:05:00Z",
      kind: "structured",
      structuredInputs: STRUCTURED_INPUTS,
    });
    expect(content).toContain("xiaohuangwen:latest");
  });
});

// ── File I/O helpers ──────────────────────────────────────────────────────────

describe("prompt-md file I/O", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `prompt-md-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
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
