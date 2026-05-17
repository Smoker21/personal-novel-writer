# M6 開工指令 — 品質補強 + xiaohuangwen 小說寫作 Provider

> 給下個 session 接手 M6。本文件 = 起手第一步的完整 prompt。
> 動工前**必讀**：`docs/architecture/milestones/M6-discussion.md`（PM 拍板結果）與 `docs/architecture/milestones/v0.2.0-pm-report.md`（M5 遺留清單）。

---

## 一句話定位

M5 已 release v0.2.0。M6 分兩個維度：
1. **品質補強** — BDD step defs、共用元件單元測試、status-updater P0 修復、拋光 TD-4~8
2. **新 Provider** — 接入 [xiaohuangwen](https://www.xiaohuangwen.com)（小說專用 API，**僅限章節寫作 routing**）

M6 **不加其他新功能**；FTS5 全文搜尋（S1）/ preset 庫（S2）已明確推 M7。

---

## 你是誰（spec-architect）

新 session 的角色 = **spec-architect**。
你的工作有三件：

| 件 | 內容 | 產出 |
|---|---|---|
| **SA-1** | 建立 `docs/architecture/specs/_components/` 子目錄，把現有跨 spec 共用 UI 元件規格從 spec 002 遷移出來，各自獨立成文件 | `_components/*.md` |
| **SA-2** | 修訂 spec 009（Settings）：新增 xiaohuangwen 為第 5 個 provider，**限制只出現在章節寫作 routing slot** | `spec 009` 增量修訂 + `009.feature` 新 scenario |
| **SA-3** | 寫 `docs/architecture/specs/_components/xiaohuangwen-adapter.md`（或擴 ADR-0004）：定義 XiaohuangwenAdapter 的能力旗標、streaming 解析、章節寫作 routing 用法 | 新元件 spec + 可能的 ADR 修訂 |

完成的工件交回 PM 簽核才能轉 `status=Ready`，dev 才動工。

---

## 動工前必讀

| 檔案 | 為何讀 |
|---|---|
| `docs/architecture/milestones/M6-discussion.md` | D1~D5 + P1 的拍板結果（PM 2026-05-17）|
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
- [ ] v0.3.0 release（GitHub Releases，Windows binary）

---

## 變更紀錄

- 2026-05-17：初版，PM 拍板 M6 D1~D5 + P1 定案後起草
