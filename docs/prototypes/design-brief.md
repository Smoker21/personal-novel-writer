# Novel Writer — UI Design Brief（v0.1 MVP）

> 目的：給 claude.ai/design（或任何設計工具 / 設計師）一份能直接動工的 UI 設計需求書。
> 適用：v0.1 MVP，11 條 Story（001/002/003/004/005/006/007/008/009/010）。
> 對應 scope：[`docs/requirements/mvp-scope.md`](../requirements/mvp-scope.md)
> 撰寫：2026-05-12 / 與 PM + 使用者共議

---

## 1. 一句話定位

**Novel Writer** 是個給單一使用者的本機小說撰寫桌面應用。
作者用結構化欄位建角色、寫章節大綱、按一個按鈕讓 AI 草擬整章，採用後系統自動更新長期記憶（故事與角色狀態），並把每一次寫檔動作 git commit 起來。內容存在使用者選的本機資料夾（可放 Drive / 自接 git）。

**它不是**：

- 不是雲端 SaaS、不是多人協作、不是訂閱制
- 不是富文本所見即所得編輯器（純 markdown）
- 不是 AI 一鍵生成完整小說的工具（AI 是助手，使用者主導）

---

## 2. Personas

設計時請隨時問：「這個畫面對哪個 persona 最重要？他們會不會被嚇到 / 看不懂？」

| Persona | 別名 | 一段話 | 對 UI 的影響 |
|---|---|---|---|
| **`hobbyist-author`** | 業餘興趣作家 | 30+ 歲上班族，下班寫點短篇練筆，會用 ChatGPT 但不熟 prompt engineering。希望「我寫一段，AI 幫我接一段」。 | UI 要直覺、按鈕意圖清楚、不要逼他懂 prompt / model 細節 |
| **`serial-author`** | 連載長篇作家 | 在小說平台連載的中度活躍者，已經寫過 30+ 章。最痛苦：忘了自己 5 章前怎麼寫的，AI 也接不上。 | 強調「狀態 / 記憶 / 歷史」這條線；status 與 git history 是他每天會點的東西 |
| **`worldbuilder-author`** | 世界觀打磨型 | 寫架空 / 奇幻，花更多時間在角色與世界觀，章節節奏慢。重視角色卡的細膩度。 | 角色卡欄位要豐富但可漸進填寫；個性 / 外貌 / 對話風格分區明確 |

---

## 3. 設計原則（請貼在工具頂端）

1. **本機優先 / 隱私為先** — 沒有「登入」「雲端帳號」「分享」按鈕。第一次開應用看到的是「選資料夾 / 新小說 / 開啟既有」，不是註冊頁。
2. **AI 是按鈕觸發的助手，不是隨時插話** — 沒有聊天視窗、沒有「Copilot 飄字」、沒有自動補完。所有 AI 呼叫都來自明確按鈕（「AI 撰寫本章」、「AI 生成角色描述」、「AI 精簡」）。
3. **編輯 vs 定稿，兩個世界要分明** — 編輯期間自動存到瀏覽器（藍色「編輯中」）；按「儲存」才寫進 .md（綠色「已儲存」）。視覺上要立刻分得出來。
4. **長文是常態** — 章節幾千~一萬多字、status 檔可能變很長。不要任何「字數限制 200」「縮短到 N 字」的硬截斷 UI；提供「AI 精簡」按鈕讓使用者主動觸發。
5. **可逆性** — 所有寫檔動作都會 git commit，每個編輯器都有「歷史」按鈕。誤改 / AI 寫亂 / status 被誤更新都能還原。設計時要讓使用者敢點「採用」「儲存」「重新生成」，因為心裡知道「點錯了還有歷史」。
6. **中文為主** — 所有 UI 文案中文（繁體）。中文排版要舒服：字體 14-16px、行高 1.7、段落間距大、不要全靠粗體強調。
7. **單一作者 / 單機** — 沒有「邀請」「分享連結」「公開」「Stripe / 付款」相關 element。

---

## 4. 設計語言建議（claude.ai/design 用得上）

| 面向 | 建議 |
|---|---|
| 整體調性 | 沉穩、文學感；像「IA Writer / Bear / Notion 文件視圖」之間，不要 Discord / SaaS 那種飽和 UI |
| 主色 | 一個低彩度的點綴色（建議**深綠 / 墨藍 / 暗紅**任選一），其餘灰階為主 |
| 字體 | 中文：思源宋體 / Noto Serif TC 為內文，Noto Sans TC 為 UI；西文：Inter 為 UI、Source Serif 4 為內文。**章節編輯區用宋體**讓寫作有儀式感 |
| 間距 | 寬鬆。卡片內 padding 至少 24px，章節清單列高至少 56px |
| 圓角 | 8px（按鈕 / 卡片）、12px（對話框） |
| 陰影 | 極輕，只在浮層 / drawer 用；主畫面平面化 |
| Dark mode | 必須提供。深色背景偏暖（不要純黑），編輯區字色不要純白（#e8e6e1 之類） |
| Icon | 用 Lucide / Phosphor 即可，線條粗細一致 |
| Animation | 克制。drawer 開合 200ms ease-out；fake AI 串流要「打字感」(每 30-50ms 一個字) |

---

## 5. Information Architecture（IA）

```
┌─ App Shell ──────────────────────────────────────────────────────────┐
│ Top bar：[← 首頁] [專案名「春日記事」] [☁ 已儲存 / ✎ 編輯中] [⚙ 設定]│
├─────────┬────────────────────────────────────────────────────────────┤
│ Sidebar │ Main                                                       │
│         │                                                            │
│ ▸ 章節  │  (章節編輯器 / 角色卡 / status / 設定 / 等)               │
│ ▸ 角色  │                                                            │
│ ▸ 狀態  │                                                            │
│ ▸ 歷史  │                                                            │
└─────────┴────────────────────────────────────────────────────────────┘
```

- **Top bar** 全域常駐：左側是專案切換 / 麵包屑，右側是儲存狀態 + 設定齒輪
- **Sidebar** 在「專案內」才顯示；「首頁 / 設定頁」沒有 sidebar
- **歷史**（git history）做成抽屜（drawer）從右邊滑出，不是獨立頁

---

## 6. 路由與畫面清單（**必畫**）

> 共 **10 個畫面 + 3 個浮層**。每個畫面我會給：路由 / 對應 Story / 目的 / 必要元素 / 互動 / fake data 範例 / 設計重點。

### 6.1 `/` — 首頁（最近專案 + 入口）

- **對應 Story**：001（建立）、008（開啟）
- **目的**：第一個畫面；要讓使用者立刻看到「我的小說在哪」「要新開一本」
- **必要元素**：
  - App logo + 一行 tagline「個人本機小說撰寫助手」
  - **「+ 新小說」**主按鈕（明顯）
  - **「📂 開啟既有專案」**次按鈕
  - **「最近開啟」清單**（最多 8 筆）：每筆顯示書名 / 路徑 / 上次開啟時間 / 章節數
  - 角落「⚙ 設定」連結 → `/settings`
- **互動**：
  - 點「最近開啟」一筆 → 進 `/p/:slug`
  - 點「+ 新小說」 → 進 `/projects/new`
  - 點「📂 開啟既有」 → 開系統檔案選擇器（prototype 用 fake：跳一個 mock dialog 讓使用者貼路徑）
- **Fake data**：
  ```
  最近開啟：
  - 春日記事 — F:/novels/春日記事 — 2 小時前 — 12 章
  - 暗河 — F:/novels/暗河 — 昨天 — 35 章
  - （試寫）街角咖啡店 — F:/novels/咖啡店 — 上週 — 1 章
  ```
- **設計重點**：寬螢幕時清單置中（max-width 720px），不要鋪滿整個寬螢幕

### 6.2 `/projects/new` — 建立新小說

- **對應 Story**：001
- **目的**：一個有引導感的表單，建完就能進去寫
- **必要元素**：
  - **書名*** input（必填）
  - **存放位置*** 路徑選擇器（按鈕「選擇資料夾」+ 旁邊顯示已選路徑）
  - **故事大綱（synopsis）** textarea（多行，placeholder「一段話描述這本小說的主軸」）
  - **初始角色** 區（可加多個，每個一個 row：名稱 / 一句話描述 / [刪除]）。預設給一個空 row
  - 「✨ 建立」主按鈕；「取消」連結
- **互動**：
  - 必填欄缺項時主按鈕 disabled
  - 點建立 → loading 1 秒 → 跳 `/p/:slug`，sidebar 預設展開
- **Fake data**：placeholder 範例「春日記事」、「一個編輯與書店主人的相遇與漸近」、「蘇晴」
- **設計重點**：每個欄位旁有小小的說明文字「(可之後補)」讓使用者不害怕

### 6.3 `/p/:slug` — 專案總覽（dashboard）

- **對應 Story**：008
- **目的**：開既有專案後第一眼看到的畫面；快速進入章節 / 角色 / 狀態
- **必要元素**：
  - 上方：書名（大標題）+ synopsis 一段
  - 三個卡片並排：
    - **「📖 章節」卡** — 顯示「12 章 / 上次寫到第 12 章 3 小時前」 + 「+ 新章節」按鈕
    - **「👤 角色」卡** — 顯示「3 位角色」 + 縮圖列表 + 「+ 新增角色」
    - **「🧠 故事狀態」卡** — 顯示 `story_status.md` 摘要前 3 行 + 「展開檢視」
  - 下方：**章節清單**（表格 / 卡片）每筆顯示「第 N 章 / 標題 / 字數 / 上次儲存時間 / 狀態 badge（草稿 / 已儲存 / 已採用）」
- **互動**：
  - 點章節 → 進 `/p/:slug/chapters/:n`
  - 點角色縮圖 → 進 `/p/:slug/characters/:id`
  - 點「展開檢視」→ 進 `/p/:slug/status/story`
- **Fake data**：
  ```
  第 1 章 梅雨初晴 — 4,231 字 — 3 小時前 — [已採用]
  第 2 章 書店的訪客 — 5,012 字 — 昨天 — [已儲存]
  第 3 章（未命名） — 0 字 — — [草稿]
  ```

### 6.4 `/p/:slug/characters` 與 `/p/:slug/characters/:id` — 角色卡

- **對應 Story**：002（MVP）；002b/c vision 路徑**不在 MVP 但 UI 預留入口位置**
- **目的**：用 6 個欄位區塊讓使用者填完，按一個按鈕讓 AI 統整成連貫敘述
- **必要元素**（**列表頁**簡單就好：grid 卡片 + 「+ 新角色」+ 搜尋框）
- **必要元素**（**編輯頁** — 重點畫面）：
  - 左半：**6 個欄位區塊**（accordion 或 tabs）
    1. **身分基礎**（name / age / gender / pronoun / role）— 預設展開，name 必填
    2. **個性參考**（personalityTags chip / MBTI dropdown / zodiac / bloodType / culturalBackground textarea）
    3. **外貌參考**（heightCm / bodyType chip / hairAndColor / eyes / otherFeatures）
    4. **對話與寫作**（dialoguePace 三選一 / wordingPreference / writingAvoid）
    5. **關係**（relations textarea，支援 `[[角色名]]` 連結語法）
    6. **親密場景描寫參考**（**預設摺疊**，標題旁有小提示「只有要寫成人題材才填」）
  - 右半：**「敘述」可編輯區**（一大塊 textarea，宋體顯示）
    - 上方有：**「✨ AI 生成角色描述」**主按鈕 + 「上次生成 anthropic:claude-haiku-4-5 @ 3 分鐘前」灰字 + （若 manuallyEdited）橘色警示「此描寫已手動編輯，重新生成會覆蓋」
    - 下方有「儲存」與「刪除」按鈕（刪除要二次確認）
  - 角落「歷史」按鈕（→ 6.10 浮層）
- **互動**：
  - 點「✨ AI 生成」 → button 變 spinner「生成中…」→ 3 秒後右側 textarea 從上往下「打字」(fake stream)
  - AI 失敗時顯示紅色 toast「AI 生成失敗：…」，原內容保留
  - 未設定 LLM 時 disabled，hover 顯示「請先到設定頁設定」
  - 名稱變更時提示「將同步重命名 characters/<old>.md → <new>.md」
- **Vision 入口（v0.2 預留位置）**：在「外貌參考」區頂部加兩個 ghost button「📷 上傳參考圖（v0.2）」「🎨 文字生圖（v0.3）」— 設計時就把位置佔住，避免之後改版動很大
- **Fake data**：
  ```
  name=蘇晴 / age=30 / gender=female / pronoun=她 / role=主角
  personalityTags=[內向, 含蓄, 敏感] / MBTI=INFJ / zodiac=處女座 / bloodType=A
  heightCm=165 / bodyType=中等偏瘦 / hair="黑色長髮綁低馬尾"
  AI 生成 body：「蘇晴是 30 歲的女作家，內向但觀察力極強……（300 字）」
  ```

### 6.5 `/p/:slug/chapters/:n` — 章節編輯器（**主畫面，最重要**）

- **對應 Story**：003（編輯+autosave）、004（undo/redo）、005（AI 寫）、006（採用）、010（git）
- **目的**：寫作的主場；編輯區 + AI 草稿側欄 + 工具列
- **必要元素**：
  - **頂部 toolbar**（從左到右）：
    - 章節編號 + 標題 input（inline 可改，標題改了 placeholder「儲存後生效」）
    - **儲存狀態指示**：⚪ 乾淨 / 🔵 編輯中（已 autosave 到 browser）/ 🟢 已儲存
    - **字數計數**「4,231 字」
    - **「儲存」按鈕**（綠色 / 主按鈕）
    - **「✨ AI 撰寫本章」按鈕**
    - **「⏱ 立刻更新狀態」按鈕**（次要）
    - **「⟲ Undo / ⟳ Redo」按鈕**（lib 內建即可）
    - **「📜 歷史」按鈕**（→ 6.10 浮層）
    - 角落「⋯」menu：刪除章節 / 重新命名
  - **主編輯區**（佔大部分空間）：
    - 純 markdown textarea，**宋體 16px / 行高 1.8**
    - 寬度限制（max-width ~720px 置中），避免一行太長
    - 沒有 toolbar / 無格式按鈕（純文字寫作）
  - **草稿側欄**（預設摺疊；點「✨ AI 撰寫本章」展開）：
    - 寬度 480px 左右，從右側滑入
    - 上方「AI 草稿」標題 + 「中止」紅色按鈕（串流期間顯示）
    - 下方草稿內容區（唯讀，串流時逐字出現）
    - 底部三按鈕「採用」「丟棄」「重產出」（串流完才出現）
    - 串流完底部多一行「使用 anthropic:claude-sonnet-4-6 / 1,452 字 / 12 秒」
  - 串流期間主編輯區灰階 + 不可編輯，覆一層淺色遮罩寫「AI 撰寫中…」
- **互動**：
  - 打字 → 1.5 秒後狀態 ⚪→🔵
  - 按「儲存」→ 🔵→🟢 + 一秒淡出 toast「已儲存到 chapters/chapter_0001_梅雨初晴.md」
  - 按「✨ AI 撰寫」→ 草稿側欄從右滑入 → fake stream 開始（每 40ms 一個字）
  - 按「中止」→ 立刻停 + 三按鈕出現
  - 按「採用」→ 二次確認對話框「會覆蓋目前主檔內容（4,231 字 → 1,452 字）」→ 確認後主編輯區內容換成草稿 + 顯示 toast「已採用 / 儲存 / 狀態更新中…」
  - 切到別章時若草稿側欄正在串流：自動「中止 + 保留草稿」（回來時自動恢復）
- **Fake data**：給一段中文小說範例（500-800 字），AI 草稿 fake 出 1500 字
- **設計重點**：
  - 「狀態 badge」用色一致（🔵 = 主色淡版 / 🟢 = 成功色 / 🔴 = 警告色）
  - 草稿側欄滑入動畫不要超過 250ms（重複操作不卡）
  - 採用後的 toast 要連續 3 個（「已採用」→「已儲存」→「狀態更新中」）讓使用者感受到「鏈式自動發生」

### 6.6 `/p/:slug/status/story` — 故事狀態編輯器

- **對應 Story**：007、010
- **目的**：檢視 / 編輯 `status/story_status.md`；可以手動改、可以按 AI 精簡
- **必要元素**：
  - 上方標題「📘 故事狀態 — story_status.md」
  - **toolbar**：「儲存」「✨ AI 精簡」「📜 歷史」
  - **主編輯區**：textarea（pure markdown），預期內容會有 `## 🔖 伏筆` 與 `## ✨ 轉折點` 段落（用淡色背景區分）
  - **「AI 精簡」對話框**：點按鈕後跳浮層
    - 文字「AI 會把整段精簡，但保留 🔖 伏筆 / ✨ 轉折點 段落不動」
    - 「精簡目標長度」slider（不必硬限，預設「縮一半」）
    - 「執行」/「取消」
- **Fake data**：
  ```markdown
  # 故事狀態

  ## 主軸進展
  第 1-12 章已完成，蘇晴與林書言已從陌生到信賴…

  ## 🔖 伏筆
  - 第 3 章 蘇晴祖母留下的書信，內容尚未揭露
  - 第 7 章 書店地下室的舊照片

  ## ✨ 轉折點
  - 第 10 章末，蘇晴決定主動聯絡父親
  ```
- **設計重點**：🔖 與 ✨ 段落要視覺上「凸出」（左側細色 bar），讓使用者清楚這是受保護的段

### 6.7 `/p/:slug/status/characters/:slug` — 角色狀態編輯器

- **對應 Story**：007、010
- 結構幾乎同 6.6，標題改為「👤 蘇晴 — 狀態」，內容是 `characters/蘇晴_status.md`
- 也有「儲存 / AI 精簡 / 歷史」三按鈕
- 上方有「← 回角色卡」連結 → `/p/:slug/characters/:id`

### 6.8 `/settings` — 設定頁

- **對應 Story**：009
- **目的**：集中設定 LLM provider、API key、預設模型；無 wizard
- **必要元素**：
  - 左 sidebar tabs：「Providers」「預設模型」「個人偏好」「關於」
  - **Providers tab**：
    - 一節一個 provider（anthropic / openai / gemini / lmstudio / ollama / rwkv-runner）
    - 每節：☐ 啟用 / API key（password input + 「顯示」按鈕，已存的顯示為 `sk-ant-...••••••••1234`）/ 地端 endpoint（若適用）/「測試連線」按鈕（成功 = 綠色勾，失敗 = 紅色叉 + 錯誤訊息）
  - **預設模型 tab**：
    - 上方四個 quick preset button「全雲端」「Cloud + 地端 fallback」「全地端」「測試版」
    - 下方表格：每個 Agent 一行
      - chapter-writer / status-updater / character-card-consolidator / status-shortener
      - 每行兩個欄位：primary（dropdown，列出已啟用 provider 的模型）、fallbacks（multi-select chip）
    - 底部「儲存」按鈕；未儲存時顯示橘色橫幅「有未儲存變更」
  - **個人偏好 tab**：dark mode toggle、字體、編輯器寬度、autosave debounce 秒數
  - **關於 tab**：版本、git log link 到專案 repo
- **Fake data**：先把所有 provider 顯示為「未啟用」；按下「啟用」後出現 API key input
- **設計重點**：API key 輸入是敏感資料，要清楚 mask；快速 preset 按鈕要有「點下去看到效果」的反饋（dropdown 自動填好）

### 6.9 全域：未設定 LLM 引導

- **觸發點**：在 002 / 005 / 007 點 AI 按鈕但 009 還沒設定
- 顯示 modal：「您尚未設定 LLM provider，請先到設定頁啟用一個 provider 並指定預設模型。」
- 兩按鈕「前往設定頁」（主）/「稍後再說」（次）

### 6.10 全域浮層：歷史抽屜（git history）

- **對應 Story**：010
- **觸發點**：任何編輯器（章節 / 角色卡 / status）點「📜 歷史」
- **必要元素**：
  - 從右側滑入的 drawer，寬 480px
  - 上方標題「歷史 — chapter_0001_梅雨初晴.md」
  - 下方 commit list（最新在上）：
    - 每筆：commit message（一行）/ 時間（「3 小時前」+ tooltip 完整時間）/ 字數變化（「+420 字」）
    - 頂端那筆有「目前版本」綠色 badge
  - 點任一筆 → 右側展開 preview 區（drawer 變寬到 720px）：
    - 上方「<commit message> — 3 天前」
    - 下方該 commit 當時的內容（唯讀）
    - 底部兩按鈕「⟲ 還原到此版本」（要二次確認）/「⇄ Diff 與當前比較」
  - 點「⇄ Diff」→ 切換為 unified diff 視圖（紅 = 刪 / 綠 = 增）
- **設計重點**：commit list 要支援滾動（章節可能 100+ commit）；分頁載入；「目前版本」要明顯

### 6.11 全域浮層：採用 AI 草稿確認

- **對應 Story**：006
- 觸發點：章節編輯器草稿側欄按「採用」
- 內容：「即將以 AI 草稿覆蓋當前章節內容（4,231 字 → 1,452 字）。系統會自動：① 寫入 .md ② git commit ③ 觸發 status-updater。是否繼續？」
- 兩按鈕「採用」（主）/「取消」

---

## 7. 元件庫（要設計的可重用元件）

| 元件 | 用在 |
|---|---|
| `Button`（primary / secondary / ghost / destructive） | 全域 |
| `Input` / `Textarea` / `Dropdown` / `Chip multi-select` | 角色卡、設定頁 |
| `StatusBadge`（草稿 / 已儲存 / 已採用 / 編輯中） | 章節清單、編輯器 toolbar |
| `Drawer`（右側滑入） | 歷史 |
| `Modal`（中央彈出） | 確認、未設定引導 |
| `Toast`（右下淡出） | 儲存 / 採用 / 錯誤 |
| `Spinner` + `LoadingButton` | AI 按鈕 |
| `MarkdownEditor`（一個簡單 textarea + 字數 + 宋體） | 章節 / status |
| `DiffView`（unified） | 歷史 |
| `EmptyState` | 首頁無專案、章節無內容 |

---

## 8. UX 開放問題（給設計師回頭問使用者）

- [ ] 採用後 status-updater 失敗的 UX？（建議：toast 顯示「狀態更新失敗，可手動重試」+ 在 status 頁顯示重試按鈕）
- [ ] 使用者要中止 AI stream 的位置在哪最好找？（草稿側欄頂端固定 / 浮在右下 / 鍵盤 ESC？）
- [ ] 章節大綱（outline）放哪？目前計劃是章節編輯器內折疊區「📋 本章大綱」，但也可放 sidebar
- [ ] 「歷史」抽屜開著時主編輯區要不要 dim？（建議：不 dim，可以邊看歷史邊改）
- [ ] 採用時的二次確認可不可以「以後不再問」？（建議：可，存在個人偏好）
- [ ] 親密場景描寫區的視覺 — 要不要在角色列表也顯示一個小 icon 表示「此角色有親密設定」？（建議：不要，避免每次點清單就被提醒）
- [ ] 第一次開啟應用要不要有 onboarding tour？（建議：不要，靠空狀態的引導文字）

---

## 9. 給 claude.ai/design 的指令模板

如果你打算把這份 brief 貼到 claude.ai/design，可以加上以下指令：

> 請為一個叫做「Novel Writer」的個人本機小說撰寫桌面應用設計 UI。需求請見以下 brief。設計 10 個畫面與 3 個浮層；風格沉穩文學感（IA Writer / Bear / Notion 文件視圖之間），主色用低彩度深綠或墨藍。中文（繁體）介面。請提供 light + dark mode。最後請輸出每個畫面的 React + Tailwind 元件，並標出狀態（loading / empty / error）。
>
> [貼整份 design-brief.md]

---

## 10. 不要做的事（重申）

- 不要設計登入 / 註冊 / 個人檔案 / 訂閱頁
- 不要設計聊天視窗 / Copilot 浮字 / 自動補完
- 不要設計分享連結 / 公開閱讀頁
- 不要設計富文本工具列（**bold** / *italic* / 引用 / 圖片插入）
- 不要設計多人協作（@mention / comments / cursor presence）
- 不要設計「字數限制」「縮短到 N 字」的硬截斷
- 不要設計大量 onboarding modal / 首次教學

---

> Brief 結束。有任何疑問回到 `docs/requirements/mvp-scope.md` 或對應 Story `.md`。
