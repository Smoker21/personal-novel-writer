# M6 開工指令 — 品質補強 + xiaohuangwen 小說寫作 Provider

> 給下個 session 接手 M6。本文件 = 起手第一步的完整 prompt。
> 動工前**必讀**：`docs/architecture/milestones/M6-discussion.md`（PM 拍板結果）與 `docs/architecture/milestones/v0.2.0-pm-report.md`（M5 遺留清單）。

---

## 一句話定位

M5 已 release v0.2.0。M6 分**三個維度**：
1. **品質補強** — BDD step defs、共用元件單元測試、status-updater P0 修復、拋光 TD-4~8
2. **新 Provider** — 接入 [xiaohuangwen](https://www.xiaohuangwen.com)（小說專用 API，限章節寫作 routing + polish-prose Skill）
3. **技術翻新（M6-X）** — Node.js 升 LTS + 依賴 major 升級（PM 2026-05-18 拍板新增）；範圍與細節見 [`M6-X-tech-refresh.md`](./M6-X-tech-refresh.md)

M6 **不加其他產品功能**；FTS5 全文搜尋（S1）/ preset 庫（S2）/ 前端架構翻新（React 19 / Router 7 / Zustand 5）已明確推 M7。

---

## 你是誰（spec-architect）

新 session 的角色 = **spec-architect**。

### M6 PM Round 0 拍板（2026-05-17 — spec-architect 預審後修訂）

spec-architect 完成 M5 後檢視 M6 handover，回報 4 個跨切面問題請 PM 拍板：

| Q | 問題 | dev 推薦 | **PM 拍板** |
|---|---|---|---|
| **Q1** | polish-prose 是否做 | (a) 不做，等未來起 | **建立 Polish Novel — 統一修訂規格，主要為潤稿使用；增加 Feedback for PM 段** |
| **Q2** | LLM adapter 介面擴張 | R1（`streamStructured` opt-in + 新 ADR-0010）| 同意 R1 |
| **Q3** | spec 005 / 006 修訂納入 SA-2 範圍 | 是 | 同意 |
| **Q4** | XiaohuangwenAdapter 放新 spec 011（不放 `_components/`）| 是 | 同意 |

### 工作清單（PM Q1~Q4 拍板後修訂）

| 件 | 內容 | 產出 |
|---|---|---|
| **SA-1** | 建 `docs/architecture/specs/_components/` 子目錄 + 5 個元件規格 + 7 份 spec 反向 cross-reference 更新 | `_components/_index.md` + 5 元件檔 + spec 002/003/005/006/007/009 reference 更新 |
| **SA-2.a** | 新增獨立 spec 011 `xiaohuangwen-provider.md`（adapter 規格） | `specs/011-xiaohuangwen-provider.md` |
| **SA-2.b** | 新增獨立 spec 012 `polish-prose-flow.md`（含 Feedback for PM 段，5 個 Q-P 待 Round 1 拍板）| `specs/012-polish-prose-flow.md` |
| **SA-2.c** | 新增 `docs/skills/polish-prose.md`（Skill 本體規格）| `docs/skills/polish-prose.md` |
| **SA-2.d** | 修訂 spec 005（structured generate 分支：build-prompt response / generate request / PromptSnapshot / UI 五欄編輯） | `specs/005-ai-write-chapter.md` 增量修訂 |
| **SA-2.e** | 修訂 spec 006（prompt.md 渲染兩 path / frontmatter `kind`）| `specs/006-adopt-chapter-draft.md` 增量修訂 |
| **SA-2.f** | 修訂 spec 009（xiaohuangwen provider / `agents.polish-prose` slot / balance endpoint / dropdown 過濾 / 共用元件 reference 改指 `_components/`）| `specs/009-settings-page.md` 增量修訂 |
| **SA-3** | 新增 ADR-0010「LLM adapter 結構化生成擴充」（`streamStructured` opt-in / `StructuredNovelProvider` / `hasStructuredNovelGenerate` capability / `quota_exhausted` error / `origin: "novel-api"`） | `adr/0010-llm-adapter-structured-generation.md` |
| **同步** | CLAUDE.md 補 D4 流程 + D5 自治邊界；本檔補 PM Q1~Q4 紀錄 | CLAUDE.md / 本檔 |

### M6 SA 階段交付狀態（2026-05-18 — PM Round 1 拍板完成）

| 工件 | 狀態 |
|---|---|
| `_components/` 6 檔（含 _index）| ✅ Ready |
| ADR-0010 | ✅ Accepted |
| spec 011 xiaohuangwen-provider | ✅ **Ready**（PM Round 1 拍板 2026-05-18）|
| spec 012 polish-prose-flow | ✅ **Ready**（PM Round 1 Q-P1~5 全拍板 + PolishPanel UI 設計確認 2026-05-18）|
| `docs/skills/polish-prose.md` | ✅ **Ready**（同 spec 012）|
| spec 005 / 006 / 009 增量修訂 | ✅ **Ready**（PM Round 1 拍板 2026-05-18）|
| spec 002 / 003 / 007 cross-reference 反向更新 | ✅ 完成 |
| CLAUDE.md（D4 流程 + D5 自治邊界）| ✅ 完成 |

### PM Round 1 拍板結果（2026-05-18）

**spec 012 Q-P1~5 全拍板**：

| Q-P | 拍板結果 |
|---|---|
| Q-P1 觸發入口 | 框選文字後浮動工具列（CM6 SelectionMenu plugin）|
| Q-P2 潤稿範圍 | 選段為主，無選取則不出現按鈕 |
| Q-P3 接受流程 | **PM 直接設計 PolishPanel（取代 DiffView）** — 右側 panel，三段式：選取文字（可收合 read-only）/ 潤飾提示詞（可放大）/ 潤飾結果（可放大可編輯）+ 三按鈕（潤飾 / 重新產生 / 採用）|
| Q-P4 routing slot | 獨立 `polish-prose` slot |
| Q-P5 dirty draft | 不進 spec 006 採用流程，直接覆寫編輯器 |

**spec-architect 注意**：
- `jsdiff` 套件**不引入**（PolishPanel 設計移除 DiffView）
- 新增 `ReadOnlyCollapsible` 元件（spec-local，非 _components/）
- spec 012 dev 任務已更新至 commit `361a526`

**SA 階段收尾項**（spec-architect 執行）：
- [ ] 把 spec 011 / 012 / 005 / 006 / 009 + `docs/skills/polish-prose.md` 的 `Status: Draft` 全改為 `Status: Ready`
- [ ] 在每份 spec 變更紀錄段補「PM Round 1 拍板 2026-05-18」

**PM 待補（不阻 dev 動工，但 QA 跑 BDD 前要有）**：
- `docs/requirements/features/012-polish-prose.feature`（PM 是 .feature 唯一 author）

---

## M6-X 技術翻新軌道（2026-05-18 PM 新增）

**獨立規劃文件**：[`M6-X-tech-refresh.md`](./M6-X-tech-refresh.md)

### 一句話定位

Node.js 升 LTS（22）+ 主要依賴升版，與既有 M6 任務**並行**。Scope 由 PM 拍板（A 最小 / B 中 / C 大 / D 全棧）。

### SA-4 工作項（PM Round 1 Q-X1~5 全拍板 2026-05-18 — 全照 dev 推薦）

| 件 | 內容 | 產出 | 狀態 |
|---|---|---|---|
| **SA-4.a** | 依 PM 拍板 scope = B + D 拆 M7 定案 M6-X 範圍 | `M6-X-tech-refresh.md` Status=Ready | ✅ |
| **SA-4.b** | 寫 ADR-0011「技術棧升版策略 / LTS 對齊」 | `adr/0011-tech-stack-upgrade-policy.md` Accepted | ✅ |
| **SA-4.c** | 把 D 範圍（React 19 / Router 7 / Zustand 5 / Tauri Rust）寫進 `M6-backlog.md` M7 段 | `M6-backlog.md` M7-Y1~Y4 段 | ✅ |
| ~~SA-4.d~~ | 原計畫的「SDK 升版對 spec 011 影響」段 | 不需要 — X-9 不破壞 adapter 介面（ADR-0010 仍生效）| — |

### 與既有 M6 任務的協調

- M6-X 子項全部走**獨立小 PR**，每 PR 單一升級
- M6-X **不**動產品功能 spec（005 / 006 / 009 / 011 / 012）— 只動 package.json / config / call site
- 若 X-9（LLM SDK 升）與 xiaohuangwen adapter 同期，建議**同 dev 在同一週做**，減少 adapter 層 churn
- M6-A BDD step defs 起手前**必須**先完成 X-5（Vitest 3）— 避免寫了 step def 後又要遷移

### PM 待拍板（Q-X1~5）

詳見 [`M6-X-tech-refresh.md` §9](./M6-X-tech-refresh.md#9-pm-待拍板)。dev 推薦 **B（中）+ D 拆 M7**。

---

## 動工前必讀

| 檔案 | 為何讀 |
|---|---|
| `docs/architecture/milestones/M6-discussion.md` | D1~D5 + P1 的拍板結果（PM 2026-05-17）|
| `docs/architecture/milestones/M6-X-tech-refresh.md` | M6-X 技術翻新範圍與任務細節（PM 2026-05-18 新增）|
| `docs/architecture/milestones/M6-backlog.md` | xiaohuangwen API 文件、欄位對應表、使用範圍限制 |
| `docs/architecture/milestones/v0.2.0-pm-report.md` | M5 遺留、status-updater 根因分析（§2.3）、spec-architect 自決事項（§2.4）|
| `docs/architecture/specs/002-edit-character-card.md` | 現行共用元件定義所在地（ExpandableTextarea / PortraitGrid / Error 三層等）|
| `docs/architecture/specs/009-settings-page.md` | 現行 Settings spec，要在此加 xiaohuangwen |
| `docs/architecture/adr/0004-llm-adapter.md` | LLM adapter 設計，評估是否需擴充 capability flag |
| `CLAUDE.md` | 開發規範 |

---

## SA-1：`_components/` 子目錄建立

### 動機

M5 spec 002 承擔了「角色卡」+ 「跨 spec 共用 UI 元件 canonical 規格」雙重職責，查元件規格要去角色卡 spec 不直覺。M6 起 spec-architect 寫新 spec 前要先讀 `_components/`，識別哪些是共用、哪些是 spec-local。

### 要遷移的元件（至少）

| 元件 | 現在的位置 | 新位置 |
|---|---|---|
| `ExpandableTextarea` | spec 002 | `_components/expandable-textarea.md` |
| `PortraitGrid` | spec 002 | `_components/portrait-grid.md` |
| `Spinner / LoadingOverlay` | spec 002 | `_components/spinner.md` |
| `Error 三層顯示`（inline / toast / dialog）| spec 002 | `_components/error-display.md` |
| `ModelDropdown` | spec 009 | `_components/model-dropdown.md` |

spec 002 / spec 009 保留 cross-reference（`詳見 _components/<name>.md`），原有段落可精簡但不要完全刪除摘要。

### 新 spec 起手流程（D4 拍板的流程規範）

```
spec-architect 起新 spec 時：
1. 先讀 _components/ 目錄索引
2. 識別新 UI 需求中哪些是共用、哪些是 spec-local
3. 若是共用 → 寫 _components/<name>.md（或補進既有）
4. spec 主檔 cross-reference 即可
```

---

## SA-2：spec 009 修訂 — xiaohuangwen provider

### 重點限制（PM 拍板，不可更動）

> xiaohuangwen API **只能用於章節寫作**。
> 不可用於：character-consolidate / status-updater / 任何 structured-data routing slot。

### Settings UI 變更（需寫進 spec 009）

| 項 | 規格 |
|---|---|
| Provider 清單 | 新增 xiaohuangwen 項目（排在 Ollama / LM Studio 之後，或獨立「小說寫作 API」分類）|
| API key 欄位 | 同現有 cloud provider（文字輸入 + 顯示/隱藏切換） |
| 版本選擇 | `version` 欄位：下拉 `latest`（預設）/ `stable` |
| 餘額顯示 | 新增「查詢餘額」按鈕（呼 `GET /api/v1/balance`），顯示 `remaining_words` |
| Routing slot 限制 | xiaohuangwen **只出現在** `chapterWriter` routing slot；`characterConsolidate` / `statusUpdater` 等 slot 的 provider 下拉不顯示 xiaohuangwen |
| Test connection | 呼 `/api/v1/balance`，成功則顯示餘額，失敗則 inline error |

### API 端點（已取得，供 spec 參考）

```
Base URL: https://www.xiaohuangwen.com
認證: Authorization: Bearer <api_key>

POST /api/v1/generate  — 章節生成（stream plain text）
  body: { plot, background?, requirements?, pre_summary?, prev_segment?, version? }

POST /api/v1/polish    — 章節潤飾（stream plain text）
  body: { pre_output, polish_input, version? }

GET  /api/v1/balance   — 查餘額
  response: { status: "success", remaining_words: number }
```

### 欄位對應（供 context-collector 對應）

| xiaohuangwen 欄位 | 必填 | novel_writer 對應 |
|---|---|---|
| `plot` | ✅ | spec 003 `outline`（本章劇情大綱）|
| `background` | 選 | character.md 摘要 + story_status |
| `requirements` | 選 | spec 003 `requirements`（本章寫作需求）|
| `pre_summary` | 選 | story_status summary |
| `prev_segment` | 選 | 前章末段（context-collector 既有）|

### .feature 新增 scenario（至少）

- xiaohuangwen 只在 chapterWriter slot 可選
- balance 查詢成功 / API key 錯誤
- 章節生成走 xiaohuangwen path 回傳 stream

---

## SA-3：XiaohuangwenAdapter 規格

### 定性

xiaohuangwen **不是 OpenAI 相容**（不走 `messages[]` → `choices[0].delta.content` 格式）。
streaming 回傳 plain text（不是 SSE JSON event），需獨立解析。

### 建議方案（spec-architect 最終決定）

1. `packages/llm-adapter` 加 `XiaohuangwenAdapter` 類別
2. adapter 對外暴露：
   - `generateNovel(params: XiaohuangwenGenerateParams): AsyncGenerator<string>`
   - `polishNovel(params: XiaohuangwenPolishParams): AsyncGenerator<string>`
   - `getBalance(): Promise<number>`
3. adapter capability flags 加 `hasStructuredNovelGenerate: true`
4. chapter-writer Agent 判斷 `provider.capabilities.hasStructuredNovelGenerate` 為 true → 不走 build-prompt-then-chat，直接帶 `plot / background / requirements / pre_summary / prev_segment` 呼叫 `generateNovel()`

**是否需要擴 ADR-0004**：若新增 capability flag 的設計超出 ADR-0004 現有範圍，請補一個新 ADR（或 ADR-0004 的 appendix），說明「為何設計 capability flag 而非強制 interface 統一」。

---

## dev 段：spec-architect 完成後的工作清單

> spec-architect 完成 SA-1~3 且 PM 拍板 status=Ready 後，dev session 讀此段。

### P0（W1）

| 任務 | 說明 | 參考 |
|---|---|---|
| **M6-C** status-updater 三層修復 | L1: service 加 90s timeout + 強制 `emit failed`；L2: StatusUpdateIndicator 加 60s client timeout + 重連；L3: job-event-bus SSE timeout 30s → 5min | `v0.2.0-pm-report.md §2.3` |

### P1（W1 起手 / W2 完成）

| 任務 | 說明 |
|---|---|
| **M6-A** BDD step defs | cucumber-js step definitions for 全部 7 份 .feature（002/003/005/006/007/009/032）；M5 沒做，補上 |
| **D4 流程** | 依 `_components/` 新目錄重新組織 spec 閱讀 checklist（補進 CLAUDE.md 或 M6-Handover 本文件）|
| **D5 自治邊界** | 把 D5 表格（impl-detail / props-shape / cross-file 三分類）補進 CLAUDE.md `## 實作決策自治邊界` 段 |

### P1（W2~3）

| 任務 | 說明 |
|---|---|
| **M6-B** 共用元件單元測試 | ExpandableTextarea / PortraitGrid / ModelDropdown / Error三層 / Spinner 各加 unit test |

### P1（W3~5）

| 任務 | 說明 |
|---|---|
| **P1 xiaohuangwen** | 依 SA-2 / SA-3 的 Ready spec 實作 XiaohuangwenAdapter + spec 009 UI 變更 |

### P2（W3~4）

| 任務 | 說明 |
|---|---|
| **M6-D 拋光** | TD-4 design token（Light/Dark 統一）/ TD-5 routing 警告 / TD-6 spinner 統一 / TD-7 provider 折疊指示 / TD-8 角色卡歷史按鈕 |

---

## dev 自治邊界（D5 拍板）

| 類型 | 處理 | 範例 |
|---|---|---|
| 純實作細節 | dev 自決，PR 描述帶過 | useEffect 依賴陣列、CSS class 命名 |
| 影響元件 props / API shape | 開 advisor 確認 → dev 自決 → PR 註明 | 加一個 optional prop |
| 跨檔行為 / 觸發時機 | 回 spec-architect 補 spec 變更紀錄段 → 才動工 | 「settings 級 prompt 在哪個時間點注入」|
| 跨 spec 一致性 | 回 PM round review | 「modal 行為定義在哪份 spec」|

---

## M6 DoD（Definition of Done）

- [ ] `_components/` 子目錄建立，5 個共用元件各有獨立 spec 文件
- [ ] spec 009 status=Ready（含 xiaohuangwen，限 chapterWriter slot）
- [ ] XiaohuangwenAdapter spec 文件 Ready（或 ADR-0004 appendix）
- [ ] status-updater 三層修復上線，採用流程不再卡住
- [ ] BDD step defs：7 份 .feature 全跑通（`pnpm test:e2e` 綠）
- [ ] 共用元件 5 個各有 unit test
- [ ] TD-4~8 拋光 PR 合進 main
- [ ] xiaohuangwen provider 可在 Settings 設定、章節寫作時可選用
- [ ] 餘額查詢按鈕可用
- [ ] **M6-X 技術翻新**：依 PM 拍板 scope 完成（A/B/C/D 之一）；`engines.node` 升 22 LTS + `.nvmrc` + zod 統一 + ADR-0011 寫入
- [ ] v0.3.0 release（GitHub Releases，Windows binary）

---

## 變更紀錄

- 2026-05-17：初版，PM 拍板 M6 D1~D5 + P1 定案後起草
- 2026-05-17（spec-architect 接手 + PM Round 0 拍板）：
  - spec-architect 預審 handover 回報 4 個 Q1~Q4 問題；PM 拍板：
    - Q1 = 建立 polish-prose Skill（含 Feedback for PM）
    - Q2 = R1 介面擴張（新 ADR-0010）
    - Q3 = spec 005 / 006 / 009 三份增量修訂
    - Q4 = 新 spec 011 + 移除「_components/xiaohuangwen-adapter.md」方案
  - SA-1 / SA-2 / SA-3 全部完成（待 PM Round 1 核准）；spec 005 / 006 / 009 status 暫退 Draft
- 2026-05-18（PM Round 1 拍板 + M6-X 新增）：
  - PM 對 spec 012 Q-P1~5 全拍板（含 PolishPanel UI 自行設計）；5 份 spec / skill 全轉 Ready
  - PM 拍板 M6 新增「技術翻新」軌道 → spec-architect 起 `M6-X-tech-refresh.md` 規劃文件；4 個 scope 選項待 PM 拍 Q-X1~5
  - DoD 加「M6-X 技術翻新依拍板 scope 完成 + ADR-0011」項
- 2026-05-18（同日 PM Q-X1~5 全拍板 — 全照 dev 推薦）：
  - SA-4.a / .b / .c 全部完成
  - `M6-X-tech-refresh.md` Status=Ready（scope = B：9 子項 / 9~10 PR）
  - 新增 `ADR-0011 技術棧升版策略 / LTS 對齊`（Accepted）
  - `M6-backlog.md` 補 M7-Y1~Y4 段（React 19 / Router 7 / Zustand 5 / Tauri Rust 推 M7 中段）
  - **🎉 SA 階段全部完成**；dev 可進入 Phase 2
- 2026-05-18（dev W1-W3 完成 + spec-architect Round 2）：
  - dev W1-W3 完成（M6-X scope B 全 9 子項 ✅ / M6-C status-updater ✅ / BDD 環境就緒 + 1/7 跑通 / xiaohuangwen adapter + dispatch + settings ✅）
  - dev 揭露 5 個 spec/ADR gap（S-1~S-4 + S-5）＋ 3 個 BDD mismatch（MISMATCH-1/2 / PARSE-ERROR）
  - spec-architect Round 2 工作項列於本文件最後段

---

## spec-architect Round 2 — dev W1-W3 揭露的 spec/ADR gap（2026-05-18）

> 來源：`docs/architecture/milestones/M6-implementation-feedback.md`
> 優先序：S-1 ~ S-4 為 🟧 強烈建議（不擋 W4 但 M7 前應補）；S-5 為 🟨 可選

### SA-R2-1：spec 011 type 路徑錯誤

**問題**：spec 011 line 356 寫 `packages/shared-types/src/llm-adapter.ts`，但 `ModelCapabilities` / `LLMProvider` / `StreamChunk` 等 type 實際在 `packages/llm-adapter/src/types.ts`。dev 已自決放 `packages/llm-adapter/src/types.ts`。

**spec-architect 修正**：把 spec 011 開發任務段的 `types:` 項路徑改為 `packages/llm-adapter/src/types.ts`，並加註「型別放 adapter package 本身；shared-types 只放跨 workspace 共用 type」。

### SA-R2-2：ADR-0010 `retryPerModel` structured path 語意

**問題**：ADR-0010 line 121/124 寫 `retryPerModel: number`（required），但 structured path 不做 fallback / retry，傳此值無意義。dev 已自決設為 optional。

**spec-architect 修正**：ADR-0010 `LLMRouter.generateNovel` / `polishNovel` signature 說明段加一句：「`retryPerModel` 在 structured path 為 optional / unused；structured provider 不在 fallbacks 間切換」。

### SA-R2-3：xiaohuangwen 餘額不足偵測規則

**問題**：spec 011 line 208 寫 HTTP 402 OR body 含 `"餘額不足"` → `quota_exhausted`，但未定義 case-sensitivity / 英文 alias。dev 已自決用寬鬆策略（HTTP 402 OR body lowercase 含 `"insufficient"` / `"quota"` / `"餘額不足"`）。

**spec-architect 修正**：spec 011「錯誤映射」表加補充欄：
```
402 / body 含以下任一（case-insensitive）：
  - "餘額不足"
  - "insufficient"
  - "quota"（partial match）
→ quota_exhausted
```
或縮緊為「僅 HTTP 402 + body 含 "餘額不足"」— 擇一確認並寫進 spec。

### SA-R2-4：ADR-0010 caller-side validation error code 未定義

**問題**：ADR-0010 定義 server-returned error code，但**未定義 adapter 端 caller-side validation 失敗**（如空 `plot` / 空 `pre_output`）的 code。dev 暫用 `"unknown"`。

**spec-architect 修正**：ADR-0010 `LLMErrorCode` 擴張段加 `"invalid_argument"`，說明「adapter 端 caller-side 參數驗證失敗；retryable = false」。同步更新 spec 011 錯誤映射表。

### SA-R2-5（可選）：spec 005 PromptSnapshot 補完

**問題**：spec 005 M5 line 334 有 `PromptSnapshot.kind` / `structuredInputs` 欄位定義，但既有 `generate.ts` 從未寫過 `current.prompt.json`（M5 任務 be-m5-5 未完成）。這是 M5 prior gap，非 M6 regression。

**spec-architect / PM 決定**：
- 補進 W4 範圍（建議）— dev 可在 polish-prose 後接著做
- 或推 M7 / 標明 M6 release report 已知問題

---

## PM Round 2 拍板結果（2026-05-18）

| 項 | PM 拍板 | 說明 |
|---|---|---|
| **MISMATCH-1** | **A — 改 component** | FirstLaunchWarningDialog 加 emoji section headers（📁/📝/🔐/📂）；dev 實作 |
| **MISMATCH-2** | **A — 實作 timestamp** | `firstLaunchWarningAcknowledgedAt: ISO 8601` 寫入；需改 shared-types + component + API zod schema；dev 實作 |
| **PARSE-ERROR** | **已修（PM 2026-05-18）** | 002b / 010 .feature markdown list 改為 data table；commit `（見下）` |
| **DESIGN-DECISION-1** | **A — 改 .feature** | 032 scenario「強制關閉重啟」改描述為「重新進入 settings ack state 持久化」；`@pending` 移除；dev 實作輕量驗證 |
| **SA-R2-5 PromptSnapshot** | **交 spec-architect** | spec-architect 決定 M6 補完或推 M7 |
