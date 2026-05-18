# M6-X — Node.js 升版與技術棧翻新規劃

> Status: `Ready`（PM Round 1 拍板 2026-05-18 — Q-X1~5 全照 dev 推薦）
> 提案：spec-architect（2026-05-18）
> 觸發：PM 2026-05-18 拍板「M6 範圍含 Node.js 升版 + 架構翻新」
> 定案 scope：**B（中）+ D 拆 M7**
> 相關 ADR：[ADR-0011](../adr/0011-tech-stack-upgrade-policy.md)

---

## 1. 動機

| 觸發 | 來源 |
|---|---|
| **使用者環境已升 Node v26.1.0** | memory `tech_stack.md` / `dev_env_todo.md`（2026-05-14） |
| **`package.json engines.node` 仍鎖 `>=18.17.0`** | 與實際使用機環境脫節 |
| **better-sqlite3 / sharp ABI mismatch** | v0.2.0-pm-report §2.2（M5 已踩，現靠 `postinstall: pnpm rebuild` 兜底，但無 engines 規範時新貢獻者仍會撞）|
| **zod 跨 workspace 不一致**（api v3 / prompt-library v4）| 直接從 package.json 掃出；類型漂移風險 |
| **多個主依賴有 major 升版可用** | React 19 / Vite 6 / Vitest 3 / Tauri 2.x latest / biome 2 / Zustand 5 / Playwright 1.5x / Anthropic SDK / OpenAI SDK 5 / React Router 7 / sharp 0.34 |

---

## 2. 現況掃描（2026-05-18 git HEAD）

### Node / 工具鏈

| 項 | 現況 | 最新 LTS / Stable | 缺口 |
|---|---|---|---|
| `engines.node` | `>=18.17.0` | Node 22 LTS / 24 Current（使用者裝 26.1.0）| 大 |
| `engines.pnpm` | `>=8.0.0` | 9.x stable / 10.x | 中 |
| `.nvmrc` / `packageManager` | 都無 | 應有 | 大 |
| `@types/node` | `^22.0.0` | 22.x / 24.x | 小（看選 22 還 24）|
| TypeScript | `^5.7.0` | 5.8.x | 小 |
| Rust toolchain | `1.77.2` | 1.85+ stable | 中 |

### 前端

| 項 | 現況 | 最新 | 跳級 |
|---|---|---|---|
| React | `^18.3.1` | 19.x | 1 major |
| react-dom | `^18.3.1` | 19.x | 1 major |
| react-router-dom | `^6.28.0` | 7.x | 1 major（API 大改）|
| Vite | `^5.4.10` | 6.x | 1 major（Node 20+ 要求）|
| @vitejs/plugin-react | `^4.3.4` | 4.x latest | 小 |
| Vitest | `^2.1.0` | 3.x | 1 major |
| Zustand | `^4.5.6` | 5.x | 1 major |
| CodeMirror 6 | `^6.x` 各模組 | 6.x latest | 小（minor 升）|
| Dexie | `^4.0.10` | 4.x latest | 小 |
| Tailwind | `^4.0.0` | 4.x latest | 小 |
| lucide-react | `^0.479.0` | 0.4xx latest | 小 |
| MSW | `^2.6.0` | 2.x latest | 小 |
| jsdom | `^25.0.0` | 26.x | 1 major |

### 後端 / SDK

| 項 | 現況 | 最新 | 跳級 |
|---|---|---|---|
| Hono | `^4.6.0` | 4.x latest | 小（minor 升）|
| @hono/node-server | `^1.13.0` | 1.x latest | 小 |
| better-sqlite3 | `^12.10.0` | 12.x latest | 小（ABI 對應 Node 版本）|
| sharp | `^0.32.6` | 0.34.x | 2 minor（含 native ABI 變動）|
| zod | api **v3.24** / prompt-library **v4.4** | 4.x | api 要升 1 major 對齊 |
| @anthropic-ai/sdk | `^0.39.0` | 0.60+ | 多次升（含 breaking）|
| openai | `^4` | 5.x | 1 major |
| @google/genai | `^1.0.0` | 1.x latest | 小 |
| gpt-tokenizer | `^2.1.0` | 2.x latest | 小 |
| Tauri (npm) | `^2` | 2.x latest | 小 |
| Tauri (Cargo) | `2` (rust-version `1.77.2`) | 2.x latest（rust 1.85+ 建議）| 中 |
| Playwright | `^1.44.0` | 1.5x | 6 minor |
| biome | `^1.9.4` | 2.x | 1 major（config 格式變）|

### 一致性問題

1. ⚠️ **zod 跨 workspace 版本不一致**（v3 vs v4） — 共用 `packages/shared-types` 若用 zod schema，會跨版本漂移
2. ⚠️ **無 `.nvmrc` / `packageManager`** — 多人協作 / CI 環境隨機
3. ⚠️ **`engines.node >=18.17`** 與 better-sqlite3 v12 不相容（v12 要 Node 20+）— 已在實際機器靠 rebuild 繞過

---

## 3. 「翻新」範圍清單（子項分類）

| # | 子項 | 風險 | 必要性 |
|---|---|---|---|
| **X-1** | `engines.node` 升到 `>=22.0.0`（LTS）+ 加 `.nvmrc` + `packageManager` 鎖 pnpm 版本 | 低 | **必做** |
| **X-2** | `@types/node` 對齊（^22 或 ^24） | 低 | **必做** |
| **X-3** | zod 統一升 v4（api 從 v3 升）；shared-types 補 schema fixture 對應 | 中 — schema breaking | **必做** |
| **X-4** | sharp `^0.32` → `^0.34`（含 native ABI rebuild） | 中 — portrait 處理測試要重跑 | **必做** |
| **X-5** | Vite `5 → 6` + Vitest `2 → 3` | 中 — config 格式 + test API 微改 | 推薦 |
| **X-6** | biome `1 → 2`（config schema 變） | 中 — `biome.json` 要 migrate | 推薦 |
| **X-7** | TS `5.7 → 5.8` + tsconfig 補新嚴格選項 | 低 | 推薦 |
| **X-8** | Hono / better-sqlite3 / Dexie / Tailwind / CodeMirror / lucide-react / MSW / jsdom minor 升 | 低 | 推薦 |
| **X-9** | Anthropic SDK `0.39 → 0.60+` + OpenAI SDK `4 → 5` | 中-高 — adapter call site 要改 | 推薦 |
| **X-10** | React `18 → 19` + react-router-dom `6 → 7` | **高** — Suspense / actions / ref / loader API 全面變動 | 評估後決定 |
| **X-11** | Zustand `4 → 5` | 中 — store factory API 變 | 評估後決定 |
| **X-12** | Tauri Rust toolchain `1.77 → 1.85`（rust-version 同步）| 中 — bundle 重建 | 評估後決定 |
| **X-13** | Playwright `1.44 → 1.5x` | 低 | 推薦 |
| **X-14** | Vercel 風格 monorepo turbo / nx 引入 | 低-中 | 不做（YAGNI） |
| **X-15** | CJS → ESM 全棧（已是 ESM）| — | 不需做 |

---

## 4. Scope 四個選項

| 選項 | 包含子項 | PR 數 | 風險 | 完成時間 |
|---|---|---|---|---|
| **A. 最小（安全網）** | X-1 / X-2 / X-3 / X-4 | 4 | 低 | W1 內 |
| **B. 中（工具鏈升）** | A + X-5 / X-6 / X-7 / X-8 / X-13 | 9-10 | 低-中 | W1~W2 |
| **C. 大（含後端 SDK + 前端 minor）** | B + X-9 | 11-12 | 中 | W1~W3 |
| **D. 全棧翻新** | C + X-10 / X-11 / X-12 | 14-16 | 高 | W3~W5 |

### dev 推薦 — **B（中）+ D 拆 M7**

理由：

1. **A 必做**：Node engines / zod 對齊是技術債清零；不修會持續引發新貢獻者 / 新環境踩雷
2. **B 在「品質補強」milestone 合理**：Vite/Vitest/biome major 都是「工具鏈」，跳級風險可控，且能讓後續 PR 跑在新 lint / test 規則上一次到位
3. **C SDK 升風險集中在 LLM adapter** — 與 xiaohuangwen 新 adapter 同時做反而是好時機（adapter 大改本來就要重測）；但若 PM 怕兩條線同時動 → 推 M7
4. **D 大爆炸**：React 19 + Router 7 + Zustand 5 三個 frontend major 不該與 xiaohuangwen + polish-prose UI 同時做 — 衝突點過多，QA 無法分離 root cause。推 **M7「前端架構翻新」獨立 milestone**

### 不推薦 D（M6 內）的具體理由

| 子項 | 衝突 |
|---|---|
| React 19 | PolishPanel（spec 012）、PortraitGrid 等 M6 新 UI 同時動會混淆 hooks behavior 變動的影響 |
| React Router 7 | Loader API 全面改 — 影響所有 page；M6 不該動既有頁面 routing |
| Zustand 5 | Store factory API 變 — 既有 store 全要改；無 user-visible 收益 |

---

## 5. 任務細節（dev 階段用）

### X-1 Node engines

```json
// package.json
{
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

```
// .nvmrc
22
```

驗收：`pnpm install` 在 Node 22 / 24 / 26 三版皆通；CI（若有）跑 Node 22。

### X-2 @types/node

| 選 | 理由 |
|---|---|
| `^22` | 鎖 LTS 對應 engines | ✅ 推薦 |
| `^24` | 跟使用者實際 v26（更近） | 多升一次 |

### X-3 zod 統一 v4

1. `apps/api/package.json`：`zod ^3` → `^4`
2. 所有 `import { z } from "zod"` 不變
3. Breaking changes 掃：
   - `.parse()` / `.safeParse()` API 不變
   - `z.string().email()` 等 method API 不變
   - `z.preprocess` / `z.refine` 行為有微調 — 跑全 vitest 確認
4. `packages/shared-types` 若有 zod fixture，補測
5. PR 連同 vitest run 通過才合

### X-4 sharp 升

1. `apps/api/package.json`：`sharp ^0.32` → `^0.34`
2. 確認 `pnpm rebuild sharp` postinstall 仍跑（已有）
3. spec 002b portrait extraction 走 chrome-devtools-mcp 手測一輪
4. Windows / macOS / Linux 三平台 prebuilt binary 都驗

### X-5 Vite 6 + Vitest 3

1. `apps/web/package.json`：`vite ^5` → `^6`；`vitest ^2` → `^3`
2. `vite.config.ts`：檢查 `defineConfig` 是否有 breaking（一般無）
3. `vitest.config.ts`：`test.environment` / `test.deps` 改名（Vitest 3 改 `test.deps.optimizer`）
4. snapshot 格式可能變 — 跑一次 `vitest --update-snapshots`，手動 diff 確認

### X-6 biome 2

1. `biome.json` 用 `biome migrate` CLI 自動轉
2. 跑 `biome check .` 看新規則噴的 warnings — 一律當錯改完
3. 注意 `correctness/noUnused*` 系列規則可能變嚴

### X-7 TS 5.8

1. `typescript` 升 `^5.8`
2. 各 workspace `tsconfig.json` 補：`"moduleDetection": "force"` / `"verbatimModuleSyntax": true`（若未設）
3. 跑 `pnpm typecheck` 通過

### X-8 後端 minor 升

逐項 `pnpm up <pkg>@latest`，每升一個跑 typecheck + vitest，分 PR：

- hono / @hono/node-server
- better-sqlite3
- Dexie
- Tailwind
- CodeMirror（6 模組一次升）
- lucide-react
- MSW
- jsdom（含 vitest 整合測試）

### X-9 LLM SDK major 升（**與 xiaohuangwen 同 PR 軌道**）

| SDK | 變動點 |
|---|---|
| `@anthropic-ai/sdk 0.39 → latest` | `messages.create` stream API 微改；error 型別重新分類 — `packages/llm-adapter/src/providers/anthropic.ts` 重測 |
| `openai 4 → 5` | `chat.completions.create` 一致；型別更嚴格；fetch transport 改用 native fetch（捨棄 axios）|
| `@google/genai` | 升 minor |
| `gpt-tokenizer` | 確認對新模型 ID（claude-sonnet-4-7 等）兼容 |

每個 provider 單獨 PR；走 smoke test 驗（packages/llm-adapter/scripts/smoke.ts）。

### X-13 Playwright

`apps/e2e/package.json`：`@playwright/test ^1.5x`；跑 `pnpm playwright install` 更新 browser binaries。

---

## 6. 推 M7 的子項（X-10 / X-11 / X-12）

寫進 `M6-backlog.md` 與未來 `M7-discussion.md` 草稿：

- **M7-Y1**：React 18 → 19（含 react-dom / 元件改寫；新增 actions / Suspense Boundary）
- **M7-Y2**：react-router-dom 6 → 7（loader / action API 全改；route 結構重整）
- **M7-Y3**：Zustand 4 → 5（store factory API；vanilla `create` 改 `createStore`）
- **M7-Y4**：Tauri Rust 1.77 → 1.85（rust-toolchain.toml 鎖 + bundle 全平台重測）

---

## 7. 風險矩陣

| 風險 | 影響範圍 | 緩解 |
|---|---|---|
| `pnpm rebuild` 在新 Node 失敗（better-sqlite3 / sharp） | dev 完全卡死 | X-1 同 PR 加 CI matrix（22 / 24）跑 install + smoke test |
| zod v4 schema breaking | api 所有 endpoint validation | X-3 PR 單獨跑 + 一輪手測 build-prompt / generate / settings / adopt |
| Vite 6 / Vitest 3 snapshot 變動 | 既有 23 個 web test | X-5 PR 跑 `--update-snapshots` + 人工 diff 全部 snapshot 變動 |
| biome 2 規則變嚴 | 大量 lint warnings | X-6 之前先 stash；migrate 後逐項 fix |
| Anthropic SDK breaking | chapter-writer / character-card-consolidator / status-updater 全失效 | X-9 走獨立 PR；smoke test + golden test 驗 |
| 升版集中爆炸難 root cause | M6 整體 release 時程 | 嚴格**單 PR 單升**；每 PR 跑完整 typecheck + test 才合 main |

### 回滾策略

- 每個 X-* 子項**獨立 PR**，方便 `git revert` 單一 PR 回滾
- 不做「all-in-one tech-refresh」commit
- 失敗的子項 → revert PR，記在 `M6-backlog.md` 推 M7

---

## 8. 整合到 M6 時程

若 PM 拍板 **B（中）**：

```
W1 day 1-2:
  X-1 + X-2 + X-7  → 1 PR「chore: pin Node 22 LTS + TS 5.8」
  X-3              → 1 PR「chore(deps): zod v4 跨 workspace 統一」
W1 day 3-5:
  X-4              → 1 PR「chore(deps): sharp ^0.34」+ portrait 手測
  M6-C status-updater 三層修復（既有 P0）

W2:
  X-5              → 1 PR「chore(deps): Vite 6 + Vitest 3」
  X-6              → 1 PR「chore(lint): biome 2 migrate」
  X-8              → 5-7 個小 PR（hono / better-sqlite3 / Dexie / Tailwind / CM6 / lucide / MSW / jsdom）
  X-13             → 1 PR「chore(deps): Playwright 1.5x」
  M6-A BDD step defs 起手

W3:
  X-9（與 xiaohuangwen adapter 同軌道）→ 3 PR（anthropic / openai / google）
  M6-A BDD step defs 完成
  xiaohuangwen adapter 起手

W4~W5:
  既有 M6 任務（xiaohuangwen 完成 / polish-prose / M6-B 共用元件單元測試 / M6-D 拋光）
  → 走在已升版的 toolchain 上

v0.3.0 release：含 M6-X B 軌道
```

若 PM 拍 **A（最小）**：壓在 W1 day 1-3 完成 4 個 PR；不擋後續。

若 PM 拍 **C（大）**：W1~W3 全跑技術翻新，xiaohuangwen 後挪 W3~W5；release 推到 v0.4.0。

若 PM 拍 **D（全棧）**：M6 release 推到 6~8 週後；不建議。

---

## 9. PM 拍板結果（2026-05-18）

| Q-X | 問題 | dev 推薦 | **PM 拍板** |
|---|---|---|---|
| **Q-X1** | scope 選 A / B / C / D | B + D 拆 M7 | ✅ **B + D 拆 M7** |
| **Q-X2** | Node engines 鎖 22 LTS 還是 24 Current | 22 LTS | ✅ **22 LTS** |
| **Q-X3** | @types/node 對齊 22 還是 24 | 22 | ✅ **^22** |
| **Q-X4** | 是否寫 ADR 記錄此次翻新決策 | 是 | ✅ **ADR-0011** |
| **Q-X5** | M7 是否優先排「前端架構翻新」（X-10/11/12）| M7 中段（FTS5 之後）| ✅ **M7 中段** |

### 定案範圍（M6 內執行）

X-1 / X-2 / X-3 / X-4 / X-5 / X-6 / X-7 / X-8 / X-13 — **共 9 項，9~10 PR**

### 推 M7 範圍

- **M7-Y1** React 18 → 19
- **M7-Y2** react-router-dom 6 → 7
- **M7-Y3** Zustand 4 → 5
- **M7-Y4** Tauri Rust 1.77 → 1.85
- 排程：M7 中段（**S1 FTS5 全文搜尋之後**）

詳見 `docs/architecture/milestones/M6-backlog.md` M7 段。

---

## 變更紀錄

- 2026-05-18：初版，spec-architect 提案；等 PM 拍 Q-X1~5。
- 2026-05-18（同日 — PM Round 1 拍板）：Q-X1~5 全照 dev 推薦；status Draft → Ready；scope 定案 = B；M7 推 Y1~Y4。
