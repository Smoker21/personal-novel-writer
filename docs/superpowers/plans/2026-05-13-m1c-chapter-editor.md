# M1-C 章節編輯器實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成章節編輯器三欄 UI（ChapterList + CM6 編輯區 + TitleInput + Save），含 IndexedDB autosave、衝突處理、Ctrl+S/Z/Y 快捷鍵、首次警語對話框。完成後 M1 寫作骨架完整可用。

**Architecture:** 後端 chapter-fs + chapters routes 先，前端按依賴序：types → Dexie → editor-store → CM6 元件 → 整合頁。fs_watcher 簡化為 window focus 觸發；status-updater 留 log placeholder；DELETE UI 留 M3。

**Tech Stack:** CodeMirror 6（@codemirror/state/view/commands/language/lang-markdown）、Dexie 4、Zustand 4、Hono、vitest + RTL + MSW、Tailwind v4。

---

## 檔案地圖

| 動作 | 路徑 | 負責 |
|---|---|---|
| MODIFY | `packages/shared-types/src/chapter.ts` | 補 ChapterFile / ChapterListItem / SaveChapterRequest 等 |
| CREATE | `apps/api/src/services/chapter-fs.ts` | 章節檔案 CRUD + rename |
| CREATE | `apps/api/src/services/chapter-mtime.ts` | mtime 取得 helper |
| CREATE | `apps/api/src/routes/chapters.ts` | 6 個 endpoints |
| MODIFY | `apps/api/src/server.ts` | 註冊 chapters route |
| CREATE | `apps/web/src/lib/db.ts` | Dexie schema |
| CREATE | `apps/web/src/lib/word-count.ts` | countChars wrapper |
| CREATE | `apps/web/src/lib/broadcast-channel.ts` | 多 tab 偵測骨架 |
| CREATE | `apps/web/src/lib/window-focus.ts` | useWindowFocusEffect hook |
| CREATE | `apps/web/src/stores/editor-store.ts` | Zustand store |
| CREATE | `apps/web/src/features/editor/ChapterEditor.tsx` | CM6 整合 |
| CREATE | `apps/web/src/features/editor/ChapterList.tsx` | 左側列表 |
| CREATE | `apps/web/src/features/editor/TitleInput.tsx` | 標題編輯 |
| CREATE | `apps/web/src/features/editor/SaveButton.tsx` | 儲存按鈕 |
| CREATE | `apps/web/src/features/editor/EditorStatusIndicator.tsx` | 三狀態 |
| CREATE | `apps/web/src/features/editor/ConflictDialog.tsx` | 衝突對話框 |
| MODIFY | `apps/web/src/features/editor/EditorPlaceholder.tsx` → 改名 `ChapterEditorPage.tsx` | 整合三欄 |
| CREATE | `apps/web/src/features/onboarding/FirstLaunchWarningDialog.tsx` | 首次警語 |
| MODIFY | `apps/web/src/App.tsx` | 包入 FirstLaunchWarningDialog |
| MODIFY | `apps/web/src/router.tsx` | /editor/:hash 接到 ChapterEditorPage |
| MODIFY | `apps/web/src/mocks/handlers.ts` | 加 chapter handlers |
| CREATE | `apps/web/src/mocks/fixtures/chapters.ts` | mock 章節資料 |
| MODIFY | `apps/web/package.json` | 加 codemirror 依賴 |

---

## Task 1：shared-types 擴充

**Files:**
- Modify: `packages/shared-types/src/chapter.ts`

- [ ] **Step 1.1：完整覆寫 `packages/shared-types/src/chapter.ts`**

```ts
export interface Chapter {
  number: number;
  title: string;
  content: string;
  charCount: number;
  mtime: string;
}

export interface ChapterSummary {
  number: number;
  title: string;
  charCount: number;
  mtime: string;
}

export interface ChapterFile {
  number: number;
  title: string;
  path: string;
  content: string;
  mtime: string;
  size: number;
}

export interface ChapterListItem {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
}

export interface SaveChapterRequest {
  content: string;
  title: string;
  expectedMtime?: string;
}

export interface SaveChapterResponse {
  path: string;
  mtime: string;
  size: number;
  commitSha: string | null;
  statusUpdateJobId: string | null;
}

export type SaveChapterErrorCode =
  | "INVALID_TITLE"
  | "MTIME_MISMATCH"
  | "RENAME_CONFLICT"
  | "IO_ERROR";

export interface CreateChapterRequest {
  title?: string;
}

export interface CreateChapterResponse {
  number: number;
  title: string;
  path: string;
}

export function countChars(text: string): number {
  return [...text].filter((c) => !/\s/.test(c)).length;
}
```

- [ ] **Step 1.2：typecheck + commit**

```bash
cd F:/workspace/novel_writer && pnpm typecheck 2>&1 | tail -5
git add packages/shared-types/src/chapter.ts
git commit -m "feat(types): M1-C chapter editor types"
```

---

## Task 2：chapter-fs + chapter-mtime services

**Files:**
- Create: `apps/api/src/services/chapter-mtime.ts`
- Create: `apps/api/src/services/chapter-fs.ts`
- Create: `apps/api/src/services/chapter-fs.test.ts`

- [ ] **Step 2.1：建立 `chapter-mtime.ts`**

```ts
import { stat } from "node:fs/promises";

export async function getChapterMtime(filePath: string): Promise<string | null> {
  try {
    const s = await stat(filePath);
    return s.mtime.toISOString();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2.2：寫測試 `chapter-fs.test.ts`**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createChapter,
  deleteChapter,
  listChapters,
  readChapter,
  renameChapter,
  saveChapter,
} from "./chapter-fs.js";

describe("chapter-fs", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "chapter-fs-"));
    mkdirSync(join(projectPath, "chapters"), { recursive: true });
  });
  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it("readChapter returns null when not found", async () => {
    const result = await readChapter(projectPath, 1);
    expect(result).toBeNull();
  });

  it("createChapter writes empty file with auto number", async () => {
    const ch = await createChapter(projectPath, "首章");
    expect(ch.number).toBe(1);
    expect(ch.title).toBe("首章");
    expect(existsSync(join(projectPath, "chapters", "chapter_0001_首章.md"))).toBe(true);

    const ch2 = await createChapter(projectPath);
    expect(ch2.number).toBe(2);
    expect(ch2.title).toBe("未命名");
  });

  it("readChapter returns content + title from filename", async () => {
    await createChapter(projectPath, "首章");
    writeFileSync(join(projectPath, "chapters", "chapter_0001_首章.md"), "hello content", "utf-8");
    const result = await readChapter(projectPath, 1);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("首章");
    expect(result?.content).toBe("hello content");
    expect(result?.size).toBeGreaterThan(0);
  });

  it("listChapters returns all chapters sorted by number", async () => {
    await createChapter(projectPath, "A");
    await createChapter(projectPath, "B");
    await createChapter(projectPath, "C");
    const list = await listChapters(projectPath);
    expect(list).toHaveLength(3);
    expect(list[0]?.number).toBe(1);
    expect(list[2]?.number).toBe(3);
  });

  it("saveChapter writes content without rename", async () => {
    const ch = await createChapter(projectPath, "原標題");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "新內容",
      title: "原標題",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = readFileSync(result.path, "utf-8");
      expect(content).toBe("新內容");
      expect(result.renamed).toBe(false);
    }
  });

  it("saveChapter with new title renames file", async () => {
    const ch = await createChapter(projectPath, "舊標題");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "x",
      title: "新標題",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renamed).toBe(true);
      expect(existsSync(join(projectPath, "chapters", "chapter_0001_新標題.md"))).toBe(true);
      expect(existsSync(join(projectPath, "chapters", "chapter_0001_舊標題.md"))).toBe(false);
    }
  });

  it("saveChapter returns MTIME_MISMATCH when expectedMtime differs", async () => {
    const ch = await createChapter(projectPath, "x");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "x",
      title: "x",
      expectedMtime: "1970-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MTIME_MISMATCH");
  });

  it("saveChapter returns INVALID_TITLE for empty title", async () => {
    const ch = await createChapter(projectPath, "x");
    const result = await saveChapter({
      projectPath,
      chapterNumber: ch.number,
      content: "x",
      title: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_TITLE");
  });

  it("renameChapter handles file rename", async () => {
    await createChapter(projectPath, "前");
    const result = await renameChapter(projectPath, 1, "後");
    expect(result.newPath).toContain("chapter_0001_後.md");
    expect(existsSync(result.oldPath)).toBe(false);
    expect(existsSync(result.newPath)).toBe(true);
  });

  it("deleteChapter removes the .md file", async () => {
    const ch = await createChapter(projectPath, "x");
    const result = await deleteChapter(projectPath, ch.number);
    expect(result.deletedPath).toContain("chapter_0001_x.md");
    expect(existsSync(result.deletedPath)).toBe(false);
  });
});
```

- [ ] **Step 2.3：實作 `chapter-fs.ts`**

```ts
import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { countChars } from "@novel-writer/shared-types";
import { sanitizeSlug } from "./sanitize.js";

const CHAPTER_PATTERN = /^chapter_(\d{4})_(.+)\.md$/;

export interface ChapterFile {
  number: number;
  title: string;
  path: string;
  content: string;
  mtime: string;
  size: number;
}

export interface ChapterListEntry {
  number: number;
  title: string;
  path: string;
  wordCount: number;
  mtime: string;
  hasPromptFile: boolean;
}

interface ChapterFileLocation {
  number: number;
  title: string;
  filename: string;
  fullPath: string;
}

async function findChapterFile(
  projectPath: string,
  n: number,
): Promise<ChapterFileLocation | null> {
  const chaptersDir = join(projectPath, "chapters");
  let files: string[];
  try {
    files = await readdir(chaptersDir);
  } catch {
    return null;
  }
  const numStr = String(n).padStart(4, "0");
  for (const file of files) {
    const match = file.match(CHAPTER_PATTERN);
    if (match?.[1] === numStr && match[2] !== "prompt") {
      return {
        number: n,
        title: match[2] ?? "",
        filename: file,
        fullPath: join(chaptersDir, file),
      };
    }
  }
  return null;
}

export async function readChapter(
  projectPath: string,
  n: number,
): Promise<ChapterFile | null> {
  const loc = await findChapterFile(projectPath, n);
  if (!loc) return null;
  const content = await readFile(loc.fullPath, "utf-8");
  const s = await stat(loc.fullPath);
  return {
    number: loc.number,
    title: loc.title,
    path: loc.fullPath,
    content,
    mtime: s.mtime.toISOString(),
    size: s.size,
  };
}

export async function listChapters(projectPath: string): Promise<ChapterListEntry[]> {
  const chaptersDir = join(projectPath, "chapters");
  let files: string[];
  try {
    files = await readdir(chaptersDir);
  } catch {
    return [];
  }
  const entries: ChapterListEntry[] = [];
  const seenNumbers = new Set<number>();
  for (const file of files) {
    const match = file.match(CHAPTER_PATTERN);
    if (!match || !match[1] || match[2] === "prompt") continue;
    const num = Number.parseInt(match[1], 10);
    if (seenNumbers.has(num)) continue;
    seenNumbers.add(num);
    const fullPath = join(chaptersDir, file);
    const [content, s] = await Promise.all([
      readFile(fullPath, "utf-8"),
      stat(fullPath),
    ]);
    const promptFile = `chapter_${match[1]}_prompt.md`;
    const hasPromptFile = files.includes(promptFile);
    entries.push({
      number: num,
      title: match[2] ?? "",
      path: fullPath,
      wordCount: countChars(content),
      mtime: s.mtime.toISOString(),
      hasPromptFile,
    });
  }
  entries.sort((a, b) => a.number - b.number);
  return entries;
}

export async function createChapter(
  projectPath: string,
  title?: string,
): Promise<ChapterFile> {
  const existing = await listChapters(projectPath);
  const nextNum = existing.length > 0 ? Math.max(...existing.map((c) => c.number)) + 1 : 1;
  const finalTitle = title?.trim() || "未命名";
  const slugged = sanitizeSlug(finalTitle);
  const numStr = String(nextNum).padStart(4, "0");
  const filename = `chapter_${numStr}_${slugged}.md`;
  const fullPath = join(projectPath, "chapters", filename);
  await writeFile(fullPath, "", "utf-8");
  const s = await stat(fullPath);
  return {
    number: nextNum,
    title: slugged,
    path: fullPath,
    content: "",
    mtime: s.mtime.toISOString(),
    size: 0,
  };
}

export interface SaveChapterParams {
  projectPath: string;
  chapterNumber: number;
  content: string;
  title: string;
  expectedMtime?: string;
}

export type SaveChapterResult =
  | { ok: true; path: string; mtime: string; size: number; renamed: boolean }
  | { ok: false; code: "MTIME_MISMATCH" | "RENAME_CONFLICT" | "INVALID_TITLE"; message: string };

export async function saveChapter(params: SaveChapterParams): Promise<SaveChapterResult> {
  const { projectPath, chapterNumber, content, title, expectedMtime } = params;

  let slugged: string;
  try {
    slugged = sanitizeSlug(title);
  } catch (err) {
    return {
      ok: false,
      code: "INVALID_TITLE",
      message: err instanceof Error ? err.message : "invalid title",
    };
  }

  const loc = await findChapterFile(projectPath, chapterNumber);
  if (!loc) {
    return { ok: false, code: "MTIME_MISMATCH", message: "chapter not found" };
  }

  if (expectedMtime) {
    const s = await stat(loc.fullPath);
    if (s.mtime.toISOString() !== expectedMtime) {
      return { ok: false, code: "MTIME_MISMATCH", message: "external modification detected" };
    }
  }

  const numStr = String(chapterNumber).padStart(4, "0");
  const newFilename = `chapter_${numStr}_${slugged}.md`;
  const newPath = join(projectPath, "chapters", newFilename);
  const renamed = newFilename !== loc.filename;

  if (renamed) {
    try {
      await stat(newPath);
      return { ok: false, code: "RENAME_CONFLICT", message: `target file exists: ${newFilename}` };
    } catch {
      // not exists, OK
    }
  }

  await writeFile(newPath, content, "utf-8");
  if (renamed && newPath !== loc.fullPath) {
    await rm(loc.fullPath, { force: true });
    // rename prompt file too
    const oldPrompt = join(projectPath, "chapters", `chapter_${numStr}_prompt.md`);
    try {
      await stat(oldPrompt);
      // exists, keep as-is (prompt file naming is by number, not title)
    } catch {
      // not exists, OK
    }
  }

  const s = await stat(newPath);
  return {
    ok: true,
    path: newPath,
    mtime: s.mtime.toISOString(),
    size: s.size,
    renamed,
  };
}

export async function renameChapter(
  projectPath: string,
  n: number,
  newTitle: string,
): Promise<{ oldPath: string; newPath: string }> {
  const loc = await findChapterFile(projectPath, n);
  if (!loc) throw new Error(`chapter ${n} not found`);
  const slugged = sanitizeSlug(newTitle);
  const numStr = String(n).padStart(4, "0");
  const newFilename = `chapter_${numStr}_${slugged}.md`;
  const newPath = join(projectPath, "chapters", newFilename);
  await rename(loc.fullPath, newPath);
  return { oldPath: loc.fullPath, newPath };
}

export async function deleteChapter(
  projectPath: string,
  n: number,
): Promise<{ deletedPath: string }> {
  const loc = await findChapterFile(projectPath, n);
  if (!loc) throw new Error(`chapter ${n} not found`);
  await rm(loc.fullPath, { force: true });
  return { deletedPath: loc.fullPath };
}
```

- [ ] **Step 2.4：執行測試 + commit**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -10
cd F:/workspace/novel_writer
git add apps/api/src/services/chapter-fs.ts apps/api/src/services/chapter-fs.test.ts apps/api/src/services/chapter-mtime.ts
git commit -m "feat(api): chapter-fs service with CRUD + rename + list"
```

預期：10 chapter-fs tests PASS。

---

## Task 3：chapters route

**Files:**
- Create: `apps/api/src/routes/chapters.ts`
- Create: `apps/api/src/routes/chapters.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 3.1：實作 `chapters.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type {
  ApiErrorBody,
  ChapterFile,
  ChapterListItem,
  CreateChapterResponse,
  SaveChapterResponse,
} from "@novel-writer/shared-types";
import { commitIfChanged } from "../services/commit-policy.js";
import {
  createChapter,
  deleteChapter,
  listChapters,
  readChapter,
  renameChapter,
  saveChapter,
} from "../services/chapter-fs.js";
import { resolveProjectPath } from "../services/project-resolver.js";

const saveSchema = z.object({
  content: z.string(),
  title: z.string().trim().min(1),
  expectedMtime: z.string().optional(),
});

const createSchema = z.object({ title: z.string().optional() });
const renameSchema = z.object({ title: z.string().trim().min(1) });
const deleteSchema = z.object({ confirmed: z.literal(true) });

async function getProjectPath(hash: string): Promise<string | null> {
  return resolveProjectPath(hash);
}

export const chapters = new Hono()
  .get("/", async (c) => {
    const hash = c.req.param("hash") ?? "";
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const list = await listChapters(projectPath);
    const items: ChapterListItem[] = list.map((c) => ({
      number: c.number,
      title: c.title,
      path: c.path,
      wordCount: c.wordCount,
      mtime: c.mtime,
      hasPromptFile: c.hasPromptFile,
    }));
    return c.json({ chapters: items });
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const { title } = c.req.valid("json");
    const ch = await createChapter(projectPath, title);
    const body: CreateChapterResponse = { number: ch.number, title: ch.title, path: ch.path };
    return c.json(body, 201);
  })
  .get("/:n", async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const result = await readChapter(projectPath, n);
    if (!result) {
      return c.json<ApiErrorBody>({ code: "CHAPTER_NOT_FOUND", message: "" }, 404);
    }
    const body: ChapterFile = result;
    return c.json(body);
  })
  .put("/:n", zValidator("json", saveSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const params = c.req.valid("json");
    const result = await saveChapter({
      projectPath,
      chapterNumber: n,
      content: params.content,
      title: params.title,
      ...(params.expectedMtime !== undefined ? { expectedMtime: params.expectedMtime } : {}),
    });
    if (!result.ok) {
      const status: 400 | 409 = result.code === "INVALID_TITLE" ? 400 : 409;
      return c.json<ApiErrorBody>({ code: result.code, message: result.message }, status);
    }
    let commitSha: string | null = null;
    try {
      const commit = await commitIfChanged(projectPath, "save-chapter", params.title);
      commitSha = commit?.sha ?? null;
    } catch (err) {
      console.warn(`commit-policy failed: ${String(err)}`);
    }
    // M3 placeholder
    console.log(`[status-updater] skipped for chapter ${n} (not implemented yet)`);

    const body: SaveChapterResponse = {
      path: result.path,
      mtime: result.mtime,
      size: result.size,
      commitSha,
      statusUpdateJobId: null,
    };
    return c.json(body);
  })
  .post("/:n/rename", zValidator("json", renameSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    const { title } = c.req.valid("json");
    try {
      const result = await renameChapter(projectPath, n, title);
      let commitSha = "";
      try {
        const commit = await commitIfChanged(projectPath, "rename-chapter", title);
        commitSha = commit?.sha ?? "";
      } catch (err) {
        console.warn(`commit failed: ${String(err)}`);
      }
      return c.json({ oldPath: result.oldPath, newPath: result.newPath, commitSha });
    } catch (err) {
      return c.json<ApiErrorBody>(
        { code: "IO_ERROR", message: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  })
  .delete("/:n", zValidator("json", deleteSchema), async (c) => {
    const hash = c.req.param("hash") ?? "";
    const n = Number.parseInt(c.req.param("n") ?? "0", 10);
    const projectPath = await getProjectPath(hash);
    if (!projectPath) {
      return c.json<ApiErrorBody>({ code: "PROJECT_NOT_FOUND", message: "" }, 404);
    }
    try {
      await deleteChapter(projectPath, n);
      let commitSha = "";
      try {
        const commit = await commitIfChanged(projectPath, "save-chapter", `delete chapter ${n}`);
        commitSha = commit?.sha ?? "";
      } catch {
        // ignore
      }
      return c.json({ commitSha });
    } catch (err) {
      return c.json<ApiErrorBody>(
        { code: "IO_ERROR", message: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });
```

- [ ] **Step 3.2：寫測試 `chapters.test.ts`**

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters } from "./chapters.js";
import * as projectResolver from "../services/project-resolver.js";

describe("chapters routes", () => {
  let tmpHome: string;
  let projectPath: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  async function setupProject(): Promise<void> {
    const { createProjectFiles } = await import("../services/project-fs.js");
    await createProjectFiles(
      {
        parentFolder: tmpHome,
        title: "test",
        synopsis: "s",
        characters: [{ name: "a", description: "b" }],
      },
      projectPath,
    );
  }

  beforeEach(async () => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "chapters-home-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    projectPath = join(tmpHome, "test");
    await setupProject();
    vi.spyOn(projectResolver, "resolveProjectPath").mockResolvedValue(projectPath);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
    vi.restoreAllMocks();
  });

  it("GET / lists chapters (initial state has chapter 1)", async () => {
    const res = await chapters.request("/", {
      method: "GET",
      headers: { "x-project-hash": "h" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chapters: Array<{ number: number }> };
    expect(body.chapters.length).toBeGreaterThan(0);
  });

  it("POST / creates new chapter with next number", async () => {
    const res = await chapters.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "新章" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { number: number; title: string };
    expect(body.title).toBe("新章");
    expect(body.number).toBeGreaterThan(0);
  });

  it("GET /:n returns chapter content", async () => {
    const res = await chapters.request("/1", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { number: number; content: string };
    expect(body.number).toBe(1);
  });

  it("GET /:n returns 404 for missing chapter", async () => {
    const res = await chapters.request("/999", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("PUT /:n saves content + title", async () => {
    const res = await chapters.request("/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "new content", title: "新標題" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; mtime: string };
    expect(body.path).toContain("chapter_0001_新標題.md");
  });

  it("PUT /:n returns 400 INVALID_TITLE for empty title", async () => {
    const res = await chapters.request("/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x", title: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /:n returns 409 MTIME_MISMATCH", async () => {
    const res = await chapters.request("/1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "x",
        title: "x",
        expectedMtime: "1970-01-01T00:00:00.000Z",
      }),
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3.3：路由需綁定 `:hash` 參數，所以 server.ts 用 mount style**

修改 `apps/api/src/server.ts`：

```ts
import { chapters } from "./routes/chapters.js";
const app = new Hono()
  .route("/api/health", health)
  .route("/api/settings", settings)
  .route("/api/git", git)
  .route("/api/novels", novels)
  .route("/api/projects", projects)
  .route("/api/projects/:hash/chapters", chapters);
```

注意：因 chapters 內部用 `c.req.param("hash")`，所以 mount 路徑要帶 `:hash`。Hono 會自動繼承父路徑的 params。

- [ ] **Step 3.4：跑 typecheck + test**

```bash
cd F:/workspace/novel_writer && pnpm typecheck && pnpm test 2>&1 | tail -10
```

預期：chapters 7 tests PASS。

- [ ] **Step 3.5：commit**

```bash
git add apps/api/src/routes/chapters.ts apps/api/src/routes/chapters.test.ts apps/api/src/server.ts
git commit -m "feat(api): chapters route — list/create/read/save/rename/delete"
```

---

## Task 4：前端 lib（db、word-count、broadcast-channel、window-focus）

**Files:**
- Create: `apps/web/src/lib/db.ts`
- Create: `apps/web/src/lib/word-count.ts`
- Create: `apps/web/src/lib/broadcast-channel.ts`
- Create: `apps/web/src/lib/window-focus.ts`

- [ ] **Step 4.1：建立 `db.ts`**

```ts
import Dexie, { type Table } from "dexie";

export interface DraftRow {
  id: string;
  projectHash: string;
  chapterNumber: number;
  content: string;
  title: string;
  updatedAt: number;
  baseMtime: string;
}

class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;

  constructor() {
    super("novel-writer");
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber], updatedAt",
    });
  }
}

export const db = new NovelWriterDB();

export function draftKey(projectHash: string, chapterNumber: number): string {
  return `${projectHash}:chapter:${chapterNumber}:draft`;
}

export async function getDraft(
  projectHash: string,
  chapterNumber: number,
): Promise<DraftRow | undefined> {
  return db.drafts.get(draftKey(projectHash, chapterNumber));
}

export async function putDraft(row: DraftRow): Promise<void> {
  await db.drafts.put(row);
}

export async function deleteDraft(projectHash: string, chapterNumber: number): Promise<void> {
  await db.drafts.delete(draftKey(projectHash, chapterNumber));
}
```

- [ ] **Step 4.2：建立 `word-count.ts`**

```ts
import { countChars } from "@novel-writer/shared-types";
export { countChars };
```

- [ ] **Step 4.3：建立 `broadcast-channel.ts`（骨架）**

```ts
// M1-C: broadcast-channel 多 tab 偵測骨架；Tauri 預設單視窗，本 module 留 M3 啟用
export function noopChannel(): { close: () => void } {
  return { close: () => {} };
}
```

- [ ] **Step 4.4：建立 `window-focus.ts`**

```ts
import { useEffect } from "react";

export function useWindowFocusEffect(callback: () => void): void {
  useEffect(() => {
    window.addEventListener("focus", callback);
    return () => window.removeEventListener("focus", callback);
  }, [callback]);
}
```

- [ ] **Step 4.5：commit**

```bash
cd F:/workspace/novel_writer
git add apps/web/src/lib/db.ts apps/web/src/lib/word-count.ts apps/web/src/lib/broadcast-channel.ts apps/web/src/lib/window-focus.ts
git commit -m "feat(web): Dexie db + word-count + window-focus + broadcast skeleton"
```

---

## Task 5：editor-store + 安裝 CodeMirror 6 依賴

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/stores/editor-store.ts`
- Create: `apps/web/src/stores/editor-store.test.ts`

- [ ] **Step 5.1：在 `apps/web/package.json` 加 CodeMirror 6 依賴**

dependencies 加：

```json
"@codemirror/commands": "^6.7.0",
"@codemirror/lang-markdown": "^6.3.0",
"@codemirror/language": "^6.10.0",
"@codemirror/state": "^6.5.0",
"@codemirror/view": "^6.34.0",
"codemirror": "^6.0.1"
```

執行：

```bash
cd F:/workspace/novel_writer && pnpm install
```

- [ ] **Step 5.2：建立 `editor-store.ts`**

```ts
import { create } from "zustand";

export type EditorStateKind =
  | { kind: "loading" }
  | { kind: "clean" }
  | { kind: "browser-only"; lastAutoSaveAt: number }
  | { kind: "save-error"; reason: string; retryCount: number };

export interface ChapterContext {
  number: number;
  title: string;
  fileTitle: string;
  baseMtime: string;
  baseContent: string;
}

interface EditorStore {
  projectHash: string | null;
  chapter: ChapterContext | null;
  state: EditorStateKind;
  charCount: number;

  setProjectHash(hash: string): void;
  setChapter(ctx: ChapterContext): void;
  setTitle(title: string): void;
  markLoading(): void;
  markClean(newMtime: string, newContent: string, newFileTitle: string): void;
  markDirty(charCount: number, autoSaveAt: number): void;
  markSaveError(reason: string, retryCount?: number): void;
  reset(): void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  projectHash: null,
  chapter: null,
  state: { kind: "loading" },
  charCount: 0,

  setProjectHash: (hash) => set({ projectHash: hash }),
  setChapter: (ctx) => set({ chapter: ctx }),
  setTitle: (title) =>
    set((s) => (s.chapter ? { chapter: { ...s.chapter, title } } : {})),
  markLoading: () => set({ state: { kind: "loading" } }),
  markClean: (newMtime, newContent, newFileTitle) =>
    set((s) => ({
      state: { kind: "clean" },
      chapter: s.chapter
        ? { ...s.chapter, baseMtime: newMtime, baseContent: newContent, fileTitle: newFileTitle }
        : null,
    })),
  markDirty: (charCount, autoSaveAt) =>
    set({ state: { kind: "browser-only", lastAutoSaveAt: autoSaveAt }, charCount }),
  markSaveError: (reason, retryCount = 0) =>
    set({ state: { kind: "save-error", reason, retryCount } }),
  reset: () =>
    set({
      chapter: null,
      state: { kind: "loading" },
      charCount: 0,
    }),
}));
```

- [ ] **Step 5.3：寫測試**

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useEditorStore } from "./editor-store.js";

describe("editor-store", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useEditorStore.setState({ projectHash: null });
  });

  it("starts in loading state", () => {
    expect(useEditorStore.getState().state.kind).toBe("loading");
  });

  it("setChapter sets context", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "x",
      fileTitle: "x",
      baseMtime: "2026-01-01T00:00:00Z",
      baseContent: "content",
    });
    expect(useEditorStore.getState().chapter?.number).toBe(1);
  });

  it("markDirty transitions to browser-only", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "x",
      fileTitle: "x",
      baseMtime: "x",
      baseContent: "x",
    });
    useEditorStore.getState().markDirty(10, 1000);
    const s = useEditorStore.getState().state;
    expect(s.kind).toBe("browser-only");
    if (s.kind === "browser-only") expect(s.lastAutoSaveAt).toBe(1000);
  });

  it("markClean updates baseMtime and resets state", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "x",
      fileTitle: "x",
      baseMtime: "old",
      baseContent: "old",
    });
    useEditorStore.getState().markClean("new", "new content", "new-title");
    const { chapter, state } = useEditorStore.getState();
    expect(state.kind).toBe("clean");
    expect(chapter?.baseMtime).toBe("new");
    expect(chapter?.baseContent).toBe("new content");
    expect(chapter?.fileTitle).toBe("new-title");
  });

  it("setTitle updates only title not fileTitle", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "old",
      fileTitle: "old",
      baseMtime: "x",
      baseContent: "x",
    });
    useEditorStore.getState().setTitle("new");
    const c = useEditorStore.getState().chapter;
    expect(c?.title).toBe("new");
    expect(c?.fileTitle).toBe("old");
  });
});
```

- [ ] **Step 5.4：跑測試 + commit**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web typecheck && pnpm --filter @novel-writer/web test 2>&1 | tail -10
git add apps/web/package.json apps/web/src/stores/editor-store.ts apps/web/src/stores/editor-store.test.ts pnpm-lock.yaml
git commit -m "feat(web): editor-store + CodeMirror 6 dependencies"
```

預期：5 editor-store tests PASS。

---

## Task 6：MSW handlers + fixtures 擴充

**Files:**
- Create: `apps/web/src/mocks/fixtures/chapters.ts`
- Modify: `apps/web/src/mocks/handlers.ts`

- [ ] **Step 6.1：建立 fixtures**

```ts
import type {
  ChapterFile,
  ChapterListItem,
  CreateChapterResponse,
  SaveChapterResponse,
} from "@novel-writer/shared-types";

export const mockChapterList: ChapterListItem[] = [
  {
    number: 1,
    title: "梅雨初晴",
    path: "/mock/MyNovels/春日記事/chapters/chapter_0001_梅雨初晴.md",
    wordCount: 128,
    mtime: "2026-05-13T10:00:00Z",
    hasPromptFile: false,
  },
];

export const mockChapterFile: ChapterFile = {
  number: 1,
  title: "梅雨初晴",
  path: "/mock/MyNovels/春日記事/chapters/chapter_0001_梅雨初晴.md",
  content: "她推開書店木門時，雨剛好停了。",
  mtime: "2026-05-13T10:00:00Z",
  size: 42,
};

export const mockSaveChapterResponse: SaveChapterResponse = {
  path: mockChapterFile.path,
  mtime: new Date().toISOString(),
  size: 100,
  commitSha: "abc123def",
  statusUpdateJobId: null,
};

export const mockCreateChapterResponse: CreateChapterResponse = {
  number: 2,
  title: "未命名",
  path: "/mock/MyNovels/春日記事/chapters/chapter_0002_未命名.md",
};
```

- [ ] **Step 6.2：擴充 `handlers.ts`**

讀現有 handlers.ts，加入：

```ts
import {
  mockChapterFile,
  mockChapterList,
  mockCreateChapterResponse,
  mockSaveChapterResponse,
} from "./fixtures/chapters.js";

// 加到 handlers 陣列：
http.get("/api/projects/:hash/chapters/", () =>
  HttpResponse.json({ chapters: mockChapterList }),
),
http.post("/api/projects/:hash/chapters/", () =>
  HttpResponse.json(mockCreateChapterResponse, { status: 201 }),
),
http.get("/api/projects/:hash/chapters/:n", () => HttpResponse.json(mockChapterFile)),
http.put("/api/projects/:hash/chapters/:n", () => HttpResponse.json(mockSaveChapterResponse)),
http.post("/api/projects/:hash/chapters/:n/rename", () =>
  HttpResponse.json({ oldPath: "old", newPath: "new", commitSha: "x" }),
),
```

- [ ] **Step 6.3：commit**

```bash
git add apps/web/src/mocks/fixtures/chapters.ts apps/web/src/mocks/handlers.ts
git commit -m "feat(web): MSW handlers + fixtures for M1-C chapters"
```

---

## Task 7：editor 子元件（status indicator、title input、conflict dialog）

**Files:**
- Create: `apps/web/src/features/editor/EditorStatusIndicator.tsx`
- Create: `apps/web/src/features/editor/TitleInput.tsx`
- Create: `apps/web/src/features/editor/ConflictDialog.tsx`
- Create: `apps/web/src/features/editor/EditorStatusIndicator.test.tsx`

- [ ] **Step 7.1：`EditorStatusIndicator.tsx`**

```tsx
import type { EditorStateKind } from "../../stores/editor-store.js";

interface Props {
  state: EditorStateKind;
}

function secondsAgo(epoch: number): number {
  return Math.max(0, Math.floor((Date.now() - epoch) / 1000));
}

export function EditorStatusIndicator({ state }: Props) {
  if (state.kind === "loading") {
    return <span className="text-xs text-gray-400">載入中…</span>;
  }
  if (state.kind === "clean") {
    return <span className="text-xs text-green-600">🟢 已儲存到 .md</span>;
  }
  if (state.kind === "browser-only") {
    return (
      <span className="text-xs text-amber-600">
        🟡 編輯中（已 autosave 到 browser，{secondsAgo(state.lastAutoSaveAt)} 秒前）
      </span>
    );
  }
  return (
    <span className="text-xs text-red-600">
      🔴 儲存失敗：{state.reason}
      {state.retryCount > 0 && `（重試 ${state.retryCount}/3）`}
    </span>
  );
}
```

- [ ] **Step 7.2：`TitleInput.tsx`**

```tsx
import { useState } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

const UNSAFE_RE = /[/\\:*?"<>|]/;

export function TitleInput({ value, onChange }: Props) {
  const [touched, setTouched] = useState(false);
  const hasUnsafe = UNSAFE_RE.test(value);
  const isEmpty = value.trim() === "";
  const showError = touched && (hasUnsafe || isEmpty);

  return (
    <div className="flex flex-col">
      <input
        type="text"
        className={`px-2 py-1 border rounded text-sm ${
          showError ? "border-red-500" : "border-gray-300"
        }`}
        placeholder="章節標題"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {hasUnsafe && (
        <span className="text-xs text-amber-600 mt-1">
          將會自動移除：/ \ : * ? " &lt; &gt; |
        </span>
      )}
      {touched && isEmpty && <span className="text-xs text-red-600 mt-1">標題不可為空</span>}
    </div>
  );
}
```

- [ ] **Step 7.3：`ConflictDialog.tsx`**

```tsx
interface Props {
  kind: "open" | "save";
  localContent: string;
  serverContent: string;
  onApplyServer: () => void;
  onForceLocal: () => void;
  onCancel: () => void;
}

function preview(s: string): string {
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

export function ConflictDialog({
  kind,
  localContent,
  serverContent,
  onApplyServer,
  onForceLocal,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full space-y-4">
        <h2 className="text-lg font-semibold">
          {kind === "open" ? "外部變更已偵測（開啟時）" : "儲存衝突（外部已修改）"}
        </h2>
        <p className="text-sm text-gray-600">
          .md 檔案在 app 外被修改過。請選擇要保留哪個版本：
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="border rounded p-2 space-y-1">
            <div className="font-medium">伺服器版本（.md）</div>
            <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded">
              {preview(serverContent)}
            </pre>
          </div>
          <div className="border rounded p-2 space-y-1">
            <div className="font-medium">我的版本（編輯器）</div>
            <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded">
              {preview(localContent)}
            </pre>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onApplyServer}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            載入伺服器版本（捨棄我的編輯）
          </button>
          <button
            type="button"
            onClick={onForceLocal}
            className="px-4 py-2 border border-red-500 text-red-600 rounded text-sm"
          >
            強制儲存我的版本（覆寫伺服器）
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-500 text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4：寫 indicator 測試**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorStatusIndicator } from "./EditorStatusIndicator.js";

describe("EditorStatusIndicator", () => {
  it("renders loading", () => {
    render(<EditorStatusIndicator state={{ kind: "loading" }} />);
    expect(screen.getByText(/載入中/)).toBeInTheDocument();
  });
  it("renders clean (green)", () => {
    render(<EditorStatusIndicator state={{ kind: "clean" }} />);
    expect(screen.getByText(/已儲存/)).toBeInTheDocument();
  });
  it("renders browser-only (yellow)", () => {
    render(
      <EditorStatusIndicator
        state={{ kind: "browser-only", lastAutoSaveAt: Date.now() }}
      />,
    );
    expect(screen.getByText(/編輯中/)).toBeInTheDocument();
  });
  it("renders save-error (red) with reason", () => {
    render(
      <EditorStatusIndicator
        state={{ kind: "save-error", reason: "network", retryCount: 1 }}
      />,
    );
    expect(screen.getByText(/儲存失敗/)).toBeInTheDocument();
    expect(screen.getByText(/network/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.5：commit**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web typecheck && pnpm --filter @novel-writer/web test 2>&1 | tail -5
git add apps/web/src/features/editor/EditorStatusIndicator.tsx apps/web/src/features/editor/TitleInput.tsx apps/web/src/features/editor/ConflictDialog.tsx apps/web/src/features/editor/EditorStatusIndicator.test.tsx
git commit -m "feat(web): editor sub-components — status indicator + title input + conflict dialog"
```

---

## Task 8：ChapterList + SaveButton

**Files:**
- Create: `apps/web/src/features/editor/ChapterList.tsx`
- Create: `apps/web/src/features/editor/SaveButton.tsx`

- [ ] **Step 8.1：`ChapterList.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { ChapterListItem } from "@novel-writer/shared-types";

interface Props {
  projectHash: string;
  currentChapter: number | null;
  onSelectChapter: (n: number) => void;
  onCreateChapter: () => void;
}

export function ChapterList({ projectHash, currentChapter, onSelectChapter, onCreateChapter }: Props) {
  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/projects/${projectHash}/chapters/`);
    if (!res.ok) return;
    const data = (await res.json()) as { chapters: ChapterListItem[] };
    setChapters(data.chapters);
  }

  useEffect(() => {
    void refresh();
  }, [projectHash]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/chapters/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const ch = (await res.json()) as { number: number };
        await refresh();
        onCreateChapter();
        onSelectChapter(ch.number);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="w-64 border-r overflow-y-auto p-3">
      <h2 className="text-xs font-medium text-gray-500 mb-2">章節</h2>
      <ul className="space-y-1">
        {chapters.map((ch) => (
          <li key={ch.number}>
            <button
              type="button"
              onClick={() => onSelectChapter(ch.number)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                ch.number === currentChapter ? "bg-blue-100" : "hover:bg-gray-100"
              }`}
            >
              <div className="font-medium truncate">
                第 {ch.number} 章 · {ch.title}
              </div>
              <div className="text-xs text-gray-400">{ch.wordCount} 字</div>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="mt-3 w-full px-2 py-1 border border-dashed rounded text-sm text-gray-500 hover:bg-gray-50"
      >
        + 新章節
      </button>
    </aside>
  );
}
```

- [ ] **Step 8.2：`SaveButton.tsx`**

```tsx
import { useState } from "react";
import type { ApiErrorBody, SaveChapterResponse } from "@novel-writer/shared-types";
import { deleteDraft } from "../../lib/db.js";
import { useEditorStore } from "../../stores/editor-store.js";

interface Props {
  getContent: () => string;
  onConflict: (serverContent: string) => Promise<void>;
}

export function SaveButton({ getContent, onConflict }: Props) {
  const store = useEditorStore();
  const [saving, setSaving] = useState(false);

  async function performSave(force = false): Promise<void> {
    if (!store.projectHash || !store.chapter) return;
    if (store.chapter.title.trim() === "") {
      const t = window.prompt("請輸入章節標題");
      if (!t) return;
      store.setTitle(t);
    }
    setSaving(true);
    try {
      const content = getContent();
      const res = await fetch(
        `/api/projects/${store.projectHash}/chapters/${store.chapter.number}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content,
            title: store.chapter.title.trim(),
            ...(force ? {} : { expectedMtime: store.chapter.baseMtime }),
          }),
        },
      );
      if (res.status === 409) {
        // fetch server fresh content
        const fresh = await fetch(
          `/api/projects/${store.projectHash}/chapters/${store.chapter.number}`,
        );
        if (fresh.ok) {
          const body = (await fresh.json()) as { content: string };
          await onConflict(body.content);
        }
        return;
      }
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        store.markSaveError(body.message);
        return;
      }
      const body = (await res.json()) as SaveChapterResponse;
      await deleteDraft(store.projectHash, store.chapter.number);
      store.markClean(body.mtime, content, store.chapter.title.trim());
    } catch (err) {
      store.markSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => performSave(false)}
      disabled={saving}
      className="px-4 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
    >
      {saving ? "儲存中…" : "儲存"}
    </button>
  );
}
```

- [ ] **Step 8.3：commit**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web typecheck 2>&1 | tail -5
git add apps/web/src/features/editor/ChapterList.tsx apps/web/src/features/editor/SaveButton.tsx
git commit -m "feat(web): ChapterList + SaveButton with conflict callback"
```

---

## Task 9：ChapterEditor (CM6 整合)

**Files:**
- Create: `apps/web/src/features/editor/ChapterEditor.tsx`

- [ ] **Step 9.1：實作 `ChapterEditor.tsx`**

```tsx
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useEffect, useRef } from "react";
import { countChars } from "@novel-writer/shared-types";
import { draftKey, putDraft } from "../../lib/db.js";
import { useEditorStore } from "../../stores/editor-store.js";

const DEBOUNCE_MS = 1500;

interface Props {
  initialContent: string;
  onContentRef?: (getContent: () => string) => void;
  onSave?: () => void;
}

export function ChapterEditor({ initialContent, onContentRef, onSave }: Props) {
  const viewRef = useRef<EditorView | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // expose getContent
  useEffect(() => {
    onContentRef?.(() => viewRef.current?.state.doc.toString() ?? "");
  }, [onContentRef]);

  useEffect(() => {
    if (!hostRef.current) return;

    const ctrlS = keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          onSave?.();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const store = useEditorStore.getState();
      if (!store.projectHash || !store.chapter) return;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const content = update.state.doc.toString();
        const now = Date.now();
        const charCount = countChars(content);
        const { projectHash, chapter } = useEditorStore.getState();
        if (!projectHash || !chapter) return;
        void putDraft({
          id: draftKey(projectHash, chapter.number),
          projectHash,
          chapterNumber: chapter.number,
          content,
          title: chapter.title,
          updatedAt: now,
          baseMtime: chapter.baseMtime,
        });
        useEditorStore.getState().markDirty(charCount, now);
      }, DEBOUNCE_MS);
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        ctrlS,
        markdown(),
        EditorView.lineWrapping,
        lineNumbers(),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    // flush on blur
    const flush = () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
        const content = view.state.doc.toString();
        const now = Date.now();
        const { projectHash, chapter } = useEditorStore.getState();
        if (projectHash && chapter) {
          void putDraft({
            id: draftKey(projectHash, chapter.number),
            projectHash,
            chapterNumber: chapter.number,
            content,
            title: chapter.title,
            updatedAt: now,
            baseMtime: chapter.baseMtime,
          });
          useEditorStore.getState().markDirty(countChars(content), now);
        }
      }
    };
    window.addEventListener("blur", flush);
    window.addEventListener("beforeunload", flush);

    return () => {
      flush();
      window.removeEventListener("blur", flush);
      window.removeEventListener("beforeunload", flush);
      view.destroy();
      viewRef.current = null;
    };
    // intentionally one-shot init; we don't re-init on initialContent changes (new chapter is mounted fresh via key prop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className="flex-1 overflow-auto bg-white"
      style={{ minHeight: 0 }}
    />
  );
}
```

- [ ] **Step 9.2：commit**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web typecheck 2>&1 | tail -5
git add apps/web/src/features/editor/ChapterEditor.tsx
git commit -m "feat(web): ChapterEditor with CM6 + autosave + Ctrl+S"
```

---

## Task 10：ChapterEditorPage（整合三欄）

**Files:**
- Modify: `apps/web/src/features/editor/EditorPlaceholder.tsx` → 改寫
- 或 Create: `apps/web/src/features/editor/ChapterEditorPage.tsx` 並從 router 引用

- [ ] **Step 10.1：建立 `ChapterEditorPage.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChapterFile } from "@novel-writer/shared-types";
import { deleteDraft, getDraft } from "../../lib/db.js";
import { useWindowFocusEffect } from "../../lib/window-focus.js";
import { useEditorStore } from "../../stores/editor-store.js";
import { ChapterEditor } from "./ChapterEditor.js";
import { ChapterList } from "./ChapterList.js";
import { ConflictDialog } from "./ConflictDialog.js";
import { EditorStatusIndicator } from "./EditorStatusIndicator.js";
import { SaveButton } from "./SaveButton.js";
import { TitleInput } from "./TitleInput.js";

export function ChapterEditorPage() {
  const { hash } = useParams<{ hash: string }>();
  const navigate = useNavigate();
  const store = useEditorStore();
  const [editorKey, setEditorKey] = useState(0);
  const [initialContent, setInitialContent] = useState("");
  const [conflict, setConflict] = useState<{
    serverContent: string;
    kind: "open" | "save";
  } | null>(null);
  const getContentRef = useRef<() => string>(() => "");

  if (!hash) {
    return <Navigate hash={hash} />;
  }

  async function loadChapter(n: number, projectHash: string) {
    store.markLoading();
    const res = await fetch(`/api/projects/${projectHash}/chapters/${n}`);
    if (!res.ok) {
      store.markSaveError("無法載入章節");
      return;
    }
    const file = (await res.json()) as ChapterFile;
    const draft = await getDraft(projectHash, n);

    if (!draft) {
      // Case A
      store.setChapter({
        number: file.number,
        title: file.title,
        fileTitle: file.title,
        baseMtime: file.mtime,
        baseContent: file.content,
      });
      setInitialContent(file.content);
      setEditorKey((k) => k + 1);
      store.markClean(file.mtime, file.content, file.title);
      return;
    }

    if (draft.content === file.content && draft.title === file.title) {
      // Case B
      await deleteDraft(projectHash, n);
      store.setChapter({
        number: file.number,
        title: file.title,
        fileTitle: file.title,
        baseMtime: file.mtime,
        baseContent: file.content,
      });
      setInitialContent(file.content);
      setEditorKey((k) => k + 1);
      store.markClean(file.mtime, file.content, file.title);
      return;
    }

    if (draft.baseMtime === file.mtime) {
      // Case C: draft newer than .md, normal
      store.setChapter({
        number: file.number,
        title: draft.title,
        fileTitle: file.title,
        baseMtime: file.mtime,
        baseContent: file.content,
      });
      setInitialContent(draft.content);
      setEditorKey((k) => k + 1);
      store.markDirty(draft.content.length, draft.updatedAt);
      return;
    }

    // Case D: conflict — .md changed externally while draft existed
    setConflict({ serverContent: file.content, kind: "open" });
    store.setChapter({
      number: file.number,
      title: draft.title,
      fileTitle: file.title,
      baseMtime: file.mtime,
      baseContent: file.content,
    });
    setInitialContent(draft.content);
    setEditorKey((k) => k + 1);
  }

  useEffect(() => {
    if (!hash) return;
    store.setProjectHash(hash);
    void loadChapter(1, hash); // M1-C: default load chapter 1; M2 use settings.lastChapter
    return () => store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  useWindowFocusEffect(() => {
    if (!hash || !store.chapter) return;
    void (async () => {
      const res = await fetch(`/api/projects/${hash}/chapters/${store.chapter.number}`);
      if (!res.ok) return;
      const file = (await res.json()) as ChapterFile;
      if (file.mtime !== store.chapter?.baseMtime && store.state.kind !== "loading") {
        setConflict({ serverContent: file.content, kind: "open" });
      }
    })();
  });

  async function handleApplyServer() {
    if (!conflict || !hash || !store.chapter) return;
    await deleteDraft(hash, store.chapter.number);
    setInitialContent(conflict.serverContent);
    setEditorKey((k) => k + 1);
    store.markClean(store.chapter.baseMtime, conflict.serverContent, store.chapter.fileTitle);
    setConflict(null);
  }

  async function handleForceLocal() {
    if (!conflict || !hash || !store.chapter) return;
    const content = getContentRef.current();
    const res = await fetch(`/api/projects/${hash}/chapters/${store.chapter.number}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, title: store.chapter.title.trim() }),
    });
    if (res.ok) {
      const body = (await res.json()) as { mtime: string };
      await deleteDraft(hash, store.chapter.number);
      store.markClean(body.mtime, content, store.chapter.title.trim());
    }
    setConflict(null);
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <Link to="/" className="text-sm text-blue-600 underline">
          ← 首頁
        </Link>
        <div className="flex items-center gap-3">
          {store.chapter && (
            <TitleInput value={store.chapter.title} onChange={(t) => store.setTitle(t)} />
          )}
          <EditorStatusIndicator state={store.state} />
          <SaveButton
            getContent={() => getContentRef.current()}
            onConflict={async (serverContent) =>
              setConflict({ serverContent, kind: "save" })
            }
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ChapterList
          projectHash={hash}
          currentChapter={store.chapter?.number ?? null}
          onSelectChapter={(n) => void loadChapter(n, hash)}
          onCreateChapter={() => undefined}
        />
        <div className="flex-1 flex flex-col">
          <ChapterEditor
            key={editorKey}
            initialContent={initialContent}
            onContentRef={(getter) => {
              getContentRef.current = getter;
            }}
          />
        </div>
      </div>

      {conflict && store.chapter && (
        <ConflictDialog
          kind={conflict.kind}
          localContent={getContentRef.current()}
          serverContent={conflict.serverContent}
          onApplyServer={handleApplyServer}
          onForceLocal={handleForceLocal}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}

function Navigate({ hash }: { hash: string | undefined }) {
  return (
    <div className="p-8 text-sm text-gray-500">
      No project hash provided.
    </div>
  );
}
```

注意：上面 `Navigate` helper 是 fallback，不是 react-router 的 Navigate。實際情境 hash 必存在（router 已配置）。

- [ ] **Step 10.2：刪掉舊 `EditorPlaceholder.tsx`，更新 router**

讀 `apps/web/src/router.tsx`，將：

```tsx
import { EditorPlaceholder } from "./features/editor/EditorPlaceholder.js";
{ path: "/editor/:hash", element: <EditorPlaceholder /> },
{ path: "/editor/created", element: <EditorPlaceholder /> },
```

改成：

```tsx
import { ChapterEditorPage } from "./features/editor/ChapterEditorPage.js";
{ path: "/editor/:hash", element: <ChapterEditorPage /> },
{ path: "/editor/created", element: <ChapterEditorPage /> },
```

刪除 `apps/web/src/features/editor/EditorPlaceholder.tsx`（用 `git rm` 較好）。

- [ ] **Step 10.3：typecheck + commit**

```bash
cd F:/workspace/novel_writer
pnpm --filter @novel-writer/web typecheck 2>&1 | tail -10
git rm apps/web/src/features/editor/EditorPlaceholder.tsx
git add apps/web/src/features/editor/ChapterEditorPage.tsx apps/web/src/router.tsx
git commit -m "feat(web): ChapterEditorPage integrating CM6 + list + save + conflict"
```

---

## Task 11：首次警語 Story 032

**Files:**
- Create: `apps/web/src/features/onboarding/FirstLaunchWarningDialog.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 11.1：建立 dialog**

```tsx
import { useEffect, useState } from "react";
import type { AppSettings } from "@novel-writer/shared-types";

export function FirstLaunchWarningDialog() {
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json() as Promise<AppSettings>)
      .then((s) => {
        setSettings(s);
        setAcknowledged(s.meta.firstLaunchWarningAcknowledged);
      });
  }, []);

  async function handleAcknowledge() {
    if (!settings) return;
    const next = {
      ...settings,
      meta: { ...settings.meta, firstLaunchWarningAcknowledged: true },
    };
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setAcknowledged(true);
  }

  async function handleQuit() {
    if ("__TAURI_INTERNALS__" in window) {
      const tauri = await import("@tauri-apps/api/webviewWindow");
      const win = tauri.getCurrentWebviewWindow();
      await win.close();
    } else {
      window.close();
    }
  }

  if (acknowledged !== false) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">使用前須知</h2>
        <ul className="text-sm space-y-2 list-disc ml-5">
          <li>Novel Writer 是個人本機工具，無雲端帳號，無資料同步服務。</li>
          <li>你的小說內容存在你選擇的資料夾，包含 git 版本歷史。</li>
          <li>請定期備份：git push 到遠端、Google Drive / iCloud / OneDrive 同步該資料夾，或外接硬碟。</li>
          <li>如資料夾遺失，本應用無法復原。</li>
        </ul>
        <div className="flex flex-col gap-2 pt-3 border-t">
          <button
            type="button"
            onClick={handleAcknowledge}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            我已了解，不再顯示
          </button>
          <button
            type="button"
            onClick={handleQuit}
            className="px-4 py-2 border rounded text-sm"
          >
            離開應用
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2：在 App.tsx 包入**

讀 `apps/web/src/App.tsx`，改成：

```tsx
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { FirstLaunchWarningDialog } from "./features/onboarding/FirstLaunchWarningDialog.js";
import { router } from "./router.js";

export function App() {
  const [ready, setReady] = useState(!import.meta.env.DEV || !import.meta.env["VITE_USE_MSW"]);

  useEffect(() => {
    if (!ready) {
      void import("./mocks/browser.js").then(({ mswWorker }) =>
        mswWorker.start({ onUnhandledRequest: "warn" }).then(() => setReady(true)),
      );
    }
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <FirstLaunchWarningDialog />
      <RouterProvider router={router} />
    </>
  );
}
```

- [ ] **Step 11.3：commit**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web typecheck 2>&1 | tail -5
git add apps/web/src/features/onboarding/FirstLaunchWarningDialog.tsx apps/web/src/App.tsx
git commit -m "feat(web): FirstLaunchWarningDialog (Story 032)"
```

---

## Task 12：CI 驗收 + PR

- [ ] **Step 12.1：全域 typecheck + test + lint**

```bash
cd F:/workspace/novel_writer
pnpm typecheck 2>&1 | tail -5
pnpm test 2>&1 | grep -E "Tests |FAIL" | head -10
pnpm exec biome check apps/api/src apps/web/src packages/shared-types/src 2>&1 | tail -3
```

預期：全部通過。

若 lint 有錯，跑 `pnpm exec biome check --write --unsafe ...` 自動修正，剩下手動處理。

- [ ] **Step 12.2：push + 開 PR**

```bash
git push -u origin feat/m1c-chapter-editor
gh pr create --base feat/m1b-project-lifecycle --head feat/m1c-chapter-editor \
  --title "feat(M1-C): 章節編輯器 — CM6 + autosave + 衝突 + 首次警語" \
  --body "見 docs/superpowers/specs/2026-05-13-m1c-chapter-editor-design.md"
```

---

## 附錄：M1-C / M1 DoD

- [ ] Tasks 1-12 全部 commit 完成
- [ ] typecheck + test + lint 全綠
- [ ] PR 開啟通過 CI
- [ ] 手動驗證：建專案 → 編一章 → Ctrl+S 儲存 → git log 看到 commit
- [ ] M2 可開工（AI 寫作）
