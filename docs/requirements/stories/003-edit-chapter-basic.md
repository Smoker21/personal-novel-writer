# 章節編輯器：開啟、編輯、自動儲存（含 browser 草稿）

> Story ID: `003-edit-chapter-basic`
> Persona: `hobbyist-author`、`serial-author`、`worldbuilder-author`
> Epic: `EPIC-03-chapter-writing-flow`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `001`
> 修訂：`2026-05-12` — autosave 改寫 browser storage（IndexedDB），「儲存」按鈕才寫 markdown 並觸發 status-updater；採用 web editor lib 的內建 undo/redo（不再自寫合併規則 → 對應 Story 004 簡化）

## 使用者故事

身為 **個人創作者**，
我想要 **打開任意一章開始打字，編輯期間 browser 自動保存讓我不必擔心忘記儲存；當我覺得這版本可以了再按「儲存」按鈕，內容才寫進 markdown 檔讓 AI 看得到並進入 git 版控**，
以便 **保持寫作專注、編輯期間 F5 / 切章 / 關 tab 都不會掉內容；同時清楚分開「我還在改」與「這版本確定了」兩個狀態**。

## 背景與動機

idea.md 第 11、12 條：「每章結束輸出在畫面上，使用者可以在畫面上進行共同編輯」「章節撰寫過程，使用者，可以回復編輯動作，以免誤刪或是誤動作」。

**兩層儲存模型**（2026-05-12 引入）：

```
                 [Editor 內部 state]
                        │ 1.5s debounce / blur / 切章 / 關 tab
                        ▼
                 [Browser storage (IndexedDB)]
                        │ 使用者按「儲存」按鈕
                        ▼
                 [chapters/chapter_NNNN.md]  ← AI 可見、Drive 同步、git 版控
                        │ Story 007 觸發
                        ▼
                 status-updater 跑
```

**為什麼分兩層**：
1. **編輯期間 F5 / 切章 / 關 tab 都不會掉**（browser storage 即時保存）
2. **「儲存」是使用者明示的「這版確定」訊號**：寫進 .md = 開始進入 git commit、Drive 同步、AI 可見的範圍
3. **避免 AI 把使用者的探索性編輯當作正式內容**：AI 讀的永遠是 .md，不會偷看 browser draft
4. **status-updater 觸發點清楚**：「儲存」/「採用」按鈕一按就 trigger，autosave 不 trigger，避免每分鐘跑 LLM

Undo / Redo 用 web editor lib 的內建實作（→ Story 004 簡化版）；版本控制由 Story 010 處理（git commit on save）。

## 範圍

**包含：**
- 從章節列表開啟一章 → 進入編輯器（從 .md 讀入 + 若 browser 有 dirty draft 則優先載入並提示）
- 純文字編輯（純 markdown，不做 WYSIWYG）
- **autosave 到 browser storage**（IndexedDB）— 1.5s debounce + blur / 切章 / 關 tab 強制 flush
- **「儲存」按鈕** — 把 browser draft 寫進 `chapters/chapter_NNNN_<title>.md`，觸發 git commit + status-updater
- 編輯器顯示三種狀態：`乾淨` / `編輯中（已 autosave 到 browser）` / `已儲存到 .md`
- 標題變更時同步重命名檔案（按「儲存」時才生效；autosave 不重命名）
- 採用 web editor library 的**內建 undo/redo**（→ Story 004 簡化）
- 鍵盤捷徑 `Ctrl+S` = 按「儲存」按鈕

**不包含：**
- 富文本格式（粗體 / 引用塊 / 圖片）→ 後續另開
- 客製 undo merge 規則 → Story 004 也跟著簡化，使用 lib 內建即可
- 多開分頁 → 後續優化
- AI 撰寫 → Story 005
- 採用 AI 草稿 → Story 006
- 版本快照管理 → Story 010（git）

## 兩層儲存：行為細節

### Browser storage（IndexedDB）

- key 結構：`<projectHash>:chapter:<chapterNumber>:draft`
- value：當前編輯器內容（plain markdown 字串）
- 觸發寫入時機：
  - 鍵盤輸入後 **1.5 秒 debounce**
  - 視窗失焦（blur）→ 立即 flush
  - 切換到其他章節 → 立即 flush
  - 關閉應用前（beforeunload）→ 同步 flush
- **不**觸發 status-updater
- **不**寫進 .md
- 容量上限（IndexedDB 預設 ~50MB+）足夠裝幾百章未存草稿

### Markdown 檔（`chapters/chapter_NNNN_<title>.md`）

- 寫入觸發點：使用者按「儲存」按鈕（Ctrl+S 等同）
- 寫入流程：
  1. 從 browser storage 讀當前 draft
  2. 寫入 .md（atomic：寫 .tmp → fsync → rename）
  3. 若標題改了，同步重命名檔案
  4. 觸發 git commit（Story 010）
  5. 觸發 status-updater（Story 007）
  6. 寫入成功後可以選擇清掉 browser draft（讓「乾淨」狀態回歸），或保留（對抗下次 .md 與 browser 不一致）— 選保留並比對

### 衝突處理

- 開啟章節時，比對 browser draft 與 .md 內容：
  - 若 browser draft 存在但與 .md 一致 → 載入 .md，狀態 `乾淨`
  - 若 browser draft 與 .md 不同 → 載入 browser draft，狀態 `編輯中（已 autosave 到 browser）`，UI 提示「這是上次未存入 .md 的草稿，按儲存才會寫入檔案」
  - 若 .md 比 browser draft 新（外部編輯了 .md，例如 git pull 或手改）→ 載入 .md，提示「外部變更已載入，未存的 browser 草稿被棄」

## 驗收條件 (Gherkin)

### Scenario: 打字 1.5 秒後 autosave 到 browser，但 .md 不變
```gherkin
Given 我已開啟專案「春日記事」第一章「梅雨初晴」，當前內容為空
When 我在編輯器輸入「她推開書店木門時，雨剛好停了。」
And 我停止打字 1.5 秒
Then 該內容寫入 browser storage（IndexedDB key="<projectHash>:chapter:1:draft"）
And chapters/chapter_0001_梅雨初晴.md 仍為空
And 編輯器右上角狀態顯示「編輯中（已 autosave 到 browser）」
And 沒有 git commit
And 沒有 status-updater 觸發
```

### Scenario: 按「儲存」按鈕才寫進 .md 並觸發後續流程
```gherkin
Given 我在第一章編輯器，browser draft 有 200 字內容
And 狀態為「編輯中（已 autosave 到 browser）」
When 我按「儲存」按鈕（或 Ctrl+S）
Then chapters/chapter_0001_梅雨初晴.md 被寫入該 200 字內容
And 系統 git commit 訊息「chapter: save chapter 1」
And status-updater 自動觸發（依 Story 007）
And 編輯器狀態變為「已儲存到 .md」
And toast 通知「已儲存」
```

### Scenario: F5 重整後 browser draft 仍在
```gherkin
Given 我在第一章編輯器輸入了「她推開書店木門時」
And 1.5 秒後 autosave 觸發，browser storage 有此 draft
And 我尚未按「儲存」
When 我按 F5 重整瀏覽器
Then 編輯器重新開啟第一章
And 顯示「她推開書店木門時」（從 browser draft 載入）
And chapters/chapter_0001_梅雨初晴.md 仍為空
And 狀態顯示「編輯中（已 autosave 到 browser）」+ 提示「這是上次未存入 .md 的草稿，按儲存才會寫入檔案」
```

### Scenario: 切換章節時自動 flush 到 browser
```gherkin
Given 我在第一章編輯器輸入了「未存的最後一段」
And 自動儲存的 1.5s debounce 尚未觸發
When 我點擊章節列表的第二章
Then 第一章的內容立即 flush 到 browser storage
And 第二章編輯器開啟
And chapters/chapter_0001_梅雨初晴.md 不變（仍是上次儲存的內容）
When 我回到第一章
Then 「未存的最後一段」仍在編輯器中
```

### Scenario: 採用 AI 草稿時直接寫 .md（不經 browser draft）
```gherkin
Given AI 撰寫已完成，草稿面板顯示完整草稿
When 我按「採用」按鈕（→ Story 006）
Then chapters/chapter_0001_梅雨初晴.md 被寫入 AI 草稿內容
And browser draft 被清空（避免下次開啟混淆）
And 編輯器狀態變為「已儲存到 .md」
And 觸發 git commit + status-updater（依 006 / 007）
```

### Scenario: 標題變更，按儲存才生效
```gherkin
Given 第一章目前的檔名為 chapters/chapter_0001_未命名.md
When 我把章節標題從「未命名」改為「梅雨初晴」
Then 編輯器內標題顯示「梅雨初晴」
And browser storage 記錄新標題
And chapters/chapter_0001_未命名.md 仍存在（檔名未改）
When 我按「儲存」
Then 系統把檔案重命名為 chapters/chapter_0001_梅雨初晴.md
And 章節列表的顯示更新為「第一章 梅雨初晴」
And 內容保持不變
And git commit 訊息「chapter: rename chapter 1 to 梅雨初晴 + save」
```

### Scenario: 儲存失敗時 browser draft 仍保留
```gherkin
Given 我在編輯器打字並按「儲存」
And 檔案系統暫時不可寫入
When 系統嘗試寫 .md 失敗
Then 編輯器顯示「儲存失敗：<原因>，請檢查資料夾權限」
And 系統以指數退避重試 3 次
And 若 3 次後仍失敗，狀態回到「編輯中（已 autosave 到 browser）」
And browser draft 保留（使用者再按一次儲存即可重試）
And 不觸發 git commit / status-updater
```

### Scenario: 外部編輯了 .md 後重開章節
```gherkin
Given 我在第一章寫了 200 字後按「儲存」，.md 與 browser 同步
And 我關閉 app
And 外部（例如直接編輯 .md 或 git pull）把 .md 內容改了
When 我重開 app 並開啟第一章
Then 編輯器載入 .md 的最新內容
And browser storage 中的舊 draft 被覆蓋（提示「外部變更已載入」）
And 狀態顯示「乾淨」
```

### Scenario: 使用編輯器 lib 內建 undo / redo
```gherkin
Given 我在第一章編輯器寫了「她推開書店木門時，雨剛好停了。」
When 我按 Ctrl+Z（或 Cmd+Z）
Then 編輯器內容回到上一個編輯狀態（依 web editor lib 的內建合併規則）
When 我按 Ctrl+Y / Ctrl+Shift+Z
Then 編輯器內容前進一步
And 編輯期間的 undo/redo 不寫 .md，只動 editor state + browser storage
And 「儲存」前 undo/redo 隨意做都不影響檔案
```

### Scenario: Ctrl+S 等同按「儲存」按鈕
```gherkin
Given 我在編輯器，browser draft 有未儲存內容
When 我按 Ctrl+S
Then 與按「儲存」按鈕同行為：寫 .md + git commit + status-updater
```

## AI 互動細節

不直接觸發 AI 代理。但「儲存」按鈕觸發 status-updater（Story 007）這個鏈式 LLM 呼叫；使用者體感上是「我按了儲存，AI 在背景更新狀態」。

## UX 注意事項

- 編輯器置中、預設字寬合理（70-80 字）
- 字數計數即時顯示
- **三種狀態指示**（明顯區分）：
  - 🟢 `已儲存到 .md`（綠色）— browser 與 .md 一致
  - 🟡 `編輯中（已 autosave 到 browser）`（黃色）— 有 dirty draft
  - 🔴 `儲存失敗`（紅色）— 出錯狀態
- 「儲存」按鈕在工具列**顯著位置**（與「採用」「立刻更新狀態」並列）
- Ctrl+S = 「儲存」按鈕
- 失焦時若有 dirty buffer 立即 flush 到 browser（不寫 .md）
- 不支援同時兩個視窗開同一章（後開的視窗顯示唯讀並提示）
- 「儲存」按鈕在 30 秒內連按只跑一次後續流程（git commit + status-updater）— UI 變灰 30 秒避免 LLM 浪費

## 開放問題

- [ ] 用哪個 web editor lib？候選：
  - **CodeMirror 6** — 純文字 + markdown 語法高亮、輕量、可組合
  - **TipTap / ProseMirror** — WYSIWYG，較重
  - **Lexical** — Meta 出品，WYSIWYG，現代
  - 建議：**MVP 用 CodeMirror 6**（純 markdown 編輯體驗對小說寫作合適）— 留待 spec 階段定案
- [ ] browser storage 用 IndexedDB 還是 localStorage？建議 IndexedDB（容量大、支援 binary、async API）。spec 階段細化
- [ ] 標題重命名時，舊檔名是否保留為 `.bak`？目前選否——直接 mv，依靠 git commit 歷史復原
- [ ] 多視窗同開同章的偵測機制：用 SQLite cache lock 或 BroadcastChannel？留 spec
- [ ] 「儲存」連按 30s debounce 是否要可調？預設不開放，避免增加設定面積
- [ ] browser storage 跨專案的清理策略：刪專案時要不要連帶清掉 IndexedDB 中該專案的 draft？建議：是
