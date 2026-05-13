# M2 — 角色卡 + AI 撰寫

> Status: **未開工**
> 預估規模：25-35 PR
> 對應 spec：[002](../specs/002-edit-character-card.md)、[005](../specs/005-ai-write-chapter.md)、[009](../specs/009-settings-page.md)（補完）
> 對應 Agent / Skill 規格：[chapter-writer](../../agents/chapter-writer.md)、[character-card-consolidator](../../skills/character-card-consolidator.md)
> 前置依賴：[M1 寫作骨架](./M1-writing-skeleton.md) DoD 全通過

## 目標

加上**完整的角色卡管理**與**第一個 AI 寫作功能**。使用者能：

1. 在角色面板新增 / 編輯 / 刪除角色卡（含 6 區塊欄位 + 「AI 生成角色描述」）
2. 在章節編輯器點「AI 撰寫本章」→ chapter-writer 串流產出草稿到並排面板
3. 中止 / 重產出 / 丟棄草稿

**M2 還不能採用草稿**（採用流程留 M3）；草稿停在面板供下一個 milestone 接續。

## 範圍

### Spec 002 角色卡（完整）

依 Spec 002 全部範圍：

- API：POST / PUT / DELETE / GET list / GET one / POST consolidate
- CharacterFields 6 區塊（身分 / 個性 / 外貌 / 對話 / 關係 / 親密）
- frontmatter YAML 序列化（保留欄位順序，null 與 missing 等價）
- body = AI 生成 / 使用者編輯的連貫敘述
- `characters/<slug>_status.md` 空骨架同步建立
- `characters/_index.md` 維護
- slug 規則 + 衝突後綴 + rename 流程
- 親密區段預設摺疊
- `manuallyEdited` warning UX

### Spec 005 AI 撰寫單章（完整）

依 Spec 005 全部範圍：

- POST /api/projects/:hash/chapters/:n/generate（SSE 串流）
- GET / DELETE draft endpoint
- 本機 draft cache（`~/.novel-writer/cache/<projectHash>/drafts/chapter-<NNNN>/`）
- ContextCollector（蒐集 synopsis / writingStyle / storyStatus / characterStatuses / characters / outline / previousChapterFullText）
- Context window 守門（token 估算 + 縮減 fallback）
- 章節編輯器並排草稿面板
- 中止 / 重產出 / 丟棄按鈕
- 串流期間主編輯區唯讀 + 灰階
- LLMRouter 降級（雲端 retryable error → 切地端 fallback）

**M2 不實作**：
- 「採用」按鈕功能（留 M3 接 Spec 006）；按鈕在 M2 顯示為 disabled 狀態，hover 提示「採用功能將在下一版啟用」

### Spec 009 設定頁（補完）

M1 已完成 providers + 連線測試；M2 補：

- per-Agent routing UI（chapter-writer / character-card-consolidator / status-updater / status-shortener 四個下拉選單組）
- preset 按鈕（4 個：全雲端 Haiku / Cloud+地端 fallback / 全地端 Qwen / 測試版 RWKV）
- 「routing 未設定」引導 UI（005 / 002 偵測到 → 顯示對話框 → 「前往設定頁」連結）
- `INVALID_ROUTING` 錯誤處理（primary 對應 provider 未啟用 → 阻擋儲存）

### Agent / Skill 提示詞實作

依 Day 5 設計的規格實作：

- `packages/prompt-library/prompts/chapter-writer.ts`（依 [docs/agents/chapter-writer.md](../../agents/chapter-writer.md)）
- `packages/prompt-library/skills/character-card-consolidator.ts`（依 [docs/skills/character-card-consolidator.md](../../skills/character-card-consolidator.md)）
- 提示詞要實作 **style.md 插入慣例**（chapter-writer 受影響、consolidator 不受影響）
- Golden test fixtures（用 mock LLMProvider 驗 prompt 組裝 hash 穩定）

### LLM adapter 補完

M0 已實作 Anthropic provider；M2 補：

- `packages/llm-adapter/src/providers/openai.ts`
- `packages/llm-adapter/src/providers/ollama.ts`（地端首選 fallback）
- `packages/llm-adapter/src/providers/lmstudio.ts`（OpenAI-compatible，與 openai 共用大部分邏輯）
- LLMRouter 多 provider 降級邏輯（雲端 → 地端，已 partial chunk 流出後不切換）
- token 計數（用 `gpt-tokenizer` 或 `js-tiktoken`）

`google`、`xai`、`rwkv-runner` provider 留 M3 或 P1（M2 範圍夠 MVP）。

## 任務拆解

### Types
- [ ] **types-1**: `packages/shared-types/src/character.ts`（CharacterFields、CharacterCard、ConsolidatorInput/Output 等）
- [ ] **types-2**: `packages/shared-types/src/llm.ts`（DraftMetadata、PromptSnapshot、ChapterContext 補上 writingStyle 與 characterStatuses）
- [ ] **types-3**: `packages/shared-types/src/sse.ts`（SSE event union）

### LLM adapter
- [ ] **llm-1**: `packages/llm-adapter/src/providers/openai.ts`（含單元測試）
- [ ] **llm-2**: `packages/llm-adapter/src/providers/ollama.ts`
- [ ] **llm-3**: `packages/llm-adapter/src/providers/lmstudio.ts`（reuse openai 邏輯）
- [ ] **llm-4**: LLMRouter 降級邏輯（依 ADR-0004 規則表）
- [ ] **llm-5**: token 計數模組（gpt-tokenizer 包裝；fallback 估算）

### Prompt library
- [ ] **prompt-1**: `packages/prompt-library/prompts/chapter-writer.ts`（含 style.md 插入慣例）
- [ ] **prompt-2**: `packages/prompt-library/skills/character-card-consolidator.ts`
- [ ] **prompt-3**: golden test fixtures（用 mock LLMProvider 驗 prompt 組裝穩定性）

### 設定頁補完
- [ ] **set-fe-1**: `AgentRoutingCard.tsx`（per-Agent dropdown 組）
- [ ] **set-fe-2**: 模型自動發現（call provider /models 拿模型清單）
- [ ] **set-fe-3**: `PresetButtons.tsx`（4 個 preset 卡片）
- [ ] **set-fe-4**: routing 未設定時的引導對話框元件（005 / 002 共用）
- [ ] **set-be-1**: `PUT /api/settings` 加 INVALID_ROUTING 驗證

### Spec 002 角色卡 — 後端
- [ ] **char-be-1**: `apps/api/src/services/character-fs.ts`（讀寫 .md + frontmatter 解析 + _index.md 維護）
- [ ] **char-be-2**: `apps/api/src/services/character-slug.ts`（與 Spec 001 共用 sanitize）
- [ ] **char-be-3**: `apps/api/src/services/character-consolidate.ts`（呼叫 consolidator skill）
- [ ] **char-be-4**: `apps/api/src/routes/characters.ts`（POST / PUT / DELETE / GET list / GET one / POST consolidate）
- [ ] **char-be-5**: 整合 commit-policy（CRUD 各觸發對應 commit）

### Spec 002 角色卡 — 前端
- [ ] **char-fe-1**: `apps/web/src/features/characters/CharacterPanel.tsx`（列表 + 新增按鈕）
- [ ] **char-fe-2**: `CharacterEditor.tsx`（六分區 tabs：身分 / 個性 / 外貌 / 對話 / 關係 / 親密）
- [ ] **char-fe-3**: 個性標籤 chip-style 元件
- [ ] **char-fe-4**: MBTI / 星座 / 血型 dropdown
- [ ] **char-fe-5**: `AIGenerateButton.tsx` + body textarea preview（spinner + 失敗保留舊 body）
- [ ] **char-fe-6**: `manuallyEdited` warning UI
- [ ] **char-fe-7**: 重命名提示與 rename 流程整合
- [ ] **char-fe-8**: 刪除二次確認 + git 還原指引

### Spec 005 AI 撰寫 — 後端
- [ ] **gen-be-1**: `apps/api/src/services/context-collector.ts`（蒐集 + writingStyle 讀 style.md + token 守門 + characterStatuses 一人一檔讀取）
- [ ] **gen-be-2**: `apps/api/src/services/draft-cache.ts`（檔案 + SQLite metadata）
- [ ] **gen-be-3**: `apps/api/src/services/job-queue.ts`（每專案 FIFO；依 ADR-0003）
- [ ] **gen-be-4**: `apps/api/src/routes/generate.ts`（POST /generate SSE handler）
- [ ] **gen-be-5**: `apps/api/src/routes/draft.ts`（GET / DELETE）
- [ ] **gen-be-6**: 整合 LLMRouter 降級事件（emit `event: degraded`）

### Spec 005 AI 撰寫 — 前端
- [ ] **gen-fe-1**: `apps/web/src/lib/sse-client.ts`（EventSource 包裝 + 中止）
- [ ] **gen-fe-2**: 草稿面板元件（並排顯示，內部 autoscroll）
- [ ] **gen-fe-3**: 「AI 撰寫本章」按鈕 + 串流期間主編輯區 disable（CM6 readOnly + 灰階濾鏡）
- [ ] **gen-fe-4**: 中止 / 採用（disabled）/ 丟棄 / 重產出四按鈕
- [ ] **gen-fe-5**: 應用啟動時恢復 in-progress / aborted 草稿（GET /draft）
- [ ] **gen-fe-6**: degraded event 處理（toast「已切換到地端模型」）

### SQLite cache schema
- [ ] **db-1**: 在 `apps/api/src/services/cache-db.ts` 建 SQLite drafts table（依 Spec 005）

### QA
- [ ] **qa-1**: cucumber-js step definitions for `002.feature`
- [ ] **qa-2**: step definitions for `005.feature`
- [ ] **qa-3**: 角色 slug 規則 unit test 矩陣
- [ ] **qa-4**: chapter-writer / consolidator prompt 組裝穩定性 golden test
- [ ] **qa-5**: SSE 串流 + 中止 端對端測試（用 mock LLMProvider）
- [ ] **qa-6**: 連結到實際模型的整合測試（@golden tag，CI 預設跳過）
- [ ] **qa-7**: rename 流程的檔案 + git commit 完整性

## demo 驗收 walk-through

```
1. 啟動既有專案
   → 開啟 M1 建好的「春日記事」專案

2. 設定頁套用 preset
   → 點「設定」進設定頁
   → 確認 anthropic 已啟用、lmstudio 已啟用且能測試連線
   → 在「預設模型」區點「Cloud + 地端 fallback」preset 按鈕
   → 看到四個 Agent / Skill 的 routing 都被填入
   → 按「儲存」

3. 編輯既有角色（M1 建立時只填了 name + description）
   → 角色面板點「蘇晴」
   → 編輯面板開啟，看到六分區 tabs
   → 填入 MBTI、星座、血型、文化背景、外貌、對話節奏等欄位
   → 點「AI 生成角色描述」
   → spinner 5-15 秒 → 看到 200~500 字連貫敘述出現在「敘述」textarea
   → 微調文字（例改一個形容詞）
   → 點「儲存」
   → 看到 characters/蘇晴.md frontmatter 含全部欄位 + body 為 AI 生成 + manuallyEdited=true
   → git log 看到「character: edit 蘇晴」commit

4. 新增第二個角色
   → 點「新增角色」
   → 填名稱「林書言」+ 其他欄位
   → 不點「AI 生成」（直接儲存）
   → 看到 characters/林書言.md 建立但 body 為 "(尚未統整)" placeholder
   → 點「AI 生成」→ body 更新
   → 儲存
   → _index.md 列出兩名角色

5. AI 撰寫章節
   → 切到第一章編輯器
   → 主編輯區還是 M1 寫的內容（未刪）
   → 點工具列「AI 撰寫本章」
   → 草稿面板從右側滑出
   → 主編輯區變灰、顯示「AI 撰寫中…」
   → 草稿面板開始逐字顯示中文
   → 過程中可看到字數累積
   → 等 1 分鐘左右完成
   → 「採用」按鈕 disabled + hover 提示「採用功能將在下一版啟用」
   → 「中止」按鈕變「重產出 / 丟棄 / 採用(disabled)」

6. 重產出測試
   → 點「重產出」
   → 確認 → 草稿面板清空、重新串流
   → 過 30 秒中途點「中止」
   → 串流停止，已產出部分留在面板

7. 丟棄
   → 點「丟棄」→ 二次確認 → 確認
   → 草稿面板關閉
   → 主編輯區恢復可編輯狀態
   → ~/.novel-writer/cache/<projectHash>/drafts/chapter-0001/ 被清空

8. 重開測試
   → 再次「AI 撰寫本章」→ 串流到一半關閉應用
   → 重新啟動 → 進入該章
   → 草稿面板自動恢復（依 Spec 005 GET /draft）+ 顯示「上次未完成的草稿」標記

9. 設定 routing 未設定的引導
   → 設定頁把 chapter-writer 的 primary 改為「未設定」+ 儲存
   → 進入章節編輯器 → 點「AI 撰寫本章」
   → 顯示對話框「請先到設定頁設定 chapter-writer 的預設模型」
   → 點「前往設定頁」→ 路由到設定頁
```

## DoD

- [ ] 全部任務 PR 已 merge
- [ ] 上述 9 步 demo walk-through 全部通過
- [ ] vitest 覆蓋率 critical path ≥ 70%
- [ ] BDD step definitions for 002 / 005 / 009（含 routing） pass
- [ ] golden test：chapter-writer 對固定 fixture 產出的 prompt hash 穩定 5 次
- [ ] Anthropic + Ollama + LM Studio 三 provider 都能跑通 generate 與 stream

## 給下個 session 的開工 brief

你接手的是 **M2 角色卡 + AI 撰寫** milestone。M0 / M1 已完成；現在要加上**完整的角色卡管理**與**第一個 AI 寫作功能**（chapter-writer 串流產出草稿）。

### 動工順序建議

1. **types** 全部先做（character.ts、llm.ts、sse.ts）
2. **LLM adapter 補完** 與 **Prompt library** 並行
3. **設定頁補完**（per-Agent routing UI + preset）— 給後續 AI 流程的前置
4. **角色卡 Spec 002**（後端 + 前端，可並行）
5. **AI 撰寫 Spec 005**（最重；建議單一 dev 連續寫，因為 SSE 串流 + 草稿面板 + draft cache 三者緊密耦合）
6. **QA** 持續滾動

可拆三條 dev session 並行：

| Session 線 | 範圍 |
|---|---|
| A | 角色卡（types-1, char-be-*, char-fe-*）+ consolidator prompt |
| B | AI 撰寫（types-2/3, gen-be-*, gen-fe-*）+ chapter-writer prompt + LLM adapter 補完 |
| C | 設定頁補完（set-fe-*, set-be-1）+ golden test 框架 |

三條線在 types 完成後可獨立。

### 動工前必讀

- 本檔
- [Spec 002](../specs/002-edit-character-card.md)、[Spec 005](../specs/005-ai-write-chapter.md)、[Spec 009](../specs/009-settings-page.md)
- [chapter-writer Agent 規格](../../agents/chapter-writer.md)
- [character-card-consolidator Skill 規格](../../skills/character-card-consolidator.md)
- [ADR-0004 LLM adapter](../adr/0004-llm-adapter.md)
- [Story 002 修訂](../../requirements/stories/002-edit-character-card.md)（注意 2026-05-12 修訂版的 6 區塊欄位與 AI 統整流程）
- [Story 005](../../requirements/stories/005-ai-write-chapter.md)

### 關鍵風險

- **Style.md 整合**：chapter-writer 的 user prompt 開頭要動態插入 style.md（依 Spec 005 與 Agent 規格的「style.md 插入慣例」）；style.md 為空時跳過插入
- **CharacterStatuses 一人一檔**：ChapterContext 從 `characterStatus: string`（單檔）改為 `characterStatuses: Record<slug, string>`（一人一檔）；ContextCollector 要對每個 relevant character 讀一個檔
- **草稿 cache 路徑**：別寫到專案 Drive 目錄；用 `~/.novel-writer/cache/<projectHash>/drafts/`
- **採用按鈕 disabled**：UI 上要明確 disabled + 提示「下一版啟用」，避免使用者誤觸後困惑
- **LLM 拒絕成人內容**：Anthropic 對某些章節內容會回 content_blocked；LLMRouter 自動降級到 Ollama；UI 透過 `event: degraded` 顯示「已切換到地端」

### 不在範圍

- **採用 AI 草稿**：留 M3；M2 只實作「產出草稿」這半
- **status-updater 觸發**：Save 流程末端在 M1 已是 placeholder；M2 仍保持 noop，M3 才接 status-updater
- **git 歷史面板**：留 M3
- **角色卡 vision（002b / 002c）**：留 v0.2

### 模型評估的依賴

`docs/agents/chapter-writer.md` 與 `docs/skills/character-card-consolidator.md` 中的「模型建議」段引用了 [model-evaluation 結果](../model-evaluation/results/)。M2 動工時若評估結果尚未填寫完整，**直接用 ADR-0004 default**（`anthropic:claude-sonnet-4-6` / `lmstudio:qwen3-vl-30b-...`）；不阻擋 dev 動工。

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| SSE 在 Hono + Tauri WebView 行為與標準瀏覽器差異 | 早期跑端對端測試確認；Hono streamSSE 有 docs |
| chapter-writer 對長 context（10k+ tokens）某些 provider 慢 / 不穩 | UI 顯示 elapsed 時間；超 60s 自動中止 + 提示 |
| Consolidator 在 7B 模型輸出格式不穩 | prompt 加 few-shot；JSON parse 失敗時前端顯示「請手動編輯」 |
| AI 草稿產出 markdown code fence 包整段 | chapter-writer prompt 嚴禁 fence；輸出後 strip 開頭 fence + 結尾 fence 作為防禦層 |

## 完成紀錄

> dev 在 milestone 完成時填這裡

- 實際開工時間：
- 實際完成時間：
- 實際 PR 數：
- 偏離 plan 的範圍：
- 踩雷 / 教訓：
- 移交給 M3 的注意事項：
