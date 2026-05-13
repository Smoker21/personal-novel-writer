# M4 打磨與發布 v0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把功能完整的 Novel Writer MVP 打磨為可發布版本，產出 GitHub Releases v0.1.0，含 Windows binary。

**Architecture:** 三個並行 session 線：A（UX + bug fix，UI 點擊測試驅動）→ B（CI/CD + 打包）→ C（文件 + release）。UI 測試用 Playwright MCP 工具實際點擊畫面，LMStudio Qwen 在 port 1234 提供地端 AI。

**Tech Stack:** React 18 + Tailwind v4 + Hono + Tauri 2 + Playwright MCP + @playwright/test + LMStudio Qwen（地端 AI 驗證）

---

## 決策摘要（已確定）

| 項目 | 決定 |
|---|---|
| Apple Developer 帳號 | 無 → docs 寫 Gatekeeper 繞過說明 |
| Windows cert | 無 → 接受 SmartScreen 警告，docs 說明 |
| Dark mode | 不做（v0.2） |
| App icon | 簡單佔位純色 icon（書本 emoji 風格） |
| Auto-updater | 不做（v0.2） |

---

## 檔案結構

### 新建

```
apps/e2e/
  playwright.config.ts         # Playwright 設定（base URL: http://localhost:5173）
  fixtures/                    # 測試用 fixture（春雨專案 seed）
  tests/
    mvp-flow.spec.ts           # MVP 完整閉環 E2E 測試
    settings.spec.ts           # 設定頁測試

apps/web/src/features/
  home/EmptyState.tsx          # 首頁空狀態元件
  characters/EmptyCharacterState.tsx   # 角色清單空狀態
  status/StatusEditorPage.tsx  # status 編輯路由（M3 遺留 pol-9）

docs/user-guide/
  installation.md
  first-novel.md
  ai-setup.md
  git-version-control.md
  troubleshooting.md

.github/workflows/
  release.yml                  # on tag → tauri-action → release
```

### 修改

```
apps/web/src/features/home/HomePage.tsx      # 加空狀態
apps/web/src/features/settings/LlmNotConfiguredModal.tsx  # 拋光文字 + 步驟
apps/web/src/router.tsx                      # 加 status 路由
apps/desktop/src-tauri/tauri.conf.json       # 改版號為 0.1.0 + 加 icon
README.md                                    # 重寫
CHANGELOG.md                                 # 新建
```

---

## Task 1: 啟動 dev server + 首次 UI 掃描

**Files:** 無程式碼修改，純觀察

- [ ] **Step 1: 確認 main 乾淨**

```bash
cd F:/workspace/novel_writer
git checkout main && git pull && git status
```
Expected: working tree clean, up to date

- [ ] **Step 2: 啟動 API server**

```bash
pnpm run dev:api &
```
等 3 秒後確認：`curl http://127.0.0.1:3001/api/health` → `{"ok":true}`

- [ ] **Step 3: 啟動 Web server（另一個 terminal）**

```bash
pnpm run dev:web &
```
等 5 秒後訪問 http://localhost:5173

- [ ] **Step 4: 用 Playwright MCP 導覽首頁**

使用 `mcp__plugin_playwright_playwright__browser_navigate` 訪問 `http://localhost:5173`，
截圖記錄首頁現況，檢查：
- 有無 Novel Writer 標題
- 「最近開啟」清單
- 「新小說」按鈕
- 設定頁連結

---

## Task 2: 空狀態 UI（pol-5）

**Files:**
- Modify: `apps/web/src/features/home/HomePage.tsx`
- Modify: `apps/web/src/features/characters/CharacterPanel.tsx`

- [ ] **Step 1: 更新 HomePage.tsx 加空狀態**

在 `HomePage.tsx` 的 `<RecentProjectsList>` 區塊，當 `recents.length === 0` 時顯示：

```tsx
{recents.length === 0 ? (
  <div className="text-center py-12 space-y-4">
    <div className="text-6xl">📖</div>
    <p className="text-neutral-400 text-sm">還沒有小說專案</p>
    <p className="text-neutral-500 text-xs">點「新小說」開始你的第一本創作</p>
  </div>
) : (
  <RecentProjectsList
    recents={recents}
    onSelect={handleSelect}
    onMissing={setMissingTarget}
  />
)}
```

- [ ] **Step 2: 更新 CharacterPanel.tsx 空狀態**

已有空狀態（`尚無角色。點「新增」建立第一個角色。`），但改善視覺：

```tsx
{characters.length === 0 && (
  <div className="p-6 text-center space-y-2">
    <div className="text-4xl">👤</div>
    <p className="text-sm text-neutral-400">尚無角色</p>
    <p className="text-xs text-neutral-500">點上方「+ 新增」建立第一個角色</p>
  </div>
)}
```

- [ ] **Step 3: pnpm typecheck 確認綠**

```bash
pnpm typecheck
```

- [ ] **Step 4: commit**

```bash
git checkout -b feat/m4-polish-ux
git add apps/web/src/features/home/HomePage.tsx apps/web/src/features/characters/CharacterPanel.tsx
git commit -m "feat(web): pol-5 empty state UI — homepage + character panel"
```

---

## Task 3: LlmNotConfiguredModal 拋光（on-4）

**Files:**
- Modify: `apps/web/src/features/settings/LlmNotConfiguredModal.tsx`

- [ ] **Step 1: 更新 Modal 加入步驟說明**

```tsx
export function LlmNotConfiguredModal({ agentName, open, onClose }: Props) {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚙️</span>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">尚未設定 AI 模型</h2>
            <p className="text-sm text-neutral-400 mt-1">
              使用「{agentName}」前需要先設定 LLM 路由。
            </p>
          </div>
        </div>
        <ol className="text-xs text-neutral-300 space-y-1.5 list-decimal list-inside bg-neutral-900/50 rounded-lg p-3">
          <li>點「前往設定頁」</li>
          <li>在「LLM Providers」啟用一個 provider（Anthropic / OpenAI / LM Studio…）</li>
          <li>在「Agent 預設模型」為 <strong>{agentName}</strong> 選擇模型</li>
          <li>點「儲存」後返回繼續操作</li>
        </ol>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            稍後再說
          </button>
          <button type="button"
            onClick={() => { navigate("/settings"); onClose(); }}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 transition-colors">
            前往設定頁 →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm typecheck && git add apps/web/src/features/settings/LlmNotConfiguredModal.tsx
git commit -m "feat(web): on-4 LlmNotConfiguredModal — add step-by-step setup guide"
```

---

## Task 4: Status 編輯路由（pol-9，M3 遺留）

**Files:**
- Create: `apps/web/src/features/status/StatusEditorPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: 建立 StatusEditorPage.tsx**

```tsx
// apps/web/src/features/status/StatusEditorPage.tsx
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { StatusShortenButton } from "./StatusShortenButton";

export function StatusEditorPage() {
  const { hash, type, slug } = useParams<{ hash: string; type: string; slug?: string }>();
  if (!hash) return <Navigate to="/" replace />;

  const isStory = type === "story";
  const title = isStory ? "故事狀態" : `角色狀態：${slug ?? ""}`;
  const fileLabel = isStory ? "story_status.md" : `characters/${slug}_status.md`;

  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${hash}/git/show?sha=HEAD&file=status/${fileLabel}`)
      .then((r) => r.ok ? r.json() as Promise<{ content: string }> : null)
      .then((d) => { setContent(d?.content ?? ""); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hash, fileLabel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save via chapters-adjacent endpoint: POST raw file write is not exposed,
      // so we use a simple approach: show user the content for manual save
      // Future: add dedicated status write endpoint
      await navigator.clipboard.writeText(content);
      alert("內容已複製到剪貼簿。請手動儲存到對應的 .md 檔案。");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-neutral-400">載入中…</div>;

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-700 shrink-0">
        <Link to={`/editor/${hash}`}
          className="text-xs text-indigo-400 hover:text-indigo-300">← 編輯器</Link>
        <span className="text-xs text-neutral-500">|</span>
        <span className="text-sm font-medium text-neutral-200">{title}</span>
        <div className="flex-1" />
        <StatusShortenButton
          projectHash={hash}
          fileType={isStory ? "story" : "character"}
          characterSlug={slug}
          onResult={(shortened) => setContent(shortened)}
        />
        <button type="button" onClick={handleSave} disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40">
          {saving ? "處理中…" : "複製內容"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full rounded border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200 font-mono resize-none focus:outline-none focus:border-neutral-500"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 更新 router.tsx 加 status 路由**

```typescript
import { StatusEditorPage } from "./features/status/StatusEditorPage";

// 在 router 加：
{ path: "/editor/:hash/status/:type", element: <StatusEditorPage /> },
{ path: "/editor/:hash/status/:type/:slug", element: <StatusEditorPage /> },
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: commit**

```bash
git add apps/web/src/features/status/StatusEditorPage.tsx apps/web/src/router.tsx
git commit -m "feat(web): pol-9 status editor route — /editor/:hash/status/story + /character/:slug"
```

---

## Task 5: 首頁空白時的 Onboarding 提示（on-3）

**Files:**
- Modify: `apps/web/src/features/home/HomePage.tsx`

在 Task 2 的基礎上，空狀態時加「新小說」大按鈕引導：

- [ ] **Step 1: 在空狀態 UI 加醒目按鈕**

```tsx
{recents.length === 0 ? (
  <div className="text-center py-16 space-y-6">
    <div className="text-7xl">📖</div>
    <div className="space-y-2">
      <p className="text-neutral-300 text-lg font-medium">開始你的第一本小說</p>
      <p className="text-neutral-500 text-sm">Novel Writer 幫助你用 AI 輔助寫作</p>
    </div>
    <NewProjectButton
      onCreated={(hash) => navigate(`/editor/${hash}`)}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
    >
      ✨ 建立第一本小說
    </NewProjectButton>
    <p className="text-neutral-600 text-xs">
      或點右上角「瀏覽資料夾」開啟既有專案
    </p>
  </div>
) : (
  <RecentProjectsList ... />
)}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm typecheck && git add apps/web/src/features/home/HomePage.tsx
git commit -m "feat(web): on-3 onboarding welcome screen with prominent CTA"
```

---

## Task 6: PR + Playwright MCP UI 測試

**Files:**
- Push 現有 branch

- [ ] **Step 1: Push pol branch**

```bash
git push -u origin feat/m4-polish-ux
gh pr create --title "feat(web): M4-A UX polish — empty states + onboarding + LlmModal + status route" --body "pol-5 empty states, on-3 onboarding welcome, on-4 LLM modal polish, pol-9 status editor route"
gh pr merge --rebase --delete-branch
git checkout main && git pull
```

- [ ] **Step 2: 用 Playwright MCP 測試完整流程**

以下步驟使用 `mcp__plugin_playwright_playwright__browser_navigate` 等工具：

1. 訪問 http://localhost:5173 → 截圖確認首頁
2. 點「新小說」按鈕 → 填表單（title: "梅雨中的書卷"，synopsis: "春雨在圖書館發現舊詩稿"）→ 確認進入編輯器
3. 在編輯器輸入幾段文字 → 等 autosave → 截圖
4. 點「設定」→ 啟用 LM Studio（endpoint: http://localhost:1234）→ 套用「全地端 Qwen」preset → 儲存
5. 回到編輯器 → 點「AI 撰寫本章」→ 等待串流 → 截圖草稿面板
6. 點「採用」→ 確認對話框 → 確認 → 等 status 更新 → 截圖
7. 點「歷史」→ 截圖歷史面板
8. 進 /editor/:hash/characters → 新增角色「春雨」→ 截圖
9. 記錄所有發現的 bug

- [ ] **Step 3: 記錄 bug 清單並修復**

---

## Task 7: Playwright @playwright/test E2E 設定（qa-2）

**Files:**
- Create: `apps/e2e/package.json`
- Create: `apps/e2e/playwright.config.ts`
- Create: `apps/e2e/tests/mvp-flow.spec.ts`

- [ ] **Step 1: 建立 e2e package**

```bash
mkdir -p apps/e2e
```

建立 `apps/e2e/package.json`：

```json
{
  "name": "@novel-writer/e2e",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0"
  }
}
```

- [ ] **Step 2: 建立 playwright.config.ts**

```typescript
// apps/e2e/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm run dev:web",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 3: 建立 MVP 閉環測試**

```typescript
// apps/e2e/tests/mvp-flow.spec.ts
import { test, expect } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const TMP_DIR = path.join(os.tmpdir(), `novel-writer-e2e-${Date.now()}`);

test.beforeAll(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

test.afterAll(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test("首頁顯示正確", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Novel Writer")).toBeVisible();
  // 空狀態時顯示 onboarding 提示
  // (若已有專案則顯示清單)
  await page.screenshot({ path: "test-results/homepage.png" });
});

test("設定頁可以開啟", async ({ page }) => {
  await page.goto("/");
  await page.getByText("設定").click();
  await expect(page.getByText("LLM Providers")).toBeVisible();
  await page.screenshot({ path: "test-results/settings.png" });
});

test("設定頁 LM Studio 啟用", async ({ page }) => {
  await page.goto("/settings");
  // 找 LM Studio 的啟用 toggle
  const lmStudioSection = page.getByText("LM Studio（地端）").first();
  await expect(lmStudioSection).toBeVisible();
  await page.screenshot({ path: "test-results/settings-lmstudio.png" });
});
```

- [ ] **Step 4: 安裝依賴並跑測試**

```bash
cd F:/workspace/novel_writer
pnpm install
pnpm --filter @novel-writer/e2e exec playwright install chromium
# API server 需要已在跑
pnpm --filter @novel-writer/e2e test 2>&1 | tail -20
```

- [ ] **Step 5: commit**

```bash
git checkout -b feat/m4-e2e
git add apps/e2e/
git commit -m "feat(e2e): qa-2 Playwright E2E setup + homepage/settings smoke tests"
git push -u origin feat/m4-e2e
gh pr create --title "feat(e2e): Playwright E2E smoke tests" --body "MVP 閉環 E2E 基礎建設"
gh pr merge --rebase --delete-branch
git checkout main && git pull
```

---

## Task 8: App Icon（ci-4）

**Files:**
- Create: `apps/desktop/src-tauri/icons/icon.png`（簡單 SVG → PNG）
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: 建立簡單佔位 icon**

建立 `apps/desktop/src-tauri/icons/icon.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" rx="40" fill="#4f46e5"/>
  <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle"
    font-size="140" font-family="serif">📖</text>
</svg>
```

Note：Tauri 需要實際的 PNG/ICO 檔案，在 CI 步驟用 `tauri icon` 命令從 PNG 生成所有格式。先放一個 placeholder 的 `icon.png`（可用 `npx @tauri-apps/cli icon` 從 SVG 生成）。

- [ ] **Step 2: 更新 tauri.conf.json**

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 3: 更新版本號**

在 `apps/desktop/src-tauri/tauri.conf.json` 改：
```json
"version": "0.1.0"
```

- [ ] **Step 4: commit**

```bash
git checkout -b feat/m4-icon-version
git add apps/desktop/src-tauri/
git commit -m "build(tauri): ci-4 update version to 0.1.0 + icon config placeholder"
git push -u origin feat/m4-icon-version
gh pr create --title "build(tauri): v0.1.0 + icon config" --body "準備 v0.1.0 版本號與 icon 設定"
gh pr merge --rebase --delete-branch
git checkout main && git pull
```

---

## Task 9: GitHub Actions Release Workflow（ci-1）

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 建立 release.yml**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  create-release:
    runs-on: ubuntu-latest
    outputs:
      release_id: ${{ steps.create-release.outputs.result }}
    steps:
      - uses: actions/checkout@v4

      - name: Create release
        id: create-release
        uses: actions/github-script@v7
        with:
          script: |
            const { data } = await github.rest.repos.createRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              tag_name: `${{ github.ref_name }}`,
              name: `Novel Writer ${{ github.ref_name }}`,
              body: `See CHANGELOG.md for details.`,
              draft: true,
              prerelease: ${{ github.ref_name == 'v0.1.0-rc1' }}
            });
            return data.id;

  build-tauri:
    needs: create-release
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: ubuntu-22.04
            args: ""
          - platform: windows-latest
            args: ""
          - platform: macos-latest
            args: "--target aarch64-apple-darwin"

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Install Linux deps
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build web
        run: pnpm --filter @novel-writer/web build

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          releaseId: ${{ needs.create-release.outputs.release_id }}
          projectPath: apps/desktop
          args: ${{ matrix.args }}

  publish-release:
    needs: [create-release, build-tauri]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        env:
          RELEASE_ID: ${{ needs.create-release.outputs.release_id }}
        with:
          script: |
            await github.rest.repos.updateRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              release_id: process.env.RELEASE_ID,
              draft: false
            });
```

- [ ] **Step 2: commit**

```bash
git checkout -b feat/m4-release-workflow
git add .github/workflows/release.yml
git commit -m "build(ci): ci-1 GitHub Actions release workflow (tauri-action 3-platform)"
git push -u origin feat/m4-release-workflow
gh pr create --title "build(ci): M4 release workflow" --body "On tag push → build Win/Mac/Linux + create release"
gh pr merge --rebase --delete-branch
git checkout main && git pull
```

---

## Task 10: CHANGELOG + README 重寫（doc-1 + rel-1）

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: 建立 CHANGELOG.md**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-05-14

### Added

#### 核心功能
- M1：章節編輯器（CM6 富文字）+ autosave + git 自動 commit
- M2：角色卡管理（6 分區欄位）+ AI 統整描述 + Vision 圖片解析
- M2：AI 撰寫章節（SSE 串流 + chapter-writer Agent）
- M3：採用 AI 草稿（9 步事務 + rollback + DRAFT_STALE 偵測）
- M3：status 自動更新（3 觸發點：save/adopt/manual）
- M3：git 歷史 UI（HistoryPanel + Diff + 還原）
- M4：空狀態 UI + Onboarding 引導
- M4：LLM 設定引導 Modal

#### 技術底層
- 6 個 LLM provider（Anthropic / OpenAI / Google / xAI / Ollama / LM Studio）
- capability-aware fallback Router（vision 請求自動跳過純文字模型）
- better-sqlite3 草稿 cache
- Spec 001-010 完整實作

### Notes
- Windows SmartScreen 警告為預期行為（無 EV cert）
- macOS：第一次跑需在「安全性」允許執行未公證應用
- 需要本機已安裝 git ≥ 2.30.0
```

- [ ] **Step 2: 重寫 README.md 開頭**

```markdown
# Novel Writer

> 個人本機小說撰寫工具。AI 輔助寫作，git 版控，完全本機執行。

## ✨ 功能

- 📝 **章節編輯器**：即時 autosave，Ctrl+S 手動儲存，git 自動備份
- 🤖 **AI 撰寫**：串流產出章節草稿，章節敏感外貌查詢
- 🧠 **記憶閉環**：採用草稿後自動更新 story/character status，下一章 AI 記得前章
- 👤 **角色卡**：6 分區結構化欄位，AI 統整描述，Vision 圖片解析
- 📚 **git 歷史**：每次儲存自動 commit，可預覽/Diff/還原任何版本

## 🚀 快速開始

### 安裝（Windows）

1. 從 [Releases](https://github.com/Smoker21/personal-novel-writer/releases) 下載 `novel-writer_0.1.0_x64-setup.exe`
2. 安裝執行（如出現 SmartScreen 警告，點「更多資訊」→「仍要執行」）
3. 確保已安裝 git（`git --version` 可用）

### 設定 LLM

**地端（LM Studio，推薦）：**
1. 安裝 [LM Studio](https://lmstudio.ai/) 並下載 `Qwen2.5-14B` 或更大模型
2. 在 LM Studio 啟動 Server（port 1234）
3. Novel Writer 設定頁：啟用 LM Studio，套用「全地端 Qwen」preset

**雲端（Anthropic）：**
1. 在設定頁輸入 [Anthropic API key](https://console.anthropic.com/)
2. 套用「全雲端 Haiku」preset

## 📁 資料儲存

- 小說內容：使用者選定的資料夾（可 Drive 同步）
- AI 草稿 cache：`~/.novel-writer/cache/`（純本機）
- 設定：`~/.novel-writer/settings.yaml`

## 開發

```bash
git clone ...
pnpm install
pnpm run dev   # 同時啟動 API(3001) + Web(5173)
```

詳見 [docs/user-guide/](docs/user-guide/)
```

- [ ] **Step 3: commit**

```bash
git checkout -b feat/m4-docs
git add CHANGELOG.md README.md
git commit -m "docs: rel-1 CHANGELOG v0.1.0 + README rewrite with quick start"
```

---

## Task 11: User Guide（doc-2~6）

**Files:**
- Create: `docs/user-guide/installation.md`
- Create: `docs/user-guide/first-novel.md`
- Create: `docs/user-guide/ai-setup.md`
- Create: `docs/user-guide/git-version-control.md`
- Create: `docs/user-guide/troubleshooting.md`

- [ ] **Step 1: 建立 installation.md**

```markdown
# 安裝指南

## Windows

1. 從 Releases 下載 `.exe`
2. 安裝（若出現 SmartScreen 警告：點「更多資訊」→「仍要執行」）
3. 安裝 git：https://git-scm.com/download/win

## macOS

1. 下載 `.dmg`，拖到 Applications
2. 首次執行若看到「無法開啟」警告：
   - 系統偏好設定 → 隱私權與安全性 → 點「仍要開啟」
3. 安裝 git：`xcode-select --install`

## Linux

1. 下載 `.AppImage`，賦予執行權限：`chmod +x *.AppImage`
2. 執行：`./novel-writer_*.AppImage`
3. 安裝 git：`sudo apt install git`（Debian/Ubuntu）
```

- [ ] **Step 2: 建立 ai-setup.md**

```markdown
# AI 設定指南

## 地端 LLM（推薦，免費）

### LM Studio

1. 下載 [LM Studio](https://lmstudio.ai/)
2. 搜尋並下載 `Qwen2.5-14B-Instruct-GGUF`（需要約 8GB 顯存）
3. 在 LM Studio 的 Local Server 頁面啟動 Server
4. Novel Writer 設定頁：
   - 啟用「LM Studio（地端）」
   - endpoint 保持 `http://localhost:1234`
   - 點「測試連線」確認綠色
   - 套用「全地端 Qwen」preset
   - 儲存

### Ollama

1. 安裝 [Ollama](https://ollama.ai/) 並執行 `ollama pull qwen2.5:14b`
2. Novel Writer 設定頁啟用「Ollama（地端）」，套用 preset

## 雲端 LLM

### Anthropic Claude

1. 申請 [Anthropic API key](https://console.anthropic.com/)
2. 設定頁填入 key，套用「全雲端 Haiku」preset（低成本）

### OpenAI

1. 取得 OpenAI API key
2. 設定頁填入，選擇 `gpt-4o-mini` 作為預設模型
```

- [ ] **Step 3: 建立其餘 docs**

`first-novel.md`、`git-version-control.md`、`troubleshooting.md` 分別寫入基本內容。

- [ ] **Step 4: commit**

```bash
git add docs/user-guide/
git commit -m "docs: doc-2~6 user guide — installation + AI setup + git + troubleshooting"
git push -u origin feat/m4-docs
gh pr create --title "docs: M4 user guide + README + CHANGELOG" --body "installation/ai-setup/git/troubleshooting guides"
gh pr merge --rebase --delete-branch
git checkout main && git pull
```

---

## Task 12: v0.1.0 Release

- [ ] **Step 1: 最終驗證**

```bash
pnpm typecheck && pnpm test
```
Expected: 全綠

- [ ] **Step 2: 標 rc tag 試 build**

```bash
git tag v0.1.0-rc1
git push origin v0.1.0-rc1
```
觀察 GitHub Actions release workflow 是否觸發（web build 只，不含 Tauri 因 CI 需要特定環境）

- [ ] **Step 3: 標正式 tag**

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 4: 更新 GitHub Release notes**

在 GitHub Release 頁面加入截圖和 release notes。
