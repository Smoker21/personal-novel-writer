# M1-A Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 M1-A 基礎層：shared-types 四個模組、settings 後端與前端、git 後端與啟動 UI、MSW mock 系統。

**Architecture:** 依賴序建構（型別 → 後端 → 前端）；MSW 同時支援單元測試與 dev 模式 mock。

**Tech Stack:** TypeScript、Hono、zod、vitest、React 18、Zustand、MSW、Tailwind v4

---

## 檔案地圖

| 動作 | 路徑 | 負責 |
|---|---|---|
| CREATE | `packages/shared-types/src/project.ts` | Project / RecentProject 型別 |
| CREATE | `packages/shared-types/src/settings.ts` | AppSettings / ProviderConfig 型別 |
| CREATE | `packages/shared-types/src/git.ts` | GitStatus / GitFileChange 型別 |
| CREATE | `packages/shared-types/src/chapter.ts` | Chapter + countChars() |
| MODIFY | `packages/shared-types/src/index.ts` | 統一 re-export |
| CREATE | `apps/api/src/services/provider-tester.ts` | 7 providers 連線測試 |
| CREATE | `apps/api/src/services/commit-policy.ts` | commit timing + commitIfChanged |
| CREATE | `apps/api/src/services/git-status-parser.ts` | --porcelain=v2 parser |
| CREATE | `apps/api/src/routes/settings.ts` | 5 個 settings endpoints |
| CREATE | `apps/api/src/routes/git.ts` | 2 個 git endpoints |
| MODIFY | `apps/api/src/server.ts` | 註冊新 routes |
| CREATE | `apps/web/src/features/settings/SettingsPage.tsx` | 設定頁主元件 |
| CREATE | `apps/web/src/features/settings/ProviderCard.tsx` | 單一 provider 卡片 |
| CREATE | `apps/web/src/features/settings/ApiKeyField.tsx` | 遮蔽/顯示切換 |
| CREATE | `apps/web/src/features/startup/GitMissingDialog.tsx` | git 未裝阻擋對話框 |
| CREATE | `apps/web/src/features/startup/ConflictBanner.tsx` | Drive 同步衝突 banner |
| CREATE | `apps/web/src/mocks/handlers.ts` | MSW handlers |
| CREATE | `apps/web/src/mocks/browser.ts` | dev 模式 MSW |
| CREATE | `apps/web/src/mocks/server.ts` | vitest MSW |
| CREATE | `apps/web/src/mocks/fixtures/settings.ts` | settings 範例資料 |
| CREATE | `apps/web/src/mocks/fixtures/git-status.ts` | git status 範例資料 |
| MODIFY | `apps/web/src/app.tsx` | 加入路由 + startup 流程 |
| CREATE | `apps/web/src/router.tsx` | react-router 設定 |
| CREATE | `apps/web/vitest.config.ts` | vitest 配置（含 MSW setup） |
| MODIFY | `apps/web/package.json` | 加入 msw、react-router-dom |

---

## Task 1：shared-types

**Files:**
- Create: `packages/shared-types/src/project.ts`
- Create: `packages/shared-types/src/settings.ts`
- Create: `packages/shared-types/src/git.ts`
- Create: `packages/shared-types/src/chapter.ts`
- Modify: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/chapter.test.ts`

- [ ] **Step 1.1：寫入 `packages/shared-types/src/project.ts`**

```ts
export type ProjectHash = string;

export interface ProjectMeta {
  title: string;
  createdAt: string;
  schemaVersion: 1;
}

export interface RecentProject {
  hash: ProjectHash;
  path: string;
  title: string;
  lastOpenedAt: string;
  pinned: boolean;
}
```

- [ ] **Step 1.2：寫入 `packages/shared-types/src/settings.ts`**

```ts
import type { RecentProject } from "./project.js";

export type LLMProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "ollama"
  | "lmstudio"
  | "rwkv-runner";

export const ALL_PROVIDER_IDS: LLMProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "ollama",
  "lmstudio",
  "rwkv-runner",
];

export const CLOUD_PROVIDERS: LLMProviderId[] = ["anthropic", "openai", "google", "xai"];
export const LOCAL_PROVIDERS: LLMProviderId[] = ["ollama", "lmstudio", "rwkv-runner"];

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
}

export interface RoutingPolicy {
  primary: string;
  fallbacks: string[];
}

export interface AppSettings {
  schemaVersion: 1;
  providers: Record<LLMProviderId, ProviderConfig>;
  routing: {
    chapterWriter?: RoutingPolicy;
    statusUpdater?: RoutingPolicy;
  };
  recentProjects: RecentProject[];
  meta: {
    firstLaunchWarningAcknowledged: boolean;
  };
}

export type ProviderTestResult =
  | { ok: true; latencyMs: number; modelCount?: number }
  | { ok: false; error: string };

export function defaultSettings(): AppSettings {
  const emptyConfig: ProviderConfig = { enabled: false };
  return {
    schemaVersion: 1,
    providers: {
      anthropic: { ...emptyConfig },
      openai: { ...emptyConfig },
      google: { ...emptyConfig },
      xai: { ...emptyConfig },
      ollama: { ...emptyConfig, endpoint: "http://localhost:11434" },
      lmstudio: { ...emptyConfig, endpoint: "http://localhost:1234" },
      "rwkv-runner": { ...emptyConfig, endpoint: "http://localhost:8000" },
    },
    routing: {},
    recentProjects: [],
    meta: { firstLaunchWarningAcknowledged: false },
  };
}

export function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 6)}***${key.slice(-4)}`;
}
```

- [ ] **Step 1.3：寫入 `packages/shared-types/src/git.ts`**

```ts
export interface GitBinaryInfo {
  installed: boolean;
  path?: string;
  version?: string;
}

export type GitChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitFileChange {
  path: string;
  status: GitChangeStatus;
  oldPath?: string;
}

export interface GitStatus {
  clean: boolean;
  branch: string;
  detached: boolean;
  changes: GitFileChange[];
  ahead: number;
  behind: number;
}
```

- [ ] **Step 1.4：寫入 `packages/shared-types/src/chapter.ts`**

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

/** 中文/英文/標點都算一個字；忽略空白與換行 */
export function countChars(text: string): number {
  return [...text].filter((c) => !/\s/.test(c)).length;
}
```

- [ ] **Step 1.5：寫入 `packages/shared-types/src/chapter.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { countChars } from "./chapter.js";

describe("countChars", () => {
  it("counts ASCII letters", () => {
    expect(countChars("hello")).toBe(5);
  });
  it("counts CJK characters as one each", () => {
    expect(countChars("梅雨初晴")).toBe(4);
  });
  it("ignores whitespace and newlines", () => {
    expect(countChars("a b\nc\td")).toBe(4);
  });
  it("counts emoji as one (uses code points)", () => {
    expect(countChars("😀abc")).toBe(4);
  });
  it("returns 0 for empty string", () => {
    expect(countChars("")).toBe(0);
  });
});
```

- [ ] **Step 1.6：覆寫 `packages/shared-types/src/index.ts`**

```ts
export * from "./project.js";
export * from "./settings.js";
export * from "./git.js";
export * from "./chapter.js";
```

- [ ] **Step 1.7：在 `packages/shared-types/` 加入 vitest 設定**

加 `packages/shared-types/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

`packages/shared-types/package.json` 的 scripts 改：

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

devDependencies 加 `"vitest": "^2.1.0"`。

- [ ] **Step 1.8：跑 typecheck 和 test**

```bash
cd F:/workspace/novel_writer && pnpm install && pnpm --filter @novel-writer/shared-types typecheck && pnpm --filter @novel-writer/shared-types test
```

預期：typecheck 通過，5 tests PASS。

- [ ] **Step 1.9：commit**

```bash
cd F:/workspace/novel_writer
git add packages/shared-types/ pnpm-lock.yaml
git commit -m "feat(types): M1-A shared-types — project, settings, git, chapter"
```

---

## Task 2：provider-tester 服務

**Files:**
- Create: `apps/api/src/services/provider-tester.ts`
- Create: `apps/api/src/services/provider-tester.test.ts`

- [ ] **Step 2.1：先寫測試（TDD）**

建立 `apps/api/src/services/provider-tester.test.ts`：

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { testProvider } from "./provider-tester.js";

describe("testProvider", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("anthropic — calls /v1/models with x-api-key header", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: [{}, {}] }), { status: 200 }),
    );
    const result = await testProvider("anthropic", { enabled: true, apiKey: "sk-ant-xxx" });
    expect(result.ok).toBe(true);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toContain("api.anthropic.com/v1/models");
    expect((call[1] as RequestInit).headers).toMatchObject({ "x-api-key": "sk-ant-xxx" });
  });

  it("openai — calls /v1/models with Bearer", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    const result = await testProvider("openai", { enabled: true, apiKey: "sk-xxx" });
    expect(result.ok).toBe(true);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-xxx");
  });

  it("google — embeds key in query string", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const result = await testProvider("google", { enabled: true, apiKey: "AIza-xxx" });
    expect(result.ok).toBe(true);
    expect(fetchSpy.mock.calls[0][0]).toContain("key=AIza-xxx");
  });

  it("ollama — uses configured endpoint", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const result = await testProvider("ollama", {
      enabled: true,
      endpoint: "http://localhost:11434",
    });
    expect(result.ok).toBe(true);
    expect(fetchSpy.mock.calls[0][0]).toContain("localhost:11434/v1/models");
  });

  it("returns error when status not ok", async () => {
    fetchSpy.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const result = await testProvider("anthropic", { enabled: true, apiKey: "wrong" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("401");
  });

  it("returns error when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Network failure"));
    const result = await testProvider("anthropic", { enabled: true, apiKey: "x" });
    expect(result.ok).toBe(false);
  });

  it("returns error when missing required config", async () => {
    const result = await testProvider("anthropic", { enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/api[_ ]key/i);
  });
});
```

- [ ] **Step 2.2：跑測試確認失敗（檔案不存在）**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -10
```

預期：找不到 `./provider-tester.js`。

- [ ] **Step 2.3：實作 `apps/api/src/services/provider-tester.ts`**

```ts
import type { LLMProviderId, ProviderConfig, ProviderTestResult } from "@novel-writer/shared-types";

const TIMEOUT_MS = 5000;

interface ProviderEndpoint {
  url: (config: ProviderConfig) => string;
  headers: (config: ProviderConfig) => Record<string, string>;
  parseCount: (json: unknown) => number | undefined;
  requires: "apiKey" | "endpoint";
}

const ENDPOINTS: Record<LLMProviderId, ProviderEndpoint> = {
  anthropic: {
    url: () => "https://api.anthropic.com/v1/models",
    headers: (c) => ({
      "x-api-key": c.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    }),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "apiKey",
  },
  openai: {
    url: () => "https://api.openai.com/v1/models",
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey ?? ""}` }),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "apiKey",
  },
  google: {
    url: (c) =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(c.apiKey ?? "")}`,
    headers: () => ({}),
    parseCount: (j) => (j as { models?: unknown[] }).models?.length,
    requires: "apiKey",
  },
  xai: {
    url: () => "https://api.x.ai/v1/models",
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey ?? ""}` }),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "apiKey",
  },
  ollama: {
    url: (c) => `${c.endpoint?.replace(/\/$/, "")}/v1/models`,
    headers: () => ({}),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "endpoint",
  },
  lmstudio: {
    url: (c) => `${c.endpoint?.replace(/\/$/, "")}/v1/models`,
    headers: () => ({}),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "endpoint",
  },
  "rwkv-runner": {
    url: (c) => `${c.endpoint?.replace(/\/$/, "")}/v1/models`,
    headers: () => ({}),
    parseCount: (j) => (j as { data?: unknown[] }).data?.length,
    requires: "endpoint",
  },
};

export async function testProvider(
  providerId: LLMProviderId,
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<ProviderTestResult> {
  const ep = ENDPOINTS[providerId];

  if (ep.requires === "apiKey" && !config.apiKey) {
    return { ok: false, error: "Missing api_key for cloud provider" };
  }
  if (ep.requires === "endpoint" && !config.endpoint) {
    return { ok: false, error: "Missing endpoint for local provider" };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = performance.now();
  try {
    const res = await fetch(ep.url(config), {
      method: "GET",
      headers: ep.headers(config),
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const json = (await res.json()) as unknown;
    return { ok: true, latencyMs, modelCount: ep.parseCount(json) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
```

- [ ] **Step 2.4：跑測試確認 7 個全部 PASS**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -10
```

預期：所有 testProvider 測試通過。

- [ ] **Step 2.5：commit**

```bash
git add apps/api/src/services/provider-tester.ts apps/api/src/services/provider-tester.test.ts
git commit -m "feat(api): provider-tester service for 7 LLM providers"
```

---

## Task 3：git-status-parser 服務

**Files:**
- Create: `apps/api/src/services/git-status-parser.ts`
- Create: `apps/api/src/services/git-status-parser.test.ts`

- [ ] **Step 3.1：寫測試（TDD）**

```ts
import { describe, expect, it } from "vitest";
import { parseStatus } from "./git-status-parser.js";

describe("parseStatus", () => {
  it("clean working tree", () => {
    const stdout = `# branch.oid abc123\n# branch.head main\n# branch.ab +0 -0\n`;
    const result = parseStatus(stdout);
    expect(result).toEqual({
      clean: true,
      branch: "main",
      detached: false,
      changes: [],
      ahead: 0,
      behind: 0,
    });
  });

  it("modified file", () => {
    const stdout = `# branch.head main\n1 .M N... 100644 100644 100644 abc def chapters/c.md\n`;
    const result = parseStatus(stdout);
    expect(result.clean).toBe(false);
    expect(result.changes).toEqual([{ path: "chapters/c.md", status: "modified" }]);
  });

  it("added (untracked staged)", () => {
    const stdout = `# branch.head main\n1 A. N... 000000 100644 100644 0 def new.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "new.md", status: "added" });
  });

  it("deleted", () => {
    const stdout = `# branch.head main\n1 .D N... 100644 100644 000000 abc 0 gone.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "gone.md", status: "deleted" });
  });

  it("renamed", () => {
    const stdout = `# branch.head main\n2 R. N... 100644 100644 100644 abc def R90 chapters/new.md\tchapters/old.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({
      path: "chapters/new.md",
      status: "renamed",
      oldPath: "chapters/old.md",
    });
  });

  it("untracked", () => {
    const stdout = `# branch.head main\n? unknown.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "unknown.md", status: "untracked" });
  });

  it("conflicted", () => {
    const stdout = `# branch.head main\nu UU N... 100644 100644 100644 100644 abc def ghi conflict.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "conflict.md", status: "conflicted" });
  });

  it("detached HEAD", () => {
    const stdout = `# branch.oid abc123\n# branch.head (detached)\n`;
    const result = parseStatus(stdout);
    expect(result.detached).toBe(true);
    expect(result.branch).toBe("(detached)");
  });

  it("ahead/behind tracking", () => {
    const stdout = `# branch.head main\n# branch.ab +3 -2\n`;
    const result = parseStatus(stdout);
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(2);
  });
});
```

- [ ] **Step 3.2：實作 parser**

`apps/api/src/services/git-status-parser.ts`：

```ts
import type { GitFileChange, GitStatus } from "@novel-writer/shared-types";

const STATUS_MAP: Record<string, GitFileChange["status"]> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
};

export function parseStatus(stdout: string): GitStatus {
  let branch = "";
  let detached = false;
  let ahead = 0;
  let behind = 0;
  const changes: GitFileChange[] = [];

  for (const line of stdout.split("\n")) {
    if (!line) continue;

    if (line.startsWith("# branch.head ")) {
      branch = line.slice("# branch.head ".length);
      detached = branch === "(detached)";
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
      continue;
    }
    if (line.startsWith("#")) continue;

    if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      const xy = parts[1];
      const path = parts.slice(8).join(" ");
      const code = (xy[0] !== "." ? xy[0] : xy[1]) ?? "";
      const status = STATUS_MAP[code];
      if (status) changes.push({ path, status });
      continue;
    }

    if (line.startsWith("2 ")) {
      const parts = line.split(" ");
      const pathPart = parts.slice(9).join(" ");
      const [newPath, oldPath] = pathPart.split("\t");
      changes.push({ path: newPath, status: "renamed", oldPath });
      continue;
    }

    if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const path = parts.slice(10).join(" ");
      changes.push({ path, status: "conflicted" });
      continue;
    }

    if (line.startsWith("? ")) {
      changes.push({ path: line.slice(2), status: "untracked" });
      continue;
    }
  }

  return {
    clean: changes.length === 0,
    branch,
    detached,
    changes,
    ahead,
    behind,
  };
}
```

- [ ] **Step 3.3：跑測試**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -15
```

預期：9 tests PASS。

- [ ] **Step 3.4：commit**

```bash
git add apps/api/src/services/git-status-parser.ts apps/api/src/services/git-status-parser.test.ts
git commit -m "feat(api): git-status-parser for --porcelain=v2 output"
```

---

## Task 4：commit-policy 服務

**Files:**
- Create: `apps/api/src/services/commit-policy.ts`
- Create: `apps/api/src/services/commit-policy.test.ts`

- [ ] **Step 4.1：實作（不嚴格 TDD，因為依賴真實 git；用整合測試）**

`apps/api/src/services/commit-policy.ts`：

```ts
import { execGit } from "./git.js";
import { parseStatus } from "./git-status-parser.js";

export type CommitTrigger = "create-project" | "save-chapter" | "rename-chapter";

const PREFIX: Record<CommitTrigger, string> = {
  "create-project": "init",
  "save-chapter": "chapter",
  "rename-chapter": "chapter",
};

export async function commitIfChanged(
  projectPath: string,
  trigger: CommitTrigger,
  message: string,
): Promise<{ sha: string } | null> {
  const statusOut = await execGit(projectPath, ["status", "--porcelain=v2", "--branch"]);
  const status = parseStatus(statusOut.stdout);

  if (status.detached) {
    console.warn(`commit-policy: skipped commit in detached HEAD state at ${projectPath}`);
    return null;
  }
  if (status.clean) return null;

  await execGit(projectPath, ["add", "."]);
  const fullMsg = `${PREFIX[trigger]}: ${message}`;
  await execGit(projectPath, ["commit", "-m", fullMsg]);
  const shaOut = await execGit(projectPath, ["rev-parse", "HEAD"]);
  return { sha: shaOut.stdout.trim() };
}
```

（依現有 `apps/api/src/services/git.ts` 的 `execGit(cwd, args)` 介面；若簽名不符請對齊現有實作）

- [ ] **Step 4.2：寫整合測試**

`apps/api/src/services/commit-policy.test.ts`：

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { commitIfChanged } from "./commit-policy.js";

describe("commitIfChanged (integration)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "commit-policy-"));
    execSync("git init -q", { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "test"', { cwd: tmpDir });
    writeFileSync(join(tmpDir, "seed.txt"), "seed");
    execSync("git add . && git commit -q -m seed", { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when clean", async () => {
    const result = await commitIfChanged(tmpDir, "save-chapter", "no changes");
    expect(result).toBeNull();
  });

  it("commits when file modified", async () => {
    writeFileSync(join(tmpDir, "seed.txt"), "changed");
    const result = await commitIfChanged(tmpDir, "save-chapter", "ch1 saved");
    expect(result).not.toBeNull();
    expect(result?.sha).toMatch(/^[a-f0-9]{40}$/);
    const log = execSync("git log --oneline -1", { cwd: tmpDir }).toString();
    expect(log).toContain("chapter: ch1 saved");
  });

  it("uses init prefix for create-project trigger", async () => {
    writeFileSync(join(tmpDir, "new.txt"), "new");
    await commitIfChanged(tmpDir, "create-project", "novel created");
    const log = execSync("git log --oneline -1", { cwd: tmpDir }).toString();
    expect(log).toContain("init: novel created");
  });
});
```

- [ ] **Step 4.3：跑測試**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -15
```

預期：3 tests PASS。

- [ ] **Step 4.4：commit**

```bash
git add apps/api/src/services/commit-policy.ts apps/api/src/services/commit-policy.test.ts
git commit -m "feat(api): commit-policy service with commitIfChanged"
```

---

## Task 5：settings routes

**Files:**
- Create: `apps/api/src/routes/settings.ts`
- Create: `apps/api/src/routes/settings.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 5.1：寫 routes**

`apps/api/src/routes/settings.ts`：

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppSettings, LLMProviderId } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS, defaultSettings, maskApiKey } from "@novel-writer/shared-types";
import { readSettings, writeSettings } from "../services/settings-store.js";
import { testProvider } from "../services/provider-tester.js";

const providerConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  endpoint: z.string().optional(),
  defaultModel: z.string().optional(),
});

const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  providers: z.record(providerConfigSchema),
  routing: z.object({
    chapterWriter: z.object({ primary: z.string(), fallbacks: z.array(z.string()) }).optional(),
    statusUpdater: z.object({ primary: z.string(), fallbacks: z.array(z.string()) }).optional(),
  }),
  recentProjects: z.array(z.unknown()),
  meta: z.object({ firstLaunchWarningAcknowledged: z.boolean() }),
});

const testProviderSchema = z.object({
  providerId: z.enum(ALL_PROVIDER_IDS as [LLMProviderId, ...LLMProviderId[]]),
  config: providerConfigSchema.optional(),
});

function maskSettings(s: AppSettings): AppSettings {
  const masked = { ...s, providers: { ...s.providers } };
  for (const id of ALL_PROVIDER_IDS) {
    const cfg = masked.providers[id];
    if (cfg.apiKey) {
      masked.providers[id] = { ...cfg, apiKey: maskApiKey(cfg.apiKey) };
    }
  }
  return masked;
}

export const settings = new Hono()
  .get("/", async (c) => {
    const s = await readSettings();
    return c.json(maskSettings(s));
  })
  .put("/", zValidator("json", settingsSchema), async (c) => {
    const incoming = c.req.valid("json") as AppSettings;
    const current = await readSettings();
    // If apiKey is masked (looks like "sk-***xxxx"), keep current value
    for (const id of ALL_PROVIDER_IDS) {
      const newKey = incoming.providers[id]?.apiKey;
      if (newKey && newKey.includes("***")) {
        incoming.providers[id].apiKey = current.providers[id]?.apiKey;
      }
    }
    await writeSettings(incoming);
    return c.json({ ok: true });
  })
  .post("/test-provider", zValidator("json", testProviderSchema), async (c) => {
    const { providerId, config } = c.req.valid("json");
    const current = await readSettings();
    const effectiveConfig = config ?? current.providers[providerId];
    const result = await testProvider(providerId, effectiveConfig);
    return c.json(result);
  })
  .post("/reset", async (c) => {
    await writeSettings(defaultSettings());
    return c.json({ ok: true });
  })
  .get("/secret/:provider", async (c) => {
    const provider = c.req.param("provider") as LLMProviderId;
    if (!ALL_PROVIDER_IDS.includes(provider)) {
      return c.json({ error: "invalid provider" }, 400);
    }
    const s = await readSettings();
    return c.json({ apiKey: s.providers[provider]?.apiKey ?? "" });
  });
```

- [ ] **Step 5.2：寫整合測試**

`apps/api/src/routes/settings.test.ts`：

```ts
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings } from "./settings.js";

const originalHome = process.env["HOME"];
const originalUserprofile = process.env["USERPROFILE"];
let tmpHome: string;

describe("settings routes", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "settings-routes-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{}] }), { status: 200 }),
    );
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (originalHome) process.env["HOME"] = originalHome;
    if (originalUserprofile) process.env["USERPROFILE"] = originalUserprofile;
    vi.restoreAllMocks();
  });

  it("GET / returns masked settings", async () => {
    const res = await settings.request("/", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schemaVersion: number };
    expect(body.schemaVersion).toBe(1);
  });

  it("PUT / writes settings", async () => {
    const newSettings = {
      schemaVersion: 1,
      providers: {
        anthropic: { enabled: true, apiKey: "sk-ant-real" },
        openai: { enabled: false },
        google: { enabled: false },
        xai: { enabled: false },
        ollama: { enabled: false },
        lmstudio: { enabled: false },
        "rwkv-runner": { enabled: false },
      },
      routing: {},
      recentProjects: [],
      meta: { firstLaunchWarningAcknowledged: false },
    };
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newSettings),
    });
    expect(res.status).toBe(200);
  });

  it("POST /test-provider succeeds for valid config", async () => {
    const res = await settings.request("/test-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: "anthropic",
        config: { enabled: true, apiKey: "sk-ant-x" },
      }),
    });
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /reset wipes settings", async () => {
    const res = await settings.request("/reset", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 5.3：在 server.ts 註冊 settings route**

修改 `apps/api/src/server.ts`，加入：

```ts
import { settings } from "./routes/settings.js";
const app = new Hono()
  .route("/api/health", health)
  .route("/api/settings", settings);
```

- [ ] **Step 5.4：跑測試**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -10
```

預期：settings routes 4 tests PASS。

- [ ] **Step 5.5：commit**

```bash
git add apps/api/src/routes/settings.ts apps/api/src/routes/settings.test.ts apps/api/src/server.ts
git commit -m "feat(api): settings routes — GET/PUT/test-provider/reset/secret"
```

---

## Task 6：git routes

**Files:**
- Create: `apps/api/src/routes/git.ts`
- Create: `apps/api/src/routes/git.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 6.1：寫 routes**

`apps/api/src/routes/git.ts`：

```ts
import { Hono } from "hono";
import { execSync } from "node:child_process";
import type { GitBinaryInfo } from "@novel-writer/shared-types";
import { resolveProjectPath } from "../services/project-resolver.js";
import { execGit } from "../services/git.js";
import { parseStatus } from "../services/git-status-parser.js";

function checkGitBinary(): GitBinaryInfo {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const path = execSync(`${which} git`).toString().trim().split("\n")[0];
    const versionOut = execSync("git --version").toString();
    const m = versionOut.match(/\d+\.\d+\.\d+/);
    return { installed: true, path, version: m?.[0] };
  } catch {
    return { installed: false };
  }
}

export const git = new Hono()
  .get("/check-binary", (c) => {
    return c.json(checkGitBinary());
  })
  .get("/projects/:hash/status", async (c) => {
    const hash = c.req.param("hash");
    const projectPath = await resolveProjectPath(hash);
    if (!projectPath) {
      return c.json({ error: "project not found" }, 404);
    }
    const out = await execGit(projectPath, ["status", "--porcelain=v2", "--branch"]);
    return c.json(parseStatus(out.stdout));
  });
```

- [ ] **Step 6.2：寫測試**

`apps/api/src/routes/git.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { git } from "./git.js";

describe("git routes", () => {
  it("GET /check-binary returns binary info", async () => {
    const res = await git.request("/check-binary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installed: boolean };
    // git 必然安裝（M0 已驗收）
    expect(body.installed).toBe(true);
  });

  it("GET /projects/:hash/status returns 404 when unknown hash", async () => {
    const res = await git.request("/projects/nonexistenthash1234/status");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6.3：註冊 route**

`apps/api/src/server.ts`：

```ts
import { git } from "./routes/git.js";
// ...
const app = new Hono()
  .route("/api/health", health)
  .route("/api/settings", settings)
  .route("/api/git", git);
```

- [ ] **Step 6.4：跑測試 + commit**

```bash
cd F:/workspace/novel_writer/apps/api && pnpm test 2>&1 | tail -10
cd F:/workspace/novel_writer
git add apps/api/src/routes/git.ts apps/api/src/routes/git.test.ts apps/api/src/server.ts
git commit -m "feat(api): git routes — check-binary + project status"
```

---

## Task 7：前端依賴 + router + MSW 安裝

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/mocks/` 目錄與 5 個檔案
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 7.1：apps/web/package.json 加入依賴**

dependencies 加：
```json
"react-router-dom": "^6.28.0"
```

devDependencies 加：
```json
"msw": "^2.6.0",
"@testing-library/react": "^16.1.0",
"@testing-library/user-event": "^14.5.2",
"@testing-library/jest-dom": "^6.6.0",
"jsdom": "^25.0.0",
"vitest": "^2.1.0"
```

`scripts` 加：
```json
"test": "vitest run"
```

- [ ] **Step 7.2：安裝**

```bash
cd F:/workspace/novel_writer && pnpm install
```

- [ ] **Step 7.3：建立 mocks fixtures**

`apps/web/src/mocks/fixtures/settings.ts`：

```ts
import type { AppSettings } from "@novel-writer/shared-types";
import { defaultSettings } from "@novel-writer/shared-types";

export const mockSettings: AppSettings = {
  ...defaultSettings(),
  providers: {
    ...defaultSettings().providers,
    anthropic: {
      enabled: true,
      apiKey: "sk-ant-***mock",
      defaultModel: "claude-sonnet-4-6",
    },
    ollama: {
      enabled: true,
      endpoint: "http://localhost:11434",
    },
  },
};
```

`apps/web/src/mocks/fixtures/git-status.ts`：

```ts
import type { GitStatus, GitBinaryInfo } from "@novel-writer/shared-types";

export const mockCleanStatus: GitStatus = {
  clean: true,
  branch: "main",
  detached: false,
  changes: [],
  ahead: 0,
  behind: 0,
};

export const mockDirtyStatus: GitStatus = {
  clean: false,
  branch: "main",
  detached: false,
  changes: [{ path: "chapters/c1.md", status: "modified" }],
  ahead: 0,
  behind: 0,
};

export const mockGitBinaryInstalled: GitBinaryInfo = {
  installed: true,
  path: "/usr/bin/git",
  version: "2.44.0",
};
```

- [ ] **Step 7.4：建立 MSW handlers**

`apps/web/src/mocks/handlers.ts`：

```ts
import { http, HttpResponse } from "msw";
import { mockSettings } from "./fixtures/settings.js";
import { mockCleanStatus, mockGitBinaryInstalled } from "./fixtures/git-status.js";

export const handlers = [
  http.get("/api/settings", () => HttpResponse.json(mockSettings)),
  http.put("/api/settings", () => HttpResponse.json({ ok: true })),
  http.post("/api/settings/test-provider", async ({ request }) => {
    const body = (await request.json()) as { providerId: string };
    return HttpResponse.json({
      ok: true,
      latencyMs: 142,
      modelCount: 8,
    });
  }),
  http.post("/api/settings/reset", () => HttpResponse.json({ ok: true })),
  http.get("/api/settings/secret/:provider", () =>
    HttpResponse.json({ apiKey: "sk-ant-real-key-1234567890" }),
  ),
  http.get("/api/git/check-binary", () => HttpResponse.json(mockGitBinaryInstalled)),
  http.get("/api/git/projects/:hash/status", () => HttpResponse.json(mockCleanStatus)),
];
```

- [ ] **Step 7.5：建立 MSW server（vitest）**

`apps/web/src/mocks/server.ts`：

```ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

export const mswServer = setupServer(...handlers);
```

- [ ] **Step 7.6：建立 MSW browser（dev mode）**

`apps/web/src/mocks/browser.ts`：

```ts
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers.js";

export const mswWorker = setupWorker(...handlers);
```

- [ ] **Step 7.7：建立 vitest config 與 setup**

`apps/web/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
```

`apps/web/src/test-setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "./mocks/server.js";

beforeAll(() => mswServer.listen({ onUnhandledRequest: "warn" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
```

- [ ] **Step 7.8：建立 router**

`apps/web/src/router.tsx`：

```tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import { SettingsPage } from "./features/settings/SettingsPage.js";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/settings" replace /> },
  { path: "/settings", element: <SettingsPage /> },
]);
```

（路由先極簡，M1-B 加 Home / NewProject 路由）

- [ ] **Step 7.9：commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/mocks/ apps/web/src/router.tsx apps/web/src/test-setup.ts pnpm-lock.yaml
git commit -m "feat(web): MSW mock infrastructure + react-router setup"
```

---

## Task 8：前端 Settings features

**Files:**
- Create: `apps/web/src/features/settings/SettingsPage.tsx`
- Create: `apps/web/src/features/settings/ProviderCard.tsx`
- Create: `apps/web/src/features/settings/ApiKeyField.tsx`
- Create: `apps/web/src/features/settings/SettingsPage.test.tsx`

- [ ] **Step 8.1：`ApiKeyField.tsx`**

```tsx
import { useState } from "react";

interface Props {
  providerId: string;
  maskedValue: string;
  onChange: (raw: string) => void;
}

export function ApiKeyField({ providerId, maskedValue, onChange }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [rawValue, setRawValue] = useState<string | null>(null);

  async function handleReveal() {
    const res = await fetch(`/api/settings/secret/${providerId}`);
    const data = (await res.json()) as { apiKey: string };
    setRawValue(data.apiKey);
    setRevealed(true);
  }

  function handleHide() {
    setRevealed(false);
    setRawValue(null);
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type={revealed ? "text" : "password"}
        className="flex-1 px-2 py-1 border rounded"
        value={revealed ? rawValue ?? "" : maskedValue}
        placeholder="API key"
        onChange={(e) => {
          const v = e.target.value;
          if (revealed) setRawValue(v);
          onChange(v);
        }}
      />
      {!revealed ? (
        <button type="button" onClick={handleReveal} className="text-xs underline">
          顯示
        </button>
      ) : (
        <button type="button" onClick={handleHide} className="text-xs underline">
          隱藏
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8.2：`ProviderCard.tsx`**

```tsx
import { useState } from "react";
import type { LLMProviderId, ProviderConfig, ProviderTestResult } from "@novel-writer/shared-types";
import { CLOUD_PROVIDERS } from "@novel-writer/shared-types";
import { ApiKeyField } from "./ApiKeyField.js";

interface Props {
  providerId: LLMProviderId;
  config: ProviderConfig;
  onChange: (config: ProviderConfig) => void;
}

const LABELS: Record<LLMProviderId, string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  google: "Google Gemini",
  xai: "xAI Grok",
  ollama: "Ollama（地端）",
  lmstudio: "LM Studio（地端）",
  "rwkv-runner": "RWKV Runner（地端）",
};

export function ProviderCard({ providerId, config, onChange }: Props) {
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const isCloud = CLOUD_PROVIDERS.includes(providerId);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId, config }),
      });
      const result = (await res.json()) as ProviderTestResult;
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="border rounded p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{LABELS[providerId]}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
          />
          啟用
        </label>
      </div>

      {config.enabled && (
        <>
          {isCloud ? (
            <ApiKeyField
              providerId={providerId}
              maskedValue={config.apiKey ?? ""}
              onChange={(apiKey) => onChange({ ...config, apiKey })}
            />
          ) : (
            <input
              type="text"
              className="w-full px-2 py-1 border rounded text-sm"
              placeholder="http://localhost:11434"
              value={config.endpoint ?? ""}
              onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
            />
          )}
          <input
            type="text"
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="預設模型（選填）"
            value={config.defaultModel ?? ""}
            onChange={(e) => onChange({ ...config, defaultModel: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="text-sm px-3 py-1 border rounded"
            >
              {testing ? "測試中…" : "測試連線"}
            </button>
            {testResult?.ok === true && (
              <span className="text-sm text-green-600">
                ✓ 連線成功（延遲 {testResult.latencyMs}ms
                {testResult.modelCount ? `, ${testResult.modelCount} 個模型` : ""}）
              </span>
            )}
            {testResult?.ok === false && (
              <span className="text-sm text-red-600">✗ {testResult.error}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8.3：`SettingsPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { AppSettings, LLMProviderId } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS } from "@novel-writer/shared-types";
import { ProviderCard } from "./ProviderCard.js";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json() as Promise<AppSettings>)
      .then(setSettings);
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMessage(res.ok ? "已儲存" : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("確定要還原所有設定為出廠預設？")) return;
    await fetch("/api/settings/reset", { method: "POST" });
    const r = await fetch("/api/settings");
    setSettings((await r.json()) as AppSettings);
    setMessage("已重設");
  }

  if (!settings) {
    return <div className="p-8 text-ink/60">載入設定中…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-4">
      <h1 className="text-2xl font-semibold mb-4">設定</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">LLM Providers</h2>
        {ALL_PROVIDER_IDS.map((id: LLMProviderId) => (
          <ProviderCard
            key={id}
            providerId={id}
            config={settings.providers[id]}
            onChange={(cfg) =>
              setSettings({
                ...settings,
                providers: { ...settings.providers, [id]: cfg },
              })
            }
          />
        ))}
      </section>

      <div className="flex items-center gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button type="button" onClick={handleReset} className="px-4 py-2 border rounded">
          重設為出廠預設
        </button>
        {message && <span className="text-sm text-ink/60">{message}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.4：寫元件測試**

`apps/web/src/features/settings/SettingsPage.test.tsx`：

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage.js";

describe("SettingsPage", () => {
  it("renders 7 provider cards after load", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
      expect(screen.getByText(/Ollama/)).toBeInTheDocument();
    });
  });

  it("save button triggers PUT /api/settings", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Anthropic Claude"));
    const saveBtn = screen.getByRole("button", { name: /儲存/ });
    await user.click(saveBtn);
    await waitFor(() => expect(screen.getByText("已儲存")).toBeInTheDocument());
  });
});
```

- [ ] **Step 8.5：app.tsx 改用 router**

修改 `apps/web/src/app.tsx`：

```tsx
import { RouterProvider } from "react-router-dom";
import { router } from "./router.js";

if (import.meta.env.DEV && import.meta.env["VITE_USE_MSW"]) {
  await import("./mocks/browser.js").then(({ mswWorker }) =>
    mswWorker.start({ onUnhandledRequest: "warn" }),
  );
}

export function App() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 8.6：跑測試**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web test 2>&1 | tail -10
```

- [ ] **Step 8.7：commit**

```bash
git add apps/web/src/features/ apps/web/src/app.tsx
git commit -m "feat(web): SettingsPage with 7 ProviderCards + API key reveal"
```

---

## Task 9：前端 Startup features

**Files:**
- Create: `apps/web/src/features/startup/GitMissingDialog.tsx`
- Create: `apps/web/src/features/startup/ConflictBanner.tsx`
- Create: `apps/web/src/features/startup/GitMissingDialog.test.tsx`

- [ ] **Step 9.1：`GitMissingDialog.tsx`**

```tsx
import { useState } from "react";

interface Props {
  onRetry: () => Promise<boolean>;
}

export function GitMissingDialog({ onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [stillMissing, setStillMissing] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    const found = await onRetry();
    setRetrying(false);
    if (!found) setStillMissing(true);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">需要安裝 Git</h2>
        <p className="text-sm">
          Novel Writer 需要系統 Git 才能版本控制小說檔案。請先安裝 Git 後再繼續。
        </p>
        <ul className="text-sm space-y-1 ml-4 list-disc">
          <li>
            Windows:{" "}
            <a
              href="https://git-scm.com/download/win"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              git-scm.com/download/win
            </a>
          </li>
          <li>
            macOS: <code>brew install git</code> 或從 git-scm.com
          </li>
          <li>
            Linux: <code>apt install git</code> / <code>dnf install git</code>
          </li>
        </ul>
        {stillMissing && (
          <p className="text-sm text-red-600">仍未偵測到 Git，請確認安裝後重新開啟應用。</p>
        )}
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded"
        >
          {retrying ? "偵測中…" : "我已安裝，重試"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2：`ConflictBanner.tsx`**

```tsx
import type { GitStatus } from "@novel-writer/shared-types";

interface Props {
  status: GitStatus;
  onDismiss?: () => void;
}

export function ConflictBanner({ status, onDismiss }: Props) {
  if (status.clean) return null;

  return (
    <div className="bg-amber-100 border-l-4 border-amber-500 p-3 text-sm flex items-start gap-3">
      <span className="text-amber-700 font-semibold shrink-0">⚠</span>
      <div className="flex-1">
        <p className="font-medium">外部變更已偵測</p>
        <p className="text-ink/70 mt-1">
          {status.changes.length} 個檔案有未提交變更。請檢視後決定是否載入。
        </p>
        <ul className="mt-2 ml-4 list-disc text-xs">
          {status.changes.slice(0, 5).map((c) => (
            <li key={c.path}>
              {c.path} <span className="text-ink/50">({c.status})</span>
            </li>
          ))}
          {status.changes.length > 5 && (
            <li className="text-ink/50">…還有 {status.changes.length - 5} 個</li>
          )}
        </ul>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs underline shrink-0">
          知道了
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 9.3：寫測試**

`apps/web/src/features/startup/GitMissingDialog.test.tsx`：

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GitMissingDialog } from "./GitMissingDialog.js";

describe("GitMissingDialog", () => {
  it("calls onRetry on button click", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(true);
    render(<GitMissingDialog onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /我已安裝/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows still-missing message when retry returns false", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(false);
    render(<GitMissingDialog onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /我已安裝/ }));
    expect(await screen.findByText(/仍未偵測到 Git/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9.4：跑測試 + commit**

```bash
cd F:/workspace/novel_writer && pnpm --filter @novel-writer/web test 2>&1 | tail -10
git add apps/web/src/features/startup/
git commit -m "feat(web): GitMissingDialog + ConflictBanner startup components"
```

---

## Task 10：CI / 整合驗收

- [ ] **Step 10.1：根 typecheck + test + lint 全綠**

```bash
cd F:/workspace/novel_writer && pnpm typecheck && pnpm test && pnpm lint
```

若 lint 有錯，先 `pnpm exec biome check --write` 安全修正後再人工處理 unsafe。

- [ ] **Step 10.2：開 PR**

```bash
git push -u origin feat/m1a-foundation
gh pr create --base feat/m0-tauri-shell --head feat/m1a-foundation \
  --title "feat(M1-A): 基礎層 — types + settings 後/前端 + git 後/前端" \
  --body "見 docs/superpowers/specs/2026-05-13-m1a-foundation-design.md"
```

---

## 附錄：M1-A DoD

- [ ] Tasks 1-10 全部 commit 完成
- [ ] `pnpm typecheck` / `pnpm test` / `pnpm lint` 全綠
- [ ] PR 開啟並通過 CI
- [ ] M1-B 開工前不需要回頭改 shared-types
