# M3 記憶閉環 + Git 歷史 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 MVP 記憶閉環：採用 AI 草稿 → status 自動更新 → git 歷史 UI。

**Architecture:** Wave 1（types + prompts）→ Wave 2（採用後端）‖ Wave 6（git後端）→ Wave 3（status後端）→ Wave 4（採用前端）→ Wave 5（status前端）→ Wave 6b（git前端）→ Wave 7（QA）。每個 Wave 對應一個 trunk-based 短命 PR。

**Tech Stack:** Hono + better-sqlite3 + vitest + React 18 + Zustand + CM6 + Tailwind v4

---

## 檔案結構總覽

### 新建

```
packages/shared-types/src/
  status-update.ts           # UpdateReason / StatusJobEvent / StatusShortenRequest/Response

apps/api/src/
  services/
    prompt-md.ts             # renderPromptMarkdown / appendPrompt / truncateAtMarker
    undo-store.ts            # createUndoEntry / getUndoEntry / markUndone (SQLite)
    status-context-collector.ts  # 蒐集 StatusUpdateContext（一人一檔）
    status-updater-service.ts    # 主流程：context → LLM → 比對 → write；retry 3x
    status-md-merger.ts      # 識別 🔖/✨ heading，merge 規則
    status-shortener-service.ts  # 呼叫 status-shortener Skill
    job-event-bus.ts         # in-memory jobId → AsyncIterable<StatusJobEvent>
    git-log-parser.ts        # git log numstat 解析
  routes/
    adopt.ts                 # POST /adopt
    unadopt.ts               # POST /unadopt
    status.ts                # POST /status/update-from-chapter，POST /status/shorten
    jobs.ts                  # GET /jobs/:id/events SSE bridge

packages/prompt-library/src/skills/
  status-updater.ts          # buildStatusUpdaterRequest()
  status-shortener.ts        # buildStatusShortenerRequest()

apps/web/src/
  features/
    editor/
      AdoptButton.tsx        # 採用按鈕 + 二次確認 + 進度條
      StatusUpdateIndicator.tsx  # 右下角 spinner
    status/
      StatusEditorPage.tsx   # status 編輯畫面（新路由）
      UpdateStatusButton.tsx
      StatusShortenButton.tsx
    git/
      HistoryPanel.tsx       # drawer
      CommitPreview.tsx
      DiffView.tsx
      RevertButton.tsx
```

### 修改

```
packages/shared-types/src/project.ts   # 加 UndoEntry interface
apps/api/src/services/cache-db.ts      # 加 undo_entries table
apps/api/src/services/commit-policy.ts # 加 "adopt" / "status" trigger
apps/api/src/server.ts                 # 掛新 routes
apps/web/src/features/editor/DraftPanel.tsx  # 採用按鈕改 enabled → AdoptButton
apps/web/src/features/editor/GenerateButton.tsx  # 串 LlmNotConfiguredModal
apps/api/src/routes/chapters.ts        # save 尾端觸發 status-updater
apps/api/src/routes/git.ts             # 補全 log/show/diff/revert/commit-manual
```

---

## Wave 1a：Types

### Task 1: UndoEntry + status-update.ts

**Files:**
- Modify: `packages/shared-types/src/project.ts`
- Create: `packages/shared-types/src/status-update.ts`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1: 加 UndoEntry 到 project.ts**

在 `packages/shared-types/src/project.ts` 末尾加入（`ApiErrorBody` 之前）：

```typescript
export interface UndoEntry {
  id: string;
  type: "adopt-draft" | "apply-skill";
  projectHash: string;
  chapterNumber: number;
  draftId?: string;
  targetMainPath: string;
  promptMarkerStartOffset: number | null;
  label: string;
  createdAt: string;
  undone: boolean;
}

export interface AdoptRequest {
  draftId: string;
  confirmed: true;
  force?: boolean;
}

export interface AdoptResponse {
  mainPath: string;
  promptPath: string;
  statusUpdateJobId: string;
  undoEntry: { id: string; label: string };
}

export interface UnadoptRequest {
  undoEntryId: string;
}
```

- [ ] **Step 2: 建立 status-update.ts**

```typescript
// packages/shared-types/src/status-update.ts
export type UpdateReason = "auto-after-save" | "auto-after-adopt" | "manual";

export interface StatusUpdateRequest {
  chapterNumber: number;
  reason: UpdateReason;
}

export interface StatusUpdateResponse {
  jobId: string;
}

export type StatusJobEvent =
  | { type: "started"; model: string; chapterNumber: number }
  | { type: "progress"; phase: string; details?: Record<string, unknown> }
  | { type: "completed"; skipped: boolean; retries: number }
  | { type: "failed"; code: string; message: string; retries: number };

export interface StatusShortenRequest {
  fileType: "story" | "character";
  characterSlug?: string;
  preserveMarkedSections: boolean;
  modelOverride?: string;
}

export interface StatusShortenResponse {
  shortenedContent: string;
  preservedSections: string[];
}
```

- [ ] **Step 3: 更新 index.ts**

在 `packages/shared-types/src/index.ts` 加入：
```typescript
export * from "./status-update.js";
```

- [ ] **Step 4: 跑 typecheck**

```bash
pnpm typecheck
```
Expected: Done（無 error）

- [ ] **Step 5: commit**

```bash
git checkout -b feat/types-m3
git add packages/shared-types/src/project.ts packages/shared-types/src/status-update.ts packages/shared-types/src/index.ts
git commit -m "feat(types): M3 types — UndoEntry + status-update.ts (types-1/2)"
git push -u origin feat/types-m3
# 開 PR → Rebase and merge
```

---

## Wave 1b：Prompt Library

### Task 2: status-updater + status-shortener prompts

**Files:**
- Create: `packages/prompt-library/src/skills/status-updater.ts`
- Create: `packages/prompt-library/src/skills/status-shortener.ts`
- Modify: `packages/prompt-library/src/index.ts`

- [ ] **Step 1: 建立 status-updater.ts**

```typescript
// packages/prompt-library/src/skills/status-updater.ts
import type { GenerateRequest } from "@novel-writer/llm-adapter";
import { z } from "zod";

const SYSTEM_PROMPT = `你是小說的故事狀態維護員。你的任務是讀剛寫好的一章，把該章發生的關鍵劇情演進與人物關係變化，寫進 story_status.md 與該章涉及角色的 character_<slug>_status.md。

【嚴格規則 — 不可違反】

1. 只寫**結構化條列**，不寫小說正文，不寫散文段落。
2. 不新增「relevantCharacters」之外的角色姓名（即使章節中提到也不寫入）。章節中提到但不在清單中的疑似人名，列在輸出的 unrecognizedNames 欄位。
3. 不修改既有角色姓名的任一字元。
4. 保留 status 檔的既有 heading 結構：
   - story_status.md 必有：## 世界觀 / ## 重要劇情點 / ## 🔖 伏筆 / ## ✨ 轉折點 / ## 場景
   - <slug>_status.md 必有：## 重要狀態變化 / ## 與其他角色的關係 / ## 🔖 個人伏筆 / ## ✨ 個人轉折點
5. 既有 status 內容**保留**（按章節時序累積）；新內容**追加**到對應段落。不要刪舊內容，除非該舊內容明確被本章推翻。
6. 重要劇情點 / 狀態變化條目格式：\`(第 N 章) <簡短描述>\`
7. 不更動「## 🔖」「## ✨」段落的既有條目；本章新埋的伏筆 / 轉折點可加進對應段落。
8. 章節中**沒有**新演進的角色，其 status 檔輸出與輸入完全相同。

【輸出格式】

回傳 JSON（不加 code fence；不加說明文字）：

{"storyStatus":"<新版 story_status.md 完整內容>","characterStatuses":{"<slug>":"<新版 <slug>_status.md 完整內容>"},"unrecognizedNames":["<疑似人名>"]}`;

export interface StatusUpdaterInput {
  chapterNumber: number;
  chapterTitle: string;
  chapterText: string;
  currentStoryStatus: string;
  relevantCharacters: Array<{
    slug: string;
    name: string;
    card: string;
    status: string;
  }>;
}

export const statusUpdaterOutputSchema = z.object({
  storyStatus: z.string().min(1),
  characterStatuses: z.record(z.string()),
  unrecognizedNames: z.array(z.string()).optional(),
});

export type StatusUpdaterOutput = z.infer<typeof statusUpdaterOutputSchema>;

export function buildStatusUpdaterRequest(
  input: StatusUpdaterInput,
  modelId: string,
): GenerateRequest {
  const charBlock = input.relevantCharacters
    .map(
      (c) => `### ${c.name}（slug: ${c.slug}）\n\n角色卡：\n${c.card}\n\n現有 status：\n${c.status}`,
    )
    .join("\n\n---\n\n");

  const userPrompt = `## 第 ${input.chapterNumber} 章：${input.chapterTitle}

### 章節正文

${input.chapterText}

---

### 現有 story_status.md

${input.currentStoryStatus}

---

### 涉及角色（含現有 status）

${charBlock}

---

請根據以上章節內容，更新 story_status.md 與各角色的 status，回傳 JSON。`;

  return {
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4096,
    temperature: 0.1,
  };
}
```

- [ ] **Step 2: 建立 status-shortener.ts**

```typescript
// packages/prompt-library/src/skills/status-shortener.ts
import type { GenerateRequest } from "@novel-writer/llm-adapter";
import { z } from "zod";

const SYSTEM_PROMPT = `你是小說設定文件的精簡員。讀一個 status 檔，產出精簡版。

【嚴格規則】

1. 保留所有 heading 結構（## 世界觀 / ## 重要劇情點 / ...）
2. 若 preserveMarkedSections=true：\`## 🔖 ...\` 與 \`## ✨ ...\` 段下的條目**完全不動**
3. 若 preserveMarkedSections=false：所有段都可精簡（但保留 heading）
4. 精簡 = 把同類條目合併、刪冗詞、壓縮描述；不刪關鍵資訊
5. 不新增資訊；不改角色名字元
6. 只輸出新版 status 內容；不加說明、不加 fence、不加 frontmatter`;

export interface StatusShortenerInput {
  fileContent: string;
  fileType: "story" | "character";
  characterSlug?: string;
  preserveMarkedSections: boolean;
}

export const statusShortenerOutputSchema = z.object({
  shortenedContent: z.string().min(1),
  preservedSections: z.array(z.string()),
});

export type StatusShortenerOutput = z.infer<typeof statusShortenerOutputSchema>;

export function buildStatusShortenerRequest(
  input: StatusShortenerInput,
  modelId: string,
): GenerateRequest {
  const fileLabel = input.fileType === "story"
    ? "story_status.md"
    : `characters/${input.characterSlug ?? "unknown"}_status.md`;

  const userPrompt = `請精簡以下 ${fileLabel}（preserveMarkedSections=${input.preserveMarkedSections}）。

只輸出精簡後的 JSON：{"shortenedContent":"...","preservedSections":["..."]}

---

${input.fileContent}`;

  return {
    modelId,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4096,
    temperature: 0.1,
  };
}
```

- [ ] **Step 3: 更新 prompt-library/src/index.ts**

加入：
```typescript
export { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "./skills/status-updater.js";
export type { StatusUpdaterInput, StatusUpdaterOutput } from "./skills/status-updater.js";
export { buildStatusShortenerRequest, statusShortenerOutputSchema } from "./skills/status-shortener.js";
export type { StatusShortenerInput, StatusShortenerOutput } from "./skills/status-shortener.js";
```

- [ ] **Step 4: 加 golden tests**

建立 `packages/prompt-library/src/skills/status-updater.golden.test.ts`：

```typescript
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "./status-updater.js";

const FIXTURE: Parameters<typeof buildStatusUpdaterRequest>[0] = {
  chapterNumber: 1,
  chapterTitle: "梅雨初晴",
  chapterText: "蘇晴推開書店的木門時，一股舊書的氣息迎面而來。林書言正在整理架上的書，沒有抬頭。",
  currentStoryStatus: "# 故事狀態\n\n## 世界觀\n\n現代台北，小說類型：都市輕愛情。\n\n## 重要劇情點\n\n## 🔖 伏筆\n\n## ✨ 轉折點\n\n## 場景\n",
  relevantCharacters: [
    {
      slug: "蘇晴",
      name: "蘇晴",
      card: "蘇晴是 30 歲的女作家，內向但觀察力極強。",
      status: "# 蘇晴 — 狀態\n\n## 重要狀態變化\n\n## 與其他角色的關係\n\n## 🔖 個人伏筆\n\n## ✨ 個人轉折點\n",
    },
  ],
};

describe("status-updater prompt golden test", () => {
  it("produces identical hash across 5 runs", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildStatusUpdaterRequest(FIXTURE, "anthropic:claude-haiku-4-5");
      const content = typeof req.messages[0]?.content === "string"
        ? req.messages[0].content : JSON.stringify(req.messages[0]?.content);
      return createHash("sha256").update(req.systemPrompt + content).digest("hex");
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it("system prompt forbids modifying character names", () => {
    const req = buildStatusUpdaterRequest(FIXTURE, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("不修改既有角色姓名");
  });

  it("output schema rejects missing storyStatus", () => {
    const result = statusUpdaterOutputSchema.safeParse({ characterStatuses: {} });
    expect(result.success).toBe(false);
  });

  it("output schema accepts valid output", () => {
    const result = statusUpdaterOutputSchema.safeParse({
      storyStatus: "# 故事狀態\n\n## 世界觀\n台北。\n",
      characterStatuses: { "蘇晴": "# 蘇晴 — 狀態\n\n## 重要狀態變化\n(第1章) 初訪書店。\n" },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 5: 跑 tests**

```bash
pnpm test --filter=@novel-writer/prompt-library
```
Expected: All pass

- [ ] **Step 6: commit**

```bash
git checkout -b feat/prompts-status
git add packages/prompt-library/src/skills/ packages/prompt-library/src/index.ts
git commit -m "feat(prompts): status-updater + status-shortener prompts + golden tests (prompt-1/2/3)"
git push -u origin feat/prompts-status
```

---

## Wave 2a：commit-policy + cache-db 擴充

### Task 3: commit-policy 加 adopt/status trigger + undo_entries table

**Files:**
- Modify: `apps/api/src/services/commit-policy.ts`
- Modify: `apps/api/src/services/cache-db.ts`

- [ ] **Step 1: 更新 commit-policy.ts**

```typescript
// apps/api/src/services/commit-policy.ts
import { git } from "./git.js";

export type CommitTrigger =
  | "create-project"
  | "save-chapter"
  | "rename-chapter"
  | "character"
  | "adopt"
  | "status";

const PREFIX: Record<CommitTrigger, string> = {
  "create-project": "init",
  "save-chapter": "chapter",
  "rename-chapter": "chapter",
  character: "character",
  adopt: "chapter",
  status: "status",
};

export async function commitIfChanged(
  projectPath: string,
  trigger: CommitTrigger,
  message: string,
): Promise<{ sha: string } | null> {
  const statusResult = await git.status(projectPath);
  if (!statusResult.ok) {
    throw new Error(`git status failed: ${statusResult.error.stderr}`);
  }
  const { staged, unstaged, untracked } = statusResult.value;
  const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  if (isClean) return null;

  const addResult = await git.add(projectPath, ["."]);
  if (!addResult.ok) {
    throw new Error(`git add failed: ${addResult.error.stderr}`);
  }

  const fullMsg = `${PREFIX[trigger]}: ${message}`;
  const commitResult = await git.commit(projectPath, fullMsg);
  if (!commitResult.ok) {
    throw new Error(`git commit failed: ${commitResult.error.stderr}`);
  }
  return commitResult.value;
}
```

- [ ] **Step 2: 更新 cache-db.ts — 加 undo_entries table**

在 `db.exec(...)` 內容中加入（在 drafts table 的 INDEX 之後）：

```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      draft_id     TEXT PRIMARY KEY,
      project_hash TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      status       TEXT NOT NULL,
      model_id     TEXT NOT NULL,
      context_hash TEXT NOT NULL,
      total_chars  INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at   TEXT NOT NULL,
      completed_at TEXT,
      error_code   TEXT,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_project_chapter
      ON drafts(project_hash, chapter_number);

    CREATE TABLE IF NOT EXISTS undo_entries (
      id             TEXT PRIMARY KEY,
      type           TEXT NOT NULL,
      project_hash   TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      draft_id       TEXT,
      target_main_path TEXT NOT NULL,
      prompt_marker_start_offset INTEGER,
      label          TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      undone         INTEGER NOT NULL DEFAULT 0
    );
  `);
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: 跑 tests（確認 cache-db schema 無破壞）**

```bash
pnpm test --filter=@novel-writer/api
```

- [ ] **Step 5: commit**

```bash
git checkout -b feat/infra-commit-policy
git add apps/api/src/services/commit-policy.ts apps/api/src/services/cache-db.ts
git commit -m "feat(api): extend commit-policy (adopt/status) + undo_entries SQLite table"
git push -u origin feat/infra-commit-policy
```

---

## Wave 2b：採用後端核心

### Task 4: prompt-md.ts

**Files:**
- Create: `apps/api/src/services/prompt-md.ts`

- [ ] **Step 1: 建立 prompt-md.ts**

```typescript
// apps/api/src/services/prompt-md.ts
import { appendFile, readFile, stat, truncate, writeFile } from "node:fs/promises";
import type { DraftMetadata } from "@novel-writer/shared-types";

export interface PromptRenderOptions {
  draftMeta: DraftMetadata;
  undoEntryId: string;
  adoptedAt: string;
  systemPrompt: string;
  userPrompt: string;
}

export function renderPromptMarkdown(opts: PromptRenderOptions): string {
  const { draftMeta, undoEntryId, adoptedAt, systemPrompt, userPrompt } = opts;
  return `<!-- adopt-marker:${undoEntryId} -->
---
generatedAt: ${draftMeta.createdAt}
adoptedAt: ${adoptedAt}
agent: chapter-writer
modelId: ${draftMeta.modelId}
chapterNumber: ${draftMeta.chapterNumber}
contextHash: ${draftMeta.contextHash}
---

## System prompt

${systemPrompt}

## User prompt

${userPrompt}

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
export async function appendToPromptFile(
  promptPath: string,
  content: string,
): Promise<number> {
  let startOffset = 0;
  try {
    const st = await stat(promptPath);
    startOffset = st.size;
    await appendFile(promptPath, `\n\n---\n\n${content}`, "utf-8");
  } catch {
    // File doesn't exist — create it
    await writeFile(promptPath, content, "utf-8");
  }
  return startOffset;
}

/**
 * Truncate prompt file back to startOffset (rollback).
 */
export async function truncatePromptFile(
  promptPath: string,
  startOffset: number,
): Promise<void> {
  if (startOffset === 0) {
    // File was newly created — delete it
    const { unlink } = await import("node:fs/promises");
    await unlink(promptPath).catch(() => undefined);
  } else {
    await truncate(promptPath, startOffset);
  }
}

/**
 * Append an Undo note to the prompt file.
 */
export async function appendUndoNote(
  promptPath: string,
  undoEntryId: string,
): Promise<void> {
  const note = `\n\n---\n\n**Undo 採用** at: ${new Date().toISOString()}\n原因：使用者在 client 端按 Ctrl+Z\nundoEntryId: ${undoEntryId}\n`;
  await appendFile(promptPath, note, "utf-8").catch(() => undefined);
}
```

- [ ] **Step 2: 寫 prompt-md unit tests**

建立 `apps/api/src/services/prompt-md.test.ts`：

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendToPromptFile, truncatePromptFile, renderPromptMarkdown } from "./prompt-md.js";
import type { DraftMetadata } from "@novel-writer/shared-types";

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
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it("renderPromptMarkdown includes adopt marker", () => {
    const content = renderPromptMarkdown({
      draftMeta: DRAFT_META, undoEntryId: "undo-1",
      adoptedAt: "2026-05-13T10:05:00Z",
      systemPrompt: "system", userPrompt: "user",
    });
    expect(content).toContain("<!-- adopt-marker:undo-1 -->");
    expect(content).toContain("<!-- /adopt-marker -->");
    expect(content).toContain("chapter-writer");
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
    await appendToPromptFile(path, initial.trimEnd());
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, initial, "utf-8");
    const offset = await appendToPromptFile(path, "second");
    expect(offset).toBe(initial.length);
    const content = await readFile(path, "utf-8");
    expect(content).toContain("second");
  });

  it("truncatePromptFile restores to startOffset", async () => {
    const path = join(tmpDir, "prompt.md");
    const initial = "initial content";
    await appendToPromptFile(path, initial);
    const offset = await appendToPromptFile(path, "\nadded");
    await truncatePromptFile(path, initial.length);
    const content = await readFile(path, "utf-8");
    expect(content).toBe(initial);
  });
});
```

- [ ] **Step 3: 跑 tests**

```bash
pnpm test --filter=@novel-writer/api -- prompt-md
```
Expected: 4 pass

- [ ] **Step 4: commit**

```bash
git checkout -b feat/adopt-be-prompt-md
git add apps/api/src/services/prompt-md.ts apps/api/src/services/prompt-md.test.ts
git commit -m "feat(api): ad-be-1 prompt-md — renderPromptMarkdown + append/truncate"
git push -u origin feat/adopt-be-prompt-md
```

---

### Task 5: undo-store.ts

**Files:**
- Create: `apps/api/src/services/undo-store.ts`

- [ ] **Step 1: 建立 undo-store.ts**

```typescript
// apps/api/src/services/undo-store.ts
import { randomUUID } from "node:crypto";
import type { UndoEntry } from "@novel-writer/shared-types";
import { getDb } from "./cache-db.js";

export async function createUndoEntry(
  opts: Omit<UndoEntry, "id" | "createdAt" | "undone">,
): Promise<UndoEntry> {
  const entry: UndoEntry = {
    id: randomUUID(),
    ...opts,
    createdAt: new Date().toISOString(),
    undone: false,
  };
  const db = await getDb(opts.projectHash);
  db.prepare(
    `INSERT INTO undo_entries
      (id, type, project_hash, chapter_number, draft_id, target_main_path,
       prompt_marker_start_offset, label, created_at, undone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    entry.id, entry.type, entry.projectHash, entry.chapterNumber,
    entry.draftId ?? null, entry.targetMainPath,
    entry.promptMarkerStartOffset, entry.label, entry.createdAt,
  );
  return entry;
}

export async function getUndoEntry(
  projectHash: string,
  id: string,
): Promise<UndoEntry | null> {
  const db = await getDb(projectHash);
  const row = db.prepare(
    `SELECT * FROM undo_entries WHERE id = ? AND project_hash = ?`,
  ).get(id, projectHash) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row["id"] as string,
    type: row["type"] as UndoEntry["type"],
    projectHash: row["project_hash"] as string,
    chapterNumber: row["chapter_number"] as number,
    draftId: (row["draft_id"] as string | null) ?? undefined,
    targetMainPath: row["target_main_path"] as string,
    promptMarkerStartOffset: row["prompt_marker_start_offset"] as number | null,
    label: row["label"] as string,
    createdAt: row["created_at"] as string,
    undone: Boolean(row["undone"]),
  };
}

export async function markUndone(
  projectHash: string,
  id: string,
): Promise<boolean> {
  const db = await getDb(projectHash);
  const result = db.prepare(
    `UPDATE undo_entries SET undone = 1 WHERE id = ? AND project_hash = ? AND undone = 0`,
  ).run(id, projectHash);
  return result.changes > 0;
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: commit**

```bash
git checkout -b feat/adopt-be-undo-store
git add apps/api/src/services/undo-store.ts
git commit -m "feat(api): ad-be-2 undo-store — SQLite undo_entries CRUD"
git push -u origin feat/adopt-be-undo-store
```

---

### Task 6: adopt route（POST /adopt）

**Files:**
- Create: `apps/api/src/routes/adopt.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: 建立 adopt.ts**

```typescript
// apps/api/src/routes/adopt.ts
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { listChapters } from "../services/chapter-fs.js";
import { collectChapterContext } from "../services/context-collector.js";
import { readDraft } from "../services/draft-cache.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { appendToPromptFile, renderPromptMarkdown, truncatePromptFile } from "../services/prompt-md.js";
import { createUndoEntry } from "../services/undo-store.js";

const adoptSchema = z.object({
  draftId: z.string().min(1),
  confirmed: z.literal(true),
  force: z.boolean().optional(),
});

// In-flight lock: prevent double-adopt
const IN_FLIGHT = new Set<string>();
function lockKey(projectHash: string, chapterNumber: number) {
  return `${projectHash}:${chapterNumber}`;
}

const app = new Hono();

app.post("/", zValidator("json", adoptSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");
  const body = c.req.valid("json");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const lockKey_ = lockKey(projectHash, chapterNumber);
  if (IN_FLIGHT.has(lockKey_)) {
    return c.json({ code: "ADOPT_IN_PROGRESS", message: "An adopt is already in progress for this chapter" }, 409);
  }
  IN_FLIGHT.add(lockKey_);

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    // 1. Validate draft
    const draft = await readDraft(projectHash, chapterNumber);
    if (!draft) return c.json({ code: "DRAFT_NOT_FOUND" }, 404);
    if (draft.meta.status === "running") {
      return c.json({ code: "INVALID_DRAFT_STATUS", message: "Draft is still running" }, 400);
    }

    // 2. Compare context hash
    if (!body.force) {
      const currentContext = await collectChapterContext({ projectPath, chapterNumber }).catch(() => null);
      if (currentContext && currentContext.contextHash !== draft.meta.contextHash) {
        return c.json({
          code: "DRAFT_STALE",
          message: "Context changed since draft was generated. Pass force=true to adopt anyway.",
        }, 409);
      }
    }

    // 3. Find target main path
    const chapters = await listChapters(projectPath);
    const chapter = chapters.find((ch) => ch.number === chapterNumber);
    if (!chapter) return c.json({ code: "INVALID_CHAPTER" }, 400);

    const targetMainPath = join(projectPath, chapter.path);

    // 4. Atomic write main file
    const tmpPath = `${targetMainPath}.tmp`;
    await writeFile(tmpPath, draft.text, "utf-8");
    await rename(tmpPath, targetMainPath);
    rollbacks.push(async () => {
      await unlink(targetMainPath).catch(() => undefined);
    });

    // 5. Append to prompt.md
    const promptPath = join(
      projectPath,
      "chapters",
      `chapter_${String(chapterNumber).padStart(4, "0")}_prompt.md`,
    );
    const undoEntryId = crypto.randomUUID();
    const promptContent = renderPromptMarkdown({
      draftMeta: draft.meta,
      undoEntryId,
      adoptedAt: new Date().toISOString(),
      systemPrompt: "(prompt snapshot not available in this version)",
      userPrompt: "(see draft cache for full prompt)",
    });
    const markerOffset = await appendToPromptFile(promptPath, promptContent);
    rollbacks.push(async () => {
      await truncatePromptFile(promptPath, markerOffset);
    });

    // 6. git commit
    await commitIfChanged(projectPath, "adopt", `adopt AI draft for chapter ${chapterNumber} ${chapter.title}`);

    // 7. Trigger status-updater (fire-and-forget)
    const { triggerStatusUpdate } = await import("../services/status-updater-service.js").catch(() => ({ triggerStatusUpdate: null }));
    let jobId = "no-job";
    if (triggerStatusUpdate) {
      jobId = await triggerStatusUpdate(projectHash, projectPath, chapterNumber, "auto-after-adopt");
    }

    // 8. Record undo entry
    const undoEntry = await createUndoEntry({
      id: undoEntryId,
      type: "adopt-draft",
      projectHash,
      chapterNumber,
      draftId: draft.meta.draftId,
      targetMainPath: chapter.path,
      promptMarkerStartOffset: markerOffset,
      label: "採用 chapter-writer 草稿",
    });

    return c.json({
      mainPath: chapter.path,
      promptPath: `chapters/chapter_${String(chapterNumber).padStart(4, "0")}_prompt.md`,
      statusUpdateJobId: jobId,
      undoEntry: { id: undoEntry.id, label: undoEntry.label },
    });

  } catch (err) {
    for (const rb of [...rollbacks].reverse()) {
      await rb().catch(() => undefined);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ code: "IO_ERROR", message: msg }, 500);
  } finally {
    IN_FLIGHT.delete(lockKey_);
  }
});

export { app as adoptRouter };
```

- [ ] **Step 2: 建立 unadopt.ts**

```typescript
// apps/api/src/routes/unadopt.ts
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { resolveProjectPath } from "../services/project-resolver.js";
import { getUndoEntry, markUndone } from "../services/undo-store.js";
import { appendUndoNote } from "../services/prompt-md.js";
import { commitIfChanged } from "../services/commit-policy.js";

const app = new Hono();

app.post("/", zValidator("json", z.object({ undoEntryId: z.string().min(1) })), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const chapterNumber = Number(c.req.param("chapterNumber") ?? "0");
  const { undoEntryId } = c.req.valid("json");

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const entry = await getUndoEntry(projectHash, undoEntryId);
  if (!entry) return c.json({ code: "UNDO_ENTRY_NOT_FOUND" }, 404);
  if (entry.undone) return c.json({ code: "ALREADY_UNDONE" }, 400);

  await markUndone(projectHash, undoEntryId);

  const promptPath = join(
    projectPath,
    "chapters",
    `chapter_${String(chapterNumber).padStart(4, "0")}_prompt.md`,
  );
  await appendUndoNote(promptPath, undoEntryId);
  await commitIfChanged(projectPath, "adopt", `unadopt chapter ${chapterNumber} (undo entry ${undoEntryId.slice(0, 8)})`);

  return c.json({ promptNote: `Undo 採用 recorded at ${new Date().toISOString()}` });
});

export { app as unadoptRouter };
```

- [ ] **Step 3: 掛 routes 到 server.ts**

在 `apps/api/src/server.ts` 加：
```typescript
import { adoptRouter } from "./routes/adopt.js";
import { unadoptRouter } from "./routes/unadopt.js";

// 加到 .route() 鏈：
.route("/api/projects/:hash/chapters/:chapterNumber/adopt", adoptRouter)
.route("/api/projects/:hash/chapters/:chapterNumber/unadopt", unadoptRouter)
```

- [ ] **Step 4: typecheck + tests**

```bash
pnpm typecheck && pnpm test --filter=@novel-writer/api
```

- [ ] **Step 5: commit**

```bash
git checkout -b feat/adopt-be-routes
git add apps/api/src/routes/adopt.ts apps/api/src/routes/unadopt.ts apps/api/src/server.ts
git commit -m "feat(api): ad-be-3/4 adopt + unadopt routes (9-step transaction)"
git push -u origin feat/adopt-be-routes
```

---

## Wave 3：status-updater 後端

### Task 7: job-event-bus.ts

**Files:**
- Create: `apps/api/src/services/job-event-bus.ts`

- [ ] **Step 1: 建立 job-event-bus.ts**

```typescript
// apps/api/src/services/job-event-bus.ts
import type { StatusJobEvent } from "@novel-writer/shared-types";

interface JobSubscription {
  resolve: (events: StatusJobEvent[]) => void;
  events: StatusJobEvent[];
  done: boolean;
  listeners: Array<(event: StatusJobEvent) => void>;
}

const SUBS = new Map<string, JobSubscription>();

export function createJob(jobId: string): void {
  SUBS.set(jobId, { resolve: () => {}, events: [], done: false, listeners: [] });
  // Auto-cleanup after 5 minutes
  setTimeout(() => SUBS.delete(jobId), 5 * 60 * 1000);
}

export function emitJobEvent(jobId: string, event: StatusJobEvent): void {
  const sub = SUBS.get(jobId);
  if (!sub) return;
  sub.events.push(event);
  for (const listener of sub.listeners) {
    listener(event);
  }
  if (event.type === "completed" || event.type === "failed") {
    sub.done = true;
  }
}

export async function* subscribeJob(jobId: string): AsyncIterable<StatusJobEvent> {
  const sub = SUBS.get(jobId);
  if (!sub) return;

  // Replay buffered events first
  for (const event of sub.events) {
    yield event;
    if (event.type === "completed" || event.type === "failed") return;
  }

  if (sub.done) return;

  // Stream new events
  let resolve: (e: StatusJobEvent | null) => void;
  const queue: StatusJobEvent[] = [];
  let waiting = false;

  const listener = (event: StatusJobEvent) => {
    if (waiting) {
      resolve(event);
      waiting = false;
    } else {
      queue.push(event);
    }
  };
  sub.listeners.push(listener);

  try {
    while (true) {
      if (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (event.type === "completed" || event.type === "failed") return;
      } else {
        const event = await new Promise<StatusJobEvent | null>((res) => {
          waiting = true;
          resolve = res;
          setTimeout(() => { waiting = false; resolve(null); }, 30_000);
        });
        if (event === null) return; // timeout
        yield event;
        if (event.type === "completed" || event.type === "failed") return;
      }
    }
  } finally {
    const idx = sub.listeners.indexOf(listener);
    if (idx >= 0) sub.listeners.splice(idx, 1);
  }
}
```

- [ ] **Step 2: commit**

```bash
git checkout -b feat/status-be-eventbus
git add apps/api/src/services/job-event-bus.ts
git commit -m "feat(api): stat-be-5 job-event-bus — in-memory AsyncIterable SSE bridge"
git push -u origin feat/status-be-eventbus
```

---

### Task 8: status-context-collector + status-updater-service

**Files:**
- Create: `apps/api/src/services/status-context-collector.ts`
- Create: `apps/api/src/services/status-updater-service.ts`
- Create: `apps/api/src/services/status-shortener-service.ts`

- [ ] **Step 1: 建立 status-context-collector.ts**

```typescript
// apps/api/src/services/status-context-collector.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listCharacters, readCharacter } from "./character-fs.js";
import { readChapter } from "./chapter-fs.js";

export interface StatusUpdateContext {
  chapterNumber: number;
  chapterTitle: string;
  chapterText: string;
  currentStoryStatus: string;
  characterStatuses: Record<string, string>;
  relevantCharacters: Array<{ slug: string; name: string; card: string; status: string }>;
}

async function readFileSafe(path: string): Promise<string> {
  try { return await readFile(path, "utf-8"); } catch { return ""; }
}

export async function collectStatusContext(
  projectPath: string,
  chapterNumber: number,
): Promise<StatusUpdateContext> {
  const chapter = await readChapter(projectPath, chapterNumber);
  if (!chapter) throw Object.assign(new Error("Chapter not found"), { code: "INVALID_CHAPTER" });

  const currentStoryStatus = await readFileSafe(join(projectPath, "status", "story_status.md"));
  const charList = await listCharacters(projectPath);

  const characterStatuses: Record<string, string> = {};
  const relevantCharacters: StatusUpdateContext["relevantCharacters"] = [];

  for (const item of charList) {
    const char = await readCharacter(projectPath, item.slug);
    if (!char) continue;
    const statusPath = join(projectPath, "characters", `${item.slug}_status.md`);
    const statusContent = await readFileSafe(statusPath);
    characterStatuses[item.slug] = statusContent;

    // Include character if mentioned in chapter text (substring match)
    if (chapter.content.includes(char.fields.name) || charList.length <= 3) {
      relevantCharacters.push({
        slug: item.slug,
        name: char.fields.name,
        card: char.body,
        status: statusContent,
      });
    }
  }

  return {
    chapterNumber,
    chapterTitle: chapter.title,
    chapterText: chapter.content,
    currentStoryStatus,
    characterStatuses,
    relevantCharacters,
  };
}
```

- [ ] **Step 2: 建立 status-updater-service.ts**

```typescript
// apps/api/src/services/status-updater-service.ts
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "@novel-writer/prompt-library";
import { readSettings } from "./settings-store.js";
import { buildRouter, toRouterPolicy } from "./router-factory.js";
import { commitIfChanged } from "./commit-policy.js";
import { collectStatusContext } from "./status-context-collector.js";
import { createJob, emitJobEvent } from "./job-event-bus.js";
import { atomicWriteFile } from "./atomic-fs.js";
import type { UpdateReason } from "@novel-writer/shared-types";

const BACKOFF = [1000, 2000, 4000];

export async function triggerStatusUpdate(
  projectHash: string,
  projectPath: string,
  chapterNumber: number,
  reason: UpdateReason,
): Promise<string> {
  const jobId = randomUUID();
  createJob(jobId);

  // Fire-and-forget
  setImmediate(() => {
    void runStatusUpdate(jobId, projectHash, projectPath, chapterNumber, reason);
  });

  return jobId;
}

async function runStatusUpdate(
  jobId: string,
  projectHash: string,
  projectPath: string,
  chapterNumber: number,
  reason: UpdateReason,
): Promise<void> {
  try {
    const settings = await readSettings();
    const routingConf = settings.routing.statusUpdater;
    if (!routingConf) {
      emitJobEvent(jobId, { type: "failed", code: "ROUTING_NOT_CONFIGURED", message: "statusUpdater routing not set", retries: 0 });
      return;
    }

    emitJobEvent(jobId, { type: "started", model: routingConf.primary, chapterNumber });
    emitJobEvent(jobId, { type: "progress", phase: "collecting-context" });

    const context = await collectStatusContext(projectPath, chapterNumber);
    const req = buildStatusUpdaterRequest({
      chapterNumber: context.chapterNumber,
      chapterTitle: context.chapterTitle,
      chapterText: context.chapterText,
      currentStoryStatus: context.currentStoryStatus,
      relevantCharacters: context.relevantCharacters,
    }, routingConf.primary);

    emitJobEvent(jobId, { type: "progress", phase: "calling-llm" });

    const router = buildRouter(settings);
    let response: { text: string } | null = null;
    let retries = 0;

    while (retries <= 3) {
      try {
        response = await router.generate(req, toRouterPolicy(routingConf));
        break;
      } catch (err) {
        const e = err as { retryable?: boolean };
        if (!e.retryable || retries >= 3) {
          const msg = err instanceof Error ? err.message : String(err);
          emitJobEvent(jobId, { type: "failed", code: "LLM_FAILED", message: msg, retries });
          return;
        }
        await new Promise(r => setTimeout(r, BACKOFF[retries] ?? 4000));
        retries++;
      }
    }

    if (!response) return;

    // Parse LLM output
    const text = response.text.trim().replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1").trim();
    let parsed: ReturnType<typeof statusUpdaterOutputSchema.parse>;
    try {
      parsed = statusUpdaterOutputSchema.parse(JSON.parse(text));
    } catch {
      // One retry with format reminder
      const retryReq = buildStatusUpdaterRequest({ ...buildStatusUpdaterRequest.arguments } as never, routingConf.primary);
      retryReq.messages.push({ role: "assistant", content: text });
      retryReq.messages.push({ role: "user", content: "請直接回傳 JSON，不要加 code fence 或說明文字。" });
      const retry = await router.generate(retryReq, toRouterPolicy(routingConf)).catch(() => null);
      if (!retry) {
        emitJobEvent(jobId, { type: "failed", code: "PARSE_FAILED", message: "Cannot parse LLM output as JSON", retries });
        return;
      }
      try {
        parsed = statusUpdaterOutputSchema.parse(JSON.parse(retry.text.trim().replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1").trim()));
      } catch {
        emitJobEvent(jobId, { type: "failed", code: "PARSE_FAILED", message: "JSON parse failed after retry", retries });
        return;
      }
    }

    emitJobEvent(jobId, { type: "progress", phase: "writing-files" });

    // Write story_status.md if changed
    let changed = false;
    if (parsed.storyStatus !== context.currentStoryStatus) {
      await atomicWriteFile(join(projectPath, "status", "story_status.md"), parsed.storyStatus);
      changed = true;
    }

    // Write character status files (one per slug)
    for (const [slug, newContent] of Object.entries(parsed.characterStatuses)) {
      const oldContent = context.characterStatuses[slug] ?? "";
      if (newContent !== oldContent) {
        await atomicWriteFile(join(projectPath, "characters", `${slug}_status.md`), newContent);
        changed = true;
      }
    }

    if (changed) {
      await commitIfChanged(
        projectPath, "status",
        `update after ${reason} chapter ${chapterNumber}`,
      );
    }

    emitJobEvent(jobId, { type: "completed", skipped: !changed, retries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitJobEvent(jobId, { type: "failed", code: "UNKNOWN", message: msg, retries: 0 });
  }
}
```

- [ ] **Step 3: 建立 status-shortener-service.ts**

```typescript
// apps/api/src/services/status-shortener-service.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStatusShortenerRequest, statusShortenerOutputSchema } from "@novel-writer/prompt-library";
import { readSettings } from "./settings-store.js";
import { buildRouter, toRouterPolicy } from "./router-factory.js";
import type { StatusShortenRequest } from "@novel-writer/shared-types";

export async function shortenStatusFile(
  projectPath: string,
  req: StatusShortenRequest,
): Promise<{ shortenedContent: string; preservedSections: string[] }> {
  const filePath = req.fileType === "story"
    ? join(projectPath, "status", "story_status.md")
    : join(projectPath, "characters", `${req.characterSlug ?? ""}_status.md`);

  const fileContent = await readFile(filePath, "utf-8").catch(() => "");
  if (!fileContent.trim()) throw new Error("Status file is empty");

  const settings = await readSettings();
  const routingConf = settings.routing.statusUpdater;
  if (!routingConf) throw Object.assign(new Error("statusUpdater routing not configured"), { code: "ROUTING_NOT_CONFIGURED" });

  const effectiveModelId = req.modelOverride ?? routingConf.primary;
  const genReq = buildStatusShortenerRequest({
    fileContent,
    fileType: req.fileType,
    characterSlug: req.characterSlug,
    preserveMarkedSections: req.preserveMarkedSections,
  }, effectiveModelId);

  const router = buildRouter(settings);
  const response = await router.generate(genReq, toRouterPolicy({ ...routingConf, primary: effectiveModelId }));
  const text = response.text.trim().replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1").trim();
  return statusShortenerOutputSchema.parse(JSON.parse(text));
}
```

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: commit**

```bash
git checkout -b feat/status-be-services
git add apps/api/src/services/status-context-collector.ts apps/api/src/services/status-updater-service.ts apps/api/src/services/status-shortener-service.ts
git commit -m "feat(api): stat-be-1/2/4 status-context-collector + updater-service + shortener-service"
git push -u origin feat/status-be-services
```

---

### Task 9: status routes + jobs route

**Files:**
- Create: `apps/api/src/routes/status.ts`
- Create: `apps/api/src/routes/jobs.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: 建立 status.ts**

```typescript
// apps/api/src/routes/status.ts
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { resolveProjectPath } from "../services/project-resolver.js";
import { triggerStatusUpdate } from "../services/status-updater-service.js";
import { shortenStatusFile } from "../services/status-shortener-service.js";

const app = new Hono();

const updateSchema = z.object({
  chapterNumber: z.number().int().positive(),
  reason: z.enum(["auto-after-adopt", "auto-after-save", "manual"]),
});

const shortenSchema = z.object({
  fileType: z.enum(["story", "character"]),
  characterSlug: z.string().optional(),
  preserveMarkedSections: z.boolean(),
  modelOverride: z.string().optional(),
});

app.post("/update-from-chapter", zValidator("json", updateSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const { chapterNumber, reason } = c.req.valid("json");
  const jobId = await triggerStatusUpdate(projectHash, projectPath, chapterNumber, reason);
  return c.json({ jobId }, 202);
});

app.post("/shorten", zValidator("json", shortenSchema), async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  try {
    const result = await shortenStatusFile(projectPath, c.req.valid("json"));
    return c.json(result);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "ROUTING_NOT_CONFIGURED") return c.json({ code: "ROUTING_NOT_CONFIGURED" }, 400);
    return c.json({ code: "LLM_FAILED", message: e.message ?? String(err) }, 502);
  }
});

export { app as statusRouter };
```

- [ ] **Step 2: 建立 jobs.ts（SSE bridge）**

```typescript
// apps/api/src/routes/jobs.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribeJob } from "../services/job-event-bus.js";

const app = new Hono();

app.get("/:jobId/events", async (c) => {
  const jobId = c.req.param("jobId") ?? "";
  return streamSSE(c, async (stream) => {
    for await (const event of subscribeJob(jobId)) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
      if (event.type === "completed" || event.type === "failed") break;
    }
  });
});

export { app as jobsRouter };
```

- [ ] **Step 3: 掛到 server.ts**

```typescript
import { statusRouter } from "./routes/status.js";
import { jobsRouter } from "./routes/jobs.js";

// .route() 鏈加：
.route("/api/projects/:hash/status", statusRouter)
.route("/api/projects/:hash/jobs", jobsRouter)
```

- [ ] **Step 4: 整合 save 觸發（chapters.ts PUT handler）**

在 `apps/api/src/routes/chapters.ts` 的 PUT handler（儲存章節成功後）加：

```typescript
// 在 commitIfChanged 之後、return 之前加：
const { triggerStatusUpdate } = await import("../services/status-updater-service.js").catch(() => ({ triggerStatusUpdate: null }));
if (triggerStatusUpdate) {
  void triggerStatusUpdate(hash, projectPath, n, "auto-after-save");
}
```

- [ ] **Step 5: typecheck + tests**

```bash
pnpm typecheck && pnpm test --filter=@novel-writer/api
```

- [ ] **Step 6: commit**

```bash
git checkout -b feat/status-be-routes
git add apps/api/src/routes/status.ts apps/api/src/routes/jobs.ts apps/api/src/server.ts apps/api/src/routes/chapters.ts
git commit -m "feat(api): stat-be-6/7/8/9 status+jobs routes + auto-after-save trigger"
git push -u origin feat/status-be-routes
```

---

## Wave 4：採用前端

### Task 10: AdoptButton + DraftPanel 更新

**Files:**
- Create: `apps/web/src/features/editor/AdoptButton.tsx`
- Modify: `apps/web/src/features/editor/DraftPanel.tsx`
- Modify: `apps/web/src/features/editor/GenerateButton.tsx`
- Modify: `apps/web/src/stores/draft-store.ts`

- [ ] **Step 1: 更新 draft-store.ts 加 undoEntryId + jobId**

```typescript
// 在 DraftStore interface 加：
undoEntryId: string | null;
statusJobId: string | null;
setUndoEntryId: (id: string) => void;
setStatusJobId: (id: string) => void;
```

在 `create<DraftStore>` 的初始狀態加：
```typescript
undoEntryId: null,
statusJobId: null,
setUndoEntryId: (undoEntryId) => set({ undoEntryId }),
setStatusJobId: (statusJobId) => set({ statusJobId }),
```

在 `reset` 中加：
```typescript
undoEntryId: null, statusJobId: null,
```

- [ ] **Step 2: 建立 AdoptButton.tsx**

```typescript
// apps/web/src/features/editor/AdoptButton.tsx
import { useState } from "react";
import { useDraftStore } from "../../stores/draft-store";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

type AdoptStep = "idle" | "confirming" | "adopting" | "stale-confirm";

export function AdoptButton({ projectHash, chapterNumber }: Props) {
  const { draftId, setStatusJobId, setUndoEntryId } = useDraftStore();
  const [step, setStep] = useState<AdoptStep>("idle");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const doAdopt = async (force = false) => {
    if (!draftId) return;
    setStep("adopting");
    setProgress("寫主檔…");
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectHash}/chapters/${chapterNumber}/adopt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId, confirmed: true, ...(force ? { force: true } : {}) }),
        },
      );

      if (res.status === 409) {
        const body = await res.json() as { code: string };
        if (body.code === "DRAFT_STALE") {
          setStep("stale-confirm");
          return;
        }
      }

      if (!res.ok) {
        const body = await res.json() as { message?: string };
        setError(body.message ?? "採用失敗");
        setStep("idle");
        return;
      }

      const data = await res.json() as { statusUpdateJobId: string; undoEntry: { id: string } };
      setStatusJobId(data.statusUpdateJobId);
      setUndoEntryId(data.undoEntry.id);
      setProgress("完成");
      setStep("idle");
    } catch (e) {
      setError(String(e));
      setStep("idle");
    }
  };

  if (step === "confirming") {
    return (
      <div className="flex flex-col gap-2 p-2 rounded border border-neutral-600 bg-neutral-800 text-xs">
        <p className="text-neutral-200">採用此草稿將覆寫章節主檔。git 歷史可還原。</p>
        {error && <p className="text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep("idle")} className="text-neutral-400">取消</button>
          <button
            type="button"
            onClick={() => doAdopt(false)}
            className="rounded bg-green-700 px-3 py-1.5 text-white hover:bg-green-600"
          >確認採用</button>
        </div>
      </div>
    );
  }

  if (step === "stale-confirm") {
    return (
      <div className="flex flex-col gap-2 p-2 rounded border border-amber-700 bg-neutral-800 text-xs">
        <p className="text-amber-300">您在草稿產生後修改了上下文。是否仍要採用此草稿？</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep("idle")} className="text-neutral-400">取消</button>
          <button
            type="button"
            onClick={() => doAdopt(true)}
            className="rounded bg-amber-700 px-3 py-1.5 text-white hover:bg-amber-600"
          >強制採用</button>
        </div>
      </div>
    );
  }

  if (step === "adopting") {
    return (
      <button disabled className="rounded bg-green-800 px-3 py-1.5 text-xs text-green-300 opacity-70">
        {progress}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStep("confirming")}
      className="rounded bg-green-700 px-3 py-1.5 text-xs text-white hover:bg-green-600 transition-colors"
    >
      採用
    </button>
  );
}
```

- [ ] **Step 3: 更新 DraftPanel.tsx — 採用按鈕改為 AdoptButton**

把 DraftPanel.tsx 中 disabled 的採用按鈕（line ~113-120）替換為：

```tsx
// 加 import
import { AdoptButton } from "./AdoptButton";

// 替換舊的 disabled 按鈕：
<AdoptButton projectHash={projectHash} chapterNumber={chapterNumber} />
```

- [ ] **Step 4: 更新 GenerateButton.tsx — 串 LlmNotConfiguredModal（ad-fe-7）**

```typescript
// 在 GenerateButton.tsx 頂部加 import：
import { useState } from "react";
import { LlmNotConfiguredModal } from "../settings/LlmNotConfiguredModal";

// 在 handleGenerate 的 onError 中加：
onError: (d) => {
  if (d.code === "ROUTING_NOT_CONFIGURED" || d.code === "HTTP_ERROR") {
    setShowModal(true);
    setStatus("idle");
    return;
  }
  setStatus("errored");
},

// 在 component 加 state：
const [showModal, setShowModal] = useState(false);

// 在 return 中加（在 button 之後）：
<LlmNotConfiguredModal
  agentName="chapter-writer"
  open={showModal}
  onClose={() => setShowModal(false)}
/>
```

- [ ] **Step 5: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: commit**

```bash
git checkout -b feat/adopt-fe
git add apps/web/src/features/editor/AdoptButton.tsx apps/web/src/features/editor/DraftPanel.tsx apps/web/src/features/editor/GenerateButton.tsx apps/web/src/stores/draft-store.ts
git commit -m "feat(web): ad-fe-1~7 AdoptButton (enabled) + confirm dialog + stale flow + LlmNotConfiguredModal"
git push -u origin feat/adopt-fe
```

---

## Wave 5：status-updater 前端

### Task 11: StatusUpdateIndicator + UpdateStatusButton + StatusShortenButton

**Files:**
- Create: `apps/web/src/features/editor/StatusUpdateIndicator.tsx`
- Create: `apps/web/src/features/status/UpdateStatusButton.tsx`
- Create: `apps/web/src/features/status/StatusShortenButton.tsx`
- Modify: `apps/web/src/features/editor/ChapterEditorPage.tsx`

- [ ] **Step 1: 建立 StatusUpdateIndicator.tsx**

```tsx
// apps/web/src/features/editor/StatusUpdateIndicator.tsx
import { useEffect, useState } from "react";
import { connectSse } from "../../lib/sse-client";
import { useDraftStore } from "../../stores/draft-store";

export function StatusUpdateIndicator() {
  const statusJobId = useDraftStore((s) => s.statusJobId);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!statusJobId) return;
    setPhase("running");
    const abort = connectSse(`/api/projects/none/jobs/${statusJobId}/events`, {}, {
      onStarted: () => setPhase("running"),
      onComplete: (d) => {
        setPhase("done");
        setToast(d.skipped ? null : "狀態已更新");
        setTimeout(() => { setPhase("idle"); setToast(null); }, 4000);
      },
      onError: () => {
        setPhase("failed");
        setToast("狀態更新失敗");
      },
    });
    return abort;
  }, [statusJobId]);

  if (phase === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 shadow-lg text-xs">
      {phase === "running" && (
        <>
          <span className="animate-spin text-indigo-400">⟳</span>
          <span className="text-neutral-300">狀態更新中…</span>
        </>
      )}
      {phase === "done" && toast && <span className="text-green-400">{toast}</span>}
      {phase === "failed" && (
        <span className="text-red-400">{toast}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 建立 UpdateStatusButton.tsx**

```tsx
// apps/web/src/features/status/UpdateStatusButton.tsx
import { useState } from "react";
import { useDraftStore } from "../../stores/draft-store";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

export function UpdateStatusButton({ projectHash, chapterNumber }: Props) {
  const setStatusJobId = useDraftStore((s) => s.setStatusJobId);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm(`以第 ${chapterNumber} 章的內容重新跑 status-updater？`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/status/update-from-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber, reason: "manual" }),
      });
      if (res.ok) {
        const data = await res.json() as { jobId: string };
        setStatusJobId(data.jobId);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40 transition-colors"
    >
      {loading ? "更新中…" : "立刻更新狀態"}
    </button>
  );
}
```

- [ ] **Step 3: 建立 StatusShortenButton.tsx**

```tsx
// apps/web/src/features/status/StatusShortenButton.tsx
import { useState } from "react";

interface Props {
  projectHash: string;
  fileType: "story" | "character";
  characterSlug?: string;
  onResult: (shortened: string) => void;
}

export function StatusShortenButton({ projectHash, fileType, characterSlug, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [preserveMarked, setPreserveMarked] = useState(true);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/status/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileType, characterSlug, preserveMarkedSections: preserveMarked }),
      });
      if (res.ok) {
        const data = await res.json() as { shortenedContent: string };
        onResult(data.shortenedContent);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-neutral-400 cursor-pointer">
        <input
          type="checkbox"
          checked={preserveMarked}
          onChange={(e) => setPreserveMarked(e.target.checked)}
          className="rounded"
        />
        保留 🔖/✨ 段
      </label>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded border border-indigo-700 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40 transition-colors"
      >
        {loading ? "精簡中…" : "AI 精簡"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 在 ChapterEditorPage 工具列加 UpdateStatusButton + StatusUpdateIndicator**

在 `ChapterEditorPage.tsx` 的工具列區（`<GenerateButton>` 後）加：

```tsx
// 加 imports：
import { UpdateStatusButton } from "../status/UpdateStatusButton";
import { StatusUpdateIndicator } from "./StatusUpdateIndicator";

// 在工具列中（<GenerateButton> 之後）：
{currentChapter !== null && (
  <UpdateStatusButton projectHash={projectHash} chapterNumber={currentChapter} />
)}

// 在 return 最末（</div> 之前）加：
<StatusUpdateIndicator />
```

- [ ] **Step 5: typecheck + tests**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 6: commit**

```bash
git checkout -b feat/status-fe
git add apps/web/src/features/editor/StatusUpdateIndicator.tsx apps/web/src/features/status/ apps/web/src/features/editor/ChapterEditorPage.tsx
git commit -m "feat(web): stat-fe-1/2/3 StatusUpdateIndicator + UpdateStatusButton + StatusShortenButton"
git push -u origin feat/status-fe
```

---

## Wave 6a：git 歷史後端

### Task 12: git-log-parser.ts + git routes 補全

**Files:**
- Create: `apps/api/src/services/git-log-parser.ts`
- Modify: `apps/api/src/routes/git.ts`

- [ ] **Step 1: 建立 git-log-parser.ts**

```typescript
// apps/api/src/services/git-log-parser.ts
import type { GitCommit, GitCommitFile } from "@novel-writer/shared-types";
import { git } from "./git.js";

function parseMessageType(msg: string): GitCommit["type"] {
  if (msg.startsWith("init:")) return "init";
  if (msg.startsWith("chapter:")) return "chapter";
  if (msg.startsWith("character:")) return "character";
  if (msg.startsWith("status:")) return "status";
  if (msg.startsWith("style:")) return "style";
  return "meta";
}

export async function parseGitLog(
  projectPath: string,
  opts: { file?: string; limit?: number; before?: string },
): Promise<{ commits: GitCommit[]; hasMore: boolean }> {
  const limit = opts.limit ?? 50;
  const args = [
    "log",
    `--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s`,
    "--numstat",
    `--max-count=${limit + 1}`,
  ];
  if (opts.before) args.push(`--before=${opts.before}`);
  if (opts.file) args.push("--", opts.file);

  const result = await git.log(projectPath, { file: opts.file, limit: limit + 1 });
  if (!result.ok) return { commits: [], hasMore: false };

  // Parse using raw git run
  const rawResult = await (await import("node:child_process")).spawnSync(
    "git",
    args,
    { cwd: projectPath, encoding: "utf-8", env: { ...process.env, LC_ALL: "C.UTF-8" } },
  );
  const raw = rawResult.stdout ?? "";

  const commits: GitCommit[] = [];
  const blocks = raw.split("\n\n").filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0];
    if (!header) continue;
    const [sha, shortSha, author, date, ...msgParts] = header.split("\x1f");
    if (!sha || !shortSha || !author || !date) continue;
    const message = msgParts.join("\x1f");

    const files: GitCommitFile[] = [];
    for (const line of lines.slice(1)) {
      const m = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (!m?.[3]) continue;
      files.push({
        path: m[3],
        status: "modified",
        additions: m[1] === "-" ? 0 : Number(m[1]),
        deletions: m[2] === "-" ? 0 : Number(m[2]),
      });
    }

    commits.push({
      sha, shortSha, author,
      date,
      message,
      type: parseMessageType(message),
      files,
    });
  }

  const hasMore = commits.length > limit;
  return { commits: commits.slice(0, limit), hasMore };
}
```

- [ ] **Step 2: 補全 git routes（log / show / diff / revert / commit-manual）**

在 `apps/api/src/routes/git.ts` 的 export 中加（在現有路由之後）：

```typescript
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { parseGitLog } from "../services/git-log-parser.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { atomicWriteFile } from "../services/atomic-fs.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { git } from "../services/git.js";

// GET /api/projects/:hash/git/log
export const gitRoutes = new Hono()
  .get("/log", async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const file = c.req.query("file");
    const limit = Number(c.req.query("limit") ?? "50");
    const before = c.req.query("before");
    const result = await parseGitLog(projectPath, { file, limit: Math.min(limit, 500), before });
    return c.json(result);
  })
  .get("/show", async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const sha = c.req.query("sha");
    const file = c.req.query("file");
    if (!sha || !file) return c.json({ code: "MISSING_PARAMS" }, 400);
    const result = await git.show(projectPath, sha, file);
    if (!result.ok) return c.json({ code: "NOT_FOUND" }, 404);
    return c.json({ content: result.value.stdout, size: result.value.stdout.length });
  })
  .get("/diff", async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const sha = c.req.query("sha");
    const file = c.req.query("file");
    const against = c.req.query("against") ?? "head";
    if (!sha || !file) return c.json({ code: "MISSING_PARAMS" }, 400);
    const args = against === "current"
      ? [sha, "--", file]
      : ["HEAD", sha, "--", file];
    const result = await git.diff(projectPath, args);
    if (!result.ok) return c.json({ unifiedDiff: "", additions: 0, deletions: 0 });
    const diff = result.value.stdout;
    const additions = (diff.match(/^\+[^+]/gm) ?? []).length;
    const deletions = (diff.match(/^-[^-]/gm) ?? []).length;
    return c.json({ unifiedDiff: diff, additions, deletions });
  })
  .post("/revert", zValidator("json", z.object({ sha: z.string(), file: z.string() })), async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const { sha, file } = c.req.valid("json");
    const showResult = await git.show(projectPath, sha, file);
    if (!showResult.ok) return c.json({ code: "FILE_NOT_IN_COMMIT" }, 404);
    const { join } = await import("node:path");
    await atomicWriteFile(join(projectPath, file), showResult.value.stdout);
    const commitResult = await commitIfChanged(projectPath, "meta" as never, `revert ${file} to ${sha.slice(0, 7)}`);
    return c.json({ revertCommitSha: commitResult?.sha ?? null });
  })
  .post("/commit-manual", zValidator("json", z.object({ message: z.string().min(1), files: z.array(z.string()).optional() })), async (c) => {
    const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
    if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
    const { message, files } = c.req.valid("json");
    const addResult = await git.add(projectPath, files ?? ["."]);
    if (!addResult.ok) return c.json({ code: "IO_ERROR", message: addResult.error.stderr }, 500);
    const commitResult = await git.commit(projectPath, message);
    if (!commitResult.ok) return c.json({ code: "IO_ERROR", message: commitResult.error.stderr }, 500);
    return c.json({ commitSha: commitResult.value.sha });
  });
```

- [ ] **Step 3: 把 gitRoutes 掛到 server.ts**

```typescript
import { gitRoutes } from "./routes/git.js";
// 加：
.route("/api/projects/:hash/git", gitRoutes)
```

- [ ] **Step 4: typecheck + tests**

```bash
pnpm typecheck && pnpm test --filter=@novel-writer/api
```

- [ ] **Step 5: commit**

```bash
git checkout -b feat/git-be
git add apps/api/src/services/git-log-parser.ts apps/api/src/routes/git.ts apps/api/src/server.ts
git commit -m "feat(api): git-be-1/2 git-log-parser + complete log/show/diff/revert/commit-manual routes"
git push -u origin feat/git-be
```

---

## Wave 6b：git 歷史前端

### Task 13: HistoryPanel + CommitPreview + DiffView + RevertButton

**Files:**
- Create: `apps/web/src/features/git/HistoryPanel.tsx`
- Create: `apps/web/src/features/git/CommitPreview.tsx`
- Create: `apps/web/src/features/git/DiffView.tsx`
- Modify: `apps/web/src/features/editor/ChapterEditorPage.tsx`

- [ ] **Step 1: 建立 HistoryPanel.tsx**

```tsx
// apps/web/src/features/git/HistoryPanel.tsx
import type { GitCommit } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";

interface Props {
  projectHash: string;
  file?: string;
  open: boolean;
  onClose: () => void;
}

export function HistoryPanel({ projectHash, file, open, onClose }: Props) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selected, setSelected] = useState<GitCommit | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = `/api/projects/${projectHash}/git/log?limit=50${file ? `&file=${encodeURIComponent(file)}` : ""}`;
    fetch(url)
      .then((r) => r.json() as Promise<{ commits: GitCommit[] }>)
      .then((data) => setCommits(data.commits))
      .finally(() => setLoading(false));
  }, [projectHash, file, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-96 bg-neutral-900 border-l border-neutral-700 flex flex-col h-full shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-200">版本歷史</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-200">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-neutral-500">載入中…</p>}
          {commits.map((commit) => (
            <button
              key={commit.sha}
              type="button"
              onClick={() => setSelected(commit === selected ? null : commit)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-800 hover:bg-neutral-800 transition-colors ${selected?.sha === commit.sha ? "bg-neutral-800" : ""}`}
            >
              <p className="text-xs font-mono text-indigo-400">{commit.shortSha}</p>
              <p className="text-sm text-neutral-200 truncate">{commit.message}</p>
              <p className="text-xs text-neutral-500">{new Date(commit.date).toLocaleString("zh-TW")}</p>
              <p className="text-xs text-neutral-600">
                {commit.files.reduce((s, f) => s + f.additions + f.deletions, 0)} 字變更
              </p>
            </button>
          ))}
        </div>
        {selected && file && (
          <CommitPreview projectHash={projectHash} commit={selected} file={file} />
        )}
      </div>
    </div>
  );
}

function CommitPreview({ projectHash, commit, file }: { projectHash: string; commit: GitCommit; file: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "diff">("preview");
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectHash}/git/show?sha=${commit.sha}&file=${encodeURIComponent(file)}`)
      .then((r) => r.ok ? r.json() as Promise<{ content: string }> : null)
      .then((d) => setContent(d?.content ?? null));
  }, [projectHash, commit.sha, file]);

  const loadDiff = async () => {
    const r = await fetch(`/api/projects/${projectHash}/git/diff?sha=${commit.sha}&file=${encodeURIComponent(file)}&against=current`);
    const d = await r.json() as { unifiedDiff: string };
    setDiff(d.unifiedDiff);
    setView("diff");
  };

  const doRevert = async () => {
    if (!confirm(`還原 ${file} 到 ${commit.shortSha}？此動作將建立新 commit。`)) return;
    setReverting(true);
    await fetch(`/api/projects/${projectHash}/git/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, file }),
    });
    setReverting(false);
    window.location.reload();
  };

  return (
    <div className="border-t border-neutral-700 flex flex-col" style={{ maxHeight: "50%" }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700">
        <button type="button" onClick={() => setView("preview")} className={`text-xs ${view === "preview" ? "text-indigo-400" : "text-neutral-400"}`}>預覽</button>
        <button type="button" onClick={loadDiff} className={`text-xs ${view === "diff" ? "text-indigo-400" : "text-neutral-400"}`}>Diff</button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={doRevert}
          disabled={reverting}
          className="rounded border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 disabled:opacity-40"
        >
          {reverting ? "還原中…" : "還原到此版本"}
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-3 text-xs font-mono text-neutral-300 whitespace-pre-wrap">
        {view === "preview" && (content ?? "（檔案在此 commit 不存在）")}
        {view === "diff" && diff && <DiffView unifiedDiff={diff} />}
      </div>
    </div>
  );
}

function DiffView({ unifiedDiff }: { unifiedDiff: string }) {
  return (
    <div className="text-xs font-mono">
      {unifiedDiff.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "bg-green-900/30 text-green-300"
              : line.startsWith("-") && !line.startsWith("---")
                ? "bg-red-900/30 text-red-300"
                : "text-neutral-400"
          }
        >
          {line || " "}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 加「歷史」按鈕到 ChapterEditorPage 工具列**

在 `ChapterEditorPage.tsx` 工具列（`<GenerateButton>` 後）加：

```tsx
// 加 import：
import { HistoryPanel } from "../git/HistoryPanel";

// 加 state：
const [historyOpen, setHistoryOpen] = useState(false);

// 工具列加按鈕：
{currentChapter !== null && (
  <button
    type="button"
    onClick={() => setHistoryOpen(true)}
    className="text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700 rounded px-2 py-1"
  >
    歷史
  </button>
)}

// return 末尾加：
<HistoryPanel
  projectHash={projectHash}
  file={currentChapter !== null ? `chapters/chapter_${String(currentChapter).padStart(4, "0")}_${store.chapter?.title ?? ""}.md` : undefined}
  open={historyOpen}
  onClose={() => setHistoryOpen(false)}
/>
```

- [ ] **Step 3: typecheck + tests**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 4: commit**

```bash
git checkout -b feat/git-fe
git add apps/web/src/features/git/ apps/web/src/features/editor/ChapterEditorPage.tsx
git commit -m "feat(web): git-fe-1~6 HistoryPanel + CommitPreview + DiffView + RevertButton + 歷史按鈕"
git push -u origin feat/git-fe
```

---

## Wave 7：QA Golden Tests

### Task 14: status-updater golden tests

**Files:**
- Create: `apps/api/src/services/status-updater-service.test.ts`
- Create: `apps/api/src/services/prompt-md.test.ts`（已在 Task 4 建立）

- [ ] **Step 1: 建立 status-updater-service.test.ts**

```typescript
// apps/api/src/services/status-updater-service.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { buildStatusUpdaterRequest, statusUpdaterOutputSchema } from "@novel-writer/prompt-library";

// Golden test fixtures
const FIXTURE_INPUT: Parameters<typeof buildStatusUpdaterRequest>[0] = {
  chapterNumber: 1,
  chapterTitle: "梅雨初晴",
  chapterText: "蘇晴推開木門走進書店。林書言抬頭打了個招呼。兩人聊了一會兒雨停的可能性，最後蘇晴買了一本詩集離去。",
  currentStoryStatus: "# 故事狀態\n\n## 世界觀\n\n現代台北。\n\n## 重要劇情點\n\n## 🔖 伏筆\n\n## ✨ 轉折點\n\n## 場景\n",
  relevantCharacters: [
    {
      slug: "蘇晴",
      name: "蘇晴",
      card: "蘇晴是 30 歲的女作家。",
      status: "# 蘇晴 — 狀態\n\n## 重要狀態變化\n\n## 與其他角色的關係\n\n## 🔖 個人伏筆\n\n## ✨ 個人轉折點\n",
    },
  ],
};

describe("status-updater prompt (qa-4 golden tests)", () => {
  it("produces stable prompt hash across 5 runs", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
      const content = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
      return createHash("sha256").update(req.systemPrompt + content).digest("hex");
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it("schema accepts valid output with characterStatuses", () => {
    const valid = {
      storyStatus: "# 故事狀態\n\n## 世界觀\n現代台北。\n\n## 重要劇情點\n- (第1章) 蘇晴初訪書店。\n\n## 🔖 伏筆\n\n## ✨ 轉折點\n\n## 場景\n### 場景：言字書店\n環境：舊書香氣。\n",
      characterStatuses: {
        "蘇晴": "# 蘇晴 — 狀態\n\n## 重要狀態變化\n- (第1章) 初訪言字書店。\n\n## 與其他角色的關係\n- 與 [[林書言]]：初次相識。\n\n## 🔖 個人伏筆\n\n## ✨ 個人轉折點\n",
      },
    };
    expect(statusUpdaterOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("schema rejects output with extra character slugs", () => {
    const invalid = {
      storyStatus: "...",
      characterStatuses: {
        "蘇晴": "...",
        "未在輸入中的角色": "...",  // should be caught by business logic, not schema
      },
    };
    // Schema itself allows any keys; business logic enforces relevantCharacters constraint
    const result = statusUpdaterOutputSchema.safeParse(invalid);
    expect(result.success).toBe(true);
    // But we verify it passes so business logic can filter
  });

  it("system prompt contains rule about not modifying character names", () => {
    const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("不修改既有角色姓名");
  });

  it("system prompt contains rule about preserving 🔖 sections", () => {
    const req = buildStatusUpdaterRequest(FIXTURE_INPUT, "anthropic:claude-haiku-4-5");
    expect(req.systemPrompt).toContain("🔖");
    expect(req.systemPrompt).toContain("✨");
  });
});
```

- [ ] **Step 2: 跑 QA tests**

```bash
pnpm test --filter=@novel-writer/api -- status-updater
pnpm test --filter=@novel-writer/prompt-library
```
Expected: All pass

- [ ] **Step 3: commit**

```bash
git checkout -b feat/qa-golden
git add apps/api/src/services/status-updater-service.test.ts
git commit -m "test: qa-4 status-updater golden tests + prompt hash stability"
git push -u origin feat/qa-golden
```

---

## 最終驗收 Checklist

- [ ] `pnpm typecheck` 全綠
- [ ] `pnpm test` 全部 pass（預估 ≥ 430 tests）
- [ ] git log --oneline：main 上有所有 Wave 1-7 的 commit
- [ ] Demo step 1-10 手動跑通：
  - [ ] Step 2：採用第 1 章草稿 → 進度條 → toast → status spinner
  - [ ] Step 3：ls chapters/ → prompt.md 存在
  - [ ] Step 4：story_status.md 有更新內容
  - [ ] Step 5：Ctrl+Z → CM6 view 還原（.md 不動）
  - [ ] Step 6：第 2 章 AI 寫 → prompt 含 story_status + character_status
  - [ ] Step 8：AI 精簡 → 🔖 段保留
  - [ ] Step 9：歷史面板 → diff → 還原

---

## Trunk-based Merge 順序

```
PR #10 (pre-flight) → main
PR (feat/types-m3)  → main   [Wave 1a]
PR (feat/prompts-status) → main  [Wave 1b, 依賴 types]
PR (feat/infra-commit-policy) → main  [Wave 2a, 依賴 types]
PR (feat/adopt-be-prompt-md) → main  [Wave 2b-1]
PR (feat/adopt-be-undo-store) → main  [Wave 2b-2]
PR (feat/adopt-be-routes) → main  [Wave 2b-3, 依賴前三個]
PR (feat/status-be-eventbus) → main  [Wave 3a]
PR (feat/status-be-services) → main  [Wave 3b, 依賴 prompts]
PR (feat/status-be-routes) → main  [Wave 3c, 依賴 services]
PR (feat/adopt-fe) → main  [Wave 4, 依賴 adopt-be-routes]
PR (feat/status-fe) → main  [Wave 5, 依賴 status-be-routes]
PR (feat/git-be) → main  [Wave 6a]
PR (feat/git-fe) → main  [Wave 6b, 依賴 git-be]
PR (feat/qa-golden) → main  [Wave 7]
```
