# Spec: polish-prose 應用流程（章節編輯器內潤稿）

> Story: 無對應 user story — M6 P1 引入（PM Q1 拍板「建立 Polish Novel」）
> Skill spec: [`docs/skills/polish-prose.md`](../../skills/polish-prose.md)
> Related: [011](./011-xiaohuangwen-provider.md) / [005](./005-ai-write-chapter.md) / [009](./009-settings-page.md) / ADR-0010
> Status: `Draft`
> Owner: `spec-architect`
> Last updated: `2026-05-17`

## ⚠️ Feedback for PM — 待 PM Round 1 拍板的設計問題

> PM Q1 指示「主要為潤稿使用，增加一個 feedback 給 PM 設計使用方式」。本段為 spec-architect 的草版設計 + 待拍板問題清單。請 PM 對下列五個 Q-P 問題回覆，spec-architect 依此完成本 spec → status=`Ready`。

dev 端的草版推薦 = **以下「初版規格草案」段中已選的方向**（每個 Q-P 對應的推薦選項已標 ✅）。PM 若同意全部推薦，回「Q-P1~5 全照推薦」即可；要改的逐項說明。

| # | 問題 | 選項 | dev 推薦 | **PM 拍板** |
|---|---|---|---|---|
| **Q-P1** | polish-prose **觸發入口**位置？ | (a) 章節編輯器右上「✨ 潤稿」按鈕 / (b) 選取文字後 inline 浮動 toolbar ✅ / (c) 兩者皆有 | (a) | **(b)** — 框選文字後浮動工具列顯示「✨ 潤稿」按鈕（PM 2026-05-18）|
| **Q-P2** | 潤稿**範圍**預設？ | (a) 選段為主（無選取則禁用）✅ | (a) | **(a)** |
| **Q-P3** | 潤後文字的**接受流程**？ | ~~(a) diff 視窗 hunk-level~~ / **(d) 潤飾面板 — 結果可編輯，三按鈕流程 ✅** | ~~(a)~~ | **(d) PM 直接設計**（2026-05-18）：詳見「PolishPanel UI」段 |
| **Q-P4** | 是否新增 routing slot `polish-prose`？ | (a) 是，獨立 slot ✅ | (a) | **(a)** |
| **Q-P5** | polish 輸出是否進入 dirty draft 邏輯？ | (a) 不進，直接覆寫 ✅ | (a) | **(a)** |

**其他細節（dev 自決，PM 知會即可）**：
- 潤稿時的 LLM 上下文：選段前 / 後各 500 codepoint（讓 LLM 知道上下文，但不要修改）
- 整章潤稿（Q-P2 (c) 若 PM 拍板開放）：分段 chunked polish（每 2000 字一段），不一次塞整章
- 一般 LLM provider（非 xiaohuangwen）的 polish prompt template：在 `packages/prompt-library/prompts/skills/polish-prose.ts`

---

# 初版規格草案（PM 拍板後 promote 成正式 spec）

## 摘要

`polish-prose` 是章節編輯器內的潤稿 Skill。使用者在 CM6 編輯器內**框選一段文字** → 浮動工具列顯示「✨ 潤稿」按鈕 → 點擊後開啟**文字潤飾面板（PolishPanel）** → 面板三段式佈局（選取文字 / 潤飾提示詞 / 潤飾結果）→ 按「潤飾」送 AI 串流 → AI 輸出填入「潤飾結果」（可手動編輯）→ 按「採用」以潤飾結果取代編輯器中的選取文字。

走 **structured generate provider**（xiaohuangwen）或**普通 messages-array provider**（雲端 / 地端）皆可，由 `agents.polish-prose.routing.primary` 決定。

## API 合約

### POST /api/projects/:projectHash/chapters/:chapterNumber/polish

**Auth:** `none`（localhost）

**Request:**
```ts
{
  selectedText: string;        // 必填：選取的段落
  contextBefore?: string;      // 選取前 N codepoint（預設 500）
  contextAfter?: string;       // 選取後 N codepoint
  polishInput: string;         // 必填：使用者潤稿指令；空字串視為「自由潤飾」
}
```

**Response:** SSE stream（與 spec 005 相同事件結構）

事件序列：

```
event: started
data: {"polishId":"<uuid>","model":"xiaohuangwen:latest"}

event: chunk
data: {"text":"..."}

... (重複)

event: usage
data: {"inputTokens":0,"outputTokens":1234}    // xiaohuangwen 走字數；其他 provider 走 token

event: complete
data: {"polishId":"<uuid>","totalChars":1234,"durationMs":15000}
```

**Errors:**

| Status | Code | When | Layer |
|---|---|---|---|
| 400 | `INVALID_INPUT` | selectedText 為空、或 > 5000 codepoint | inline |
| 400 | `ROUTING_NOT_CONFIGURED` | `agents.polish-prose.routing.primary` 未設 | modal |
| 404 | `PROJECT_NOT_FOUND` | projectHash 不在 recentProjects | modal |
| 502 | `QUOTA_EXHAUSTED` | xiaohuangwen 餘額不足 | toast |

### Dispatch 邏輯

```ts
// apps/api/src/services/polish-prose.ts
const primaryProvider = providers.get(parsedPrimary.providerId);
const cap = primaryProvider.capabilities(parsedPrimary.modelId);

if (cap?.hasStructuredNovelGenerate) {
  // xiaohuangwen path
  return router.polishNovel(
    { pre_output: selectedText, polish_input: polishInput },
    { primary: routing.primary, retryPerModel: routing.retryPerModel },
  );
} else {
  // 普通 LLM path — 用 prompt-library 的 polish-prose template
  const { systemPrompt, userMessage } = buildPolishPrompt({
    selectedText, contextBefore, contextAfter, polishInput,
  });
  return router.stream(
    { modelId: routing.primary, systemPrompt, messages: [{ role: "user", content: userMessage }] },
    routing,
  );
}
```

## 跨元件協議

### UI 觸發流程

```
ChapterEditor (CM6)              apps/api                  LLMRouter
  │
  │ 使用者在 CM6 中框選文字
  │ ← 浮動工具列出現（CM6 SelectionMenu plugin）
  │ 使用者點「✨ 潤稿」
  │ ← PolishPanel 滑入（右側 panel，編輯器仍可見）
  │   panel 三段式顯示：選取文字(收合) / 潤飾提示詞(空) / 潤飾結果(空)
  │
  │ 使用者輸入潤飾提示詞 → 按「潤飾」
  │ POST .../polish ─────────▶│
  │                            │ dispatch（capability flag）
  │                            │─────────────▶ generateNovel() / stream()
  │ ← SSE event:started ───────┤ 潤飾結果開始顯示（串流）
  │ ← SSE event:chunk ─────────┤ 結果文字逐步填入 潤飾結果 textarea
  │ ...
  │ ← SSE event:complete ──────┤ 串流完成；「採用」「重新產生」按鈕 active
  │
  │ 使用者可選擇：
  │   ├─ 手動編輯「潤飾結果」textarea（直接修改 AI 輸出）
  │   ├─ 按「重新產生」→ 清空結果，重新送 POST .../polish
  │   └─ 按「採用」→ 以「潤飾結果」文字取代編輯器中的選取段落
  │                 → panel 關閉，編輯器 dirty，流程結束
```

### PolishPanel UI

**面板類型**：右側滑入 panel（與章節編輯器並存，使用者仍可閱讀編輯器上下文）

**佈局**：

```
┌──────────────────────────────────────────────┐
│ ✨ 文字潤飾                           [×] 關閉 │
├──────────────────────────────────────────────┤
│ 選取文字  [▶ 展開 / ▼ 收合]  ← 預設收合      │
│  （read-only；展開後全文可閱讀）               │
├──────────────────────────────────────────────┤
│ 潤飾提示詞  [⤢ 放大]  ← 不可收合             │
│  ┌──────────────────────────────────────┐    │
│  │ 可編輯 textarea（placeholder：       │    │
│  │  「留空則自由潤飾；或填：調整節奏、  │    │
│  │   強化情感…」）                      │    │
│  └──────────────────────────────────────┘    │
├──────────────────────────────────────────────┤
│ 潤飾結果  [⤢ 放大]  ← 不可收合               │
│  ┌──────────────────────────────────────┐    │
│  │ 可編輯 textarea（串流時逐字填入；     │    │
│  │  完成後使用者可手動修改）             │    │
│  └──────────────────────────────────────┘    │
├──────────────────────────────────────────────┤
│         [潤飾]    [重新產生]    [採用]         │
└──────────────────────────────────────────────┘
```

**按鈕狀態機**：

| 狀態 | 潤飾 | 重新產生 | 採用 |
|---|---|---|---|
| 初始（結果空）| ✅ active | ❌ disabled | ❌ disabled |
| 產生中 | ❌ loading spinner | ❌ disabled | ❌ disabled |
| 有結果（完成）| ❌ disabled | ✅ active | ✅ active |
| 使用者手動清空結果 | ✅ active | ❌ disabled | ❌ disabled |

**「選取文字」段規格**：

| 項 | 規格 |
|---|---|
| 預設狀態 | 收合，顯示前 50 字 + `…` |
| 展開後 | 全文可閱讀（read-only，不可編輯） |
| 使用元件 | 自訂（非 ExpandableTextarea — 因為 ExpandableTextarea 是可編輯元件）；改用帶收合控制的 read-only `<ReadOnlyCollapsible>` |

**「潤飾提示詞」與「潤飾結果」段規格**：

| 項 | 潤飾提示詞 | 潤飾結果 |
|---|---|---|
| 可編輯 | ✅ | ✅（串流完成後） |
| 可收合 | ❌ | ❌ |
| 可放大（全螢幕）| ✅（ExpandableTextarea）| ✅（ExpandableTextarea）|
| 串流期間 | — | read-only（串流中不可編輯）|
| Placeholder | 「留空則自由潤飾…」 | 「潤飾結果將顯示於此…」 |

**「採用」行為**：
1. 以「潤飾結果」textarea 當前文字（含使用者手動修改）取代 CM6 編輯器中的選取段落
2. PolishPanel 關閉
3. 編輯器 dirty 標記啟動（使用者需手動儲存 → git commit）
4. **不走 spec 006 採用流程**（Q-P5 = a）

### 與 chapter-writer 的分工

| Skill / Agent | 目的 | 寫入位置 | 採用流程 |
|---|---|---|---|
| chapter-writer（spec 005） | 從零生成整章 | 寫到 cache draft；走 spec 006 採用流程 | ✅ |
| polish-prose（本 spec） | 對已採用章節的選段微調 | 直接覆寫編輯器當前文字（不走 draft） | ❌（Q-P5 (a)）|

## 資料模型

無新增 .md 檔案結構；polish 結果不留 history（透過編輯器 unsaved changes → 使用者按儲存 → 寫檔 → git 自管版本）。

## Settings 變更（影響 spec 009）

### 新增 routing slot

```yaml
agents:
  polish-prose:           # M6 新增
    routing:
      primary: "xiaohuangwen:latest"   # 預設 xiaohuangwen；使用者可改
      fallbacks: []                    # structured-only 無 fallback
      retryPerModel: 1
      systemPromptOverride: null       # 不注入（prose Skill 不需要 settings 級 persona）
      temperature: null
```

### Settings UI（spec 009 補）

`AgentRoutingCard` for `polish-prose` 顯示在「Agent routing」段，與既有 4 個 Agent slot 並列。Provider 下拉**可選** `origin in ["cloud", "local", "novel-api"]`（同 chapter-writer）。

## LLM adapter 合約

- 觸發的 Skill：`polish-prose`（`docs/skills/polish-prose.md`）
- 上層需提供的上下文：`selectedText`、`contextBefore`、`contextAfter`、`polishInput`
- 串流：是
- 失敗處置：xiaohuangwen path 無 fallback；toast 顯示 `QUOTA_EXHAUSTED` / `network` 錯誤訊息

## 非功能性

- **效能**：首 chunk 1~3s；總長 5~30s（依選段長度）
- **容量**：selectedText 上限 5000 codepoint（超過提示使用者分段）
- **可用性**：不阻擋一般編輯；潤稿期間編輯器仍可操作其他段落（但建議使用者等完成）

## Shared UI components reference

詳見 [`_components/_index.md`](./_components/_index.md)。

| 元件 | 位置 |
|---|---|
| [`<ExpandableTextarea>`](./_components/expandable-textarea.md) | PolishPanel「潤飾提示詞」欄位 + 「潤飾結果」欄位（兩處，均可放大）|
| [`<ReadOnlyCollapsible>`](../../apps/web/src/components/ReadOnlyCollapsible.tsx) | PolishPanel「選取文字」段（**新元件**，不在 _components/ — 因為 spec-local；可收合，不可編輯）|
| [`<Spinner>`](./_components/spinner.md) | 串流首 chunk 等待（1~3s）；「潤飾」按鈕 loading 狀態 |
| [Error 三層](./_components/error-display.md) | inline（INVALID_INPUT）/ toast（QUOTA_EXHAUSTED / network）/ modal（ROUTING_NOT_CONFIGURED）|

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/polish-prose.ts` — request / response types（移除 DiffHunk，不需要）
- [ ] **prompt-library**: `packages/prompt-library/prompts/skills/polish-prose.ts` — 普通 LLM provider 的 prompt template（含 contextBefore / contextAfter 注入 + 「不可修改」規則）
- [ ] **be-1**: `apps/api/src/services/polish-prose.ts` — dispatch 邏輯（capability flag）
- [ ] **be-2**: `apps/api/src/routes/polish.ts` — `POST .../polish` endpoint（SSE）
- [ ] **fe-1**: `apps/web/src/components/ReadOnlyCollapsible.tsx` — 通用 read-only 可收合區塊（供 PolishPanel 選取文字段使用；**非** ExpandableTextarea，因為不可編輯）
- [ ] **fe-2**: `apps/web/src/features/chapter-editor/PolishSelectionMenu.tsx` — CM6 SelectionMenu plugin，框選後顯示浮動工具列含「✨ 潤稿」按鈕
- [ ] **fe-3**: `apps/web/src/features/chapter-editor/PolishPanel.tsx` — 右側滑入 panel（三段式：ReadOnlyCollapsible + 2× ExpandableTextarea + 三按鈕）
- [ ] **fe-4**: SSE consumer hook `useStreamPolish`（仿照 `useStreamGenerate`）
- [ ] **qa-1**: dispatch 整合測試（structured vs messages-array path）
- [ ] **qa-2**: 採用邏輯單元測試（CM6 transaction 取代選取段落，dirty 標記啟動）
- [ ] **qa-3**: `.feature` scenarios（待 PM 補 `docs/requirements/features/012-polish-prose.feature`）
- [ ] **⚠️ 注意**：`jsdiff` 套件**不需要**引入（移除 DiffView 設計後無此依賴）

## .feature scenarios（待 PM 補）

以下 scenarios 由 PM 在 `docs/requirements/features/012-polish-prose.feature` 中親手寫（依 CLAUDE.md 規範）。Skill 設計問題（Q-P1~5）拍板後 spec-architect 補建議草稿。

- polish-prose 觸發按鈕在無選取時 disabled
- 選段超過 5000 字提示分段
- xiaohuangwen path：餘額不足 → toast + 引導查餘額
- 一般 LLM path：DiffView 顯示 hunk + 使用者部分接受
- 取消 DiffView → 編輯器內容不變

## 變更紀錄

- `2026-05-17`：初版（M6 PM Q1 拍板「建立 Polish Novel」後起草；含 Feedback for PM 段待 Round 1 拍板）。
- `2026-05-18`：PM 拍板 Q-P1~5：Q-P1 改為框選後浮動工具列（b）；Q-P3 PM 直接設計取代 diff view — 改為三段式 PolishPanel（選取文字收合 read-only / 潤飾提示詞可編輯可放大 / 潤飾結果可編輯可放大）+ 三按鈕（潤飾 / 重新產生 / 採用）。移除 DiffView + jsdiff 依賴。新增 ReadOnlyCollapsible 元件。
