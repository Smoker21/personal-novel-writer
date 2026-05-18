/**
 * M6 PR B2 — collectStructuredInputs + extractStorySummarySection 單元測試。
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectStructuredInputs,
  extractStorySummarySection,
  lastCodepoints,
} from "./context-collector.js";

describe("extractStorySummarySection", () => {
  it("extracts content under '## 故事摘要'", () => {
    const md = "# 故事狀態\n\n## 故事摘要\n\n春雨在圖書館遇見明哲。\n\n## 重大事件\n\n初遇。";
    expect(extractStorySummarySection(md)).toBe("春雨在圖書館遇見明哲。");
  });

  it("returns content till end when 故事摘要 is the last section", () => {
    const md = "## 故事摘要\n\n摘要內容。";
    expect(extractStorySummarySection(md)).toBe("摘要內容。");
  });

  it("returns empty string when section is missing", () => {
    expect(extractStorySummarySection("## 其他段\n\n內容")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractStorySummarySection("")).toBe("");
  });
});

describe("lastCodepoints", () => {
  it("returns whole string when length <= n", () => {
    expect(lastCodepoints("abc", 5)).toBe("abc");
  });

  it("returns last n codepoints", () => {
    expect(lastCodepoints("abcdef", 3)).toBe("def");
  });

  it("handles CJK codepoints correctly (not UTF-16 units)", () => {
    expect(lastCodepoints("春雨明哲圖書館", 3)).toBe("圖書館");
  });
});

describe("collectStructuredInputs", () => {
  let tmpHome: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), "csi-"));
    projectPath = join(tmpHome, "test");
    const { createProjectFiles } = await import("./project-fs.js");
    await createProjectFiles(
      {
        parentFolder: tmpHome,
        title: "test",
        synopsis: "故事大綱：春雨在圖書館遇見明哲。",
        characters: [
          { name: "春雨", description: "20 歲文學系大學生" },
          { name: "明哲", description: "22 歲圖書館研究生工讀" },
        ],
      },
      projectPath,
    );
    execSync("git init -q", { cwd: projectPath });
    execSync('git config user.email "t@t.com"', { cwd: projectPath });
    execSync('git config user.name "t"', { cwd: projectPath });
    execSync("git add . && git commit -q -m seed", { cwd: projectPath });
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("populates all 5 fields when project has full context", async () => {
    // Write story_status with 故事摘要
    await mkdir(join(projectPath, "status"), { recursive: true });
    await writeFile(
      join(projectPath, "status", "story_status.md"),
      "# 狀態\n\n## 故事摘要\n\n他們相識於春雨。\n\n## 後續\n\n...",
      "utf-8",
    );

    const { inputs, contextHash } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 1,
      participantSlugs: ["春雨"],
      outlineOverride: "春雨找明哲。",
      requirementsOverride: "約 1500 字",
    });

    expect(inputs.plot).toBe("春雨找明哲。");
    expect(inputs.requirements).toBe("約 1500 字");
    expect(inputs.pre_summary).toBe("他們相識於春雨。");
    expect(inputs.background).toContain("春雨");
    expect(inputs.prev_segment).toBe(""); // first chapter — no prev
    expect(contextHash).toMatch(/^[a-f0-9]{12}$/);
  });

  it("returns empty prev_segment for first chapter", async () => {
    const { inputs } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 1,
      participantSlugs: ["春雨"],
      outlineOverride: "p",
      requirementsOverride: "r",
    });
    expect(inputs.prev_segment).toBe("");
  });

  it("returns empty pre_summary when story_status lacks 故事摘要 section", async () => {
    const { inputs } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 1,
      participantSlugs: ["春雨"],
      outlineOverride: "p",
      requirementsOverride: "r",
    });
    expect(inputs.pre_summary).toBe("");
  });

  it("populates prev_segment with last 2000 codepoints of previous chapter", async () => {
    // Project starts with chapter 1 (from createProjectFiles). Save long content to ch1, create ch2.
    const { saveChapter, createChapter } = await import("./chapter-fs.js");
    const longText = "x".repeat(3000);
    const saveRes = await saveChapter({
      projectPath,
      chapterNumber: 1,
      content: longText,
      title: "ch1",
    });
    expect(saveRes.ok).toBe(true);
    await createChapter(projectPath, "ch2");

    const { inputs } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 2,
      participantSlugs: ["春雨"],
      outlineOverride: "p",
      requirementsOverride: "r",
    });
    expect([...(inputs.prev_segment ?? "")].length).toBe(2000);
  });

  it("background contains story_status full text (not just 故事摘要 section)", async () => {
    await mkdir(join(projectPath, "status"), { recursive: true });
    await writeFile(
      join(projectPath, "status", "story_status.md"),
      "## 故事摘要\n\n摘要。\n\n## 重大事件\n\n事件 A。",
      "utf-8",
    );

    const { inputs } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 1,
      participantSlugs: ["春雨"],
      outlineOverride: "p",
      requirementsOverride: "r",
    });
    expect(inputs.background).toContain("事件 A。"); // full status, not just 摘要
    expect(inputs.pre_summary).toBe("摘要。"); // only 摘要 section
  });

  it("empty participantSlugs yields background with only story_status (no characters)", async () => {
    await mkdir(join(projectPath, "status"), { recursive: true });
    await writeFile(join(projectPath, "status", "story_status.md"), "## 故事摘要\n\nX。", "utf-8");

    const { inputs } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 1,
      participantSlugs: [],
      outlineOverride: "p",
      requirementsOverride: "r",
    });
    expect(inputs.background).not.toContain("春雨");
    expect(inputs.background).toContain("故事狀態");
  });

  it("empty outline override results in empty plot string (not null)", async () => {
    const { inputs } = await collectStructuredInputs({
      projectPath,
      chapterNumber: 1,
      participantSlugs: ["春雨"],
      outlineOverride: null,
      requirementsOverride: null,
    });
    expect(inputs.plot).toBe("");
    expect(inputs.requirements).toBe("");
  });
});
