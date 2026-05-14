# M4 動工前：BDD scenarios 手工驗證

> 驗證者：使用者
> 開始日期：（填）
> 完成日期：（填）
> 環境：Windows 11 / Tauri dev mode
> 應用版本：M3 已 merged（commit 89cf664）

## 使用方式

1. BDD step definitions **尚未實作**（M4 qa-1 任務）。本表單目的：在補 step definitions 前，先用 user 手工驗證 scenarios 是否真實反映實作
2. 對每個 scenario：跑一遍 Given / When → 比對 Then 段 → 填結果
3. 對照原檔：`docs/requirements/features/<NNN>-<slug>.feature`
4. 完成後把所有 ❌ / ⚠️ 對應到 M4 qa-1（step defs）/ spec 修訂 / 程式碼修改任務

## 結果代碼

| 代碼 | 意義 |
|---|---|
| ✅ Pass | 實作與 scenario 描述完全一致 |
| ⚠️ Partial | 大部分對，細節有出入（填出入點） |
| ❌ Fail | 實作與 scenario 矛盾（決定誰要改：spec 對 → 修程式；實作對 → 修 spec / .feature） |
| 🚫 Skip | 無法手工驗（需特殊 fixture / 環境）— 留給 step defs 自動跑 |
| ⬜ 未驗 | 尚未測 |

---

## Story 001 — 建立新小說專案（6 scenarios）

對應 .feature：`docs/requirements/features/001-create-novel-project.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 1.1 | 在指定資料夾下建立第一個專案 | ⬜ | |
| 1.2 | 任一必填欄位為空時阻擋送出 | ⬜ | |
| 1.3 | 目標路徑已存在同名專案資料夾 | ⬜ | |
| 1.4 | 沒有資料夾寫入權限 | ⬜ | |
| 1.5 | git init 失敗時整個建立流程 rollback | ⬜ | |
| 1.6 | 多角色一次建立 | ⬜ | |

---

## Story 002 — 編輯角色卡（9 scenarios）

對應 .feature：`docs/requirements/features/002-edit-character-card.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 2.1 | 新增角色卡（填欄位 → AI 生成敘述 → 儲存） | ⬜ | |
| 2.2 | 重新生成角色描述（改欄位後） | ⬜ | |
| 2.3 | 手動編輯 AI 生成的敘述後儲存 | ⬜ | |
| 2.4 | AI 生成失敗時不破壞既有 body | ⬜ | |
| 2.5 | 未設定 LLM 時點「AI 生成」 | ⬜ | |
| 2.6 | 必填欄位（名稱）為空時阻擋送出 | ⬜ | |
| 2.7 | 角色 slug 衝突時加後綴 | ⬜ | |
| 2.8 | 刪除角色卡 | ⬜ | |
| 2.9 | 親密場景描寫區預設摺疊 | ⬜ | |

---

## Story 002b — 角色卡圖片解析（10 scenarios）

對應 .feature：`docs/requirements/features/002b-character-card-from-image.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 2b.1 | 為角色上傳預設圖並解析 | ⬜ | |
| 2b.2 | 為章節 N 上傳專屬圖 | ⬜ | |
| 2b.3 | chapter-writer 寫第 5 章時讀到對應版本的外貌 | ⬜ | |
| 2b.4 | 上傳格式不支援 | ⬜ | |
| 2b.5 | 上傳圖片過大 | ⬜ | |
| 2b.6 | 雲端 vision provider 拒絕解析（content_blocked） | ⬜ | |
| 2b.7 | 未啟用任何 vision provider | ⬜ | |
| 2b.8 | 刪除章節圖 | ⬜ | |
| 2b.9 | 刪除角色時清除所有資產 | ⬜ | |
| 2b.10 | 角色 rename 時 _assets 跟著搬 | ⬜ | |

---

## Story 003 — 章節基本編輯（10 scenarios）

對應 .feature：`docs/requirements/features/003-edit-chapter-basic.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 3.1 | 打字 1.5 秒後 autosave 到 browser，但 .md 不變 | ⬜ | |
| 3.2 | 按「儲存」按鈕才寫進 .md 並觸發後續流程 | ⬜ | |
| 3.3 | F5 重整後 browser draft 仍在 | ⬜ | |
| 3.4 | 切換章節時自動 flush 到 browser | ⬜ | |
| 3.5 | 採用 AI 草稿時直接寫 .md（不經 browser draft） | ⬜ | |
| 3.6 | 標題變更，按儲存才生效 | ⬜ | |
| 3.7 | 儲存失敗時 browser draft 仍保留 | ⬜ | |
| 3.8 | 外部編輯了 .md 後重開章節 | ⬜ | |
| 3.9 | 使用編輯器 lib 內建 undo / redo | ⬜ | |
| 3.10 | Ctrl+S 等同按「儲存」按鈕 | ⬜ | |

---

## Story 004 — Undo / Redo（8 scenarios）

對應 .feature：`docs/requirements/features/004-undo-redo-chapter.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 4.1 | 連續打字後 Undo 回到 lib 認定的上一個切點 | ⬜ | |
| 4.2 | 連續 Undo 回到空白後不再退 | ⬜ | |
| 4.3 | Undo 後 Redo 還原 | ⬜ | |
| 4.4 | Undo 後重新打字會清空 Redo stack | ⬜ | |
| 4.5 | 採用 AI 草稿視為單一 Undo 步驟 | ⬜ | |
| 4.6 | Skill 套用視為單一 Undo 步驟 | ⬜ | |
| 4.7 | 切換章節後不能 undo 上一個章節的編輯 | ⬜ | |
| 4.8 | AI 串流產出過程中按 Undo 等於中止串流 | ⬜ | |

---

## Story 005 — AI 撰寫單章（11 scenarios）

對應 .feature：`docs/requirements/features/005-ai-write-chapter.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 5.1 | 觸發 AI 撰寫並串流接收草稿 | ⬜ | |
| 5.2 | 未設定 LLM 時阻擋並引導 | ⬜ | |
| 5.3 | 缺少必要上下文時阻擋並指引使用者 | ⬜ | |
| 5.4 | 串流中按「中止」保留已產出內容 | ⬜ | |
| 5.5 | 串流完成後可丟棄草稿 | ⬜ | |
| 5.6 | 串流完成後重產出 | ⬜ | |
| 5.7 | AI 不修改使用者原有的章節主檔 | ⬜ | |
| 5.8 | LLM 連線失敗時降級到地端 | ⬜ | |
| 5.9 | 串流中切換章節時自動中止 + 保留草稿 | ⬜ | |
| 5.10 | AI 草稿不得修改角色名稱（品質性質） | ⬜ | |
| 5.11 | Context 太大時 UI 引導使用者精簡 | ⬜ | |

---

## Story 006 — 採用 AI 草稿（7 scenarios）

對應 .feature：`docs/requirements/features/006-adopt-chapter-draft.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 6.1 | 採用 AI 草稿並完成歸檔 | ⬜ | |
| 6.2 | 二次確認時取消，採用不發生 | ⬜ | |
| 6.3 | 採用後 Undo 還原編輯器內容（但 .md 不變） | ⬜ | |
| 6.4 | 主檔寫入失敗時整個採用流程 rollback | ⬜ | |
| 6.5 | 採用一個空主檔的章節（首次寫作情境） | ⬜ | |
| 6.6 | 一章被採用多次（重產出後再採用）prompt.md 累積歷史 | ⬜ | |
| 6.7 | 編輯器中有 dirty browser draft 時點採用 | ⬜ | |

---

## Story 007 — 更新故事 / 人物狀態（11 scenarios）

對應 .feature：`docs/requirements/features/007-update-story-character-status.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 7.1 | 採用第一章後產生初版 story_status 與 character_status | ⬜ | |
| 7.2 | 「儲存」按鈕（不是採用）也觸發 status 更新 | ⬜ | |
| 7.3 | 「立刻更新狀態」按鈕主動觸發 | ⬜ | |
| 7.4 | status-updater 只動該章涉及的角色檔 | ⬜ | |
| 7.5 | AI 精簡按鈕（story_status.md） | ⬜ | |
| 7.6 | AI 精簡時使用者勾選「也精簡 🔖/✨ 段」 | ⬜ | |
| 7.7 | status-updater 失敗不破壞既有 status | ⬜ | |
| 7.8 | status-updater 不修改既有角色名稱（品質性質） | ⬜ | |
| 7.9 | 場景清單在新場景出現時自動加入 | ⬜ | |
| 7.10 | 章節提及新角色時不自動建立 char_status 檔 | ⬜ | |
| 7.11 | 使用者手改 status 後再觸發 status-updater | ⬜ | |

---

## Story 008 — 開啟既有專案（8 scenarios）

對應 .feature：`docs/requirements/features/008-open-existing-project.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 8.1 | 從「最近開啟」清單開啟專案 | ⬜ | |
| 8.2 | 透過「瀏覽資料夾」開啟未列在清單中的專案 | ⬜ | |
| 8.3 | 嘗試打開非合法的 novel-writer 資料夾 | ⬜ | |
| 8.4 | 最近開啟清單中的專案資料夾不見了 | ⬜ | |
| 8.5 | 從清單移除單筆（不刪資料夾） | ⬜ | |
| 8.6 | 清空整個「最近開啟」清單 | ⬜ | |
| 8.7 | 「最近開啟」上限為 10 | ⬜ | |
| 8.8 | 開啟同步衝突的專案（git） | ⬜ | |

---

## Story 009 — 設定頁（9 scenarios）

對應 .feature：`docs/requirements/features/009-settings-page.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 9.1 | 第一次進設定頁，所有 provider 預設停用 | ⬜ | |
| 9.2 | 啟用 cloud provider 並測試連線 | ⬜ | |
| 9.3 | 啟用地端 provider 並測試連線 | ⬜ | |
| 9.4 | 套用快速設定 preset | ⬜ | |
| 9.5 | 為單一 Agent 自訂 routing | ⬜ | |
| 9.6 | 設定 primary 為「未啟用 provider 的模型」時阻擋儲存 | ⬜ | |
| 9.7 | 005 偵測到 chapter-writer routing 未設定時引導 | ⬜ | |
| 9.8 | API key 在 UI 顯示為遮蔽 | ⬜ | |
| 9.9 | 「重設為出廠預設」清除所有設定 | ⬜ | |

---

## Story 010 — Git 版控（12 scenarios）

對應 .feature：`docs/requirements/features/010-git-version-control.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 10.1 | 建立專案時自動 git init + initial commit | ⬜ | |
| 10.2 | 章節儲存時自動 commit | ⬜ | |
| 10.3 | 採用 AI 草稿時 commit 含主檔與 prompt.md | ⬜ | |
| 10.4 | status-updater 跑完後 commit 多檔 | ⬜ | |
| 10.5 | status-updater 沒實際改動 status 檔則無 commit | ⬜ | |
| 10.6 | 「歷史」面板列出該章的 commit 歷史 | ⬜ | |
| 10.7 | 預覽歷史 commit 的內容 | ⬜ | |
| 10.8 | 還原到歷史版本 | ⬜ | |
| 10.9 | Diff 比較當前與歷史版本 | ⬜ | |
| 10.10 | 角色卡 / status 檔也有歷史面板 | ⬜ | |
| 10.11 | Drive 同步把另一台電腦的變更帶來 | ⬜ | |
| 10.12 | 手動觸發 commit | ⬜ | |

---

## Story 032 — 首次啟動警語（7 scenarios）

對應 .feature：`docs/requirements/features/032-first-launch-warning.feature`

| # | Scenario | 結果 | 改善意見 / 對應任務 |
|---|---|---|---|
| 32.1 | 首次啟動顯示警語 | ⬜ | |
| 32.2 | 按「我已了解」後永久不再顯示 | ⬜ | |
| 32.3 | 按「離開應用」關閉視窗 | ⬜ | |
| 32.4 | 使用者重置設定後再次顯示 | ⬜ | |
| 32.5 | settings.yaml 存在但 firstLaunchWarningAcknowledged 為 false | ⬜ | |
| 32.6 | 不可點對話框外面關掉 | ⬜ | |
| 32.7 | 不可用 ESC 鍵跳過 | ⬜ | |

---

## 各 Story scenarios 統計

| Story | Scenarios | 已驗 | ✅ Pass | ⚠️ Partial | ❌ Fail | 🚫 Skip |
|---|---|---|---|---|---|---|
| 001 | 6 | 0 | 0 | 0 | 0 | 0 |
| 002 | 9 | 0 | 0 | 0 | 0 | 0 |
| 002b | 10 | 0 | 0 | 0 | 0 | 0 |
| 003 | 10 | 0 | 0 | 0 | 0 | 0 |
| 004 | 8 | 0 | 0 | 0 | 0 | 0 |
| 005 | 11 | 0 | 0 | 0 | 0 | 0 |
| 006 | 7 | 0 | 0 | 0 | 0 | 0 |
| 007 | 11 | 0 | 0 | 0 | 0 | 0 |
| 008 | 8 | 0 | 0 | 0 | 0 | 0 |
| 009 | 9 | 0 | 0 | 0 | 0 | 0 |
| 010 | 12 | 0 | 0 | 0 | 0 | 0 |
| 032 | 7 | 0 | 0 | 0 | 0 | 0 |
| **總計** | **108** | **0** | **0** | **0** | **0** | **0** |

---

## 結論與 M4 任務匯總

review 完後填：

### Fail / Partial 對應任務

| Story.Scenario | 問題 | 誰要改 | 對應任務 ID |
|---|---|---|---|
| （例：5.7 AI 不修改使用者原有的章節主檔） | （例：實作偶爾覆蓋第一段） | 程式 | （新增任務）gen-fix-1 |
| （例：7.10 章節提及新角色時不自動建立 char_status 檔） | （例：實作其實會建） | spec or 程式 | （釐清後填） |
| ... | ... | ... | ... |

### Skip 項目（留給 step defs 自動測）

| Story.Scenario | 為何 skip |
|---|---|
| | |

### 整體觀察

- 哪些 story 的 scenarios 最跟實作脫節：
  - 
- spec 與實作哪邊比較需要更新：
  - 
- 是否發現 spec 漏掉的邊界情境：
  - 

## 完成狀態

| Story | 進度 |
|---|---|
| 001 | 0/6 |
| 002 | 0/9 |
| 002b | 0/10 |
| 003 | 0/10 |
| 004 | 0/8 |
| 005 | 0/11 |
| 006 | 0/7 |
| 007 | 0/11 |
| 008 | 0/8 |
| 009 | 0/9 |
| 010 | 0/12 |
| 032 | 0/7 |
| **總計** | **0/108** |

完成後 `commit -m "qa: M4 動工前 BDD scenarios 手工驗證結果"` 即可。
