# M4 動工前：UI 人工 review

> 驗證者：使用者
> 開始日期：（填）
> 完成日期：（填）
> 環境：Windows 11 / Tauri dev mode / Chrome WebView2
> 應用版本：M3 已 merged（commit 89cf664）

## 使用方式

1. 跑 `pnpm tauri dev` 啟動應用
2. 依下表順序走每個 UI 表面（21 個）
3. 對每個項目填 **✅**（沒問題）/ **⚠️**（小問題）/ **❌**（不能用）+ 改善意見
4. 完成後，把改善意見對應到 M4 brief 的任務 ID（pol-* / conf-* / on-* / qa-*）
5. commit 此檔到 main

## 評分維度

| 維度 | 看什麼 |
|---|---|
| **功能性** | 能跑通預期行為嗎？按鈕點下去有反應嗎？輸入 / 輸出符合 spec？ |
| **視覺** | 間距 / 字型 / 對齊 / 對比度 / 圖示一致性 |
| **互動** | 游標 / hover / click feedback / 鍵盤可達性 / focus indicator |
| **錯誤處理** | 失敗時有友善訊息？空狀態有提示？載入時有 spinner？ |

對 Flows 額外加 **步驟順暢度**（中途會卡嗎？有 progress 嗎？）

## 對應 M4 任務速查

| 改善類別 | 落在 M4 哪個任務 |
|---|---|
| 顏色 / 字型 / 間距不一致 | pol-1（design token） / pol-2（字型）|
| 動畫缺失 | pol-3（對話框動畫） |
| 鍵盤可達性 | pol-4（focus indicator） |
| 空狀態 / 載入狀態 | pol-5 / pol-6 |
| Drive 同步 / mtime 衝突 UX | conf-1 / conf-2 |
| git conflict marker | conf-3 |
| 多 tab 偵測 | conf-4 |
| 引導 / 第一次使用 | on-1~4 |

---

## A. Pages（5 個）

### A1. HomePage

- 路徑：`apps/web/src/features/home/HomePage.tsx`
- 對應 Story / Spec：001（建立）/ 008（開啟既有）
- 預期行為：展示最近專案清單 + 「新小說」按鈕 + 「瀏覽資料夾」按鈕
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### A2. ChapterEditorPage

- 路徑：`apps/web/src/features/editor/ChapterEditorPage.tsx`
- 對應 Story / Spec：003（基本編輯）/ 005（AI 撰寫）/ 006（採用）
- 預期行為：三欄（章節列表 + CM6 編輯器 + 工具列）+ 草稿面板（並排顯示中）
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### A3. CharactersPage

- 路徑：`apps/web/src/features/characters/CharactersPage.tsx`
- 對應 Story / Spec：002（角色卡）/ 002b（圖片解析）
- 預期行為：二欄（角色列表 + 編輯器）含六分區 tabs（身分 / 個性 / 外貌 / 對話 / 關係 / 親密）
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### A4. SettingsPage

- 路徑：`apps/web/src/features/settings/SettingsPage.tsx`
- 對應 Story / Spec：009（設定頁）
- 預期行為：LLM Provider 列表 + Agent routing 卡片 + Preset 按鈕 + 測試連線
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### A5. StatusEditorPage

- 路徑：`apps/web/src/features/status/StatusEditorPage.tsx`
- 對應 Story / Spec：007（status 更新）
- 預期行為：編輯 `story_status.md` / `<slug>_status.md` 的獨立路由，含 AI 精簡按鈕
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

---

## B. MainPanels（6 個）

### B1. ChapterList

- 路徑：`apps/web/src/features/editor/ChapterList.tsx`
- 對應 Spec：003
- 預期行為：左欄章節列表，支援新建 / 選取 / 刪除 / 重命名
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### B2. ChapterEditor（CM6）

- 路徑：`apps/web/src/features/editor/ChapterEditor.tsx`
- 對應 Spec：003 / 004
- 預期行為：CodeMirror 6 編輯器，Ctrl+S 儲存，autosave 1.5s debounce
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### B3. DraftPanel

- 路徑：`apps/web/src/features/editor/DraftPanel.tsx`
- 對應 Spec：005 / 006
- 預期行為：右欄串流顯示 AI 草稿，含中止 / 重產出 / 丟棄 / 採用四按鈕
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### B4. CharacterPanel

- 路徑：`apps/web/src/features/characters/CharacterPanel.tsx`
- 對應 Spec：002
- 預期行為：左欄角色清單 + 搜尋 + 新建按鈕
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### B5. CharacterEditor

- 路徑：`apps/web/src/features/characters/CharacterEditor.tsx`
- 對應 Spec：002 / 002b
- 預期行為：右欄角色卡編輯，六分區 tabs，含 portrait 上傳 + vision 解析按鈕 + AI 生成敘述
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### B6. HistoryPanel

- 路徑：`apps/web/src/features/git/HistoryPanel.tsx`
- 對應 Spec：010
- 預期行為：drawer 從右邊滑出，列 commits + CommitPreview + Diff + Revert
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

---

## C. Dialogs / Modals（7 個）

### C1. NewProjectDialog

- 路徑：`apps/web/src/features/new-project/NewProjectDialog.tsx`
- 對應 Spec：001
- 預期行為：新建專案表單（名稱 / 資料夾 / 初始角色）
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### C2. ConflictDialog

- 路徑：`apps/web/src/features/editor/ConflictDialog.tsx`
- 對應 Spec：003
- 預期行為：開啟 / 儲存時偵測到 .md 與 IndexedDB 不一致 → 三方選擇（伺服器 / 本地 / 編輯中）
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### C3. MissingProjectDialog

- 路徑：`apps/web/src/features/home/MissingProjectDialog.tsx`
- 對應 Spec：008
- 預期行為：最近清單中的專案資料夾找不到時，提示重指定或從清單移除
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### C4. FirstLaunchWarningDialog

- 路徑：`apps/web/src/features/onboarding/FirstLaunchWarningDialog.tsx`
- 對應 Story：032
- 預期行為：首次啟動的單次警語對話框（個人本機工具 / 隱私 / 不收集資料）
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### C5. GitMissingDialog

- 路徑：`apps/web/src/features/startup/GitMissingDialog.tsx`
- 對應 Spec：010
- 預期行為：系統未裝 git 時，啟動偵測 → 提示三平台安裝連結 + 「重啟」按鈕
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### C6. LlmNotConfiguredModal

- 路徑：`apps/web/src/features/settings/LlmNotConfiguredModal.tsx`
- 對應 Spec：005 / 009
- 預期行為：點「AI 撰寫本章」/「AI 生成角色描述」時 routing 未設定 → 引導到設定頁
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### C7. AdoptConfirmDialog

- 路徑：`apps/web/src/features/editor/AdoptButton.tsx`（含 dialog）
- 對應 Spec：006
- 預期行為：採用前二次確認 + DRAFT_STALE 強制採用對話框 + 進度條
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

---

## D. Flows（3 個，步驟順暢度也要評）

### D1. 採用草稿 11 步事務

- 路徑：`apps/web/src/features/editor/AdoptButton.tsx` + `apps/api/src/routes/adopt.ts`
- 對應 Spec：006
- 預期行為：點「採用」→ 二次確認 → 寫主檔 → 寫 prompt.md → git commit → 觸發 status-updater → 進度條完成
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 步驟順暢度：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### D2. 章節載入衝突偵測

- 路徑：`apps/web/src/features/editor/ChapterEditorPage.tsx`
- 對應 Spec：003
- 預期行為：載入章節時跑 Case A/B/C/D 邏輯（無 draft / 一致 / dirty / 衝突）→ 顯示適當 UI
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 步驟順暢度：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

### D3. Window Focus 重檢

- 路徑：`apps/web/src/features/editor/ChapterEditorPage.tsx`
- 對應 Spec：003
- 預期行為：視窗重獲焦點時檢查 .md 外部 mtime 是否變動 → 變動則 banner / dialog 提示
- 功能性：`[  ]`
- 視覺：`[  ]`
- 互動：`[  ]`
- 錯誤處理：`[  ]`
- 步驟順暢度：`[  ]`
- 改善意見：
  - 
- 對應 M4 任務：

---

## 整體觀察

填完上述 21 個項目後，總結跨頁面觀察：

- **視覺一致性**：（顏色 / 字型 / 間距是否跨頁一致）
  - 
- **跨頁面 navigation**：（從 A 到 B 是否順暢？麵包屑？回上一頁？）
  - 
- **載入 / 錯誤狀態整體**：（spinner 樣式是否一致？錯誤 toast 一致？）
  - 
- **鍵盤可達性**：（Tab 順序合理？所有按鈕能 Enter 觸發？）
  - 
- **應該存在但不存在的功能**：
  - 
- **應該不存在但存在的功能**：
  - 

## 對應 M4 任務匯總

review 完所有 21 個項目後，把改善意見轉成 M4 任務列表：

| 改善項目 | 對應任務 ID（M4 brief） | 優先級 |
|---|---|---|
| （example：HomePage 空狀態無提示） | pol-5 | P0 |
| （example：採用流程進度條沒動畫） | pol-3 | P1 |
| ... | ... | ... |

## 完成狀態

| 區塊 | 進度 |
|---|---|
| A. Pages | 0/5 |
| B. MainPanels | 0/6 |
| C. Dialogs | 0/7 |
| D. Flows | 0/3 |
| 整體觀察 | 未開始 |
| 任務匯總 | 未開始 |
| **總計** | **0/21** |

完成後 `commit -m "qa: M4 動工前 UX 人工 review 結果"` 即可。
