# M6 dev 階段回報 — 待 PM + spec-architect round review

> **收信人**：PM + spec-architect
> **寄信人**：dev coordinator
> **日期**：2026-05-18（M6 W1-W3 完成同日）
> **目的**：dev 階段（commit `8f4d075` ~ `b98be5a`，17 個 commit）跑完 W1-W3 後，整理出 PM / spec-architect 需處理的議題。dev 不能自決的，全部停在這份文件。

---

## 0. 進度速覽

| 軌道 | 狀態 |
|---|---|
| M6-X 技術翻新（scope B / 9 子項） | ✅ 全完成 |
| M6-C status-updater 三層 timeout (P0) | ✅ +4 regression test |
| M6-A BDD step defs（環境）| ✅ cucumber-js 環境就緒；1/7 .feature 完成 |
| W3 LLM SDK 三項（Anthropic / OpenAI / Google） | ✅ |
| W3 xiaohuangwen 軌道（B1 介面 + B2 dispatch + B3 settings） | ✅ |
| W4 UI（C1~C5） | ⏳ 起手中 |
| W4-5 unit test / 拋光 / release | ⏳ |

全 monorepo 測試：**532 tests 綠**（api 268 / web 25 / llm-adapter 92 / shared-types 5 / prompt-library 15 / tools/eval 133）。

---

## 1. ADR-0011 違例（dev coordinator 確認，不可避免，**請 PM 知會**）

ADR-0011 § 4 「**單 PR 單一目的，禁止 all-in-one**」。實際執行中有三個 commit 違例：

| Commit | 違例內容 | 原因 |
|---|---|---|
| `84b0ac0` | 同時升 zod v4 + sharp 0.34 | PR2 (zod) 與 PR3 (sharp) 派工並行，兩個 sub-agent 同時編輯 `apps/api/package.json`，後 commit 者把對方變動帶進 commit |
| `b07734a` | 同時升 biome 2 + Vite 6 + Vitest 3（含 71 個檔案 format / lint 變動） | PR5 (Vite/Vitest) 與 PR6 (biome) 並行衝突，biome 最後 commit 把 PR5 也吞進去 |
| `93ae84e` | dexie / tailwind / CM6 / lucide / react-router 6.x / msw / jsdom 26 合一 PR | dev coordinator 主動拍板合 PR9-12 為單一，因都動 `apps/web/package.json` 必 race |

### 教訓 → 已內化於後續派工

**同檔 `package.json` 的 PR 不能並行**。後續派工已改成：
- 同 workspace package.json → **序列**（單一 agent 連跑多個 commit）
- 不同 workspace package.json → **可並行**
- 同 workspace 不同 source 檔 → 可並行（但有少數 import 互動風險）

技術上 commit 內容正確、typecheck + test 全綠、可 git revert 單一 commit 回滾，**無 release risk**。建議 PM 接受既成事實 + M6 release report 標明。

---

## 2. BDD spec / 實作不一致（PR14a 揭露 — **必須 PM 拍板**）

PR14a 把 032-first-launch-warning.feature 跑通的過程中 reveal 出兩個 spec ↔ 實作 mismatch。dev 不可決定哪邊改，需 PM 拍板：

### MISMATCH-1：FirstLaunchWarningDialog 4 個區塊

| 來源 | 內容 |
|---|---|
| `032-first-launch-warning.feature` 第 11 行 | 對話框含 4 個 **emoji 命名區塊**：📁 本機優先 / 📝 內容自由 / 🔐 隱私責任 / 📂 git 版控 |
| `apps/web/src/features/onboarding/FirstLaunchWarningDialog.tsx` 實際渲染 | 4 個關於資料備份的純文字 `<li>` 子彈點，**無 emoji 標題** |

**PM 拍板選項**：
- **A**. 改 component 加 emoji section headers（UI 改動）
- **B**. 改 .feature 描述實際 bullet 內容（規格 / Gherkin 改動）

`032-first-launch-warning.steps.ts` 內的對應 step 目前回 `'pending'`，等 PM 決定後可立即解開。

### MISMATCH-2：firstLaunchWarningAcknowledgedAt 時間欄位

| 來源 | 內容 |
|---|---|
| `032-first-launch-warning.feature` 第 19 行 | 點確認後 `settings.yaml` 寫 `meta.firstLaunchWarningAcknowledgedAt: <ISO 8601>` |
| `apps/web/.../FirstLaunchWarningDialog.tsx` `handleAcknowledge()` | 只寫 `firstLaunchWarningAcknowledged: true`；`AppSettings.meta` schema **無此欄位** |

**PM 拍板選項**：
- **A**. 實作 timestamp 寫入（需改 `packages/shared-types/src/settings.ts` + component + API zod schema）
- **B**. 從 .feature 移除此 step（規格過度規格化實作細節）

### PARSE-ERROR：兩份 .feature 無法被 cucumber 解析

`002b-character-card-from-image.feature` / `010-git-version-control.feature` 內某些 step body 用 markdown 列表語法（`- item`）— cucumber-js parser 把 `-` 當 Gherkin 保留字 reject。

目前對策：PR14a 的 `cucumber.config.cjs` 從 `paths` 排除這兩份。**PM 是 .feature 唯一 author**，需 PM 修語法（改用 doc string 或 data table 重寫該 step）。

### DESIGN-DECISION-1：Tauri 視窗關閉行為

032 feature 第 24 行 scenario 「使用者強制關閉應用程式 / 重啟後再顯示」，對應的「強制關閉」在 Tauri webview context 怎麼模擬？目前 step 用 `browser.newContext()` 模擬重啟，但這跳過了 Tauri runtime 的 settings persistence 真實行為。

**PM / spec-architect 拍板**：
- **A**. 改 .feature 描述為「重新進入 settings 編輯後仍持久化」（用 ack-state-only 驗證）
- **B**. 補完整 Tauri restart e2e（需 cucumber + tauri webdriver，scope 較大）
- **C**. 此 scenario 推 M7（Tauri Rust 升版時一併處理）

---

## 3. spec / ADR 描述不完整（B1 + B2 揭露 — **spec-architect round review**）

dev 動工後發現 spec / ADR 在以下細節未明寫，必須臨時自決才能繼續。**建議 spec-architect 在 M6 中段補變更紀錄段**，避免 M6 收尾或 M7 重蹈：

### S-1：spec 011 文件中 type 檔案路徑與實際架構不符

| spec 寫的 | 實際架構 |
|---|---|
| `packages/shared-types/src/llm-adapter.ts`（line 356） | 既有 `ModelCapabilities` / `LLMProvider` / `StreamChunk` 全在 `packages/llm-adapter/src/types.ts`；若依字面拆會把同 interface 切成兩半 |

**dev 自決**：把新 type（`StructuredNovelProvider` / `XiaohuangwenGenerateParams` 等）放在 `packages/llm-adapter/src/types.ts`。

**建議**：spec-architect 把 spec 011 line 356 改為 `packages/llm-adapter/src/types.ts` 或明文寫「型別放 adapter package 本身，shared-types 只放跨 workspace 共用 type」。

### S-2：ADR-0010 `retryPerModel` 對 structured path required 還是 unused？

ADR-0010 line 121 / 124 寫 `retryPerModel: number`（required），但 structured path **不做 fallback、不用 retry 計數**。若強制 required，上層每次都得傳一個無意義值。

**dev 自決**：實作中把 `retryPerModel` 在 structured path signature 設 optional。

**建議**：spec-architect 在 ADR-0010 加註「對 structured path 此參數為 optional / unused」。

### S-3：xiaohuangwen「餘額不足」字串偵測規則

spec 011 line 208 寫 HTTP 402 / body 含 `"餘額不足"` → `quota_exhausted`，但未明定：
- case-sensitivity
- 英文版（`"insufficient"` / `"quota exceeded"` 等）是否要 alias

**dev 自決**：採寬鬆策略 — `HTTP 402` OR `body 含 "餘額不足"` OR `body lowercase 含 "insufficient" / "quota"` → `quota_exhausted`。

**建議**：spec-architect 確認此寬鬆策略，或縮緊為「僅 HTTP 402 + body 含 "餘額不足"」。

### S-4：caller-side validation error code 命名未定

ADR-0010 定義了 `quota_exhausted` / `invalid_novel_input` / `operation_not_supported` 等 server-returned error，但**沒定義 adapter 端 caller-side validation 失敗的 code**（例如空 `plot` / 空 `pre_output`）。

**dev 自決**：暫用 `"unknown"`。

**建議**：spec-architect 補定 `invalid_argument` 或類似 code 給 caller-side validation 用。

### S-5：M5 既有 gap — PromptSnapshot 寫入 `current.prompt.json`

spec 005 M5 line 334 補了 PromptSnapshot 的 `kind`/`structuredInputs` 欄位，但**既有 `generate.ts` 從來沒寫過 `current.prompt.json`**（M5 開發任務 `be-m5-5` 未勾掉）。

這**不是** B2 引入的 regression，是 prior gap。M6 是否在收尾前補完？

**建議**：spec-architect / PM 決定 — 補進 W4 範圍 OR 推 M7 / 留作 M6 release report 已知問題。

---

## 4. M5 既有 task 未完成（從 task list 取出）

| Task # | 任務 | 影響 |
|---|---|---|
| #32 | [C5] character-index-cache SQLite（衍生資料） | 規模 < 200 角色不影響；M5 已 defer，M6 是否處理？ |
| #36 | [D1] 測試覆蓋：共用元件 + 主要新元件 | M6-B 已排，會在 W5 D1-D5 做 |

**建議**：PM 確認 #32 是否進 M6 scope；若否，明確推 M7。

---

## 5. 給 PM 的流程改進建議

### 5.1 同檔派工策略寫進 CLAUDE.md

D5 自治邊界已寫入，但同檔 race 教訓需要補成「dev coordinator 派工守則」。

建議在 `CLAUDE.md` 加一段：

```
## sub-agent 派工 race 預防

- 同 workspace 的 package.json 修改 → 嚴格序列（單一 agent 連跑多 commit）
- 不同 workspace 並行可
- 同 workspace 不同 source 檔可並行，但 import 重疊處保險序列
- dev coordinator 派工前 grep 各 PR 改動檔範圍，列入工作日誌
```

### 5.2 spec round 0 加「跨檔路徑掃描」步驟

S-1（spec 011 type 路徑錯誤）與 S-2 / S-4（ADR 必填參數定義不完整）都是 spec round 1 / 2 時可抓到的 gap。建議 spec-architect 起新 spec 時：
1. 先 grep 既有 `packages/*/src/types.ts` 確認新 type 放哪
2. 對每個介面參數標 required vs optional 列表，且每個 path 都覆蓋

### 5.3 BDD 環境建立後早期跑 Sample

PR14a 跑 032 sample 直接 reveal 兩個 spec/impl mismatch — 這證明 BDD 是「規格 / 實作對齊驗證器」，越早跑越早抓 gap。

建議：每個新 spec round 1 簽核**前**，PM + qa-engineer 對該 .feature 做一次 dry-run（不一定要完整 step defs，但對「Given / When / Then 是否能對應實際元件 / API」做一次紙上推演），可在規格階段抓到 mismatch。

---

## 6. dev coordinator 對下一步的建議

| 等級 | 議題 | 建議處理 |
|---|---|---|
| 🟥 **必處理** | MISMATCH-1 / MISMATCH-2 / PARSE-ERROR | M6 收尾前必拍板，否則 BDD 7 份跑不通，M6-A DoD 過不了 |
| 🟧 **強烈建議** | S-1 ~ S-4 spec / ADR 補變更紀錄段 | 不擋 W4-5，但 M7 起新 spec 前應補；否則架構漂移 |
| 🟨 **可選** | S-5 PromptSnapshot 補完 / #32 character-index-cache | M6 release report 標已知問題即可 |
| 🟨 **可選** | DESIGN-DECISION-1（Tauri 視窗關閉測試） | 推 M7 與 Tauri Rust 升版一起 |

dev 端 W4 起手不等以上議題（互不衝突），但 W4 收尾前希望 PM round 完成。

---

## 變更紀錄

- 2026-05-18：初版，W1-W3 完成後整理。等 PM + spec-architect round review。
