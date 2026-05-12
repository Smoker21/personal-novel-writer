# Novel Writer Prototype — Walkthrough

> 版本：Phase B / v0.1 MVP prototype（2026-05-12）
> 對應 code：`F:\workspace\novel_writer\apps\web\`
> 目的：讓使用者走過完整 MVP 主流程、驗收 UX 是否合理，然後回饋「哪裡要改、哪裡 OK」再進入實作軌。

---

## 啟動

```powershell
cd F:\workspace\novel_writer\apps\web
pnpm install   # 第一次才需要
pnpm dev
```

瀏覽器打開 terminal 顯示的「Local:」網址（這台機器 5173/5174 被佔用，Vite 會走上去找，通常是 **http://localhost:5180/**，每次看 terminal 確認）。

首次載入會把 seed 資料寫進瀏覽器 IndexedDB（`seeded:v2` flag 防重複）。**F5 重整後資料不會不見**。

要完全重置（清空所有 fake 資料）：開瀏覽器 DevTools → Application → IndexedDB → 刪除 `novel-writer` 資料庫 → 重整。

---

## Seed 資料概覽

首次開啟已有：

| 類型 | 內容 |
|---|---|
| 專案 | 春日記事（主要）、暗河（示意）、街角咖啡店（示意） |
| 角色 | 蘇晴（主角）、林書言（配角）、蘇祖母（回憶） |
| 章節 | 第 1 章「梅雨初晴」（已採用）、第 2 章「書店的訪客」（已儲存）、第 3 章（草稿） |
| 故事狀態 | `story_status.md`（含 🔖 伏筆 / ✨ 轉折點段落） |
| 角色狀態 | 蘇晴_status / 林書言_status |
| Commit 歷史 | 各 6 筆假 commit（第 1 章 / 第 2 章 / story_status 各自） |
| 設定 | 所有 provider 預設**停用**（per Story 009 設計） |

---

## 完整 Demo 路徑

### Step 1 — 首頁

畫面：`/`

- 左側 App logo + tagline「個人本機小說撰寫助手」
- 主按鈕「+ 新小說」、次按鈕「📂 開啟既有專案」
- 右側「最近開啟」清單：春日記事 / 暗河 / 街角咖啡店

**點「春日記事」→ 進 Dashboard（Step 2）**

---

### Step 2 — 專案 Dashboard

畫面：`/p/spring-diary`

- 書名 + synopsis 大綱一段
- 三張統計卡：
  - **章節**：3 章 / 上次修改 3 小時前 / 「+ 新章節」按鈕
  - **角色**：3 位 / 角色名列表（可點）
  - **故事狀態**：story_status 摘要前三行 / 「展開檢視」
- 章節清單 / 三個章節 badge 顏色不同：
  - 🟣 已採用（第 1 章）
  - 🟢 已儲存（第 2 章）
  - ⚪ 草稿（第 3 章）

**點第 1 章「梅雨初晴」→ 進章節編輯器（Step 3）**

---

### Step 3 — 章節編輯器（主畫面）

畫面：`/p/spring-diary/chapters/1`

工具列（從左到右）：
- 章節標題 inline input（可直接改）
- 儲存狀態 badge：⚪ 乾淨
- 字數計數
- **「儲存」**（綠色主按鈕）
- **「✨ AI 撰寫本章」**
- **「⏱ 立刻更新狀態」**
- ⟲ ⟳ Undo / Redo（視覺按鈕，textarea 原生 Ctrl+Z 有效）
- **「📜 歷史」**

主編輯區：宋體 16px，max-width 720px 置中，內容是第 1 章全文「梅雨季已經連續下了一個禮拜…」

**驗收：在編輯區打幾個字 → 1.5 秒後 badge 變🔵「編輯中」**

**驗收：按「儲存」→ 🟢 閃一秒 → 回⚪，右下角 toast「已儲存到 chapter_0001_梅雨初晴.md」**

---

### Step 4 — 嘗試 AI 撰寫（觸發「未設定 LLM」引導）

在章節編輯器點「✨ AI 撰寫本章」

→ 跳出 modal：「您尚未設定 LLM provider，請先到設定頁啟用一個 provider 並指定 chapter-writer 的預設模型。」

兩個按鈕：「前往設定頁」（主）/ 「稍後再說」（次）

這是**刻意設計**，非 bug（Story 009：首次必須先設定）。

**點「前往設定頁」→ Step 5**

---

### Step 5 — 設定頁（啟用 Provider）

畫面：`/settings`

4 個 tabs：Providers / 預設模型 / 個人偏好 / 關於

**Providers tab**：

- 六個 provider 區塊：Anthropic / OpenAI / Gemini / LM Studio / Ollama / RWKV Runner
- 每個預設「停用」
- 展開 Anthropic：勾選「啟用」→ 出現 API key 欄位
- 隨便輸入一個字串（prototype 不驗真實性）
- 點「測試連線」→ spinner 1 秒 → 綠色勾「連線成功」
  - （若 key 為空 → 紅叉「API key 不能為空」）

**預設模型 tab**：

- 點「Cloud + 地端 fallback」preset → 四個 Agent routing 自動填入
- 點「儲存」→ toast「設定已儲存」

**個人偏好 tab**：Dark mode toggle（同 top bar 也有）

**回到章節編輯器：點 top bar「春日記事」麵包屑 / 側邊欄第 1 章 → Step 6**

---

### Step 6 — AI 撰寫本章（fake stream）

回到章節編輯器，點「✨ AI 撰寫本章」

→ 右側 480px **草稿側欄**從右滑入

流程：
1. 700ms「準備上下文…」delay
2. 開始 fake stream（35ms/字）：書店場景 1500 字小說，帶閃爍游標
3. 主編輯區灰色遮罩 + 「AI 撰寫中…」文字
4. 串流期間**「中止」**紅色按鈕顯示

**驗收：點「中止」→ 串流立刻停，出現三按鈕「採用 / 丟棄 / 重產出」**

**讓串流跑完 → 底部顯示「使用 anthropic:claude-sonnet-4-6 / 約 1,500 字」**

---

### Step 7 — 採用 AI 草稿

草稿側欄底部點「採用」

→ 確認 modal：「即將以 AI 草稿覆蓋目前章節內容…系統會自動：① 寫入 .md ② git commit ③ 觸發 status-updater。是否繼續？」

點「採用」→ 三連 toast（連續出現）：
1. ✅ 已採用 AI 草稿
2. 💾 已儲存到 chapter_0001_梅雨初晴.md
3. ⏱ 狀態更新中…

主編輯區內容換成草稿內容 / 草稿側欄關閉 / badge 🟣「已採用」

---

### Step 8 — 章節 git 歷史

章節編輯器 toolbar 點「📜 歷史」

→ 右側歷史抽屜滑入（480px → 展開至 720px）

歷史清單（最新在上）：
```
[目前版本]  chapter(1): 採用 AI 草稿     3 小時前   +4,231 字
           chapter(1): 手動修訂結尾段   4 小時前   +68 字
           chapter(1): 手動修訂第二段   5 小時前   -120 字
           chapter(1): 儲存             7 小時前   +250 字
           chapter(1): 採用 AI 草稿     8 小時前   +4,351 字
           chapter(1): 初始空白章節     1 天前     0 字
```

**點任一歷史 commit** → 右側展開 preview：該 commit 當時的章節內容（唯讀）

底部兩按鈕：
- 「⟲ 還原到此版本」→ 二次確認 → 還原（更新 IndexedDB + 主編輯區刷新）
- 「⇄ Diff 與當前比較」→ 目前 disabled（stub，見限制說明）

---

### Step 9 — 角色卡

從 sidebar 點「角色」或 Dashboard 角色卡 → `/p/spring-diary/characters`

角色列表：3 張卡片（蘇晴 / 林書言 / 蘇祖母）

**點「蘇晴」→ 角色卡編輯器 `/p/spring-diary/characters/char-suqing`**

左半：6 個摺疊區塊
1. **身分基礎**（預設展開）：name / age / gender / 角色定位
2. **個性參考**：personalityTags（chip 顯示：內向、含蓄、敏感）/ MBTI / 星座 / 血型 / 文化背景
3. **外貌參考**：身高 / 體型 / 髮型 / 眼睛 / 其他特徵
4. **對話與寫作**：節奏 / 用詞偏好 / 寫作避免事項
5. **關係**：「與 [[林書言]] 從陌生到漸近…」
6. **親密場景描寫參考**（預設摺疊，標題旁有灰色說明文字）

右半：**「敘述」可編輯區**
- 已有 seed 的 AI 生成 body（「蘇晴是 30 歲的女作家，內向但觀察力極強…」）
- 下方標：`anthropic:claude-haiku-4-5 @ 5 分鐘前 | 無手動編輯`
- 右上角「📜 歷史」

**在敘述區修改任何字 → 出現橘色警示「此描寫已手動編輯，重新生成會覆蓋你的修改」**

**點「✨ AI 生成角色描述」→ fake stream 填入（30ms/字）→ 覆蓋成新版 body**

**v0.2 / v0.3 預留位置**：外貌區塊頂部兩個 ghost button「📷 上傳參考圖（v0.2）」「🎨 文字生圖（v0.3）」（disabled，hover tooltip「此功能 v0.2 開放」）

---

### Step 10 — 故事狀態編輯器

Sidebar 點「狀態 → 故事狀態」或 Dashboard 展開檢視 → `/p/spring-diary/status/story`

頂部：「📘 故事狀態 — story_status.md」

Toolbar：「儲存 / ✨ AI 精簡 / 📜 歷史」

主編輯區（markdown textarea）：
```markdown
# 故事狀態

## 主軸進展
第 1-2 章已完成。蘇晴從台北搬回外婆…

## 角色關係現況
...

## 場景設定
...

## 🔖 伏筆
- 第 1 章：蘇晴祖母留下的書信，內容尚未揭露
- 第 2 章：書店地下室傳出的舊唱片聲…
- 第 2 章：蘇晴隨身的綠色舊傘，是祖母的遺物

## ✨ 轉折點
- 第 1 章末：蘇晴決定每天下午都來書店寫作
- 第 2 章末：林書言主動端了一杯茶上樓
```

🔖 / ✨ 段落左側有彩色 bar 區分（視覺上「受保護」）

**點「✨ AI 精簡」→ modal 彈出**：
- 說明文字「AI 會精簡整體文字，但保留 🔖 伏筆 / ✨ 轉折點 段落不動」
- 精簡目標 slider（20%–90%，預設 50%）
- 「執行」/ 「取消」
- 執行後：本地字串 trim（prototype 無真 LLM）→ 🔖 / ✨ 段保留、其他段縮短

**角色狀態**（蘇晴 / 林書言）：Sidebar → 狀態 → 角色狀態 → 選角色。結構相同，多一個「← 回角色卡」連結。

---

### Step 11 — Dark Mode

Top bar 右上角月亮 icon / 設定頁個人偏好 tab → Dark mode toggle

切換後整體配色切暗，偏暖底色（編輯區字色 `#e8e6e1`，非純白）。persistent（重整後維持）。

---

## 畫面索引

| 畫面 | Route | 對應 Story |
|---|---|---|
| 首頁 | `/` | 001, 008 |
| 建立新小說 | `/projects/new` | 001 |
| 專案 Dashboard | `/p/:slug` | 008 |
| 角色列表 | `/p/:slug/characters` | 002 |
| 角色卡編輯 | `/p/:slug/characters/:id` | 002 |
| 章節編輯器 | `/p/:slug/chapters/:n` | 003, 004, 005, 006, 010 |
| 故事狀態 | `/p/:slug/status/story` | 007, 010 |
| 角色狀態 | `/p/:slug/status/characters/:id` | 007, 010 |
| 設定頁 | `/settings` | 009 |
| 歷史抽屜 | （任何編輯器點「歷史」） | 010 |
| 採用確認 modal | （草稿側欄點採用） | 006 |
| 未設定 LLM modal | （AI 按鈕未設定時） | 009 |

---

## 故意 Stub 的部分（不是 bug）

| Stub | 原因 | 實作軌時的方案 |
|---|---|---|
| AI 撰寫 / 統整 / 精簡皆為 fake | prototype 無後端 | Phase C 接 `packages/llm-adapter` |
| Undo/Redo 視覺按鈕，只靠 textarea Ctrl+Z | Story 004「用 editor lib 內建即可」；prototype 沒接 CodeMirror / Tiptap | 實作軌換 editor lib 後即可 |
| Diff 視圖（「⇄ Diff 與當前比較」）disabled | unified diff renderer 工作量不小；prototype 有 preview 已足夠驗收 UX | Phase C 接 `diff` / `diff2html` |
| AI 精簡是本地 string trim，非真 LLM | 同 fake AI | Phase C 接 `status-shortener` Skill |
| 「開啟既有專案」picker 是 fake dialog | Prototype 無檔案系統 access | Phase C 接 Electron / Tauri file picker |
| 角色卡的 vision 按鈕 disabled（002b / 002c） | v0.2 defer | Phase C v0.2 時接 vision adapter |
| 設定頁的「測試連線」是 1 秒假延遲 | 無真 provider | Phase C 接真 API |
| 沒有真 git commit（歷史都是 seed data） | 無後端 / 無 simple-git | Phase C 接 `simple-git` |
| 建立新小說不產生真資料夾 | 無檔案系統 | Phase C 接後端 |
| 刪除章節 / 重命名章節 menu 項目存在但無動作 | 省工；prototype 驗主流程 | Phase C 補 |

---

## UX 開放問題（請使用者點過後回答）

回答方式：在這個檔案底下直接標記 ✅（OK）或 ❌（要改）+ 備註，或者跟我口頭說。

### 關於章節編輯器

- [ ] **Q1** 草稿側欄從右側滑入的寬度（約 480px）夠不夠？還是應該是全寬 split view（左主右草稿各 50%）？
- [ ] **Q2** 串流期間主編輯區灰色遮罩 + 不可編輯——OK？還是希望可以「一邊看 AI 寫一邊自己繼續改主稿」？
- [ ] **Q3** 採用後三連 toast（採用→儲存→狀態更新）體感如何？夠不夠清楚讓人知道「自動鏈式發生了三件事」？
- [ ] **Q4** 「⏱ 立刻更新狀態」按鈕在 toolbar 是否直覺？還是放在別的地方（例如 status 頁才有）？
- [ ] **Q5** ⚪/🔵/🟢 三種儲存狀態，位置在 toolbar、色彩區分是否夠清楚？還是需要文字說明（例「已 autosave / 已儲存」）？
- [ ] **Q6** AI 草稿側欄的「採用 / 丟棄 / 重產出」三按鈕等距並排，哪個最主要？「採用」要不要更大、「丟棄」要不要最弱化？

### 關於角色卡

- [ ] **Q7** 6 個欄位區塊（accordion 折疊）vs tabs——prefer 哪種？目前用 accordion，每個都可折疊，身分基礎預設展開。
- [ ] **Q8** 「✨ AI 生成角色描述」按鈕在左半欄位區下方——位置對嗎？還是放右半「敘述」區的上方？
- [ ] **Q9** 親密場景描寫區預設摺疊 + 灰色說明文字——這樣處理 OK？有沒有覺得不夠隱蔽或太明顯？
- [ ] **Q10** 角色卡的 v0.2 vision ghost button（上傳圖 / 文字生圖）預留位置——看起來是否有礙觀瞻？要不要徹底隱藏直到 v0.2？

### 關於故事 / 角色狀態

- [ ] **Q11** 🔖 / ✨ 段落用左側彩色 bar 視覺標示「受保護」——夠清楚嗎？有沒有需要加 tooltip 說明「AI 精簡不會動這段」？
- [ ] **Q12** AI 精簡 modal 的 slider（精簡目標）是否直覺？使用者看到 slider 會知道在調什麼嗎？
- [ ] **Q13** status 編輯器和章節編輯器的體驗幾乎一模一樣（都是 markdown textarea）——OK？還是 status 應該有更多輔助結構（例如強制顯示各段標題）？

### 關於設定頁

- [ ] **Q14** 設定頁的 Provider → 預設模型兩步流程（先啟用 provider 再設模型）是否感覺繁瑣？有沒有更快的 happy path？
- [ ] **Q15** Quick preset button（「全雲端」「Cloud + 地端 fallback」等）有幫助嗎？點了之後 dropdown 自動填入的反饋清楚嗎？
- [ ] **Q16** API key 遮蔽顯示（`sk-ant-...••••••1234`）+ 旁邊「顯示」按鈕——OK？還是覺得多餘？

### 關於歷史 / 還原

- [ ] **Q17** 歷史抽屜從右側滑入 + 展開（click commit 後更寬）—— 體感如何？覺得 OK 還是太複雜？
- [ ] **Q18** 「Diff 與當前比較」目前 disabled，你對 diff 視圖的需求程度？是「一定要有」還是「不急，先有還原就好」？
- [ ] **Q19** 「還原到此版本」需要二次確認（「將 chapter_0001 還原到 X 的版本，當前內容會被覆蓋」）——OK？還是要加「之後可再 undo」的說明？

### 關於整體導覽

- [ ] **Q20** Sidebar 常駐（章節 / 角色 / 狀態三個分類）—— OK？還是覺得佔空間，希望可以收合？
- [ ] **Q21** Top bar 的麵包屑（首頁 > 春日記事 > 第 1 章）清楚嗎？
- [ ] **Q22** Dark mode 整體感受如何？偏暖底色的深色是你期待的風格嗎？

---

## Phase C 決策前需要釐清的問題

以下不是 UX 問題，而是**實作前需要確認的設計決策**：

1. **章節大綱（outline）放哪**：目前 prototype 沒有 outline 欄位（story 005 要求讀 `_outline.md`）。實作前需決定：章節編輯器內折疊的「📋 本章大綱」textarea，還是 Dashboard 另開一頁？
2. **「新增章節」流程**：目前 Dashboard 有「+ 新章節」按鈕但無動作（stub）。問題：章節要先填標題才能建立，還是允許先建空白章節再填？
3. **Sidebar 章節清單的「目前章節」高亮**：章節清單在 sidebar，但 sidebar 目前的章節項目只是導覽 link，沒有「正在寫哪章」的全局高亮。實作時要確認這個 UX。
4. **status-updater 失敗的 UX**：採用後三連 toast 的第三個是「狀態更新中…」，但如果 LLM 失敗呢？要顯示「重試」按鈕，還是讓使用者去 status 頁手動觸發？
5. **串流中切換章節**：prototype 沒有實作「離開後回來草稿還在」。實作時確認：草稿 cache key 是 `projectSlug:chapter:N:draft`，和 autosave 的 key 分開，避免衝突。
6. **git author**：Story 010 open question 說 MVP 用固定 `novel-writer-app <noreply@local>`——這樣 OK？還是讓使用者在設定頁輸入名字？

---

> 驗收後，請把所有 Q 的答案告訴我，或直接在 Walkthrough 上標記。之後進入 Phase C：補 spec → 實作軌。
