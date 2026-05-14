# M4 UX Review — 自動截圖報告

> 審查者：Claude Code（自動 Playwright 截圖 + 分析）
> 日期：2026-05-14
> 環境：Windows 11 / dev mode（http://localhost:5173）/ 測試專案「校園奇遇」
> 截圖目錄：`apps/e2e/ux-screenshots/`
> 方法：Playwright 自動導覽 + 截圖 + 視覺分析

---

## 最重要的跨頁問題（先看這裡）

### 🔴 P0：深淺模式不一致（最大問題）

| 頁面 | 背景 |
|---|---|
| HomePage | 白底（Light） |
| SettingsPage | 白底（Light） |
| NewProjectDialog | 白底（Light） |
| ChapterEditorPage | 白底（Light）|
| CharactersPage | 黑底（Dark）|
| CharacterEditor | 黑底（Dark）|
| StatusEditorPage | 黑底（Dark）|

**同一應用竟有兩套配色，進入角色管理或 Status 頁面會有明顯視覺跳切感。**  
→ 對應 M4 任務：`pol-1`（design token 統一）

---

## A. Pages（5 個）

### A1. HomePage

**截圖：** `A1-HomePage.png`

![A1](../../../apps/e2e/ux-screenshots/A1-HomePage.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 標題、新小說、瀏覽資料夾、最近開啟清單全部正常 |
| 視覺 | ⚠️ | 頁面下方大面積空白，沒有利用空間；「⚙️ 設定」文字小且灰色，不夠顯眼 |
| 互動 | ⚠️ | 最近清單的卡片 hover 效果不明顯；沒有鍵盤 focus 樣式 |
| 錯誤處理 | ✅ | 有最近專案記錄 |

**改善意見：**
- 「設定」連結改為更明顯的按鈕樣式（加 icon 邊框）
- 頁面下方空白可放版本號、快速說明文字或使用提示
- 深淺模式統一（此頁是 light，進編輯器是 mixed）

對應 M4 任務：`pol-1`、`pol-5`（整體視覺一致性）

---

### A2. ChapterEditorPage

**截圖：** `A2-ChapterEditorPage-empty.png`

![A2](../../../apps/e2e/ux-screenshots/A2-ChapterEditorPage-empty.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 工具列完整（← 首頁、角色、章節標題、狀態指示、儲存） |
| 視覺 | ⚠️ | 中央提示「請從左側選擇或新建章節」文字顏色極淡（幾乎消失在白底中）；整體頁面是 light 底，但 dark 元素（黑色按鈕）夾雜其中 |
| 互動 | ⚠️ | 工具列的 AI 撰寫 / 歷史 / 立刻更新狀態按鈕只有選中章節後才出現，新使用者看到空工具列會困惑 |
| 錯誤處理 | ✅ | 有「請從左側選擇或新建章節」提示（但字色太淡） |

**改善意見：**
- 中央空狀態提示加大字體、加圖示（📝），更像 onboarding 引導
- 工具列 AI / 歷史按鈕可改為 disabled + tooltip 說明「請先選取章節」
- 考慮在首次進入時自動 focus 到「+ 新章節」

對應 M4 任務：`pol-5`、`pol-6`、`on-2`

---

### A3. CharactersPage

**截圖：** `A3-CharactersPage.png`

![A3](../../../apps/e2e/ux-screenshots/A3-CharactersPage.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 雙欄版面（角色列表 + 右側提示），導覽麵包屑（← 編輯器）正確 |
| 視覺 | ⚠️ | **Dark mode**（黑底），與 HomePage、SettingsPage Light mode 不一致；空狀態左欄文字「尚無角色。點「新增」建立第一個角色。」排版擠壓 |
| 互動 | ✅ | + 新增按鈕在右上角，可點擊 |
| 錯誤處理 | ✅ | 空狀態有雙重提示（左欄 + 右欄中央） |

**改善意見：**
- 統一配色（full dark 或 full light，不要混）
- 左欄空狀態文字改成更清晰的 onboarding 樣式（加 👤 圖示）

對應 M4 任務：`pol-1`、`pol-5`

---

### A4. SettingsPage

**截圖（上半）：** `A4-SettingsPage-top.png`

![A4](../../../apps/e2e/ux-screenshots/A4-SettingsPage-top.png)

**截圖（下半 Agent routing）：** `A4b-SettingsPage-routing.png`

![A4b](../../../apps/e2e/ux-screenshots/A4b-SettingsPage-routing.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 7 個 Provider 卡片全部顯示；Agent 預設模型 4 個下拉選單；Preset 按鈕 |
| 視覺 | ⚠️ | Provider 卡片折疊狀態（只顯示名稱 + 啟用 checkbox）→ 不清楚可以點開填 API key；Agent routing dropdown 是深色底（夾在白底頁面中很突兀）；Preset 按鈕樣式較弱（邊框細，不明顯是按鈕） |
| 互動 | ⚠️ | Provider 卡片折疊後沒有 ">" 或 "▼" 展開指示；未設定 routing 時沒有紅色警示 |
| 錯誤處理 | ⚠️ | 所有 Agent routing 顯示「未設定」但沒有警示說明這會導致 AI 功能無法使用 |

**改善意見：**
- Provider 卡片加展開/折疊 indicator（▶ 符號）
- Agent routing「未設定」改用橘色文字或警告 icon 標示
- Preset 按鈕改為填色樣式（更像按鈕）
- routing 下拉選單配色統一（不要深底 + 白底混）

對應 M4 任務：`pol-1`、`on-4`

---

### A5. StatusEditorPage

**截圖：** `A5-StatusEditorPage.png`

![A5](../../../apps/e2e/ux-screenshots/A5-StatusEditorPage.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ❌ | **「複製內容」而非「儲存」**：用戶必須手動複製再貼到 .md 檔，完全不直覺；此頁拿不到 git HEAD 的 story_status.md（API 需要 git show HEAD，但空專案沒有 commit） |
| 視覺 | ⚠️ | Dark mode；工具列「保留 🔖/✨ 段」checkbox 旁的 emoji 在頁面截圖中顯示為方塊；底部路徑文字極小 |
| 互動 | ❌ | 沒有直接「儲存到檔案」功能；checkbox label 沒有連接到 input（a11y 問題） |
| 錯誤處理 | ⚠️ | 空專案讀不到 story_status.md 時只顯示空白 placeholder，沒有說明原因 |

**改善意見（P0）：**
- 加入直接寫檔 API endpoint（POST /api/projects/:hash/status/write），讓「儲存」直接存到 .md
- 「複製內容」改為「儲存」，複製改成次要功能
- 空狀態時初始化預設 story_status.md 骨架

對應 M4 任務：`pol-9`（stat-fe-5 完整實作）

---

## B. MainPanels（6 個）

### B1. ChapterList

**截圖：** 包含在 A2（左欄）

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 空狀態有「+ 新章節」按鈕 |
| 視覺 | ⚠️ | 左欄標題只有「章節」二字（灰色，偏淡）；「+ 新章節」按鈕是虛線框，視覺重量不足 |
| 互動 | ⚠️ | 沒有章節時無其他引導；點「+ 新章節」後沒有自動選中並聚焦到標題輸入 |
| 錯誤處理 | ✅ | 無 |

**改善意見：**
- 「+ 新章節」按鈕改為實心邊框或填色，增加視覺重量
- 建立章節後自動選中並 focus 到標題輸入

對應 M4 任務：`pol-5`、`pol-6`

---

### B2. ChapterEditor（CM6）

**截圖：** `B2-ChapterEditor-CM6.png`（未成功載入編輯器）

⚠️ **截圖說明**：測試過程中點擊「+ 新章節」後 CM6 編輯器未成功渲染（測試專案可能沒有有效的 git repo），截圖顯示與 A2 相同的空狀態。建議手動驗證此面板。

**預期問題（基於程式碼分析）：**
- 編輯器字型應為繁中 serif（Noto Serif TC），但 font 未 self-host → 可能出現系統字型 fallback
- 行高、字間距未設定 → 中文長段落可能偏擠

對應 M4 任務：`pol-2`（字型載入）

---

### B3. DraftPanel

截圖未能觸發（需要實際跑 AI，測試環境未連接 LM Studio）。

**基於程式碼分析的觀察：**
- ✅ 功能性：中止 / 重產出 / 丟棄 / 採用 四按鈕存在
- ⚠️ 視覺：採用按鈕（green）在其他暗色按鈕中很突出（這是好事，但顏色系統應統一）
- ⚠️ 互動：沒有 streaming 進度百分比或字數計數

對應 M4 任務：`pol-3`（動畫）、`pol-6`（載入狀態）

---

### B4. CharacterPanel

**截圖：** 包含在 A3（左欄）

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 空狀態有提示文字 + + 新增按鈕 |
| 視覺 | ⚠️ | 空狀態文字排版擠（一行變兩行，沒有垂直置中） |
| 互動 | ✅ | + 新增按鈕可觸達 |
| 錯誤處理 | ✅ | 空狀態有提示 |

---

### B5. CharacterEditor

**截圖（身分 tab）：** `B5-CharacterEditor-new.png`

![B5](../../../apps/e2e/ux-screenshots/B5-CharacterEditor-new.png)

**截圖（個性 tab）：** `B5b-CharacterEditor-personality-tab.png`

![B5b](../../../apps/e2e/ux-screenshots/B5b-CharacterEditor-personality-tab.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 六分區 tabs 存在；身分（姓名必填、角色定位、年齡、性別、代名詞）；個性（標籤、MBTI、星座、血型、文化背景） |
| 視覺 | ⚠️ | AI 統整敘述區在每個 tab 底部都固定顯示，導致表單區域被壓縮；Tab 欄在深色背景，分頁線顏色對比度偏低 |
| 互動 | ⚠️ | Tab 切換後 AI 統整敘述區固定顯示，佔用 30% 螢幕高度；「AI 生成角色描述」按鈕在新角色（未儲存）時 disabled，但沒有提示說明為何 |
| 錯誤處理 | ⚠️ | 姓名欄位空時儲存按鈕 disabled，但沒有 inline 錯誤訊息；點儲存無法知道原因 |

**改善意見：**
- AI 統整敘述區可折疊（預設展開，可收合）
- Tab 未儲存切換時需警告（目前是否有警告？）
- disabled 按鈕加 tooltip 說明原因

對應 M4 任務：`pol-4`、`pol-6`

---

### B6. HistoryPanel

**截圖：** `B6-HistoryPanel.png`（未成功顯示 drawer）

⚠️ **截圖說明**：「歷史」按鈕因測試專案無章節而未顯示，HistoryPanel drawer 未能截圖。建議手動驗證。

**基於程式碼分析：**
- ⚠️ 互動：「歷史」按鈕只在章節已選中後出現在工具列，未選中章節時整個工具列都沒有這些按鈕，新使用者無法發現這些功能
- ⚠️ 視覺：Drawer 疊加在頁面上，沒有 slide-in 動畫（pol-3）

對應 M4 任務：`pol-3`、`pol-6`

---

## C. Dialogs / Modals（7 個）

### C1. NewProjectDialog（步驟 1/3）

**截圖：** `C1-NewProjectDialog.png`

![C1](../../../apps/e2e/ux-screenshots/C1-NewProjectDialog.png)

| 維度 | 評分 | 說明 |
|---|---|---|
| 功能性 | ✅ | 三步驟 wizard（步驟 1/3）、書名輸入、父資料夾選擇 |
| 視覺 | ⚠️ | Light mode dialog，backdrop 是灰色半透明（OK）；Dialog 尺寸偏小；步驟 1/2/3 各填什麼沒有說明 |
| 互動 | ⚠️ | 「下一步」按鈕在未填資料時顯示 disabled（淡藍色），但沒有說明「需要填書名和父資料夾才能繼續」；父資料夾欄位 placeholder 「貼「瀏覽」選擇」→ 措辭不夠直覺 |
| 錯誤處理 | ⚠️ | 沒有 inline 欄位驗證訊息 |

**改善意見：**
- Dialog 加大（目前最大寬度約 500px，可到 600px）
- 步驟指示器改為視覺化 progress bar
- 父資料夾 placeholder 改為「點「瀏覽」選擇資料夾」
- disabled 按鈕 tooltip 說明「請先填寫書名並選擇資料夾」

對應 M4 任務：`pol-3`（動畫）、`on-2`（onboarding）

---

### C2. ConflictDialog

未能截圖（需要製造 mtime 衝突）。建議手動驗證。

---

### C3. MissingProjectDialog

未能截圖（需要刪除已記錄的專案）。建議手動驗證。

---

### C4. FirstLaunchWarningDialog

未能截圖（需要清除 meta.firstLaunchWarningAcknowledged）。建議手動驗證。

---

### C5. GitMissingDialog

未能截圖（git 已安裝）。建議在 git 未安裝環境驗證。

---

### C6. LlmNotConfiguredModal

**截圖：** 未觸發（因測試專案無章節，AI 撰寫按鈕未出現）

**基於程式碼分析：**
- ✅ 功能性：Modal 已加入 4 步驟說明 + LM Studio 推薦提示
- ✅ 視覺：Dark modal on dark overlay

建議手動觸發（設定頁清空 routing → 回章節頁點 AI 撰寫本章）確認顯示正確。

---

### C7. AdoptButton / AdoptConfirmDialog

**截圖：** `C7-AdoptButton-initial.png`（章節列表空，無法顯示）

未能截圖（需有 AI draft）。建議手動驗證採用確認對話框和 DRAFT_STALE 流程。

---

## D. Flows（3 個）

### D1. 採用草稿 11 步事務

未能自動測試（需要實際 AI 生成草稿）。

**基於程式碼分析的潛在問題：**
- ⚠️ 進度條：AdoptButton 目前只有 "採用中…" 文字，沒有實際步驟進度條
- ⚠️ 採用後的 toast「已採用，狀態更新中…」目前是 StatusUpdateIndicator spinner，不是明確 toast

對應 M4 任務：`pol-3`（進度動畫）、`ad-fe-3`

---

### D2 & D3. 章節載入衝突 / Window Focus 重檢

未能自動測試（需要特定條件觸發）。建議手動驗證。

---

## 整體觀察

### 視覺一致性 ❌
**最嚴重問題**：深淺模式分裂
- **Light**：HomePage、SettingsPage、ChapterEditorPage、NewProjectDialog
- **Dark**：CharactersPage、CharacterEditor、StatusEditorPage
- 切換頁面時視覺跳切明顯，讓人覺得是兩個不同的應用

### 跨頁 Navigation ⚠️
- ✅ 各頁都有「← 返回」連結
- ⚠️ 沒有全域 breadcrumb 或 site-wide nav
- ⚠️ 沒有專案名稱顯示（在 ChapterEditorPage 工具列看不到目前在哪個專案）

### 載入 / 錯誤狀態整體 ⚠️
- ✅ 多數頁面有空狀態提示
- ⚠️ 空狀態提示文字顏色普遍偏淡（對比度不足）
- ⚠️ 沒有統一的 spinner/skeleton 樣式

### 鍵盤可達性 ⚠️
- 未全面測試，但基於 biome lint 的 a11y 錯誤，有多處 onClick 沒有對應的 keyboard event
- CharacterEditor 的 `<label>` 沒有對應 `<input>`（a11y 問題）

### 應該存在但不存在的功能
- ❌ StatusEditorPage 缺少直接「儲存到 .md 檔」功能（目前只有複製到剪貼簿）
- ❌ 工具列上 AI 撰寫 / 歷史 / 立刻更新狀態按鈕在沒有章節時完全隱藏，新使用者不知道這些功能存在
- ❌ 設定頁 Agent routing「未設定」沒有警告提示
- ❌ 專案名稱在 ChapterEditorPage 工具列不可見

### 應該不存在但存在的問題
- ⚠️ StatusEditorPage 的「複製內容」按鈕（應改為「儲存」）
- ⚠️ 工具列「保留 🔖/✨ 段」checkbox 的 label 沒有 for 屬性

---

## 對應 M4 任務匯總

| 改善項目 | 對應任務 | 優先級 |
|---|---|---|
| Light/Dark mode 不一致 | pol-1（design token） | **P0** |
| StatusEditorPage「複製」改「儲存」 | pol-9（stat-fe-5） | **P0** |
| 空狀態文字對比度太低 | pol-5 | P1 |
| 工具列按鈕條件隱藏 → 改 disabled | pol-5、pol-6 | P1 |
| Provider card 展開/折疊 indicator | pol-1 | P1 |
| Agent routing「未設定」警告 | on-4 | P1 |
| 對話框/抽屜 slide-in 動畫 | pol-3 | P2 |
| 採用進度條動畫 | pol-3、ad-fe-3 | P2 |
| 字型 self-host | pol-2 | P2 |
| Keyboard accessibility（a11y） | pol-4 | P2 |
| 專案名稱顯示在工具列 | pol-1 | P2 |
| NewProjectDialog 改善說明 | on-2 | P2 |

## 完成狀態

| 區塊 | 進度 |
|---|---|
| A. Pages | 5/5（A2 CM6 待手動）|
| B. MainPanels | 3/6（B2 CM6 / B3 DraftPanel / B6 HistoryPanel 待手動）|
| C. Dialogs | 3/7（C2/C3/C4/C5 待手動）|
| D. Flows | 0/3（全部待手動）|
| 整體觀察 | ✅ 完成 |
| 任務匯總 | ✅ 完成 |
| **截圖覆蓋** | **20 個截圖** |

---

> **注意**：B3（DraftPanel）、B6（HistoryPanel）、C1b-C7（多數 Dialog）、D1-D3（Flows）需要在有實際 AI 草稿 / 特定觸發條件的環境下手動驗證。建議使用 LM Studio Qwen 生成一份草稿後補完。
