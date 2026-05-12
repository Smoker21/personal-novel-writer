# AI 撰寫單章（chapter-writer）

> Story ID: `005-ai-write-chapter`
> Persona: `hobbyist-author`、`serial-author`
> Epic: `EPIC-04-ai-writing-and-memory`
> Priority: `P0`
> Size: `L`
> Status: `Ready`
> Depends on: `001`、`002`、`003`、`009`（設定頁；未設定 LLM 時不能跑）
> 修訂：`2026-05-12` — 對齊 007 改版：`character_status` 改為一人一檔讀取、`previousChapterSummary` 改為「上一章完整內容」、加未設定 LLM 的引導場景

## 使用者故事

身為 **個人創作者**，
我想要 **點一個按鈕讓 AI 根據章節大綱、人物與故事狀態產出當前章節的草稿**，
以便 **得到一個可以直接修改採用的初稿，省去從零開始打字的負擔**。

## 背景與動機

idea.md 第 10、11 條：「開始逐章撰寫故事，每章結束輸出在畫面上」。第 24 條：「根據章節大綱 (chapter.md, character_status.md, story_status.md) 產生故事，每次讀取一章」。

這是 **AI 記憶機制鏈條的入口**：

- 本 story 負責「**讀**記憶 + 產出草稿」
- Story 006 負責「採用」（草稿 → chapter_NNNN.md）
- Story 007 負責「**寫**回記憶」（讀新主檔 → 更新 status）

三者一起閉環。

實作上由 `chapter-writer` Agent（規格放 `docs/agents/chapter-writer.md`，由 ai-agent-designer 撰寫）執行，本 story 只規範 UI / 行為合約。

## 範圍

**包含：**
- 在章節編輯器點「AI 撰寫本章」按鈕觸發
- 收集上下文（見「上下文蒐集規則」）
- 呼叫 `chapter-writer` Agent，**串流**接收輸出
- 串流產出顯示於**草稿區**（編輯器旁的並排面板，非主檔）
- 可隨時按「中止」停止串流
- 完成或中止後：草稿停在面板，使用者選擇「採用」（→ Story 006）、「丟棄」、或「重產出」
- 每次成功產出（不論最終是否採用）的提示詞快照暫存於本機 cache，採用時才寫入 `chapter_####_prompt.md`（→ Story 006）
- 未設定任何 LLM provider 時，按按鈕跳設定頁引導

**不包含：**
- 採用流程 → Story 006
- 章節大綱本身的產生 → Story 011（原 017）
- 章節續寫（避免割裂） → Story 012（原 018）
- 多方案輸出（Agent 預設一次給一個草稿；要多版請使用者重複呼叫） → 後續另開
- 模型選擇器 UI → Story 014（原 026），MVP 在 009 設定頁選預設模型即可

## 上下文蒐集規則（2026-05-12 修訂）

| 來源 | 完整 / 摘要 | 大小上限 | 失蹤時行為 |
|------|------------|----------|----------|
| 當前章節 outline `chapters/<file>_outline.md` | 完整 | 無上限（通常 < 1k 字） | 顯示警告但允許繼續 |
| `synopsis.md` | 完整 | 無上限 | 阻擋（必填） |
| `status/story_status.md` | 完整 | 無上限 | 第一章可空白 |
| 該章相關角色的 `characters/<slug>_status.md`（一人一檔） | 完整 | 無上限 | 缺則跳過該角色的 status |
| 該章相關角色卡 `characters/<slug>.md` | 完整 | 無上限 | 阻擋（至少需一名） |
| **上一章完整內容**（`chapter_<N-1>_*.md`） | **完整**（不再用 200 字摘要） | 無上限 | 第一章可空白 |

**「該章相關角色」的選取**：
1. 若 outline 中有 `## 角色` section 列出，則僅取列表中的
2. 否則取**全部**角色卡（保守）
3. 對選中的每個角色，同時讀 `characters/<slug>.md` + `characters/<slug>_status.md`
4. 未來 Story 020 可改為跨章記憶檢索動態挑選

**上下文範疇變動原因**（對齊 007）：
- 短期記憶 = 上一章完整內容（不再 200 字摘要）— 新場景的氛圍細節、上一章末尾的對話走向都需要連貫
- 中期記憶 = 不存在
- 長期記憶 = `story_status.md`（含世界觀 / 重要劇情點 / 🔖 伏筆 / ✨ 轉折點 / 場景清單）
- 角色記憶 = `<slug>.md`（設定基線）+ `<slug>_status.md`（章節間累積的狀態變化）

**Context window 守門**：

蒐集完先估算 token（用 `js-tiktoken` cl100k_base 粗估）。若超過 model 的 `contextWindow * 0.75`：

1. 嘗試把「該章相關角色」從全選縮為「outline 顯式列出的」
2. 若仍超 → 把「上一章完整內容」改取末尾 1000 字
3. 若仍超 → 提示使用者「上下文太大，請考慮：(a) 縮 story_status.md（按 AI 精簡按鈕）(b) 縮角色 status 檔 (c) 換 context window 更大的模型」並中止

## 串流與中止

- 一律 streaming——使用者要看到字逐句出現
- 「中止」按鈕在串流期間顯示，按下後：
  - 立即停止 LLM 串流
  - 已產出的部分留在草稿區，使用者仍可採用 / 丟棄 / 重產
- 串流期間不可在編輯器主檔輸入（避免混淆「這字是我打的還是 AI 給的」）

## 驗收條件 (Gherkin)

### Scenario: 觸發 AI 撰寫並串流接收草稿
```gherkin
Given 我在專案「春日記事」第二章「書店的訪客」編輯器中
And 該章節已有 outline、synopsis、至少一名角色
And 設定頁（009）已設定 chapter-writer 的預設模型
And 第一章已採用，存在 chapters/chapter_0001_梅雨初晴.md 與既有 status/story_status.md
And 「蘇晴」「林書言」兩個角色卡與其各自 _status.md 都存在
When 我點擊「AI 撰寫本章」
Then 系統蒐集上下文：第二章 outline + synopsis + story_status.md + characters/{蘇晴,林書言}.md + characters/{蘇晴,林書言}_status.md + chapter_0001 完整內容
And 呼叫 chapter-writer Agent（透過 LLMRouter）
And 草稿面板開啟，逐字顯示產出
And 主編輯區顯示為唯讀，提示「AI 撰寫中…」
And 顯示「中止」按鈕
```

### Scenario: 未設定 LLM 時阻擋並引導
```gherkin
Given 我在第一章編輯器中
And 設定頁（009）尚未設定任何 LLM provider（或 chapter-writer 的 routing 為空）
When 我點擊「AI 撰寫本章」
Then UI 顯示「請先到設定頁設定一個 LLM provider 並指定 chapter-writer 的預設模型」
And 提供「前往設定頁」連結
And 不呼叫 LLM
```

### Scenario: 缺少必要上下文時阻擋並指引使用者
```gherkin
Given 我在專案「春日記事」第一章編輯器中
And synopsis.md 為空
When 我點擊「AI 撰寫本章」
Then 系統顯示「故事大綱未填寫，請先到專案設定補上」
And 不呼叫 LLM
```

### Scenario: 串流中按「中止」保留已產出內容
```gherkin
Given AI 撰寫正在串流，已產出約 300 字
When 我點擊「中止」
Then LLM 串流停止
And 草稿面板保留已產出的 300 字
And 主編輯區回復可編輯狀態
And 「採用」、「丟棄」、「重產出」三個按鈕出現
```

### Scenario: 串流完成後可丟棄草稿
```gherkin
Given AI 撰寫已完成，草稿面板顯示完整草稿
When 我點擊「丟棄」並通過二次確認
Then 草稿面板關閉
And 主編輯區的內容不變
And 該次的提示詞快照從本機 cache 移除
```

### Scenario: 串流完成後重產出
```gherkin
Given AI 撰寫已完成，草稿面板顯示完整草稿
When 我點擊「重產出」
Then 草稿面板清空
And 系統重新蒐集上下文（可能因為使用者剛改了角色卡或 status）
And 重新呼叫 chapter-writer Agent
And 上一次的提示詞快照從 cache 移除
```

### Scenario: AI 不修改使用者原有的章節主檔
```gherkin
Given 主檔中已有使用者打的「她推開書店木門時，雨剛好停了。」
And 我點擊「AI 撰寫本章」
When chapter-writer 串流產出 1500 字草稿
Then 草稿出現在草稿面板
And chapters/chapter_0001_梅雨初晴.md 的內容仍為「她推開書店木門時，雨剛好停了。」
```

### Scenario: LLM 連線失敗時降級到地端
```gherkin
Given 我已在 009 設定 chapter-writer routing：primary=雲端模型 / fallback=地端模型
And 雲端模型回應 5xx 或網路超時
When 我點擊「AI 撰寫本章」
Then LLMRouter 自動切到 fallback 地端模型重試（在尚未有 chunk 流出前）
And 草稿面板顯示「已降級到地端模型 <model id>」橫幅後開始串流
And 若所有 fallback 都失敗，UI 顯示錯誤並保留主檔不變
```

### Scenario: 串流中切換章節時自動中止 + 保留草稿
```gherkin
Given AI 正在第二章串流，已產出約 500 字
When 我在側邊章節清單點到第三章
Then 第二章的 LLM 串流被中止
And 已產出的 500 字保留在第二章的草稿面板（暫存於本機 cache）
And 第三章編輯器正常開啟
When 我回到第二章
Then 草稿面板自動恢復顯示「上次中止的草稿（500 字）」與三按鈕（採用 / 丟棄 / 重產出）
```

### Scenario: AI 草稿不得修改角色名稱（品質性質）
```gherkin
Given 上下文中包含角色「蘇晴」與「林書言」
When chapter-writer 產出 1500 字草稿
Then 草稿中所有提及的人物姓名僅能是「蘇晴」、「林書言」或上下文中提供的其他名字
And 草稿不出現未在上下文出現的新角色姓名
```

### Scenario: Context 太大時 UI 引導使用者精簡
```gherkin
Given 累積到第 30 章，story_status.md 變得很長
And 上下文總 token 超過模型 context window 的 75%
When 我點擊「AI 撰寫本章」
Then 系統先嘗試把「該章相關角色」縮為 outline 顯式列出的
And 若仍超，把「上一章完整內容」截為末尾 1000 字
And 若仍超，UI 顯示「上下文太大，請：(a) 在 story_status.md 按 AI 精簡 (b) 縮角色 status (c) 換大模型」並中止
```

## AI 互動細節

- 觸發點：章節編輯器工具列「AI 撰寫本章」按鈕
- 上下文：見「上下文蒐集規則」表
- 預期 Agent：`docs/agents/chapter-writer.md`（待 ai-agent-designer 撰寫，TBD）
- 串流：是
- 失敗處置：先嘗試 LLMRouter fallback；都失敗則中止並保留已產出片段
- 品質保證（golden test 要驗）：
  - 不新增未提供的角色姓名
  - 不修改既有角色姓名的字元
  - 草稿長度落在「outline 預期長度的 0.7~1.5 倍」範圍
  - 引用 status_status.md 中 🔖 伏筆 段的條目時不誤改章節編號

## UX 注意事項

- 草稿面板與主編輯區並排（左主右草稿，或上下視螢幕寬度）
- 串流時草稿面板自動 scroll 跟上產出位置
- 串流期間主編輯區灰階 + 不可編輯，避免混淆
- 「中止」按鈕用紅色強調，避免使用者找不到
- 採用 / 丟棄 / 重產出三按鈕在草稿面板底部，等距並排
- 若使用者**串流期間切換到別的章節**：自動「中止 + 保留草稿到本機 cache」，回到該章時草稿仍在
- 上下文 token 超量時的提示要明確、可行動（指出哪個檔太大、建議用什麼按鈕）

## 開放問題

- [ ] 上下文超過模型 context window 時的處理已在「上下文蒐集規則」段落明示了 fallback 順序，但細節（截哪段、保留多少）需要 chapter-writer Agent 規格定案
- [ ] 若使用者在草稿面板開啟期間關閉應用，重啟後自動恢復該草稿（已寫進 Scenario）；但 cache 過期策略 → 建議：>30 天的 draft cache 自動清理
- [ ] chapter-writer 是否應支援「以使用者已寫的開頭續寫」？拆給 Story 012「章節續寫」，本 story 只處理「從零產出整章」
- [ ] context 中需不需要包含「`status/character_status.md`」這個老檔？答：007 改版後該檔不存在，改為一人一檔 `characters/<slug>_status.md`。**不再讀單檔 character_status.md**
