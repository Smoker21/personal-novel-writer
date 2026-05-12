# 章節編輯器：Undo / Redo（使用 web editor lib 內建）

> Story ID: `004-undo-redo-chapter`
> Persona: `hobbyist-author`、`serial-author`、`worldbuilder-author`
> Epic: `EPIC-03-chapter-writing-flow`
> Priority: `P0`
> Size: `S`
> Status: `Ready`
> Depends on: `003`、`005`、`006`、`010`
> 修訂：`2026-05-12` — 砍掉客製合併規則（50 字 / 5s / 句點切點）；改為直接用 web editor lib（CodeMirror 6 / TipTap / Lexical 之一，待 spec）的內建 undo/redo。AI 採用 / Skill 套用必須走 lib 的 transaction API 才能進 undo stack。跨 session 持久化丟給 git（Story 010）。

## 使用者故事

身為 **個人創作者**，
我想要 **在章節編輯時用 Ctrl+Z / Ctrl+Y 回復編輯動作；採用 AI 草稿或套用潤飾 Skill 後也能一鍵 Undo 回到動作前**，
以便 **誤刪、誤改、誤套用都能救回，不必擔心動作不可逆**。

## 背景與動機

idea.md 第 12、29 條：「使用者可以回復編輯動作，以免誤刪或是誤動作」「章節內容在編輯過程中，有 (Undo, Redo) 功能」。

**為什麼用 lib 內建 undo/redo**（2026-05-12 決策）：
- CodeMirror 6 / TipTap / Lexical / Slate 等成熟編輯器 lib **都有內建 undo/redo**，且合併規則（連續打字、句點切點）已調得相對成熟
- 自己重寫合併規則代價高，使用者體感不會更好
- 跨 session 持久化（關 app 後還能 undo）由 git commit 解決（Story 010）：使用者按「儲存」= 一個 git commit = 永久可還原

本 story 的工作因此剩三件：
1. 確認選定的 lib 內建 undo/redo 行為符合需求
2. **AI 採用（Story 006）/ Skill 套用必須通過 lib 的 transaction API 進入 undo stack**，使用者一次 Ctrl+Z 即可回到動作前
3. 鍵盤捷徑符合作業系統慣例

## 範圍

**包含：**
- `Ctrl+Z` Undo、`Ctrl+Y` 或 `Ctrl+Shift+Z` Redo（Mac 為 `Cmd+Z` / `Cmd+Shift+Z`）
- Web editor lib 自帶的合併規則（連續打字 / 句點 / 段落切點等由 lib 決定）
- AI 草稿採用視為**單一可 undo 步驟**——使用者後悔可一鍵回到採用前
- Skill 套用（如未來 Story 013 polish-prose）視為單一可 undo 步驟
- Undo / Redo 按鈕在工具列顯示，hover 顯示下一步要 undo / redo 的標籤

**不包含：**
- 客製合併規則（50 字 / 5s / 句點切點等）→ 用 lib 預設
- 跨 session 持久化的 undo（關閉應用後 stack 遺失）→ 改靠 Story 010 git commit 還原
- 章節層級的版本快照 → Story 010 git
- 跨檔案 Undo（例如刪除整章後復原）→ 後續另開
- Undo stack 上限管理 → 用 lib 預設（通常數百步以上夠用）

## AI 採用與 Skill 套用如何進 undo stack

關鍵：**透過 editor lib 的 transaction API 套用變更**，這樣 lib 會自動把該動作當成 undo stack 中的一步。

例（以 CodeMirror 6 為例，spec 階段細化）：
```ts
// 採用 AI 草稿時：
view.dispatch({
  changes: { from: 0, to: doc.length, insert: aiDraftText },
  // CodeMirror 自動當作一個 history step；undo 即可回到先前內容
});
```

這要求採用 / 套用的實作**不繞過 editor lib 直接覆寫底層 state**。

## 驗收條件 (Gherkin)

### Scenario: 連續打字後 Undo 回到 lib 認定的上一個切點
```gherkin
Given 我在編輯器中已輸入「她推開書店木門時，雨剛好停了。」
And 我繼續打字「空氣裡有舊書與咖啡的氣味。」
When 我按下 Ctrl+Z
Then 編輯器內容回到 web editor lib 認定的上一個 history step（具體切點由 lib 決定，通常為段落 / 句號 / 暫停點）
And 該動作不寫 .md（依 Story 003：autosave 只寫 browser storage，按「儲存」才寫 .md）
```

### Scenario: 連續 Undo 回到空白後不再退
```gherkin
Given 我在空白章節中輸入了三段文字
When 我連續按 Ctrl+Z 直到內容回到空白
Then 再按 Ctrl+Z 不再有變化（已到 history 底）
And Undo 按鈕顯示為禁用狀態
```

### Scenario: Undo 後 Redo 還原
```gherkin
Given 我輸入了「第一段」並 Undo 回到空白
When 我按下 Ctrl+Y（或 Ctrl+Shift+Z）
Then 編輯器內容回到「第一段」
And Redo 按鈕在內容已是最新版本時禁用
```

### Scenario: Undo 後重新打字會清空 Redo stack
```gherkin
Given 我輸入了「第一段」並 Undo 回到空白
When 我輸入「另一段」
Then Redo 按鈕變為禁用
And Undo 一次會回到空白（不會再回到「第一段」）
```

### Scenario: 採用 AI 草稿視為單一 Undo 步驟
```gherkin
Given 章節原內容為「使用者親筆的第一段。」
And 我採用了 chapter-writer 產出的草稿，章節內容變為「[AI 產出的整章內容]」
When 我按下 Ctrl+Z
Then 章節內容回到「使用者親筆的第一段。」
And Undo stack 中該步顯示標籤「採用 chapter-writer 草稿」（hover Undo 按鈕可見）
```

### Scenario: Skill 套用視為單一 Undo 步驟
```gherkin
Given 章節中有一段「她非常非常喜歡他。」
And 我選取該段，套用 polish-prose Skill，內容變為「她對他懷有深切的歡喜。」
When 我按下 Ctrl+Z
Then 該段回到「她非常非常喜歡他。」
And Undo stack 中該步顯示標籤「polish-prose 潤飾」
```

### Scenario: 切換章節後不能 undo 上一個章節的編輯
```gherkin
Given 我在第一章編輯了多步
When 我切換到第二章
Then 第一章的內容已 flush 到 browser storage（依 Story 003）
And 第二章編輯器有自己的 undo stack
And 在第二章按 Ctrl+Z 不會影響第一章
When 我回到第一章
Then 第一章的編輯內容仍在（從 browser storage 載入）
And 但第一章的 undo stack 已重置（lib 不跨 session 持久化）
And 若使用者要還原到更早的版本，請看 git commit 歷史（Story 010）
```

### Scenario: AI 串流產出過程中按 Undo 等於中止串流
```gherkin
Given AI 撰寫正在串流，已產出約 300 字到草稿面板
When 我按下 Ctrl+Z
Then 系統視為「中止串流」（與按「中止」按鈕等同，依 Story 005）
And 已產出的 300 字保留在草稿面板供使用者選擇
And 主編輯區的 undo stack 不被影響（因為主編輯區並未變動）
```

## AI 互動細節

不直接呼叫 AI，但與 AI 流程互動：
- AI 產出的草稿被採用時（Story 006），實作必須走 editor lib 的 transaction API 才能讓該動作進入 undo stack
- Skill 套用同上

## UX 注意事項

- Undo / Redo 按鈕在工具列顯眼位置，hover 顯示下一步要 undo / redo 的標籤
- 鍵盤捷徑符合作業系統慣例（Mac `Cmd+Z` / `Cmd+Shift+Z`，Windows / Linux `Ctrl+Z` / `Ctrl+Y`）
- Undo / Redo 不影響 .md 檔（只動 editor state + browser storage）
- 大量 Undo（連按 30+）時不應卡住 UI（lib 通常有處理）
- 提示使用者：「想還原到很久以前的版本嗎？打開章節旁的 `git history` 面板」（→ Story 010）

## 開放問題

- [ ] 用哪個 web editor lib：與 Story 003 同問題，spec 階段定案。建議 CodeMirror 6
- [ ] AI 採用 / Skill 套用的 transaction API 介面如何包裝？建議：apps/web 內封裝一個 `applyContentChange(text, label)` helper，所有非鍵盤輸入的內容變更都走這個，自動 carry undo label
- [ ] AI 串流期間使用者編輯主編輯區是被禁的（依 Story 005）→ 所以串流期間的 Undo 行為是清晰的（中止 + 不動 stack），無歧義
