# M6 Backlog — 候選清單

> Status: **草稿 / 累積中**（2026-05-16 起）
> 目的：累積 M5 完工後可進入 M6 的候選項目；尚未排序、未規劃 DoD、未定 milestone scope。
> M6 正式 brief 在 M5 release 後另開。

---

## SQLite 補強系列（來源：2026-05-16 xiaohuangwen schema 比較討論）

### S1. 全文搜尋 + 索引 cache（spec 002/003 內部補強）

| 項 | 內容 |
|---|---|
| 動機 | spec 002 round 2 已提到「衍生資料進 SQLite cache」但未具象化；M5 dev 階段可能會跳過 |
| 範圍 | FTS5 over `character.md` / `chapter-*.md` 全文索引；tag 統計；最近編輯排序；cross-reference graph（角色 ↔ 章節） |
| 影響 spec | spec 002 / 003 / 008 需補「衍生資料 schema」段；可能擴 ADR-0003 |
| 不影響 | ADR-0001 正本原則不變 — SQLite 仍是衍生 cache、可重建 |
| 預估 | 5-8 PR（schema migration + indexer + 搜尋 UI） |

### S2. 跨專案設定 / preset 庫（新 ADR）

| 項 | 內容 |
|---|---|
| 動機 | xiaohuangwen 有 `writing_mode` preset、`mimic_sample` 範本，跨小說共用；我們現在只能每個專案重填 |
| 範圍 | `~/.novel-writer/settings.db`（與專案資料分離）存：寫作風格 preset 庫、模仿樣本範本庫、prompt 模板庫 |
| 影響 spec | 新 ADR「跨專案設定 / preset 庫儲存策略」；spec 009 加 preset 管理 UI；spec 005 章節寫作時可下拉套用 preset |
| 不影響 | 專案資料夾結構 / git / Drive 同步邏輯 |
| 依賴 | 建議等 4 家雲端 + xiaohuangwen provider 穩了再進；S1 完成後再開 |
| 預估 | 8-12 PR（含 ADR + 新 settings DB schema + 兩處 UI） |

---

## P1. xiaohuangwen LLM Provider（來源：2026-05-16 API 文件取得）

> PM 決策：延至 M6（2026-05-16）

| 項 | 內容 |
|---|---|
| **Base URL** | `https://www.xiaohuangwen.com` |
| **認證** | `Authorization: Bearer YOUR_API_KEY`（同 OpenAI 格式） |
| **Endpoints** | `POST /api/v1/generate`（生成，stream plain text）/ `POST /api/v1/polish`（潤飾，stream plain text）/ `GET /api/v1/balance`（查餘額） |
| **模型選擇** | `version: "latest" \| "stable"`（僅兩個，非完整 model ID） |
| **Streaming** | plain text stream（**非** OpenAI SSE JSON — 需獨立解析） |
| **計費** | 字數（`remaining_words`），不是 token |
| **Vision / Function calling** | 無 |
| **定性** | 小說專用 API — API 本身負責 prompt engineering；caller 傳結構化欄位 |

### generate endpoint 欄位 ↔ novel_writer 對應

| xiaohuangwen | 必填 | novel_writer 對應 |
|---|---|---|
| `plot` | ✅ | spec 003 `outline`（本章劇情大綱） |
| `background` | 選 | character.md 摘要 + story_status |
| `requirements` | 選 | spec 003 `requirements`（本章寫作需求） |
| `pre_summary` | 選 | 前情提要（≈ story_status summary） |
| `prev_segment` | 選 | 前章末段（context-collector 已有） |
| `version` | 選 | settings provider 選擇 |

### polish endpoint

| xiaohuangwen | 必填 | novel_writer 對應 |
|---|---|---|
| `pre_output` | ✅ | 當前章節草稿文字 |
| `polish_input` | ✅ | 使用者修改指令 / Skill 指令 |
| `version` | 選 | 同上 |

### 使用範圍限制（PM 2026-05-17 確認）

> **僅限章節寫作**。不可用於 character-consolidate（角色統整）、status-updater（狀態更新）或任何 structured-data routing slot。

| 可用 | 不可用 |
|---|---|
| chapter-writer Agent → `/api/v1/generate` | character-consolidate |
| polish-prose Skill（章節編輯器內）→ `/api/v1/polish` | status-updater |
| — | 任何 structured-data slot |

### 整合方案（M6 動工前決定）

**不走通用 messages array interface**（不是 OpenAI 相容）：

- `packages/llm-adapter` 加 `XiaohuangwenAdapter` 實作
- adapter 暴露兩個專屬方法：`generateNovel(params)` + `polishNovel(params)`
- adapter 在 capabilities 標記 `hasStructuredNovelGenerate: true`
- chapter-writer Agent 偵測此 flag → 改走 `/api/v1/generate` 而非 build-prompt-then-chat
- spec 009 Settings UI：xiaohuangwen **只出現在「章節寫作」routing slot**，其他 slot 不顯示此 provider
- `balance` endpoint 整合進 Settings 頁「餘額顯示」（類似 API key 驗證按鈕）
- 需新 ADR 或擴 ADR-0004（LLM adapter 能力旗標設計）

### 依賴

- M5 spec 009 Settings + llm-adapter 架構穩定後再進
- 需 API key（由使用者自行申請，存 `~/.novel-writer/settings.yaml`）
- 預估：10-15 PR（adapter + settings UI + chapter-writer routing + balance display）

---

## M7 推延項（M6 PM Round 1 拍板 2026-05-18）

> 來源：M6-X 技術翻新規劃。PM 拍板 scope = B + D 拆 M7；下列前端框架類 P3 / Rust toolchain P4 推 M7 中段（S1 FTS5 全文搜尋之後）。
> 規範 ADR：[ADR-0011](../adr/0011-tech-stack-upgrade-policy.md) — 技術棧升版策略

### M7-Y1. React 18 → 19

| 項 | 內容 |
|---|---|
| 動機 | actions / Suspense Boundary / `use` hook / ref 變動；長期維護必升 |
| 影響 spec | spec 002 / 003 / 005 / 009 / 012 等所有有 React 元件的 spec — 需評估元件改寫範圍 |
| 風險 | hooks behavior 微改；strict mode 雙呼叫變動；部分 third-party 套件相容性 |
| 預估 | 3-5 PR（先 react / react-dom 升 + 跑全 web tests → 逐元件清 warning）|
| 依賴 | M7 中段啟動（不與 FTS5 同期） |

### M7-Y2. react-router-dom 6 → 7

| 項 | 內容 |
|---|---|
| 動機 | Loader / action API 從「組件 prop」改為 type-safe 模組；router config 結構變 |
| 影響 spec | 所有 page 級 spec（001 / 002 / 003 / 008 / 009 路由節點）|
| 風險 | Route config 全面改寫；可能要 codemod |
| 預估 | 2-3 PR |
| 依賴 | 與 M7-Y1 同期或之後（React 19 + Router 7 經常綁同一升版週期）|

### M7-Y3. Zustand 4 → 5

| 項 | 內容 |
|---|---|
| 動機 | Store factory API 變（`create` → `createStore` 為 vanilla）|
| 影響 | 所有 zustand store（chapter / character / settings 各一個）|
| 風險 | 中等 — store 取用點 API 不變，factory 端要改 |
| 預估 | 1-2 PR |
| 依賴 | M7-Y1 之後或並行 |

### M7-Y4. Tauri Cargo rust-version 1.77 → 1.85

| 項 | 內容 |
|---|---|
| 動機 | Tauri 2.x 新 minor 要求 Rust 1.85+；rust-toolchain.toml 鎖定 |
| 影響 | apps/desktop/src-tauri/Cargo.toml + 全平台 bundle 重建 |
| 風險 | Windows / macOS / Linux 三平台 binary 全要 smoke |
| 預估 | 2-3 PR（toolchain 鎖 + tauri minor 升 + 三平台驗）|
| 依賴 | 與其他 Y 項無關；可獨立做 |

### M7-Y5. PromptSnapshot wiring + prompt history schema 翻新

| 項 | 內容 |
|---|---|
| 動機 | spec 005 PromptSnapshot.kind / structuredInputs 已就緒，但 `generate.ts` complete handler 從未寫 `current.prompt.json`（M5 prior gap）；xiaohuangwen 採用後 prompt.md 「## 結構化生成欄位」段空白 |
| 來源 | M6 dev W3 feedback S-5；PM Round 2 拍板 SA-R2-5 推 M7（2026-05-18）|
| 範圍 | (i) `generate.ts` complete handler 寫 PromptSnapshot.json（含 kind / structuredInputs / participants / outline / requirements / temperature 等）/ (ii) `adopt.ts` 讀 snapshot.kind 傳給 prompt-md / (iii) prompt history schema 翻新：從 append-mode 改為「一檔一 snapshot」於 `chapters/_prompts/chapter_NNNN_<timestamp>.md` / (iv) round-trip 測試 |
| 影響 spec | spec 005（generate complete handler）/ spec 006（adopt 讀 snapshot）/ 可能補 ADR「prompt history 儲存策略」|
| 風險 | 中 — adopt 流程改 schema；舊 prompt.md 要 migration（或 fallback 兩種 schema 並存）|
| 預估 | 3-4 PR |
| 依賴 | 與 Y1~Y4 無關；建議排 W2~W3（早於 React 19 / Router 7，避免 UI 大變動同期）|

### M7 排序建議

```
W1     S1 FTS5 全文搜尋（M7 主軸）起手
W2~W3  Y5 PromptSnapshot wiring + prompt history schema
W3~W4  S1 收尾 + Y4 Tauri Rust toolchain（獨立）
W4~W5  Y1 React 19 + Y2 Router 7（同期）
W5~W6  Y3 Zustand 5
W6+    M7 收尾 + v0.4.0 release
```

---

## 待整理（未決）

- xiaohuangwen 借鑑的「writing_mode preset」與「mimic_sample」是否值得進 spec 005 章節寫作流程（提供範本下拉）— 與 S2 綁
- 是否提供「從 xiaohuangwen IndexedDB 匯入」importer（PM 2026-05-16 未表態，目前無此需求）

---

## 變更紀錄

- `2026-05-16`：初版。S1 / S2 來自 xiaohuangwen schema 比較討論的 PM 拍板。
- `2026-05-16`：補 P1 xiaohuangwen provider（PM 拍板延至 M6，API 文件已取得並分析）。
- `2026-05-17`：P1 使用範圍確認：僅限章節寫作（/generate + /polish），不可用於 structured-data slot。spec 009 Settings 只在章節寫作 routing slot 顯示此 provider。
- `2026-05-18`：M6 PM Round 1 拍板 M6-X 技術翻新 scope = B + D 拆 M7；本檔新增 M7-Y1~Y4 段（React 19 / Router 7 / Zustand 5 / Tauri Rust）。
- `2026-05-18`：M6 dev W1-W3 feedback SA-R2-5 拍板 — PromptSnapshot wiring 推 M7；本檔新增 **M7-Y5** 段 + 排序建議插入 W2~W3。
