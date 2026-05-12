Feature: 章節編輯器：開啟、編輯、自動儲存（含 browser 草稿）
  身為個人創作者
  我想要打開任意一章開始打字，編輯期間 browser 自動保存讓我不必擔心忘記儲存；當我覺得這版本可以了再按「儲存」按鈕，內容才寫進 markdown 檔讓 AI 看得到並進入 git 版控
  以便保持寫作專注、編輯期間 F5 / 切章 / 關 tab 都不會掉內容；同時清楚分開「我還在改」與「這版本確定了」兩個狀態

  Scenario: 打字 1.5 秒後 autosave 到 browser，但 .md 不變
    Given 我已開啟專案「春日記事」第一章「梅雨初晴」，當前內容為空
    When 我在編輯器輸入「她推開書店木門時，雨剛好停了。」
    And 我停止打字 1.5 秒
    Then 該內容寫入 browser storage（IndexedDB key="<projectHash>:chapter:1:draft"）
    And chapters/chapter_0001_梅雨初晴.md 仍為空
    And 編輯器右上角狀態顯示「編輯中（已 autosave 到 browser）」
    And 沒有 git commit
    And 沒有 status-updater 觸發

  Scenario: 按「儲存」按鈕才寫進 .md 並觸發後續流程
    Given 我在第一章編輯器，browser draft 有 200 字內容
    And 狀態為「編輯中（已 autosave 到 browser）」
    When 我按「儲存」按鈕（或 Ctrl+S）
    Then chapters/chapter_0001_梅雨初晴.md 被寫入該 200 字內容
    And 系統 git commit 訊息「chapter: save chapter 1」
    And status-updater 自動觸發（依 Story 007）
    And 編輯器狀態變為「已儲存到 .md」
    And toast 通知「已儲存」

  Scenario: F5 重整後 browser draft 仍在
    Given 我在第一章編輯器輸入了「她推開書店木門時」
    And 1.5 秒後 autosave 觸發，browser storage 有此 draft
    And 我尚未按「儲存」
    When 我按 F5 重整瀏覽器
    Then 編輯器重新開啟第一章
    And 顯示「她推開書店木門時」（從 browser draft 載入）
    And chapters/chapter_0001_梅雨初晴.md 仍為空
    And 狀態顯示「編輯中（已 autosave 到 browser）」+ 提示「這是上次未存入 .md 的草稿，按儲存才會寫入檔案」

  Scenario: 切換章節時自動 flush 到 browser
    Given 我在第一章編輯器輸入了「未存的最後一段」
    And 自動儲存的 1.5s debounce 尚未觸發
    When 我點擊章節列表的第二章
    Then 第一章的內容立即 flush 到 browser storage
    And 第二章編輯器開啟
    And chapters/chapter_0001_梅雨初晴.md 不變（仍是上次儲存的內容）
    When 我回到第一章
    Then 「未存的最後一段」仍在編輯器中

  Scenario: 採用 AI 草稿時直接寫 .md（不經 browser draft）
    Given AI 撰寫已完成，草稿面板顯示完整草稿
    When 我按「採用」按鈕（→ Story 006）
    Then chapters/chapter_0001_梅雨初晴.md 被寫入 AI 草稿內容
    And browser draft 被清空（避免下次開啟混淆）
    And 編輯器狀態變為「已儲存到 .md」
    And 觸發 git commit + status-updater（依 006 / 007）

  Scenario: 標題變更，按儲存才生效
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

  Scenario: 儲存失敗時 browser draft 仍保留
    Given 我在編輯器打字並按「儲存」
    And 檔案系統暫時不可寫入
    When 系統嘗試寫 .md 失敗
    Then 編輯器顯示「儲存失敗：<原因>，請檢查資料夾權限」
    And 系統以指數退避重試 3 次
    And 若 3 次後仍失敗，狀態回到「編輯中（已 autosave 到 browser）」
    And browser draft 保留（使用者再按一次儲存即可重試）
    And 不觸發 git commit / status-updater

  Scenario: 外部編輯了 .md 後重開章節
    Given 我在第一章寫了 200 字後按「儲存」，.md 與 browser 同步
    And 我關閉 app
    And 外部（例如直接編輯 .md 或 git pull）把 .md 內容改了
    When 我重開 app 並開啟第一章
    Then 編輯器載入 .md 的最新內容
    And browser storage 中的舊 draft 被覆蓋（提示「外部變更已載入」）
    And 狀態顯示「乾淨」

  Scenario: 使用編輯器 lib 內建 undo / redo
    Given 我在第一章編輯器寫了「她推開書店木門時，雨剛好停了。」
    When 我按 Ctrl+Z（或 Cmd+Z）
    Then 編輯器內容回到上一個編輯狀態（依 web editor lib 的內建合併規則）
    When 我按 Ctrl+Y / Ctrl+Shift+Z
    Then 編輯器內容前進一步
    And 編輯期間的 undo/redo 不寫 .md，只動 editor state + browser storage
    And 「儲存」前 undo/redo 隨意做都不影響檔案

  Scenario: Ctrl+S 等同按「儲存」按鈕
    Given 我在編輯器，browser draft 有未儲存內容
    When 我按 Ctrl+S
    Then 與按「儲存」按鈕同行為：寫 .md + git commit + status-updater
