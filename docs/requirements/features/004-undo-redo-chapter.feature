Feature: 章節編輯器：Undo / Redo（使用 web editor lib 內建）
  身為個人創作者
  我想要在章節編輯時用 Ctrl+Z / Ctrl+Y 回復編輯動作；採用 AI 草稿或套用潤飾 Skill 後也能一鍵 Undo 回到動作前
  以便誤刪、誤改、誤套用都能救回，不必擔心動作不可逆

  Scenario: 連續打字後 Undo 回到 lib 認定的上一個切點
    Given 我在編輯器中已輸入「她推開書店木門時，雨剛好停了。」
    And 我繼續打字「空氣裡有舊書與咖啡的氣味。」
    When 我按下 Ctrl+Z
    Then 編輯器內容回到 web editor lib 認定的上一個 history step（具體切點由 lib 決定，通常為段落 / 句號 / 暫停點）
    And 該動作不寫 .md（依 Story 003：autosave 只寫 browser storage，按「儲存」才寫 .md）

  Scenario: 連續 Undo 回到空白後不再退
    Given 我在空白章節中輸入了三段文字
    When 我連續按 Ctrl+Z 直到內容回到空白
    Then 再按 Ctrl+Z 不再有變化（已到 history 底）
    And Undo 按鈕顯示為禁用狀態

  Scenario: Undo 後 Redo 還原
    Given 我輸入了「第一段」並 Undo 回到空白
    When 我按下 Ctrl+Y（或 Ctrl+Shift+Z）
    Then 編輯器內容回到「第一段」
    And Redo 按鈕在內容已是最新版本時禁用

  Scenario: Undo 後重新打字會清空 Redo stack
    Given 我輸入了「第一段」並 Undo 回到空白
    When 我輸入「另一段」
    Then Redo 按鈕變為禁用
    And Undo 一次會回到空白（不會再回到「第一段」）

  Scenario: 採用 AI 草稿視為單一 Undo 步驟
    Given 章節原內容為「使用者親筆的第一段。」
    And 我採用了 chapter-writer 產出的草稿，章節內容變為「[AI 產出的整章內容]」
    When 我按下 Ctrl+Z
    Then 章節內容回到「使用者親筆的第一段。」
    And Undo stack 中該步顯示標籤「採用 chapter-writer 草稿」（hover Undo 按鈕可見）

  Scenario: Skill 套用視為單一 Undo 步驟
    Given 章節中有一段「她非常非常喜歡他。」
    And 我選取該段，套用 polish-prose Skill，內容變為「她對他懷有深切的歡喜。」
    When 我按下 Ctrl+Z
    Then 該段回到「她非常非常喜歡他。」
    And Undo stack 中該步顯示標籤「polish-prose 潤飾」

  Scenario: 切換章節後不能 undo 上一個章節的編輯
    Given 我在第一章編輯了多步
    When 我切換到第二章
    Then 第一章的內容已 flush 到 browser storage（依 Story 003）
    And 第二章編輯器有自己的 undo stack
    And 在第二章按 Ctrl+Z 不會影響第一章
    When 我回到第一章
    Then 第一章的編輯內容仍在（從 browser storage 載入）
    And 但第一章的 undo stack 已重置（lib 不跨 session 持久化）
    And 若使用者要還原到更早的版本，請看 git commit 歷史（Story 010）

  Scenario: AI 串流產出過程中按 Undo 等於中止串流
    Given AI 撰寫正在串流，已產出約 300 字到草稿面板
    When 我按下 Ctrl+Z
    Then 系統視為「中止串流」（與按「中止」按鈕等同，依 Story 005）
    And 已產出的 300 字保留在草稿面板供使用者選擇
    And 主編輯區的 undo stack 不被影響（因為主編輯區並未變動）
