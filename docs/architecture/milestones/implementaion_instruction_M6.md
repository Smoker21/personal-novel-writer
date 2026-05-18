# M6 Dev 開工指令（Implementation Instruction）

> 給接手 M6 dev 階段的 Session — 本文 = 你的完整 prompt。
> 你不需要看 SA 階段的 chat history；本文 + 引用文件就是全部依據。
>
> 你是誰：**Dev coordinator**。依本文派 `backend-developer` / `frontend-developer` / `llm-integrator` / `qa-engineer` 子代理執行各 PR；自己不直接寫產品 code（除非小到單檔小修補）。
>
> 上一階段成果：commit `291bfdd` — M6 SA 階段全部完成（所有 spec / ADR / 規劃文件 Ready）。

---

## 一句話定位

M6 = **品質補強 + xiaohuangwen Provider + polish-prose Skill + 技術翻新**，目標 release **v0.3.0**。

四條軌道並行：

| 軌道 | 內容 |
|---|---|
| **M6-X** | Node 22 LTS + 工具鏈 / 後端 SDK major 升（scope = B，依 ADR-0011）|
| **M6-A** | BDD step defs（7 份 .feature 全跑通）|
| **M6-B** | 共用元件單元測試 |
| **M6-C** | status-updater 三層 timeout 修復（P0）|
| **M6-D** | TD-4~8 視覺一致性拋光 |
| **P1** | xiaohuangwen Provider + structured generate UI + polish-prose Skill（spec 005/006/009/011/012）|

⚠️ **不加任何產品新功能**；S1 FTS5 / S2 preset / 前端框架 major（React 19 / Router 7 / Zustand 5 / Tauri Rust）**全部推 M7**。

---

## 動工前必讀（嚴格順序）

| # | 檔 | 為何 |
|---|---|---|
| 1 | `CLAUDE.md` | 工作流規範 + **D5 自治邊界** + **sub-agent 派工 race 預防**（新增段） |
| 2 | `docs/architecture/adr/0011-tech-stack-upgrade-policy.md` | 升版策略（單 PR 單升 / 回滾 SOP / native module rebuild）|
| 3 | `docs/architecture/milestones/M6-X-tech-refresh.md` | M6-X 9 個子項任務細節 + scope B 定案 |
| 4 | `docs/architecture/adr/0010-llm-adapter-structured-generation.md` | StructuredNovelProvider 介面 + dispatch 規則 |
| 5 | `docs/architecture/specs/_components/_index.md` | 共用元件 canonical 規格目錄 |
| 6 | `docs/architecture/milestones/v0.2.0-pm-report.md` | M5 遺留 + status-updater 根因（§2.3）|
| 7 | 對應 PR 的 spec | 動工前必讀；spec=Draft 禁止寫產品程式碼 |

---

## PR 序列（依此順序執行）

### W1 — 起手清基 + P0 修復

**嚴格順序** PR 1 → 2 → 3；**PR 4 與 1~3 並行**。

#### PR 1 — Node 22 LTS + TS 5.8（X-1 + X-2 + X-7）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec section | `M6-X-tech-refresh.md` §5 X-1/X-2/X-7 + ADR-0011 §「單 PR 升版 SOP」|
| 修改檔 | `package.json`（engines / packageManager）/ 新建 `.nvmrc` / 各 workspace `package.json` 的 `@types/node ^22` + `typescript ^5.8` |
| 規格 | `engines.node: ">=22.0.0"` / `engines.pnpm: ">=9.0.0"` / `packageManager: "pnpm@9.15.0"` / `.nvmrc` 內容為 `22` |
| 驗收 | `pnpm install` 跑通；`pnpm typecheck` 綠；`pnpm rebuild better-sqlite3 sharp` 不噴 ABI mismatch |
| PR title | `chore: pin Node 22 LTS + TS 5.8 + packageManager` |

#### PR 2 — zod 跨 workspace 統一 v4（X-3）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec section | `M6-X-tech-refresh.md` §5 X-3 |
| 修改檔 | `apps/api/package.json` zod `^3` → `^4`；掃所有 `import { z }` call site；`packages/shared-types` 補 fixture |
| Breaking | zod v3 → v4 主要 schema API 不變；`.preprocess` / `.refine` 有微調 — 跑全 vitest 確認 |
| 驗收 | `pnpm -r test` 綠；以下 endpoint 手測一輪：`POST .../build-prompt` / `POST .../generate` / `PUT /api/settings` / `POST .../adopt` |
| PR title | `chore(deps): zod v4 跨 workspace 統一` |

#### PR 3 — sharp 0.34（X-4）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec section | `M6-X-tech-refresh.md` §5 X-4 + ADR-0011 §「Native module rebuild」|
| 修改檔 | `apps/api/package.json` sharp `^0.32` → `^0.34` |
| 驗收 | postinstall `pnpm rebuild sharp` 不噴錯；spec 002b portrait extraction 走 chrome-devtools-mcp 手測（上傳一張 + extract 一張）|
| PR title | `chore(deps): sharp ^0.34` |

#### PR 4 — status-updater 三層 timeout（M6-C P0）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec section | `v0.2.0-pm-report.md` §2.3 + `M6-discussion.md` D3 |
| 修改檔 | `apps/api/src/services/status-updater.ts`（L1）/ `apps/web/src/features/.../StatusUpdateIndicator.tsx`（L2）/ `apps/api/src/services/job-event-bus.ts`（L3）|
| 規格 | L1: service 加 90s timeout + 強制 `emit failed`；L2: client 加 60s timeout + 重連邏輯；L3: SSE timeout `30s → 5min` |
| 驗收 | 手測「採用 AI 章節 → 切到 LM Studio 故意斷線」→ 90s 內必收到 `failed` event；UI 不卡住；regression test 鎖死 |
| PR title | `fix(api): status-updater 三層 timeout 修復（M6-C P0）` |

### W2 — 工具鏈 major 升 + BDD 起手

#### PR 5 — Vite 6 + Vitest 3（X-5）

| 項 | 內容 |
|---|---|
| Subagent | `frontend-developer` |
| 修改檔 | `apps/web/package.json` vite `^5` → `^6`、vitest `^2` → `^3`；vite.config.ts / vitest.config.ts |
| 注意 | `test.deps` 改名為 `test.deps.optimizer`；snapshot 格式可能變 — 跑 `vitest --update-snapshots` + 人工 diff 全部變動 |
| 驗收 | `pnpm --filter @novel-writer/web test` 綠；snapshot diff PM round |
| PR title | `chore(deps): Vite 6 + Vitest 3` |

#### PR 6 — biome 2 migrate（X-6）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| 修改檔 | `biome.json`（用 `biome migrate` CLI 自動轉）；逐項修新規則 warning |
| 驗收 | `pnpm lint` 綠 |
| PR title | `chore(lint): biome 2 migrate` |

#### PR 7~12 — 後端 minor 升（X-8）

**單 PR 單升**，逐項：

| PR | 子代理 | 範圍 |
|---|---|---|
| 7 | backend-developer | `hono` + `@hono/node-server` 升 latest |
| 8 | backend-developer | `better-sqlite3` 升 latest（含 rebuild）|
| 9 | frontend-developer | `dexie` + `@tailwindcss/vite` + `tailwindcss` 升 latest |
| 10 | frontend-developer | CodeMirror 6 模組一次升 latest（state / view / commands / language / lang-markdown）|
| 11 | frontend-developer | `lucide-react` + `react-router-dom`（**6.x latest，不升 7**）|
| 12 | frontend-developer | `msw` + `jsdom`（jsdom 25 → 26）|

每 PR title pattern：`chore(deps): <pkg> ^X.Y`；每 PR 跑對應 vitest 綠才合。

#### PR 13 — Playwright 1.5x（X-13）

| 項 | 內容 |
|---|---|
| Subagent | `qa-engineer` |
| 修改檔 | `apps/e2e/package.json` `@playwright/test ^1.5x` |
| 驗收 | `pnpm playwright install` 更新 browser binary；既有 e2e tests 跑綠 |

#### PR 14 起 — M6-A BDD step defs

> **依賴**：必在 PR 5（Vitest 3）之後

| 項 | 內容 |
|---|---|
| Subagent | `qa-engineer` |
| 範圍 | 7 份 .feature 補 cucumber-js step definitions：002 / 003 / 005 / 006 / 007 / 009 / 012 / 032 |
| 規格 | 每份 feature 一個 PR；不要 all-in-one |
| 驗收 | `pnpm test:e2e` 對該 feature 全綠 |
| PR title pattern | `test(bdd): <NNN>-<slug> step definitions` |

### W3 — LLM SDK + xiaohuangwen 同軌道

#### PR Ax / Ay / Az — LLM SDK major 升（X-9）

| PR | Subagent | 範圍 |
|---|---|---|
| Ax | `llm-integrator` | `@anthropic-ai/sdk 0.39` → latest（含 messages.create stream API 微改 / error 型別重新分類）|
| Ay | `llm-integrator` | `openai 4` → `5`（native fetch 取代 axios）|
| Az | `llm-integrator` | `@google/genai` 升 latest |

**每 PR 必跑**：`packages/llm-adapter/scripts/smoke.ts` 對該 SDK 的 stream + abort + error mapping 全綠才合。

#### PR B1 — XiaohuangwenAdapter（spec 011）

| 項 | 內容 |
|---|---|
| Subagent | `llm-integrator` |
| Spec | `docs/architecture/specs/011-xiaohuangwen-provider.md` + `docs/architecture/adr/0010-llm-adapter-structured-generation.md` |
| 修改檔 | `packages/llm-adapter/src/types.ts`（加 `StructuredNovelProvider` / `ModelCapabilities.hasStructuredNovelGenerate` / `LLMErrorCode` 擴張 / `Provider.origin` 擴張）/ `packages/llm-adapter/src/providers/xiaohuangwen.ts`（新）/ `packages/llm-adapter/src/router.ts`（加 `generateNovel` / `polishNovel`）/ 其他 6 個 provider 補 `capabilities.hasStructuredNovelGenerate=false` |
| 驗收 | adapter 單元測試（stream parse / error mapping / abort）；mock xiaohuangwen 端點走過 generate / polish / balance 三路徑 |
| PR title | `feat(adapter): XiaohuangwenAdapter + structured generation 介面（spec 011 + ADR-0010）` |

#### PR B2 — build-prompt / generate structured 分支（spec 005）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec | `docs/architecture/specs/005-ai-write-chapter.md`（M6 增量段：「**Response 200**」改 discriminated union + `KIND_MISMATCH`）|
| 修改檔 | `apps/api/src/services/context-collector.ts`（加 `collectStructuredInputs()`）/ `apps/api/src/routes/build-prompt.ts` / `apps/api/src/routes/generate.ts` / `apps/api/src/services/chapter-writer.ts`（dispatch 依 capability flag）|
| 驗收 | typecheck + vitest；mock xiaohuangwen provider 跑 build-prompt → 回 `kind: "structured"` + 5 欄；generate 收 `kind: "structured"` 對 messages-array provider 回 400 `KIND_MISMATCH` |
| PR title | `feat(api): structured generate 分支（spec 005 M6 修訂）` |

#### PR B3 — balance endpoint + routing slot 白名單（spec 009）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec | `docs/architecture/specs/009-settings-page.md`（M6 變更段）|
| 修改檔 | `apps/api/src/routes/settings.ts`（加 `GET .../balance/:providerId` + `INVALID_ROUTING_SLOT` 驗證）/ `apps/api/src/services/settings-store.ts`（schema migration 補 `providers.xiaohuangwen` + `agents.polish-prose`）|
| 驗收 | balance 對 xiaohuangwen 正常回；對其他 provider 回 `BALANCE_NOT_SUPPORTED`；PUT settings 把 xiaohuangwen 放在 status-updater slot 回 400 |
| PR title | `feat(api): balance endpoint + routing slot 白名單（spec 009 M6 修訂）` |

### W4~5 — UI + polish-prose + 拋光 + release

#### PR C1 — xiaohuangwen settings UI（spec 009）

| 項 | 內容 |
|---|---|
| Subagent | `frontend-developer` |
| 修改檔 | `apps/web/src/features/settings/ProviderCard.tsx`（三類分組）/ `apps/web/src/features/settings/XiaohuangwenProviderCard.tsx`（新）/ `apps/web/src/features/settings/AgentRoutingCard.tsx`（dropdown 過濾 + polish-prose card）|
| 規格 | 共用元件 reference 走 `_components/`：`ModelDropdown.hardcoded` prop / `Spinner` / Error 三層 |
| 驗收 | chrome-devtools-mcp 手測：xiaohuangwen 啟用 → 餘額查詢 → 切 polish-prose routing |
| PR title | `feat(web): xiaohuangwen settings UI（spec 009 M6 修訂）` |

#### PR C2 — ChapterEditor structured generate 五欄編輯（spec 005）

| 項 | 內容 |
|---|---|
| Subagent | `frontend-developer` |
| Spec | spec 005「structured path UI 分支」段 |
| 修改檔 | `apps/web/src/features/chapter-editor/PromptPreviewModal.tsx` 加 discriminated union 分支 / 新 `StructuredInputsForm.tsx`（5 欄 ExpandableTextarea）|
| 驗收 | 對 xiaohuangwen routing 跑 build-prompt → 顯示五欄編輯；對 anthropic routing 仍顯示單一 promptText |
| PR title | `feat(web): structured generate 五欄編輯（spec 005 M6 修訂）` |

#### PR C3 — polish-prose endpoint + service（spec 012）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` + `llm-integrator`（共寫 prompt template）|
| Spec | `docs/architecture/specs/012-polish-prose-flow.md` + `docs/skills/polish-prose.md` |
| 修改檔 | `apps/api/src/routes/polish.ts`（新）/ `apps/api/src/services/polish-prose.ts`（新；dispatch capability flag）/ `packages/prompt-library/prompts/skills/polish-prose.ts`（新；普通 LLM path template）|
| 驗收 | mock xiaohuangwen 走 polishNovel；mock anthropic 走 stream + prompt template |
| PR title | `feat(skill): polish-prose endpoint + service（spec 012）` |

#### PR C4 — PolishPanel + ReadOnlyCollapsible（spec 012）

| 項 | 內容 |
|---|---|
| Subagent | `frontend-developer` |
| Spec | spec 012「PolishPanel UI」段（PM 直接設計版本）|
| 修改檔 | `apps/web/src/components/ReadOnlyCollapsible.tsx`（新 spec-local 元件，**不**進 `_components/`）/ `apps/web/src/features/chapter-editor/PolishButton.tsx`（CM6 SelectionMenu plugin，框選後浮動工具列）/ `apps/web/src/features/chapter-editor/PolishPanel.tsx`（右側滑入，三段式）/ `apps/web/src/hooks/useStreamPolish.ts` |
| 規格 | 三段式：選取文字（收合 read-only）/ 潤飾提示詞（ExpandableTextarea 可放大）/ 潤飾結果（ExpandableTextarea 可放大，串流中 read-only）+ 三按鈕（潤飾 / 重新產生 / 採用）|
| 注意 | **不引入 jsdiff**（PM 拍板移除 DiffView 設計）|
| 驗收 | chrome-devtools-mcp 手測：框選 → 浮動按鈕 → panel 開啟 → 潤飾 → 編輯結果 → 採用 → CM6 取代選取段 → 編輯器 dirty |
| PR title | `feat(web): PolishPanel + ReadOnlyCollapsible（spec 012）` |

#### PR C5 — prompt.md 兩 path 渲染（spec 006）

| 項 | 內容 |
|---|---|
| Subagent | `backend-developer` |
| Spec | `docs/architecture/specs/006-adopt-chapter-draft.md`（M6 修訂段）|
| 修改檔 | `apps/api/src/services/prompt-md.ts`（依 `PromptSnapshot.kind` 分支渲染；frontmatter 加 `kind`；metadata 依 path 填 token 或字數）|
| 驗收 | 採用 xiaohuangwen 章節後 `chapters/chapter_NNNN_prompt.md` 含「## 結構化生成欄位」段 + `kind: structured` frontmatter |
| PR title | `feat(api): prompt.md 兩 path 渲染（spec 006 M6 修訂）` |

#### PR D1~5 — M6-B 共用元件單元測試

| PR | Subagent | 元件 |
|---|---|---|
| D1 | qa-engineer | `<PortraitGrid>` unit test |
| D2 | qa-engineer | `<ExpandableTextarea>` unit test（含 expanded modal 模態性）|
| D3 | qa-engineer | `<Spinner>` unit test（< 3s / 3~15s / > 15s 三段顯示）|
| D4 | qa-engineer | `<ModelDropdown>` unit test（含 `hardcoded` prop）|
| D5 | qa-engineer | Error 三層 unit test（ToastError / ErrorModal）|

#### PR E1~5 — M6-D TD 拋光

| PR | Subagent | 範圍 |
|---|---|---|
| E1 | frontend-developer | TD-4 design token（Light/Dark 統一）|
| E2 | frontend-developer | TD-5 routing 警告（chapter-writer 走 structured provider 時 UI 提示）|
| E3 | frontend-developer | TD-6 spinner 統一（全站走 `<Spinner>` 共用元件）|
| E4 | frontend-developer | TD-7 provider 折疊指示 |
| E5 | frontend-developer | TD-8 角色卡歷史按鈕 |

#### PR Z — v0.3.0 release

| 項 | 內容 |
|---|---|
| Subagent | Dev coordinator（不派子代理）|
| 前置 | 所有 PR 已合 main；DoD 全打勾 |
| 修改 | 各 workspace `package.json` `version: "0.2.0"` → `"0.3.0"`；`apps/desktop/src-tauri/Cargo.toml` / `tauri.conf.json` 同步 |
| 動作 | 寫 `docs/architecture/milestones/v0.3.0-release-notes.md` + GitHub Releases（Windows binary） |

---

## 每 PR 共通規範（ADR-0011 + CLAUDE.md）

| 項 | 規範 |
|---|---|
| 單 PR 單一目的 | 禁止 all-in-one；違反 → PM round 退回 |
| Description 必含 | spec section / 修改檔列表 / Breaking changes / 驗收方式 / 回滾策略 |
| 動工前 | 讀對應 spec；spec=Draft **禁止**寫產品程式碼（M6 所有 spec 已 Ready，無此問題）|
| Type / test | `pnpm typecheck` + `pnpm -r test` 全綠才合 main |
| LLM SDK PR | 必跑 `packages/llm-adapter/scripts/smoke.ts` 對該 SDK |
| Native module 升 | 必驗 `pnpm rebuild` postinstall 不噴錯 |
| 提交者 | 一律 `git commit` + Co-Authored-By Claude |
| Push | 個別 PR push origin main（個人本機工具，無 PR review；自我審核 + golden test 兜底）|

### D5 自治邊界（dev 遇 spec 沒寫的決策）

| 類型 | 處理 |
|---|---|
| 純實作細節（useEffect 依賴 / class 命名 / internal state） | dev 自決，PR 描述帶過 |
| 影響元件 props / API shape | 開 advisor 確認 → 自決 → PR 註明 |
| 跨檔行為 / 觸發時機 | **暫停 → 回 spec-architect 補變更紀錄段 → 才動工** |
| 跨 spec 一致性 | **暫停 → 回 PM round review** |

---

## Sub-agent 派工 race 預防（CLAUDE.md 新增規範）

> 派任何 PR 給子代理前，**先做這四步**：

1. **grep 該 PR 改動檔範圍**（用 spec section 列的修改檔清單）
2. **比對既有 in-flight PR 的改動檔**，看有無交集
3. **分級派工**：
   | 情境 | 規則 |
   |---|---|
   | 同 workspace 的 `package.json` 修改 | **嚴格序列**（單一 agent 連跑多 commit；禁止並行）|
   | 不同 workspace（apps/api ⇄ apps/web ⇄ packages/llm-adapter 等） | 並行可 |
   | 同 workspace 不同 source 檔（無 import 重疊） | 並行可 |
   | 同 workspace 不同 source 檔但 import 重疊處 | 保險序列 |
4. **列入工作日誌**：在每次派工前的訊息中記下「本批派出 X PR / 改動檔範圍 / 與其他 in-flight PR 無交集」

### M6 PR 並行 / 序列定案

| 階段 | 序列項 | 並行項 |
|---|---|---|
| W1 | PR 1 → PR 2 → PR 3（皆動 `apps/api/package.json` + root `package.json`，**嚴格序列**） | PR 4（動 apps/api source + apps/web source，可與 1~3 並行）|
| W2 | PR 5 / 6 / 7 / 8 各動不同 workspace 或不同 config 檔（可並行）；PR 7+8 都動 `apps/api/package.json` → 7→8 **序列** | PR 9~12 各 workspace 不同 → 並行；PR 13 動 apps/e2e/package.json → 與其他並行；PR 14+ BDD 動 apps/e2e source → 並行 |
| W3 | PR Ax / Ay / Az 都動 `packages/llm-adapter/package.json` → **嚴格序列**；PR B1 動 packages/llm-adapter source → 排在 Ax/Ay/Az 後 | PR B2（apps/api source）/ B3（apps/api source 但不重疊 B2）→ 並行 |
| W4~5 | C1 / C2 動 apps/web 不同 feature folder → 並行；C3 / C5 動 apps/api source → 並行；C4 動 apps/web → 與 C1/C2 並行 | D1~5 unit test 各動不同 component → 並行；E1~5 拋光各動不同檔 → 並行 |

---

## 跨 PR 依賴矩陣

| PR | 依賴 | 並行允許 |
|---|---|---|
| PR 1 | — | PR 4 |
| PR 2 | PR 1 | — |
| PR 3 | PR 1 | — |
| PR 4 | — | PR 1~3 |
| PR 5 | PR 1 | PR 6~13 |
| PR 14+ BDD | PR 5（Vitest 3）| W2 其餘 |
| PR Ax/Ay/Az SDK | PR 1（Node 22）| 互相 |
| PR B1 XiaohuangwenAdapter | PR Ax + Ay + Az（不一定，但建議同期）| B2 / B3 |
| PR B2 structured 分支 | PR B1（capability flag 介面）| B3 |
| PR B3 balance + 白名單 | PR B1 | B2 |
| PR C1~C5 | B1+B2+B3 | 互相 |
| PR D1~5 unit test | 對應元件已存在（M5 既有）| 任何 |
| PR E1~5 拋光 | UI 主體完成 | 互相 |
| PR Z release | 所有 | — |

---

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| Node 22 升版 native module ABI 壞 | PR 1 + PR 3 嚴格驗 `pnpm rebuild`；失敗 revert + 推延 sharp 升版 |
| Vitest 3 snapshot 大量變動 | 人工 diff 全部變動 + PR description 列每個變動原因 |
| Anthropic / OpenAI SDK breaking 撞 adapter | 每 SDK PR 跑 smoke.ts；失敗單 PR revert，不卡 xiaohuangwen adapter（用 mock 開發）|
| xiaohuangwen API 實測與 spec 不符 | spec 011「待 PM 釐清」段已預留；dev 階段發現 → 開 advisor 釐清 → spec-architect 補變更紀錄 |
| polish-prose CM6 SelectionMenu 整合複雜 | C4 PR 預留 spike 時間；不行就退回「✨ 潤稿」按鈕在 toolbar（spec 012 Q-P1 alt）|

---

## DoD（Definition of Done）

對照 `M6-Handover-instruction.md` §「M6 DoD」逐項驗：

- [ ] `_components/` 子目錄建立（SA 已完成）
- [ ] spec 009 / 011 / 012 / 005 / 006 status=Ready（SA 已完成）
- [ ] status-updater 三層修復上線
- [ ] BDD step defs：7 份 .feature 全跑通（`pnpm test:e2e` 綠）
- [ ] 共用元件 5 個各有 unit test
- [ ] TD-4~8 拋光 PR 合進 main
- [ ] xiaohuangwen provider 可在 Settings 設定、章節寫作時可選用
- [ ] 餘額查詢按鈕可用
- [ ] polish-prose Skill 可在 ChapterEditor 框選後使用，PolishPanel 三段式 + 三按鈕
- [ ] M6-X 技術翻新依拍板 scope=B 完成 + ADR-0011 寫入
- [ ] v0.3.0 release（GitHub Releases，Windows binary）

---

## 回報節奏（給 PM）

| 時機 | 內容 |
|---|---|
| W1 結束 | 4 個 PR 合進度 + status-updater 修復驗收 |
| W2 結束 | 工具鏈升級完成 + BDD 第一份 feature 跑通 |
| W3 結束 | LLM SDK 升完 + XiaohuangwenAdapter 可 smoke |
| W4 結束 | UI 主體（C1~C5）完成 |
| W5 結束 | 拋光 + unit test + v0.3.0 release |

每 milestone 結束寫一份精簡 release report，類似 `v0.2.0-pm-report.md` 格式，給 PM 簽收。

---

## 起手第一步

1. 讀完上方「動工前必讀」7 項
2. **派工前 grep 改動檔範圍**（依 CLAUDE.md 新增段「sub-agent 派工 race 預防」）— 確認 PR 1 與 PR 4 改動檔無交集
3. 派 `backend-developer` 起 **PR 1**（`chore: pin Node 22 LTS + TS 5.8`），等該 PR 合進 main
4. 同時派另一個 `backend-developer` 起 **PR 4**（status-updater 三層修復，與 PR 1 並行 — 改動 apps/api source，不動 package.json）
5. PR 1 合進 main 後派 **PR 2** zod v4（序列：等 PR 1 完，因為都動 apps/api/package.json）
6. 依序往下推進；每批派工前先做 race 預防四步驟

⚠️ **不要** all-in-one 升級；**不要**改 spec（spec 變動回 spec-architect）；**不要**寫新 .feature（PM 唯一 author）；**不要**並行兩個動同 workspace package.json 的 PR。

---

## 變更紀錄

- 2026-05-18：初版（Dev coordinator handover，SA commit `291bfdd` 之後）。
- 2026-05-18（同日）：補「sub-agent 派工 race 預防」段（同步 PM 在 CLAUDE.md 新增的規範）；W1~W5 PR 並行 / 序列細化到改動檔層級。
