Feature: 採用 AI 草稿並歸檔
  身為個人創作者
  我想要在審視 AI 草稿後決定採用，並讓系統把草稿、生成提示詞、章節歸檔一次處理好
  以便既擁有可寫作的成稿，也保留每一章的「為何這樣寫」紀錄供日後回顧或重生；任何採用都可以靠 git 歷史還原

  Scenario: 採用 AI 草稿並完成歸檔
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

  Scenario: 二次確認時取消，採用不發生
    Given 草稿面板顯示完整草稿
    When 我點擊「採用」
    And 在二次確認對話框點「取消」
    Then 草稿面板與主編輯區內容皆不變
    And 主檔不被覆寫
    And browser draft 不被清除
    And 不觸發 git commit / status-updater

  Scenario: 採用後 Undo 還原編輯器內容（但 .md 不變）
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

  Scenario: 主檔寫入失敗時整個採用流程 rollback
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

  Scenario: 採用一個空主檔的章節（首次寫作情境）
    Given 主檔目前為空（尚未手動編輯過，也沒 browser draft）
    And chapter-writer 已產出完整草稿
    When 我點擊「採用」並通過確認
    Then 主檔內容變為草稿內容
    And prompt.md 正常建立
    And git commit「chapter: adopt AI draft for chapter 1 ...」
    And status-updater 觸發

  Scenario: 一章被採用多次（重產出後再採用）prompt.md 累積歷史
    Given 第一章已採用過一次，prompt.md 含第一次的快照
    And 我點「重產出」讓 chapter-writer 再給一份草稿
    And 我再次點「採用」並通過確認
    Then 主檔被新草稿覆寫
    And prompt.md 新增一段「## 採用 #2 (時間戳)」並把新的 system / user prompt / metadata 寫在最上面
    And 舊的「## 採用 #1 (時間戳)」段保留在下方（用 `---` 分隔）
    And git commit「chapter: adopt AI draft for chapter 1 ... (re-adopt)」
    And status-updater 再次觸發

  # M5 PM Round 2/3：原單按鈕確認改為三選一 modal（UX-7）— 正本行為見 Spec 006

  Scenario: 採用前 dirty browser draft 三選一 modal — 先儲存編輯（M5 UX-7）
    Given 我在第一章編輯器手寫了一段「使用者親筆段落」並 autosave 到 IndexedDB
    And IndexedDB draftRow 比當前 .md 新（dirty 狀態）
    And 我同時透過 build-prompt + generate 產出了 AI 草稿
    When 我點「採用」
    Then 前端開啟三選一 modal「⚠️ 您有未儲存的編輯」
    And modal 顯示 dirty draft 前 100 字預覽
    And 三個按鈕：[先儲存編輯] [採用並丟棄編輯] [取消]
    When 我點「先儲存編輯」
    Then 前端先呼 PUT /chapters/:n 儲存 IndexedDB draft 內容
    And 主檔被寫入「使用者親筆段落」
    And 接著繼續 adopt 流程
    When DRAFT_STALE 因 contextHash 變動觸發
    Then 顯示 stale 確認對話框（既有邏輯）
    And 使用者可選 force=true 繼續

  Scenario: 採用前 dirty browser draft 三選一 modal — 採用並丟棄編輯（M5 UX-7）
    Given 我在第一章編輯器有 dirty IndexedDB draft
    And AI 草稿已備妥
    When 我點「採用」
    Then 三選一 modal 開啟
    When 我點「採用並丟棄編輯」
    Then IndexedDB 對應 draftRow 被刪除
    And adopt 流程正常進行（AI 草稿覆蓋主檔）
    And 我的手寫內容**未進入** git 歷史（因為沒按儲存）

  Scenario: 採用前 dirty browser draft 三選一 modal — 取消（M5 UX-7）
    Given 我在第一章編輯器有 dirty IndexedDB draft
    And AI 草稿已備妥
    When 我點「採用」
    Then 三選一 modal 開啟
    When 我點「取消」或按 ESC 或點 backdrop（dismissable modality）
    Then modal 關閉
    And 沒有任何操作發生（draft 仍 dirty、AI 草稿仍存在 cache、主檔不變）

  Scenario: 採用前無 dirty draft 直接走 adopt（M5 UX-7）
    Given 我在第一章編輯器，IndexedDB 無對應 draftRow 或 draft 與主檔一致
    And AI 草稿已備妥
    When 我點「採用」
    Then 前端**不**彈三選一 modal
    And adopt 流程直接啟動（既有 11 步事務）
