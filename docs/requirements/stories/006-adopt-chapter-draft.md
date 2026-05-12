# 採用 AI 草稿並歸檔

> Story ID: `006-adopt-chapter-draft`
> Persona: `hobbyist-author`、`serial-author`
> Epic: `EPIC-04-ai-writing-and-memory`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `005`、`007`、`010`（git 版控取代手動快照機制）
> 修訂：`2026-05-12` — 拿掉 `chapters/_versions/v_TS.md` 自動快照（改用 git commit on adopt）；明確採用 = 「寫 .md + git commit + 自動觸發 status-updater + 清掉 browser draft」四件套；Undo 行為對齊 Story 003 兩層儲存模型

## 使用者故事

身為 **個人創作者**，
我想要 **在審視 AI 草稿後決定採用，並讓系統把草稿、生成提示詞、章節歸檔一次處理好**，
以便 **既擁有可寫作的成稿，也保留每一章的「為何這樣寫」紀錄供日後回顧或重生；任何採用都可以靠 git 歷史還原**。

## 背景與動機

idea.md 第 14、30 條：「使用者可以決定採用目前版本，畫面須提示確認」「確認章節內容符合使用者需求後，存檔進 chapter_####\_{Chapter_title}.md 檔案，同時把該章節的產生提示詞...一併寫入 chapter\_####\_prompt.md」。

採用是 **AI 記憶機制鏈條的關鍵節點**——只有採用過的章節會：
1. 寫入主檔 `chapter_####_<title>.md`
2. 寫入提示詞 `chapter_####_prompt.md`
3. **git commit**（取代舊的 `_versions/v_TS.md` 快照機制）— Story 010
4. 觸發狀態更新（→ Story 007）
5. 清掉 browser draft（避免下次開該章看到過期未存內容）

未採用的草稿不影響任何記憶資料，等於「沒發生過」。

「採用」與「儲存」（Story 003 的「儲存」按鈕）行為相似，差別只在內容來源：
- **採用** = 從草稿面板（AI 產出）→ 編輯器 + .md
- **儲存** = 從 browser storage（使用者親筆）→ .md
兩者都觸發 git commit + status-updater。

## 範圍

**包含：**
- 在草稿面板（Story 005）按「採用」觸發本流程
- 二次確認對話框
- 用 web editor lib 的 transaction API 把草稿套到編輯器主編輯區（→ undo stack 自動加一步，依 Story 004）
- 寫入 `chapters/chapter_####_<title>.md`（覆寫主檔）
- 寫入 `chapters/chapter_####_prompt.md`（含提示詞快照、模型 ID、Agent 版本、上下文摘要）
- 清除該章的 browser draft（IndexedDB key `<projectHash>:chapter:<N>:draft`）
- 觸發 git commit（依 Story 010）— commit 訊息「chapter: adopt AI draft for chapter <N> <title>」
- 採用完成後**自動觸發** Story 007 的 status-updater
- 草稿面板關閉，主編輯區顯示新內容

**不包含：**
- 狀態更新本身的細節 → Story 007
- `chapters/_versions/v_TS.md` 自動快照 → **改為 git commit**（Story 010）
- 採用後的「再次微調」 → 採用後就回到 Story 003 的一般編輯流程
- 「以使用者已寫的開頭續寫」 → Story 012（原 018）

## 提示詞檔案格式

`chapters/chapter_####_prompt.md`：

```markdown
---
generatedAt: 2026-05-10T12:34:56Z
agent: chapter-writer
agentVersion: v0.3
model: lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus
chapterNumber: 1
chapterTitle: 梅雨初晴
adoptedAt: 2026-05-10T12:40:01Z
adoptedFromHistory: false   # true 表示這章是從舊草稿快照採用的（非當下產出）
---

## System prompt

[chapter-writer 當時用的完整 system prompt]

## User prompt

[組裝給 LLM 的 user prompt，含 outline、status 摘要、角色卡引用]

## 上下文摘要

- synopsis.md 哈希: <sha256>
- 用到的角色: [蘇晴, 林書言]
- story_status.md 哈希: <sha256>
- 用到的 character_<slug>_status.md: [蘇晴_status: <sha>, 林書言_status: <sha>]
- 上一章完整內容哈希: <sha256>

## 模型回應 metadata

- 串流耗時: 47s
- 輸入 token: 2310
- 輸出 token: 1842
```

哈希記錄讓未來可以驗證「我重產這章時，輸入是否與當時相同」。

`chapter_####_prompt.md` 也進 git commit（一起寫入；commit 訊息「chapter: adopt AI draft for chapter 1 梅雨初晴」涵蓋兩個檔）。

## 驗收條件 (Gherkin)

### Scenario: 採用 AI 草稿並完成歸檔
```gherkin
Given 我在專案「春日記事」第一章編輯器中
And chapter-writer 已產出完整草稿在草稿面板
When 我點擊「採用」並通過二次確認
Then 編輯器透過 web editor lib 的 transaction API 把主編輯區內容替換為草稿（→ undo stack 加一步「採用 chapter-writer 草稿」）
And chapters/chapter_0001_梅雨初晴.md 的內容被覆寫為草稿內容
And chapters/chapter_0001_prompt.md 被建立或覆寫，含 system prompt、user prompt、上下文摘要、模型回應 metadata
And browser storage 中該章的 draft 被清除
And 系統 git commit「chapter: adopt AI draft for chapter 1 梅雨初晴」（含 .md 與 prompt.md 兩個檔）
And status-updater 自動觸發（依 Story 007）
And 草稿面板關閉
And 主編輯區顯示新內容，狀態指示「已儲存到 .md」
```

### Scenario: 二次確認時取消，採用不發生
```gherkin
Given 草稿面板顯示完整草稿
When 我點擊「採用」
And 在二次確認對話框點「取消」
Then 草稿面板與主編輯區內容皆不變
And 主檔不被覆寫
And browser draft 不被清除
And 不觸發 git commit / status-updater
```

### Scenario: 採用後 Undo 還原編輯器內容（但 .md 不變）
```gherkin
Given 採用前主編輯區內容為「使用者親筆的第一段。」
And 我採用了 1500 字的 AI 草稿
And 採用後 .md 與編輯器都是 AI 草稿內容
When 我按 Ctrl+Z
Then 主編輯區內容回到「使用者親筆的第一段。」
And chapters/chapter_0001_梅雨初晴.md 仍為 AI 草稿內容（未變）
And browser storage 寫入 dirty draft「使用者親筆的第一段。」
And 編輯器狀態變為「編輯中（已 autosave 到 browser）」
And UI 提示「您 undo 了採用動作，但 .md 還是 AI 草稿。如要把當前編輯器內容寫進 .md，請按儲存」
And 如要還原 .md 到採用前的版本，請看 git 歷史（Story 010）
```

> **設計說明**：採用是不對稱動作——Undo 撤回編輯器內容，但 .md 與 git commit 已 fact 發生。使用者要徹底還原 .md，需走 git checkout 流程（Story 010 提供 UI）。這個分離讓「編輯器層」與「檔案 / 版控層」職責清楚。

### Scenario: 主檔寫入失敗時整個採用流程 rollback
```gherkin
Given 草稿已產出
And 檔案系統暫時不可寫
When 我點擊「採用」
Then 主檔不被部分覆寫（採原子寫入：寫到 .tmp 後 rename）
And prompt.md 不被建立
And browser draft 不被清除
And 不觸發 git commit / status-updater
And 編輯器主編輯區內容不變
And 系統顯示錯誤「採用失敗：<原因>」
And 草稿面板維持開啟，使用者可重試
```

### Scenario: 採用一個空主檔的章節（首次寫作情境）
```gherkin
Given 主檔目前為空（尚未手動編輯過，也沒 browser draft）
And chapter-writer 已產出完整草稿
When 我點擊「採用」並通過確認
Then 主檔內容變為草稿內容
And prompt.md 正常建立
And git commit「chapter: adopt AI draft for chapter 1 ...」
And status-updater 觸發
```

### Scenario: 一章被採用多次（重產出後再採用）prompt.md 累積歷史
```gherkin
Given 第一章已採用過一次，prompt.md 含第一次的快照
And 我點「重產出」讓 chapter-writer 再給一份草稿
And 我再次點「採用」並通過確認
Then 主檔被新草稿覆寫
And prompt.md 新增一段「## 採用 #2 (時間戳)」並把新的 system / user prompt / metadata 寫在最上面
And 舊的「## 採用 #1 (時間戳)」段保留在下方（用 `---` 分隔）
And git commit「chapter: adopt AI draft for chapter 1 ... (re-adopt)」
And status-updater 再次觸發
```

### Scenario: 編輯器中有 dirty browser draft 時點採用
```gherkin
Given 我在第一章編輯器手動寫了一段「使用者親筆段落」
And 該段落已 autosave 到 browser storage（狀態「編輯中」）
And 我同時透過「AI 撰寫本章」產出了草稿
When 我點「採用」
Then UI 二次確認對話框警告「採用會覆蓋您手寫的『使用者親筆段落』，git 歷史可還原。是否繼續？」
And 我按「確認」後正常完成採用流程
And browser draft「使用者親筆段落」被清除
And git 歷史中可看到「該章在採用前是手寫內容」（因為 Story 003 的儲存按鈕也會 commit；如果使用者沒按過儲存，git 中就沒有這份手寫內容）
```

## AI 互動細節

不直接呼叫 AI（Story 005 已產出草稿，本 story 只是寫檔 + git commit + 觸發 007）。

採用完成會**鏈式觸發** Story 007 的 status-updater 流程。觸發以**事件**形式發出，不阻塞使用者繼續編輯：狀態更新在背景跑，完成後 toast 通知。

## UX 注意事項

- 「採用」按鈕用主色調強調（綠色 / 主品牌色），不要與「中止」（紅色）混淆
- 二次確認對話框文字：「採用此草稿將覆寫第一章「梅雨初晴」的內容。git 歷史可還原。是否繼續？」
- 採用過程顯示進度條（寫主檔 → 寫 prompt → git commit → 觸發狀態更新）
- 狀態更新觸發後，編輯器右下角顯示小型 spinner「正在更新故事與人物狀態…」（不阻塞編輯）
- 採用失敗時顯示具體原因（檔案系統錯誤、寫入權限等），不只是「失敗」
- 編輯器有 dirty browser draft 時的「採用」二次確認文字要強調覆寫風險

## 開放問題

- [x] ~~自動版本快照是否包含 prompt.md？~~ → **改為 git commit，prompt.md 也一起 commit**
- [ ] 一章被採用多次時，prompt.md 要保留所有歷史還是只留最新？已決定**附加**所有歷史（見 Scenario 6）
- [ ] 如果使用者在採用後立即修改主檔（autosave 到 browser），prompt.md 仍指向採用當時的內容——是否在主檔變動時警示？此 story 暫不處理；git diff 已提供回溯能力
- [ ] 採用按鈕在草稿面板與主編輯器工具列**並列**？建議：只在草稿面板顯示，避免雙入口混淆使用者
