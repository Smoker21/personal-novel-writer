# M2 後半段實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 M2 角色卡 + AI 撰寫 + Vision milestone 的後半段：portrait 後端、AI 撰寫後端、設定頁補完、所有前端元件、QA

**Architecture:** 以 char-be（已完成）為基礎，Wave1 加 portrait 後端（sharp）+ SQLite cache + settings 驗證，Wave2 串起 AI 撰寫後端（context-collector → LLMRouter SSE → draft cache）+ 前端元件，Wave3 完成 portrait 前端與 AI 草稿面板，Wave4 補 BDD + golden tests。

**Tech Stack:** Hono + better-sqlite3 + sharp + yaml + @novel-writer/llm-adapter + @novel-writer/prompt-library + React 18 + Tailwind v4 + Radix Primitives + Zustand + MSW

---

## 檔案結構總覽

### 新建檔案

```
apps/api/src/
  services/
    cache-db.ts              # better-sqlite3 SQLite wrapper，drafts table
    portrait-fs.ts           # sharp resize + 圖片 atomic write/unlink/list
    character-image-extract.ts # 呼叫 image-extractor skill + 寫 frontmatter
    context-collector.ts     # 蒐集 ChapterContext，token 守門
    draft-cache.ts           # ~/.novel-writer/cache/<hash>/drafts/ 讀寫
    job-queue.ts             # p-queue per projectHash
    character-slug.test.ts   # ← T1
    character-fs.test.ts     # ← T2
    character-consolidate.test.ts # ← T3
  routes/
    portraits.ts             # POST upload / POST extract / DELETE / GET list
    generate.ts              # POST .../chapters/:n/generate  SSE
    draft.ts                 # GET / DELETE .../chapters/:n/draft

apps/web/src/
  features/
    settings/
      AgentRoutingCard.tsx   # per-Agent routing dropdown 組
      PresetButtons.tsx      # 4 個 preset
      LlmNotConfiguredModal.tsx # routing 未設定引導 dialog
    characters/
      CharacterPanel.tsx     # 列表 + 新增按鈕
      CharacterEditor.tsx    # 六分區 tabs
      PersonalityTagInput.tsx # chip-style 標籤輸入
      SelectDropdowns.tsx    # MBTI / zodiac / bloodType
      AIGenerateButton.tsx   # spinner + body preview
      PortraitSection.tsx    # 外貌圖片區
      DefaultPortraitCard.tsx
      ChapterPortraitList.tsx
      PortraitUploadHook.ts  # client 端驗證 + 進度
    editor/
      DraftPanel.tsx         # 草稿面板（並排）
      GenerateButton.tsx     # AI 撰寫本章 button
  lib/
    sse-client.ts            # EventSource 包裝 + 中止
  stores/
    draft-store.ts           # Zustand draft state
```

### 修改檔案

```
apps/api/src/server.ts                   # 掛 characters / portraits / generate / draft routes
apps/api/src/routes/settings.ts          # PUT 加 INVALID_ROUTING 驗證
apps/api/src/services/character-fs.ts    # 加 lookupAppearance() helper（port-be-5）
apps/api/package.json                    # 加 better-sqlite3 + @types/better-sqlite3
apps/web/src/features/settings/SettingsPage.tsx  # 加 AgentRoutingCard + PresetButtons
apps/web/src/features/editor/ChapterEditorPage.tsx # 加 DraftPanel + GenerateButton
```

---

## 測試補齊（現有 char-be）

### Task T1: character-slug unit tests

**Files:**
- Create: `apps/api/src/services/character-slug.test.ts`

- [ ] 建立測試檔：

```typescript
import { describe, expect, it } from "vitest";
import { computeSlug, resolveUniqueSlug, listExistingSlugs } from "./character-slug.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("computeSlug", () => {
  it("NFC normalizes and removes unsafe chars", () => {
    expect(computeSlug("蘇晴")).toBe("蘇晴");
    expect(computeSlug("lin/shu")).toBe("linshu");
    expect(computeSlug('a*b"c')).toBe("abc");
  });
  it("collapses whitespace to underscore", () => {
    expect(computeSlug("林 書 言")).toBe("林_書_言");
  });
  it("appends -character for Windows reserved names", () => {
    expect(computeSlug("CON")).toBe("CON-character");
    expect(computeSlug("NUL")).toBe("NUL-character");
  });
  it("throws on empty result", () => {
    expect(() => computeSlug("///")).toThrow("INVALID_INPUT");
  });
});

describe("resolveUniqueSlug", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `slug-test-${Date.now()}`);
    await mkdir(join(tmpDir, "characters"), { recursive: true });
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns base slug when no conflict", async () => {
    const slug = await resolveUniqueSlug("蘇晴", tmpDir);
    expect(slug).toBe("蘇晴");
  });
  it("appends -2 on conflict", async () => {
    await writeFile(join(tmpDir, "characters", "蘇晴.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("蘇晴", tmpDir);
    expect(slug).toBe("蘇晴-2");
  });
  it("excludeSlug allows rename to same slug", async () => {
    await writeFile(join(tmpDir, "characters", "蘇晴.md"), "", "utf-8");
    const slug = await resolveUniqueSlug("蘇晴", tmpDir, "蘇晴");
    expect(slug).toBe("蘇晴");
  });
});
```

- [ ] 執行：`pnpm test --filter=@novel-writer/api 2>&1 | grep -E "character-slug|PASS|FAIL"`
- [ ] 確認全過
- [ ] `git add apps/api/src/services/character-slug.test.ts && git commit -m "test(api): T1 character-slug unit tests"`

---

### Task T2: character-fs unit tests

**Files:**
- Create: `apps/api/src/services/character-fs.test.ts`

- [ ] 建立測試檔（核心三個 case）：

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createCharacter, readCharacter, updateCharacter,
  renameCharacter, deleteCharacter, listCharacters,
} from "./character-fs.js";
import type { CharacterFields } from "@novel-writer/shared-types";

function minimalFields(name: string): CharacterFields {
  return {
    name, age: null, gender: null, pronoun: null, role: null,
    personalityTags: [], mbti: null, zodiac: null, bloodType: null,
    culturalBackground: null, heightCm: null, bodyType: null,
    hairAndColor: null, eyes: null, otherFeatures: null, clothing: null,
    portrait: { default: null, byChapter: {} }, appearanceByChapter: {},
    dialoguePace: null, wordingPreference: null, writingAvoid: null,
    relations: null, intimateAppendix: null,
    consolidatedAt: null, consolidatedBy: null, manuallyEdited: false,
  };
}

describe("character-fs", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = join(tmpdir(), `char-fs-${Date.now()}`);
    await mkdir(join(tmpDir, "characters"), { recursive: true });
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("create → read roundtrip preserves all fields", async () => {
    const fields = minimalFields("蘇晴");
    fields.mbti = "INFJ";
    fields.personalityTags = ["內向", "敏感"];
    await createCharacter(tmpDir, { slug: "蘇晴", fields, body: "測試 body", oneLineSummary: "30 歲女作家" });
    const result = await readCharacter(tmpDir, "蘇晴");
    expect(result?.fields.mbti).toBe("INFJ");
    expect(result?.fields.personalityTags).toEqual(["內向", "敏感"]);
    expect(result?.body).toBe("測試 body");
  });

  it("_index.md is maintained on create and delete", async () => {
    await createCharacter(tmpDir, { slug: "蘇晴", fields: minimalFields("蘇晴"), body: "", oneLineSummary: "主角" });
    const list = await listCharacters(tmpDir);
    expect(list.some((c) => c.slug === "蘇晴")).toBe(true);
    await deleteCharacter(tmpDir, "蘇晴");
    const list2 = await listCharacters(tmpDir);
    expect(list2.some((c) => c.slug === "蘇晴")).toBe(false);
  });

  it("rename moves .md and updates _index.md", async () => {
    await createCharacter(tmpDir, { slug: "林川", fields: minimalFields("林川"), body: "", oneLineSummary: "配角" });
    await renameCharacter(tmpDir, "林川", "林書言", "林書言");
    expect(await readCharacter(tmpDir, "林川")).toBeNull();
    const renamed = await readCharacter(tmpDir, "林書言");
    expect(renamed?.fields.name).toBe("林書言");
  });
});
```

- [ ] 執行：`pnpm test --filter=@novel-writer/api 2>&1 | grep -E "character-fs|PASS|FAIL"`
- [ ] 確認全過
- [ ] `git add apps/api/src/services/character-fs.test.ts && git commit -m "test(api): T2 character-fs roundtrip + _index + rename"`

---

### Task T3: character-consolidate unit tests

**Files:**
- Create: `apps/api/src/services/character-consolidate.test.ts`

- [ ] 建立測試檔：

```typescript
import { describe, expect, it, vi } from "vitest";
import { consolidateCharacter } from "./character-consolidate.js";
import type { CharacterFields } from "@novel-writer/shared-types";

function makeRouter(text: string) {
  return { generate: vi.fn().mockResolvedValue({ text, usage: { inputTokens: 10, outputTokens: 50 }, finishReason: "end", modelId: "test:m" }) } as any;
}

const policy = { primary: "test:m", fallbacks: [], retryPerModel: 1 };
const fields = { name: "蘇晴" } as CharacterFields;

describe("consolidateCharacter", () => {
  it("parses clean JSON response", async () => {
    const result = await consolidateCharacter({
      router: makeRouter('{"body":"她是個內向的人","oneLineSummary":"30 歲女作家"}'),
      policy, fields,
    });
    expect(result.body).toBe("她是個內向的人");
    expect(result.oneLineSummary).toBe("30 歲女作家");
  });

  it("strips markdown code fence", async () => {
    const result = await consolidateCharacter({
      router: makeRouter('```json\n{"body":"body text","oneLineSummary":"summary"}\n```'),
      policy, fields,
    });
    expect(result.body).toBe("body text");
  });

  it("retries on invalid JSON and succeeds", async () => {
    const router = {
      generate: vi.fn()
        .mockResolvedValueOnce({ text: "not json", usage: { inputTokens: 10, outputTokens: 5 }, finishReason: "end", modelId: "test:m" })
        .mockResolvedValueOnce({ text: '{"body":"retry body","oneLineSummary":"retry summary"}', usage: { inputTokens: 10, outputTokens: 50 }, finishReason: "end", modelId: "test:m" }),
    } as any;
    const result = await consolidateCharacter({ router, policy, fields });
    expect(result.body).toBe("retry body");
    expect(router.generate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] 執行：`pnpm test --filter=@novel-writer/api 2>&1 | grep -E "character-consolidate|PASS|FAIL"`
- [ ] 確認全過
- [ ] `git add apps/api/src/services/character-consolidate.test.ts && git commit -m "test(api): T3 character-consolidate JSON parse + retry"`

---

## Wave 1

### Task W1-1: server.ts 掛 characters route + 安裝 better-sqlite3

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`

- [ ] 安裝依賴：
```bash
pnpm add -F @novel-writer/api better-sqlite3 @types/better-sqlite3
```

- [ ] 更新 `apps/api/src/server.ts`：

```typescript
// 加在 import 區
import { charactersRouter } from "./routes/characters.js";

// .route() 鏈加一行
.route("/api/projects/:hash/characters", charactersRouter)
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/server.ts apps/api/package.json pnpm-lock.yaml && git commit -m "feat(api): mount characters route + add better-sqlite3 dep"`

---

### Task W1-2: SQLite cache-db（db-1）

**Files:**
- Create: `apps/api/src/services/cache-db.ts`

- [ ] 建立 `apps/api/src/services/cache-db.ts`：

```typescript
import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DBS = new Map<string, Database.Database>();

function dbPath(projectHash: string): string {
  return join(homedir(), ".novel-writer", "cache", projectHash, "index.db");
}

export async function getDb(projectHash: string): Promise<Database.Database> {
  if (DBS.has(projectHash)) return DBS.get(projectHash)!;
  const path = dbPath(projectHash);
  await mkdir(join(homedir(), ".novel-writer", "cache", projectHash), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      draft_id TEXT PRIMARY KEY,
      project_hash TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      model_id TEXT NOT NULL,
      context_hash TEXT NOT NULL,
      total_chars INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_project_chapter
      ON drafts(project_hash, chapter_number);
  `);
  DBS.set(projectHash, db);
  return db;
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/cache-db.ts && git commit -m "feat(api): db-1 SQLite cache-db with drafts table"`

---

### Task W1-3: portrait-fs（port-be-1）

**Files:**
- Create: `apps/api/src/services/portrait-fs.ts`

- [ ] 建立 `apps/api/src/services/portrait-fs.ts`：

```typescript
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";
import { atomicWriteFile } from "./atomic-fs.js";
import type { PortraitInfo, PortraitScope } from "@novel-writer/shared-types";

const MAX_PIXELS = 4096;
const MAX_BYTES = 5 * 1024 * 1024;
const VALID_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function portraitPath(projectPath: string, slug: string, scope: PortraitScope, chapterNumber?: number): string {
  const dir = join(projectPath, "characters", "_assets", slug);
  if (scope === "default") return join(dir, `default`);
  const n = String(chapterNumber ?? 0).padStart(4, "0");
  return join(dir, `chapter_${n}`);
}

function mimeToExt(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

export async function savePortrait(
  projectPath: string,
  slug: string,
  scope: PortraitScope,
  chapterNumber: number | null,
  buffer: Buffer,
  mimeType: string,
): Promise<{ path: string; bytes: number; width: number; height: number; format: string; resized: boolean }> {
  let img = sharp(buffer);
  const meta = await img.metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;

  if (origW < 256 || origH < 256) {
    throw Object.assign(new Error("Image too small"), { code: "INVALID_DIMENSIONS" });
  }

  let resized = false;
  if (origW > MAX_PIXELS || origH > MAX_PIXELS) {
    img = img.resize(MAX_PIXELS, MAX_PIXELS, { fit: "inside", withoutEnlargement: true });
    resized = true;
  }

  let outBuffer = await img.toBuffer();
  if (outBuffer.length > MAX_BYTES) {
    outBuffer = await sharp(outBuffer).jpeg({ quality: 85 }).toBuffer();
    mimeType = "image/jpeg";
    resized = true;
  }

  const finalMeta = await sharp(outBuffer).metadata();
  const ext = mimeToExt(mimeType);
  const basePath = portraitPath(projectPath, slug, scope, chapterNumber ?? undefined);
  const filePath = `${basePath}${ext}`;

  const dir = join(projectPath, "characters", "_assets", slug);
  await mkdir(dir, { recursive: true });

  // Remove existing file with any extension at same scope
  try {
    const files = await readdir(dir);
    const prefix = scope === "default" ? "default" : `chapter_${String(chapterNumber ?? 0).padStart(4, "0")}`;
    for (const f of files) {
      if (f.startsWith(prefix) && VALID_EXTS.has(extname(f).toLowerCase())) {
        await unlink(join(dir, f));
      }
    }
  } catch { /* dir may not exist */ }

  await atomicWriteFile(filePath, outBuffer as unknown as string);

  return {
    path: `characters/_assets/${slug}/${scope === "default" ? `default${ext}` : `chapter_${String(chapterNumber ?? 0).padStart(4, "0")}${ext}`}`,
    bytes: outBuffer.length,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    format: mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpeg",
    resized,
  };
}

export async function deletePortrait(
  projectPath: string,
  slug: string,
  scope: PortraitScope,
  chapterNumber: number | null,
): Promise<boolean> {
  const dir = join(projectPath, "characters", "_assets", slug);
  const prefix = scope === "default" ? "default" : `chapter_${String(chapterNumber ?? 0).padStart(4, "0")}`;
  try {
    const files = await readdir(dir);
    let found = false;
    for (const f of files) {
      if (f.startsWith(prefix) && VALID_EXTS.has(extname(f).toLowerCase())) {
        await unlink(join(dir, f));
        found = true;
      }
    }
    return found;
  } catch {
    return false;
  }
}

export async function listPortraits(
  projectPath: string,
  slug: string,
): Promise<{ default: PortraitInfo | null; byChapter: Array<PortraitInfo & { chapterNumber: number }> }> {
  const dir = join(projectPath, "characters", "_assets", slug);
  let files: string[];
  try { files = await readdir(dir); } catch { return { default: null, byChapter: [] }; }

  let defaultPortrait: PortraitInfo | null = null;
  const byChapter: Array<PortraitInfo & { chapterNumber: number }> = [];

  for (const f of files) {
    if (!VALID_EXTS.has(extname(f).toLowerCase())) continue;
    const fullPath = join(dir, f);
    const st = await stat(fullPath);
    const meta = await sharp(fullPath).metadata();
    const info: PortraitInfo = {
      path: `characters/_assets/${slug}/${f}`,
      bytes: st.size,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      format: (meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpeg") as "jpeg" | "png" | "webp",
      uploadedAt: st.mtime.toISOString(),
      hasExtracted: false,
    };
    if (f.startsWith("default")) {
      defaultPortrait = info;
    } else {
      const m = f.match(/^chapter_(\d{4})/);
      if (m) byChapter.push({ ...info, chapterNumber: Number(m[1]) });
    }
  }

  return { default: defaultPortrait, byChapter };
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/portrait-fs.ts && git commit -m "feat(api): port-be-1 portrait-fs sharp upload/list/delete"`

---

### Task W1-4: lookupAppearance helper（port-be-5）

**Files:**
- Modify: `apps/api/src/services/character-fs.ts`

- [ ] 在 `character-fs.ts` 末尾加入：

```typescript
// ── lookupAppearance（供 context-collector 使用）──────────────────────────

export function lookupAppearance(fields: CharacterFields, currentChapter: number): string {
  const chapters = Object.keys(fields.appearanceByChapter)
    .map(Number)
    .filter((n) => n <= currentChapter)
    .sort((a, b) => b - a);

  if (chapters.length > 0) {
    return fields.appearanceByChapter[chapters[0]!] ?? "";
  }

  return [
    fields.hairAndColor,
    fields.eyes,
    fields.bodyType,
    fields.otherFeatures,
    fields.clothing && `服裝：${fields.clothing}`,
  ].filter(Boolean).join("\n") || "（無外貌描述）";
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/character-fs.ts && git commit -m "feat(api): port-be-5 lookupAppearance chapter-sensitive helper"`

---

### Task W1-5: character-image-extract（port-be-2）

**Files:**
- Create: `apps/api/src/services/character-image-extract.ts`

- [ ] 建立 `apps/api/src/services/character-image-extract.ts`：

```typescript
import { join } from "node:path";
import type { CharacterFields, ExtractorOutput } from "@novel-writer/shared-types";
import type { LLMRouter, RoutingPolicy } from "@novel-writer/llm-adapter";
import { buildImageExtractorRequest } from "@novel-writer/prompt-library";
import type { ImageExtractorInput } from "@novel-writer/prompt-library";
import type { PortraitScope } from "@novel-writer/shared-types";
import { readCharacter, updatePortraitFields } from "./character-fs.js";

interface ExtractOptions {
  projectPath: string;
  slug: string;
  scope: PortraitScope;
  chapterNumber: number | null;
  imagePath: string;
  storyGenre?: string;
  router: LLMRouter;
  policy: RoutingPolicy;
}

export async function extractPortraitAppearance(opts: ExtractOptions): Promise<{
  extracted: ExtractorOutput;
  writtenTo: "fields.appearance" | { chapterNumber: number };
}> {
  const { projectPath, slug, scope, chapterNumber, imagePath, storyGenre, router, policy } = opts;

  const char = await readCharacter(projectPath, slug);
  if (!char) throw Object.assign(new Error("Character not found"), { code: "CHARACTER_NOT_FOUND" });

  const input: ImageExtractorInput = {
    image: { source: { kind: "path", path: join(projectPath, imagePath) } },
    context: {
      chapterNumber,
      storyGenre,
      characterName: char.fields.name,
    },
  };

  const req = buildImageExtractorRequest(input, policy.primary);
  const response = await router.generate(req, policy);
  const text = response.text.trim().replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // One retry
    const retryReq = buildImageExtractorRequest(input, policy.primary);
    retryReq.messages.push({ role: "assistant", content: text });
    retryReq.messages.push({ role: "user", content: "請直接回傳 JSON，不要加 code fence 或說明。" });
    const retry = await router.generate(retryReq, policy);
    parsed = JSON.parse(retry.text.trim().replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1").trim());
  }

  const extracted = parsed as ExtractorOutput;

  await updatePortraitFields(projectPath, slug, (fields: CharacterFields) => {
    if (scope === "default") {
      return {
        ...fields,
        hairAndColor: extracted.hairAndColor,
        eyes: extracted.eyes,
        bodyType: extracted.bodyType,
        otherFeatures: extracted.otherFeatures,
        clothing: extracted.clothing,
      };
    }
    const n = chapterNumber!;
    const appearance = [
      `${extracted.hairAndColor}。${extracted.eyes}。${extracted.bodyType}。${extracted.otherFeatures}`,
      `服裝：${extracted.clothing}${extracted.chapterNote ? `\n\n備註：${extracted.chapterNote}` : ""}`,
    ].join("\n\n");
    return {
      ...fields,
      appearanceByChapter: { ...fields.appearanceByChapter, [n]: appearance },
    };
  });

  return {
    extracted,
    writtenTo: scope === "default" ? "fields.appearance" : { chapterNumber: chapterNumber! },
  };
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/character-image-extract.ts && git commit -m "feat(api): port-be-2 character-image-extract vision skill caller"`

---

### Task W1-6: portraits route（port-be-3/4）

**Files:**
- Create: `apps/api/src/routes/portraits.ts`
- Modify: `apps/api/src/server.ts`

- [ ] 建立 `apps/api/src/routes/portraits.ts`：

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { commitIfChanged } from "../services/commit-policy.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { readSettings } from "../services/settings-store.js";
import { buildRouter, toRouterPolicy } from "../services/router-factory.js";
import { savePortrait, deletePortrait, listPortraits } from "../services/portrait-fs.js";
import { extractPortraitAppearance } from "../services/character-image-extract.js";
import { readCharacter, updatePortraitFields } from "../services/character-fs.js";

const app = new Hono();

const extractSchema = z.object({
  scope: z.enum(["default", "chapter"]),
  chapterNumber: z.number().nullable(),
  modelOverride: z.string().optional(),
});

const deleteSchema = z.object({
  scope: z.enum(["default", "chapter"]),
  chapterNumber: z.number().nullable(),
});

// POST .../portraits  (multipart upload)
app.post("/", async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("projectHash"));
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug");

  const char = await readCharacter(projectPath, slug);
  if (!char) return c.json({ code: "CHARACTER_NOT_FOUND" }, 404);

  const formData = await c.req.formData();
  const imageFile = formData.get("image") as File | null;
  const scope = (formData.get("scope") as string) === "chapter" ? "chapter" as const : "default" as const;
  const chapterNumber = scope === "chapter" ? Number(formData.get("chapterNumber")) : null;

  if (!imageFile) return c.json({ code: "INVALID_FORMAT", message: "image field required" }, 400);

  const mime = imageFile.type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return c.json({ code: "INVALID_FORMAT", message: "only JPG/PNG/WebP accepted" }, 400);
  }
  if (imageFile.size > 10 * 1024 * 1024) {
    return c.json({ code: "FILE_TOO_LARGE" }, 400);
  }

  const buf = Buffer.from(await imageFile.arrayBuffer());
  let info: Awaited<ReturnType<typeof savePortrait>>;
  try {
    info = await savePortrait(projectPath, slug, scope, chapterNumber, buf, mime);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "INVALID_DIMENSIONS") return c.json({ code }, 400);
    throw e;
  }

  // Update portrait frontmatter
  await updatePortraitFields(projectPath, slug, (fields) => {
    if (scope === "default") {
      return { ...fields, portrait: { ...fields.portrait, default: info.path } };
    }
    return {
      ...fields,
      portrait: {
        ...fields.portrait,
        byChapter: { ...fields.portrait.byChapter, [chapterNumber!]: info.path },
      },
    };
  });

  const sha = await commitIfChanged(projectPath, "character", `upload portrait ${slug}/${scope}`);
  return c.json({ ...info, commitSha: sha?.sha ?? "" }, 201);
});

// POST .../portraits/extract
app.post("/extract", zValidator("json", extractSchema), async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("projectHash"));
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug");
  const body = c.req.valid("json");

  const char = await readCharacter(projectPath, slug);
  if (!char) return c.json({ code: "CHARACTER_NOT_FOUND" }, 404);

  const portraitPath =
    body.scope === "default"
      ? char.fields.portrait.default
      : char.fields.portrait.byChapter[body.chapterNumber ?? 0];

  if (!portraitPath) return c.json({ code: "PORTRAIT_NOT_FOUND" }, 404);

  const settings = await readSettings();
  const routingConf = settings.routing.characterImageExtractor;
  if (!routingConf) return c.json({ code: "ROUTING_NOT_CONFIGURED" }, 400);

  const effectivePolicy = body.modelOverride
    ? { primary: body.modelOverride, fallbacks: routingConf.fallbacks }
    : routingConf;

  const start = Date.now();
  const router = buildRouter(settings);
  let result: Awaited<ReturnType<typeof extractPortraitAppearance>>;
  try {
    result = await extractPortraitAppearance({
      projectPath, slug,
      scope: body.scope, chapterNumber: body.chapterNumber,
      imagePath: portraitPath,
      router, policy: toRouterPolicy(effectivePolicy),
    });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "content_blocked") return c.json({ code: "LLM_FAILED", message: "Content blocked; try local fallback" }, 502);
    return c.json({ code: "LLM_FAILED", message: String(e) }, 502);
  }

  const sha = await commitIfChanged(projectPath, "character", `extract appearance from portrait ${slug}/${body.scope}`);
  return c.json({
    extracted: result.extracted,
    writtenTo: result.writtenTo,
    modelId: effectivePolicy.primary,
    durationMs: Date.now() - start,
    commitSha: sha?.sha ?? null,
  });
});

// DELETE .../portraits
app.delete("/", zValidator("json", deleteSchema), async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("projectHash"));
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug");
  const body = c.req.valid("json");

  const deleted = await deletePortrait(projectPath, slug, body.scope, body.chapterNumber);
  if (!deleted) return c.json({ code: "PORTRAIT_NOT_FOUND" }, 404);

  await updatePortraitFields(projectPath, slug, (fields) => {
    if (body.scope === "default") {
      return { ...fields, portrait: { ...fields.portrait, default: null } };
    }
    const { [body.chapterNumber!]: _removed, ...rest } = fields.portrait.byChapter;
    void _removed;
    const { [body.chapterNumber!]: _removedApp, ...restApp } = fields.appearanceByChapter;
    void _removedApp;
    return { ...fields, portrait: { ...fields.portrait, byChapter: rest as Record<number,string> }, appearanceByChapter: restApp as Record<number,string> };
  });

  const sha = await commitIfChanged(projectPath, "character", `delete portrait ${slug}/${body.scope}`);
  return c.json({ deleted: true, commitSha: sha?.sha ?? "" });
});

// GET .../portraits
app.get("/", async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("projectHash"));
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug");
  const result = await listPortraits(projectPath, slug);
  return c.json(result);
});

export { app as portraitsRouter };
```

- [ ] 在 `server.ts` 加：
```typescript
import { portraitsRouter } from "./routes/portraits.js";
// .route 鏈加：
.route("/api/projects/:hash/characters/:slug/portraits", portraitsRouter)
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/routes/portraits.ts apps/api/src/server.ts && git commit -m "feat(api): port-be-3/4 portraits route (upload/extract/delete/list) + commit integration"`

---

### Task W1-7: settings INVALID_ROUTING 驗證（set-be-1）

**Files:**
- Modify: `apps/api/src/routes/settings.ts`

- [ ] 在 PUT handler 的 `writeSettings(incoming)` 之前加驗證：

```typescript
// 在 writeSettings 前插入
const routing = incoming.routing;
const agentKeys = ["chapterWriter", "characterCardConsolidator", "characterImageExtractor", "statusUpdater"] as const;
for (const key of agentKeys) {
  const policy = routing[key];
  if (!policy) continue;
  const { provider } = policy.primary.includes(":") ? { provider: policy.primary.split(":")[0] } : { provider: policy.primary };
  const provConfig = incoming.providers[provider as import("@novel-writer/shared-types").LLMProviderId];
  if (provConfig && !provConfig.enabled) {
    return c.json({ code: "INVALID_ROUTING", message: `Provider "${provider}" for ${key} is not enabled`, field: key }, 400);
  }
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `pnpm test --filter=@novel-writer/api` 確認全過
- [ ] `git add apps/api/src/routes/settings.ts && git commit -m "feat(api): set-be-1 INVALID_ROUTING validation on PUT /settings"`

---

## Wave 2

### Task W2-1: context-collector（gen-be-1）

**Files:**
- Create: `apps/api/src/services/context-collector.ts`

- [ ] 建立 `apps/api/src/services/context-collector.ts`：

```typescript
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChapterContext, CharacterCardInContext } from "@novel-writer/shared-types";
import { countMessageTokens } from "@novel-writer/llm-adapter";
import { listCharacters, readCharacter, lookupAppearance } from "./character-fs.js";
import { readChapter, listChapters } from "./chapter-fs.js";

async function readFileSafe(path: string): Promise<string> {
  try { return await readFile(path, "utf-8"); } catch { return ""; }
}

export interface CollectOptions {
  projectPath: string;
  chapterNumber: number;
  modelContextWindow?: number;
}

export async function collectChapterContext(opts: CollectOptions): Promise<ChapterContext> {
  const { projectPath, chapterNumber, modelContextWindow = 32768 } = opts;

  const synopsis = await readFileSafe(join(projectPath, "synopsis.md"));
  if (!synopsis.trim()) throw Object.assign(new Error("synopsis.md is empty"), { code: "MISSING_CONTEXT" });

  const writingStyle = await readFileSafe(join(projectPath, "style.md"));
  const storyStatus = await readFileSafe(join(projectPath, "status", "story_status.md"));

  // Character statuses: one file per character
  const charList = await listCharacters(projectPath);
  const characterStatuses: Record<string, string> = {};
  for (const c of charList) {
    const statusPath = join(projectPath, "characters", `${c.slug}_status.md`);
    const content = await readFileSafe(statusPath);
    if (content.trim()) characterStatuses[c.slug] = content;
  }

  // Characters with currentAppearance
  if (charList.length === 0) throw Object.assign(new Error("No characters found"), { code: "MISSING_CONTEXT" });

  const characters: CharacterCardInContext[] = [];
  for (const item of charList) {
    const char = await readCharacter(projectPath, item.slug);
    if (!char) continue;
    characters.push({
      slug: char.slug,
      name: char.fields.name,
      fields: char.fields,
      body: char.body,
      currentAppearance: lookupAppearance(char.fields, chapterNumber),
    });
  }

  // Outline from chapter prompt file
  const chapters = await listChapters(projectPath);
  const chapterEntry = chapters.find((c) => c.number === chapterNumber);
  const currentOutline: string | null = null; // TODO: read outline from dedicated file if exists

  // Previous chapter full text
  let previousChapterFullText: string | null = null;
  if (chapterNumber > 1) {
    const prev = await readChapter(projectPath, chapterNumber - 1);
    if (prev) previousChapterFullText = prev.content;
  }

  // Token gating
  const MAX_TOKENS = Math.floor(modelContextWindow * 0.75);
  const tokensEstimate = await countMessageTokens("", [
    { role: "user", content: [synopsis, storyStatus, ...Object.values(characterStatuses), ...characters.map((c) => c.body + c.currentAppearance), previousChapterFullText ?? ""].join("\n") },
  ]);

  let finalCharacters = characters;
  let finalPrevChapter = previousChapterFullText;

  if (tokensEstimate > MAX_TOKENS) {
    finalCharacters = characters.slice(0, 5);
  }
  if (tokensEstimate > MAX_TOKENS && finalPrevChapter) {
    finalPrevChapter = finalPrevChapter.slice(-2000);
  }
  if (tokensEstimate > MAX_TOKENS) {
    throw Object.assign(new Error("Context too large"), { code: "CONTEXT_TOO_LARGE" });
  }

  const contextHash = createHash("sha256")
    .update(JSON.stringify({ synopsis, writingStyle, storyStatus, characterStatuses, characters: finalCharacters, currentOutline, previousChapterFullText: finalPrevChapter }))
    .digest("hex")
    .slice(0, 12);

  return {
    synopsis,
    writingStyle,
    storyStatus,
    characterStatuses,
    characters: finalCharacters,
    currentOutline,
    previousChapterFullText: finalPrevChapter,
    contextHash,
  };
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/context-collector.ts && git commit -m "feat(api): gen-be-1 context-collector with token gating + lookupAppearance"`

---

### Task W2-2: draft-cache（gen-be-2）

**Files:**
- Create: `apps/api/src/services/draft-cache.ts`

- [ ] 建立 `apps/api/src/services/draft-cache.ts`：

```typescript
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DraftMetadata } from "@novel-writer/shared-types";
import { getDb } from "./cache-db.js";

function draftDir(projectHash: string, chapterNumber: number): string {
  const n = String(chapterNumber).padStart(4, "0");
  return join(homedir(), ".novel-writer", "cache", projectHash, "drafts", `chapter-${n}`);
}

export async function createDraft(meta: DraftMetadata): Promise<void> {
  const dir = draftDir(meta.projectHash, meta.chapterNumber);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "current.draft.md"), "", "utf-8");
  await writeFile(join(dir, "current.meta.json"), JSON.stringify(meta, null, 2), "utf-8");
  const db = await getDb(meta.projectHash);
  db.prepare(`INSERT OR REPLACE INTO drafts (draft_id,project_hash,chapter_number,status,model_id,context_hash,total_chars,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(
    meta.draftId, meta.projectHash, meta.chapterNumber, meta.status, meta.modelId, meta.contextHash, 0, meta.createdAt,
  );
}

export async function appendDraftText(projectHash: string, chapterNumber: number, text: string): Promise<void> {
  const dir = draftDir(projectHash, chapterNumber);
  await appendFile(join(dir, "current.draft.md"), text, "utf-8");
}

export async function completeDraft(projectHash: string, chapterNumber: number, draftId: string, usage: { inputTokens: number; outputTokens: number }): Promise<void> {
  const dir = draftDir(projectHash, chapterNumber);
  const text = await readFile(join(dir, "current.draft.md"), "utf-8");
  const completedAt = new Date().toISOString();
  const db = await getDb(projectHash);
  db.prepare(`UPDATE drafts SET status='complete', completed_at=?, total_chars=?, input_tokens=?, output_tokens=? WHERE draft_id=?`).run(
    completedAt, text.length, usage.inputTokens, usage.outputTokens, draftId,
  );
  const meta = JSON.parse(await readFile(join(dir, "current.meta.json"), "utf-8")) as DraftMetadata;
  await writeFile(join(dir, "current.meta.json"), JSON.stringify({ ...meta, status: "complete", completedAt, totalChars: text.length, usage }, null, 2), "utf-8");
}

export async function abortDraft(projectHash: string, chapterNumber: number, draftId: string): Promise<void> {
  const dir = draftDir(projectHash, chapterNumber);
  const text = await readFile(join(dir, "current.draft.md"), "utf-8").catch(() => "");
  const db = await getDb(projectHash);
  db.prepare(`UPDATE drafts SET status='aborted', total_chars=? WHERE draft_id=?`).run(text.length, draftId);
}

export async function readDraft(projectHash: string, chapterNumber: number): Promise<{ text: string; meta: DraftMetadata } | null> {
  const dir = draftDir(projectHash, chapterNumber);
  try {
    const [text, metaRaw] = await Promise.all([
      readFile(join(dir, "current.draft.md"), "utf-8"),
      readFile(join(dir, "current.meta.json"), "utf-8"),
    ]);
    return { text, meta: JSON.parse(metaRaw) as DraftMetadata };
  } catch {
    return null;
  }
}

export async function deleteDraft(projectHash: string, chapterNumber: number): Promise<boolean> {
  const dir = draftDir(projectHash, chapterNumber);
  try {
    await rm(dir, { recursive: true, force: true });
    const db = await getDb(projectHash);
    db.prepare(`DELETE FROM drafts WHERE project_hash=? AND chapter_number=?`).run(projectHash, chapterNumber);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/draft-cache.ts && git commit -m "feat(api): gen-be-2 draft-cache file + SQLite metadata"`

---

### Task W2-3: job-queue（gen-be-3）

**Files:**
- Create: `apps/api/src/services/job-queue.ts`

- [ ] 建立 `apps/api/src/services/job-queue.ts`：

```typescript
import PQueue from "p-queue";

const QUEUES = new Map<string, PQueue>();

export function getProjectQueue(projectHash: string): PQueue {
  if (!QUEUES.has(projectHash)) {
    QUEUES.set(projectHash, new PQueue({ concurrency: 1 }));
  }
  return QUEUES.get(projectHash)!;
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/services/job-queue.ts && git commit -m "feat(api): gen-be-3 job-queue per-project FIFO"`

---

### Task W2-4: generate SSE route（gen-be-4/5/6）

**Files:**
- Create: `apps/api/src/routes/generate.ts`
- Create: `apps/api/src/routes/draft.ts`
- Modify: `apps/api/src/server.ts`

- [ ] 建立 `apps/api/src/routes/generate.ts`：

```typescript
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { resolveProjectPath } from "../services/project-resolver.js";
import { readSettings } from "../services/settings-store.js";
import { buildRouter, toRouterPolicy } from "../services/router-factory.js";
import { collectChapterContext } from "../services/context-collector.js";
import { createDraft, appendDraftText, completeDraft, abortDraft } from "../services/draft-cache.js";
import { getProjectQueue } from "../services/job-queue.js";
import { buildChapterWriterRequest } from "@novel-writer/prompt-library";
import { listChapters, readChapter } from "../services/chapter-fs.js";

const generateSchema = z.object({
  agentName: z.literal("chapter-writer"),
  modelOverride: z.string().optional(),
  userIntent: z.string().optional(),
});

const app = new Hono();

app.post("/", zValidator("json", generateSchema), async (c) => {
  const projectHash = c.req.param("projectHash");
  const chapterNumber = Number(c.req.param("chapterNumber"));

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  const chapters = await listChapters(projectPath);
  const chapter = chapters.find((ch) => ch.number === chapterNumber);
  if (!chapter) return c.json({ code: "INVALID_CHAPTER" }, 400);

  const settings = await readSettings();
  const routingConf = settings.routing.chapterWriter;
  if (!routingConf) return c.json({ code: "ROUTING_NOT_CONFIGURED", message: "chapter-writer routing not configured" }, 400);

  const effectivePrimary = c.req.valid("json").modelOverride ?? routingConf.primary;
  const policy = toRouterPolicy({ ...routingConf, primary: effectivePrimary });

  return streamSSE(c, async (stream) => {
    const queue = getProjectQueue(projectHash);

    await queue.add(async () => {
      const draftId = randomUUID();
      const abortController = new AbortController();
      stream.onAbort(() => abortController.abort());

      let context: Awaited<ReturnType<typeof collectChapterContext>>;
      try {
        context = await collectChapterContext({ projectPath, chapterNumber });
      } catch (e: unknown) {
        const code = (e as { code?: string }).code ?? "MISSING_CONTEXT";
        await stream.writeSSE({ event: "error", data: JSON.stringify({ code, message: String(e), retryable: false }) });
        return;
      }

      await createDraft({
        draftId, projectHash, chapterNumber, chapterTitle: chapter.title,
        agentName: "chapter-writer", modelId: policy.primary,
        contextHash: context.contextHash, status: "running",
        createdAt: new Date().toISOString(), totalChars: 0,
      });

      await stream.writeSSE({ event: "started", data: JSON.stringify({ draftId, model: policy.primary, contextHash: context.contextHash }) });

      const req = buildChapterWriterRequest({
        context,
        chapterNumber,
        chapterTitle: chapter.title,
        userIntent: c.req.valid("json").userIntent,
      }, policy.primary);
      req.abortSignal = abortController.signal;

      const router = buildRouter(settings);
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        for await (const chunk of router.stream(req, policy)) {
          if (chunk.type === "text") {
            await appendDraftText(projectHash, chapterNumber, chunk.text);
            await stream.writeSSE({ event: "chunk", data: JSON.stringify({ text: chunk.text }) });
          } else if (chunk.type === "usage") {
            inputTokens = chunk.usage.inputTokens;
            outputTokens = chunk.usage.outputTokens;
            await stream.writeSSE({ event: "usage", data: JSON.stringify(chunk.usage) });
          } else if (chunk.type === "degraded") {
            await stream.writeSSE({ event: "degraded", data: JSON.stringify({ fromModel: chunk.fromModel, toModel: chunk.toModel, reason: "fallback" }) });
          } else if (chunk.type === "finish") {
            if (chunk.finishReason === "abort") {
              await abortDraft(projectHash, chapterNumber, draftId);
              return;
            }
          }
        }
        await completeDraft(projectHash, chapterNumber, draftId, { inputTokens, outputTokens });
        const draft = await import("../services/draft-cache.js").then((m) => m.readDraft(projectHash, chapterNumber));
        await stream.writeSSE({ event: "complete", data: JSON.stringify({ draftId, totalChars: draft?.text.length ?? 0, durationMs: 0 }) });
      } catch (e: unknown) {
        await abortDraft(projectHash, chapterNumber, draftId);
        const err = e as { code?: string; message?: string; retryable?: boolean };
        await stream.writeSSE({ event: "error", data: JSON.stringify({ code: err.code ?? "UNKNOWN", message: err.message ?? String(e), retryable: err.retryable ?? false }) });
      }
    });
  });
});

export { app as generateRouter };
```

- [ ] 建立 `apps/api/src/routes/draft.ts`：

```typescript
import { Hono } from "hono";
import { resolveProjectPath } from "../services/project-resolver.js";
import { readDraft, deleteDraft } from "../services/draft-cache.js";

const app = new Hono();

app.get("/", async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("projectHash"));
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const chapterNumber = Number(c.req.param("chapterNumber"));
  const result = await readDraft(c.req.param("projectHash"), chapterNumber);
  if (!result) return c.json({ code: "NO_DRAFT" }, 404);
  return c.json({
    draftId: result.meta.draftId,
    text: result.text,
    status: result.meta.status,
    contextHash: result.meta.contextHash,
    createdAt: result.meta.createdAt,
    totalChars: result.text.length,
  });
});

app.delete("/", async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("projectHash"));
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const chapterNumber = Number(c.req.param("chapterNumber"));
  const deleted = await deleteDraft(c.req.param("projectHash"), chapterNumber);
  if (!deleted) return c.json({ code: "NO_DRAFT" }, 404);
  return c.json({ deleted: true });
});

export { app as draftRouter };
```

- [ ] 在 `server.ts` 加：
```typescript
import { generateRouter } from "./routes/generate.js";
import { draftRouter } from "./routes/draft.js";

// .route 鏈加：
.route("/api/projects/:hash/chapters/:chapterNumber/generate", generateRouter)
.route("/api/projects/:hash/chapters/:chapterNumber/draft", draftRouter)
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/api/src/routes/generate.ts apps/api/src/routes/draft.ts apps/api/src/server.ts && git commit -m "feat(api): gen-be-4/5/6 SSE generate + draft GET/DELETE routes"`

---

## Wave 2（前端）

### Task W2-5: settings AgentRoutingCard + PresetButtons（set-fe-1/2/3/4）

**Files:**
- Create: `apps/web/src/features/settings/AgentRoutingCard.tsx`
- Create: `apps/web/src/features/settings/PresetButtons.tsx`
- Create: `apps/web/src/features/settings/LlmNotConfiguredModal.tsx`
- Modify: `apps/web/src/features/settings/SettingsPage.tsx`

- [ ] 建立 `AgentRoutingCard.tsx`：

```tsx
import { Select } from "@radix-ui/react-select";

interface Props {
  agentLabel: string;
  agentKey: string;
  models: string[];
  primary: string;
  onPrimaryChange: (value: string) => void;
}

export function AgentRoutingCard({ agentLabel, models, primary, onPrimaryChange }: Props) {
  return (
    <div className="rounded-lg border border-neutral-700 p-4 space-y-2">
      <p className="text-sm font-medium text-neutral-200">{agentLabel}</p>
      <select
        value={primary}
        onChange={(e) => onPrimaryChange(e.target.value)}
        className="w-full rounded border border-neutral-600 bg-neutral-800 text-sm text-neutral-100 px-2 py-1.5"
      >
        <option value="">未設定</option>
        {models.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] 建立 `PresetButtons.tsx`：

```tsx
const PRESETS = [
  {
    label: "全雲端 Haiku",
    values: {
      chapterWriter: "anthropic:claude-haiku-4-5",
      characterCardConsolidator: "anthropic:claude-haiku-4-5",
      characterImageExtractor: "anthropic:claude-sonnet-4-6",
      statusUpdater: "anthropic:claude-haiku-4-5",
    },
  },
  {
    label: "Cloud + 地端 fallback",
    values: {
      chapterWriter: "anthropic:claude-sonnet-4-6",
      characterCardConsolidator: "anthropic:claude-haiku-4-5",
      characterImageExtractor: "anthropic:claude-sonnet-4-6",
      statusUpdater: "anthropic:claude-haiku-4-5",
    },
  },
  {
    label: "全地端 Qwen",
    values: {
      chapterWriter: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      characterCardConsolidator: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      characterImageExtractor: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      statusUpdater: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
    },
  },
  {
    label: "測試版 RWKV",
    values: {
      chapterWriter: "ollama:qwen2.5:14b",
      characterCardConsolidator: "ollama:qwen2.5:7b",
      characterImageExtractor: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus",
      statusUpdater: "ollama:qwen2.5:7b",
    },
  },
];

interface Props {
  onApply: (values: Record<string, string>) => void;
}

export function PresetButtons({ onApply }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onApply(preset.values)}
          className="rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] 建立 `LlmNotConfiguredModal.tsx`：

```tsx
import { useNavigate } from "react-router-dom";

interface Props {
  agentName: string;
  open: boolean;
  onClose: () => void;
}

export function LlmNotConfiguredModal({ agentName, open, onClose }: Props) {
  const navigate = useNavigate();
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-xl p-6 max-w-sm w-full space-y-4">
        <h2 className="text-lg font-semibold text-neutral-100">LLM 路由未設定</h2>
        <p className="text-sm text-neutral-300">
          請先到設定頁設定 <strong>{agentName}</strong> 的預設模型，才能使用此功能。
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-200">取消</button>
          <button
            onClick={() => { navigate("/settings"); onClose(); }}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500"
          >
            前往設定頁
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/web/src/features/settings/ && git commit -m "feat(web): set-fe-1~4 AgentRoutingCard + PresetButtons + LlmNotConfiguredModal"`

---

### Task W2-6: CharacterPanel + CharacterEditor（char-fe-1~8）

**Files:**
- Create: `apps/web/src/features/characters/CharacterPanel.tsx`
- Create: `apps/web/src/features/characters/CharacterEditor.tsx`
- Create: `apps/web/src/features/characters/PersonalityTagInput.tsx`

- [ ] 建立 `CharacterPanel.tsx`（列表 + 新增按鈕）：

```tsx
import { useState, useEffect } from "react";
import type { CharacterListItem } from "@novel-writer/shared-types";

interface Props {
  projectHash: string;
  onSelect: (slug: string) => void;
}

export function CharacterPanel({ projectHash, onSelect }: Props) {
  const [characters, setCharacters] = useState<CharacterListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectHash}/characters`)
      .then((r) => r.json())
      .then((data: { characters: CharacterListItem[] }) => setCharacters(data.characters))
      .finally(() => setLoading(false));
  }, [projectHash]);

  if (loading) return <div className="p-4 text-neutral-400 text-sm">載入中…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <h2 className="text-sm font-semibold text-neutral-200">角色</h2>
        <button
          onClick={() => onSelect("__new__")}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          + 新增
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {characters.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">尚無角色。點「新增」建立第一個角色。</p>
        )}
        {characters.map((c) => (
          <button
            key={c.slug}
            onClick={() => onSelect(c.slug)}
            className="w-full text-left px-4 py-3 hover:bg-neutral-800 border-b border-neutral-800 transition-colors"
          >
            <p className="text-sm text-neutral-100">{c.name}</p>
            <p className="text-xs text-neutral-400 truncate">{c.oneLineSummary || c.role || ""}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] 建立 `PersonalityTagInput.tsx`（chip-style）：

```tsx
import { useState } from "react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function PersonalityTagInput({ tags, onChange }: Props) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-900/50 border border-indigo-700 px-2.5 py-0.5 text-xs text-indigo-200">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="ml-0.5 text-indigo-400 hover:text-indigo-200">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="輸入標籤後按 Enter"
          className="flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
        <button onClick={add} className="rounded bg-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-600">新增</button>
      </div>
    </div>
  );
}
```

- [ ] 建立 `CharacterEditor.tsx`（六分區 tabs + AI 生成 + manuallyEdited warning）：此檔較長，核心結構如下：

```tsx
import { useState } from "react";
import type { CharacterFields } from "@novel-writer/shared-types";
import { PersonalityTagInput } from "./PersonalityTagInput";

const TABS = ["身分", "個性", "外貌", "對話", "關係", "親密"] as const;
type Tab = typeof TABS[number];

interface Props {
  projectHash: string;
  slug: string | null; // null = new
  onSave: () => void;
  onClose: () => void;
}

export function CharacterEditor({ projectHash, slug, onSave, onClose }: Props) {
  const isNew = slug === null || slug === "__new__";
  const [activeTab, setActiveTab] = useState<Tab>("身分");
  const [fields, setFields] = useState<CharacterFields>({
    name: "", age: null, gender: null, pronoun: null, role: null,
    personalityTags: [], mbti: null, zodiac: null, bloodType: null, culturalBackground: null,
    heightCm: null, bodyType: null, hairAndColor: null, eyes: null, otherFeatures: null, clothing: null,
    portrait: { default: null, byChapter: {} }, appearanceByChapter: {},
    dialoguePace: null, wordingPreference: null, writingAvoid: null, relations: null, intimateAppendix: null,
    consolidatedAt: null, consolidatedBy: null, manuallyEdited: false,
  });
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [intimateOpen, setIntimateOpen] = useState(false);

  const upd = (patch: Partial<CharacterFields>) => setFields((f) => ({ ...f, ...patch }));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("consolidate failed");
      const data = await res.json() as { body: string };
      setBody(data.body);
      upd({ manuallyEdited: false });
    } catch {
      // keep old body
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? `/api/projects/${projectHash}/characters` : `/api/projects/${projectHash}/characters/${slug}`;
      const payload = isNew ? { name: fields.name, fields, consolidate: false } : { fields, body };
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-neutral-700">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${activeTab === t ? "text-indigo-400 border-b-2 border-indigo-500" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "身分" && (
          <>
            <Field label="姓名 *">
              <input value={fields.name} onChange={(e) => upd({ name: e.target.value })} className="input-base" />
            </Field>
            <Field label="角色定位">
              <select value={fields.role ?? ""} onChange={(e) => upd({ role: e.target.value || null })} className="select-base">
                <option value="">未設定</option>
                {["主角","配角","反派","重要路人"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="年齡">
              <input type="number" value={fields.age ?? ""} onChange={(e) => upd({ age: e.target.value ? Number(e.target.value) : null })} className="input-base w-24" />
            </Field>
          </>
        )}
        {activeTab === "個性" && (
          <>
            <Field label="個性標籤">
              <PersonalityTagInput tags={fields.personalityTags} onChange={(tags) => upd({ personalityTags: tags })} />
            </Field>
            <Field label="MBTI">
              <select value={fields.mbti ?? ""} onChange={(e) => upd({ mbti: (e.target.value || null) as CharacterFields["mbti"] })} className="select-base">
                <option value="">未設定</option>
                {["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </>
        )}
        {/* 其餘 tab 依同樣模式實作 */}
      </div>

      {/* Body + AI generate */}
      <div className="border-t border-neutral-700 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-neutral-400">AI 統整敘述</label>
          {fields.manuallyEdited && <span className="text-xs text-amber-400">⚠ 下次 AI 生成將覆蓋你的修改</span>}
        </div>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); upd({ manuallyEdited: true }); }}
          rows={5}
          className="w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 resize-none"
        />
        <button
          onClick={handleGenerate}
          disabled={generating || isNew}
          className="rounded bg-indigo-700 px-3 py-1.5 text-xs text-white hover:bg-indigo-600 disabled:opacity-40"
        >
          {generating ? "生成中…" : "AI 生成角色描述"}
        </button>
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-2 p-4 border-t border-neutral-700">
        <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-200">取消</button>
        <button onClick={handleSave} disabled={saving} className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-40">
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-neutral-400">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/web/src/features/characters/ && git commit -m "feat(web): char-fe-1~8 CharacterPanel + CharacterEditor + PersonalityTagInput"`

---

## Wave 3

### Task W3-1: SSE client（gen-fe-1）

**Files:**
- Create: `apps/web/src/lib/sse-client.ts`

- [ ] 建立 `apps/web/src/lib/sse-client.ts`：

```typescript
export interface SseCallbacks {
  onStarted?: (data: { draftId: string; model: string; contextHash: string }) => void;
  onChunk?: (text: string) => void;
  onUsage?: (data: { inputTokens: number; outputTokens: number }) => void;
  onDegraded?: (data: { fromModel: string; toModel: string }) => void;
  onComplete?: (data: { draftId: string; totalChars: number; durationMs: number }) => void;
  onError?: (data: { code: string; message: string; retryable: boolean }) => void;
}

export function connectSse(url: string, body: unknown, callbacks: SseCallbacks): () => void {
  const controller = new AbortController();

  (async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const eventMatch = part.match(/^event: (.+)$/m);
        const dataMatch = part.match(/^data: (.+)$/m);
        if (!eventMatch || !dataMatch) continue;
        const event = eventMatch[1]!;
        const data = JSON.parse(dataMatch[1]!);
        if (event === "started") callbacks.onStarted?.(data);
        else if (event === "chunk") callbacks.onChunk?.(data.text);
        else if (event === "usage") callbacks.onUsage?.(data);
        else if (event === "degraded") callbacks.onDegraded?.(data);
        else if (event === "complete") callbacks.onComplete?.(data);
        else if (event === "error") callbacks.onError?.(data);
      }
    }
  })().catch((e: unknown) => {
    if (!(e instanceof Error && e.name === "AbortError")) {
      callbacks.onError?.({ code: "NETWORK", message: String(e), retryable: true });
    }
  });

  return () => controller.abort();
}
```

- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/web/src/lib/sse-client.ts && git commit -m "feat(web): gen-fe-1 SSE client with abort + event routing"`

---

### Task W3-2: DraftPanel + GenerateButton（gen-fe-2/3/4/5/6）

**Files:**
- Create: `apps/web/src/features/editor/DraftPanel.tsx`
- Create: `apps/web/src/lib/draft-store.ts`
- Modify: `apps/web/src/features/editor/ChapterEditorPage.tsx`

- [ ] 建立 `apps/web/src/lib/draft-store.ts`：

```typescript
import { create } from "zustand";

type DraftStatus = "idle" | "streaming" | "complete" | "aborted" | "errored";

interface DraftStore {
  status: DraftStatus;
  text: string;
  draftId: string | null;
  modelId: string | null;
  degradedTo: string | null;
  abort: (() => void) | null;
  setStatus: (s: DraftStatus) => void;
  appendText: (t: string) => void;
  reset: () => void;
  setAbort: (fn: () => void) => void;
  setDraftId: (id: string) => void;
  setModel: (id: string) => void;
  setDegradedTo: (id: string) => void;
}

export const useDraftStore = create<DraftStore>((set) => ({
  status: "idle",
  text: "",
  draftId: null,
  modelId: null,
  degradedTo: null,
  abort: null,
  setStatus: (status) => set({ status }),
  appendText: (t) => set((s) => ({ text: s.text + t })),
  reset: () => set({ status: "idle", text: "", draftId: null, modelId: null, degradedTo: null, abort: null }),
  setAbort: (fn) => set({ abort: fn }),
  setDraftId: (draftId) => set({ draftId }),
  setModel: (modelId) => set({ modelId }),
  setDegradedTo: (degradedTo) => set({ degradedTo }),
}));
```

- [ ] 建立 `apps/web/src/features/editor/DraftPanel.tsx`：

```tsx
import { useEffect, useRef } from "react";
import { useDraftStore } from "../../lib/draft-store";

interface Props { projectHash: string; chapterNumber: number; }

export function DraftPanel({ projectHash, chapterNumber }: Props) {
  const { status, text, modelId, degradedTo, abort, reset } = useDraftStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  // Restore draft on mount
  useEffect(() => {
    if (status !== "idle") return;
    fetch(`/api/projects/${projectHash}/chapters/${chapterNumber}/draft`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { text: string; status: string; draftId: string } | null) => {
        if (data && data.text) {
          useDraftStore.setState({ text: data.text, status: data.status as "complete" | "aborted", draftId: data.draftId });
        }
      })
      .catch(() => {});
  }, [projectHash, chapterNumber, status]);

  if (status === "idle") return null;

  return (
    <div className="flex flex-col h-full border-l border-neutral-700 bg-neutral-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
        <span className="text-xs text-neutral-400">
          AI 草稿{" "}
          {status === "streaming" && <span className="text-indigo-400">串流中…</span>}
          {status === "complete" && <span className="text-green-400">完成</span>}
          {status === "aborted" && <span className="text-amber-400">已中止</span>}
        </span>
        {degradedTo && <span className="text-xs text-amber-300">已切換到地端模型 {degradedTo}</span>}
        {modelId && <span className="text-xs text-neutral-500">{modelId}</span>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-serif text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
        {text || <span className="text-neutral-500">等待串流…</span>}
      </div>

      <div className="flex gap-2 p-3 border-t border-neutral-700">
        {status === "streaming" && (
          <button onClick={() => abort?.()} className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700">
            中止
          </button>
        )}
        {(status === "complete" || status === "aborted") && (
          <>
            <button
              onClick={async () => {
                await fetch(`/api/projects/${projectHash}/chapters/${chapterNumber}/draft`, { method: "DELETE" });
                reset();
              }}
              className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              丟棄
            </button>
            <button className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700">
              重產出
            </button>
            <button
              disabled
              title="採用功能將在下一版啟用"
              className="rounded bg-indigo-800 px-3 py-1.5 text-xs text-indigo-300 opacity-50 cursor-not-allowed"
            >
              採用（下版啟用）
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] 建立 `apps/web/src/features/editor/GenerateButton.tsx`：

```tsx
import { connectSse } from "../../lib/sse-client";
import { useDraftStore } from "../../lib/draft-store";

interface Props { projectHash: string; chapterNumber: number; }

export function GenerateButton({ projectHash, chapterNumber }: Props) {
  const { status, setStatus, appendText, setAbort, setDraftId, setModel, setDegradedTo, reset } = useDraftStore();
  const isStreaming = status === "streaming";

  const handleGenerate = () => {
    reset();
    setStatus("streaming");
    const abortFn = connectSse(
      `/api/projects/${projectHash}/chapters/${chapterNumber}/generate`,
      { agentName: "chapter-writer" },
      {
        onStarted: (d) => { setDraftId(d.draftId); setModel(d.model); },
        onChunk: (text) => appendText(text),
        onDegraded: (d) => setDegradedTo(d.toModel),
        onComplete: () => setStatus("complete"),
        onError: () => setStatus("errored"),
      },
    );
    setAbort(() => { abortFn(); setStatus("aborted"); });
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={isStreaming}
      className="flex items-center gap-1.5 rounded border border-indigo-700 bg-indigo-900/50 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-800/60 disabled:opacity-40 transition-colors"
    >
      {isStreaming ? "AI 撰寫中…" : "AI 撰寫本章"}
    </button>
  );
}
```

- [ ] 在 `ChapterEditorPage.tsx` 加入 `<DraftPanel>` 並排 + `<GenerateButton>` 在工具列（具體整合點要 Read 現有檔案後決定位置）
- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/web/src/features/editor/ apps/web/src/lib/draft-store.ts apps/web/src/lib/sse-client.ts && git commit -m "feat(web): gen-fe-1~6 DraftPanel + GenerateButton + SSE client + draft store"`

---

### Task W3-3: PortraitSection + 圖片前端（port-fe-1~8）

**Files:**
- Create: `apps/web/src/features/characters/PortraitSection.tsx`
- Create: `apps/web/src/features/characters/DefaultPortraitCard.tsx`
- Create: `apps/web/src/features/characters/ChapterPortraitList.tsx`

- [ ] 建立 `PortraitSection.tsx`（外框，並列圖片與文字外貌區）：

```tsx
import { DefaultPortraitCard } from "./DefaultPortraitCard";
import { ChapterPortraitList } from "./ChapterPortraitList";

interface Props { projectHash: string; slug: string; }

export function PortraitSection({ projectHash, slug }: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">外貌（圖片）</h3>
      <DefaultPortraitCard projectHash={projectHash} slug={slug} />
      <ChapterPortraitList projectHash={projectHash} slug={slug} />
    </div>
  );
}
```

- [ ] 建立 `DefaultPortraitCard.tsx`（上傳 / 解析 / 刪除 + confidence ⚠️）：

```tsx
import { useState, useRef } from "react";

interface Props { projectHash: string; slug: string; }

export function DefaultPortraitCard({ projectHash, slug }: Props) {
  const [imgPath, setImgPath] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("只接受 JPG / PNG / WebP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) { alert("圖片不能超過 10 MB"); return; }
    const form = new FormData();
    form.append("image", file);
    form.append("scope", "default");
    const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/portraits`, { method: "POST", body: form });
    if (res.ok) {
      const data = await res.json() as { path: string };
      setImgPath(data.path);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    setDegraded(false);
    try {
      const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/portraits/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "default", chapterNumber: null }),
      });
      if (!res.ok) throw new Error("extract failed");
      // TODO: show extracted fields in parent
    } catch { /* show error toast */ }
    finally { setExtracting(false); }
  };

  return (
    <div className="rounded-lg border border-neutral-700 p-4 space-y-3">
      <p className="text-xs font-medium text-neutral-300">預設圖片</p>
      {degraded && <p className="text-xs text-amber-300">⚠ 已切換到地端模型</p>}
      {imgPath ? (
        <div className="relative group">
          <img src={`/project-file/${imgPath}`} alt="portrait" className="rounded w-32 h-32 object-cover" />
          <button onClick={() => setImgPath(null)} className="absolute top-1 right-1 hidden group-hover:flex rounded bg-black/60 p-1 text-xs text-white">刪除</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} className="rounded border border-dashed border-neutral-600 px-4 py-3 text-xs text-neutral-400 hover:border-neutral-400 w-full">
          上傳預設圖
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      {imgPath && (
        <button onClick={handleExtract} disabled={extracting} className="rounded border border-indigo-700 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40">
          {extracting ? "解析中…" : "從圖解析"}
        </button>
      )}
    </div>
  );
}
```

- [ ] 建立 `ChapterPortraitList.tsx`（章節版本 + 新增按鈕）：精簡版，只列已有圖片 + 一個「為章節新增照片」按鈕（選章節 → upload）
- [ ] `pnpm typecheck` 確認綠
- [ ] `git add apps/web/src/features/characters/ && git commit -m "feat(web): port-fe-1~8 PortraitSection + DefaultPortraitCard + ChapterPortraitList"`

---

## Wave 4 QA

### Task W4-1: slug unit tests 矩陣（qa-4）

已包含在 T1。確認 `character-slug.test.ts` 覆蓋中文 / 拉丁 / 特殊字元 / reserved 四類。

### Task W4-2: portrait-fs unit tests（qa-7）

**Files:**
- Create: `apps/api/src/services/portrait-fs.test.ts`

- [ ] 建立測試（mock sharp）：

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("sharp", () => {
  const chain = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, format: "jpeg" }),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("img")),
  };
  return { default: vi.fn(() => chain) };
});

import { savePortrait, deletePortrait, listPortraits } from "./portrait-fs.js";

describe("portrait-fs", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = join(tmpdir(), `portrait-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it("save creates file at correct path", async () => {
    const result = await savePortrait(tmpDir, "蘇晴", "default", null, Buffer.from("test"), "image/jpeg");
    expect(result.path).toContain("_assets/蘇晴/default.jpg");
  });

  it("delete removes existing portrait", async () => {
    await savePortrait(tmpDir, "蘇晴", "default", null, Buffer.from("test"), "image/jpeg");
    const deleted = await deletePortrait(tmpDir, "蘇晴", "default", null);
    expect(deleted).toBe(true);
  });

  it("chapter portrait uses padded number", async () => {
    const result = await savePortrait(tmpDir, "蘇晴", "chapter", 1, Buffer.from("test"), "image/jpeg");
    expect(result.path).toContain("chapter_0001.jpg");
  });
});
```

- [ ] `pnpm test --filter=@novel-writer/api 2>&1 | grep portrait-fs`
- [ ] `git add apps/api/src/services/portrait-fs.test.ts && git commit -m "test(api): qa-7 portrait-fs unit tests with mocked sharp"`

---

### Task W4-3: lookupAppearance tests（qa-9）

**Files:**
- Create: `apps/api/src/services/lookupAppearance.test.ts`

- [ ] 建立測試：

```typescript
import { describe, expect, it } from "vitest";
import { lookupAppearance } from "./character-fs.js";
import type { CharacterFields } from "@novel-writer/shared-types";

function makeFields(overrides: Partial<CharacterFields> = {}): CharacterFields {
  return {
    name: "蘇晴", age: null, gender: null, pronoun: null, role: null,
    personalityTags: [], mbti: null, zodiac: null, bloodType: null, culturalBackground: null,
    heightCm: null, bodyType: null, hairAndColor: "黑色長髮", eyes: null, otherFeatures: null, clothing: null,
    portrait: { default: null, byChapter: {} },
    appearanceByChapter: {},
    dialoguePace: null, wordingPreference: null, writingAvoid: null, relations: null, intimateAppendix: null,
    consolidatedAt: null, consolidatedBy: null, manuallyEdited: false,
    ...overrides,
  };
}

describe("lookupAppearance", () => {
  it("returns flat fields when no byChapter entries", () => {
    const result = lookupAppearance(makeFields({ hairAndColor: "黑色長髮" }), 3);
    expect(result).toContain("黑色長髮");
  });

  it("returns latest chapter ≤ N", () => {
    const fields = makeFields({ appearanceByChapter: { 1: "第1章外貌", 3: "第3章外貌" } });
    expect(lookupAppearance(fields, 3)).toBe("第3章外貌");
    expect(lookupAppearance(fields, 2)).toBe("第1章外貌");
    expect(lookupAppearance(fields, 5)).toBe("第3章外貌");
  });

  it("falls back to flat fields when no entry ≤ N", () => {
    const fields = makeFields({ appearanceByChapter: { 5: "第5章外貌" }, hairAndColor: "棕色短髮" });
    expect(lookupAppearance(fields, 3)).toContain("棕色短髮");
  });
});
```

- [ ] `pnpm test --filter=@novel-writer/api 2>&1 | grep lookupAppearance`
- [ ] `git add apps/api/src/services/lookupAppearance.test.ts && git commit -m "test(api): qa-9 lookupAppearance chapter-sensitive unit tests"`

---

### Task W4-4: chapter-writer prompt golden test（qa-5）

**Files:**
- Create: `packages/prompt-library/src/prompts/chapter-writer.golden.test.ts`

- [ ] 建立 golden test：

```typescript
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildChapterWriterRequest } from "./chapter-writer.js";
import type { ChapterContext } from "@novel-writer/shared-types";

const FIXTURE_CONTEXT: ChapterContext = {
  synopsis: "現代都市愛情故事，蘇晴與林書言因一場避雨相識。",
  writingStyle: "",
  storyStatus: "第一章開始，兩人初次見面。",
  characterStatuses: { "蘇晴": "情緒平靜，對林書言有初步好奇。" },
  characters: [{
    slug: "蘇晴", name: "蘇晴",
    fields: { name: "蘇晴", age: 30, gender: "female", pronoun: "她", role: "主角", personalityTags: ["內向"], mbti: "INFJ", zodiac: null, bloodType: null, culturalBackground: null, heightCm: 165, bodyType: null, hairAndColor: "黑色長髮", eyes: null, otherFeatures: null, clothing: null, portrait: { default: null, byChapter: {} }, appearanceByChapter: {}, dialoguePace: "慢", wordingPreference: null, writingAvoid: null, relations: null, intimateAppendix: null, consolidatedAt: null, consolidatedBy: null, manuallyEdited: false },
    body: "蘇晴是個內向的女作家。",
    currentAppearance: "黑色長髮，平日綁低馬尾。",
  }],
  currentOutline: null,
  previousChapterFullText: null,
  contextHash: "abc123",
};

describe("chapter-writer prompt golden test", () => {
  it("produces stable hash across 5 runs", () => {
    const hashes = Array.from({ length: 5 }, () => {
      const req = buildChapterWriterRequest({ context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" }, "anthropic:claude-sonnet-4-6");
      return createHash("sha256").update(req.systemPrompt + req.messages[0]!.content).digest("hex");
    });
    expect(new Set(hashes).size).toBe(1);
  });

  it("system prompt contains currentAppearance rule", () => {
    const req = buildChapterWriterRequest({ context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" }, "anthropic:claude-sonnet-4-6");
    expect(req.systemPrompt).toContain("currentAppearance");
  });

  it("inserts style.md when non-empty", () => {
    const ctxWithStyle = { ...FIXTURE_CONTEXT, writingStyle: "風格：細膩寫實，第三人稱限制視角。" };
    const req = buildChapterWriterRequest({ context: ctxWithStyle, chapterNumber: 1, chapterTitle: "梅雨初晴" }, "anthropic:claude-sonnet-4-6");
    expect(req.systemPrompt).toContain("寫作風格指南");
    expect(req.systemPrompt).toContain("細膩寫實");
  });

  it("skips style section when writingStyle is empty", () => {
    const req = buildChapterWriterRequest({ context: FIXTURE_CONTEXT, chapterNumber: 1, chapterTitle: "梅雨初晴" }, "anthropic:claude-sonnet-4-6");
    expect(req.systemPrompt).not.toContain("寫作風格指南");
  });
});
```

- [ ] `pnpm test --filter=@novel-writer/prompt-library 2>&1 | grep golden`
- [ ] `git add packages/prompt-library/src/prompts/chapter-writer.golden.test.ts && git commit -m "test(prompts): qa-5 chapter-writer prompt golden + hash stability"`

---

## 最終驗收

- [ ] `pnpm typecheck` 全綠
- [ ] `pnpm test` 全過（預估總測試數 ≥ 80）
- [ ] 手動跑 demo walk-through 步驟 1-9（依 M2 brief）
- [ ] `git push origin feat/m2-llm-adapter-vision`
