Feature: 首次啟動警語
  身為個人創作者
  我想要第一次啟動應用時看到一份簡短的說明，告知這是個人本機工具、內容自由度、隱私責任，看過勾「不再顯示」之後永遠不再打擾
  以便我知道自己在用什麼工具、它做什麼不做什麼，又不會每次開啟都被同一個 modal 擋住

  Scenario: 首次啟動顯示警語
    Given ~/.novel-writer/settings.yaml 不存在
    When 我啟動應用
    Then 應用顯示警語對話框
    And 對話框置中、modal（背景變灰、不可點外）
    And 對話框含 4 個區塊（📁 本機優先、📝 內容自由、🔐 隱私責任、📂 git 版控）
    And 對話框底部有兩個按鈕：「離開應用」與「我已了解，不再顯示」

  Scenario: 按「我已了解」後永久不再顯示
    Given 警語對話框顯示中
    When 我按「我已了解，不再顯示」
    Then ~/.novel-writer/settings.yaml 被建立（或更新）
    And settings.yaml 包含 `meta.firstLaunchWarningAcknowledged: true`
    And settings.yaml 包含 `meta.firstLaunchWarningAcknowledgedAt: <ISO 8601 時間戳>`
    And 對話框關閉
    And 應用進入首頁
    When 我關閉應用並重新啟動
    Then 警語對話框**不**再顯示
    And 應用直接進入首頁

  Scenario: 按「離開應用」關閉視窗
    Given 警語對話框顯示中
    When 我按「離開應用」
    Then Tauri 視窗關閉
    And settings.yaml **不**被建立
    And 下次啟動時警語仍會顯示

  Scenario: 使用者重置設定後再次顯示
    Given 我已看過警語並點過「不再顯示」
    When 我手動刪除 ~/.novel-writer/settings.yaml
    And 重新啟動應用
    Then 警語對話框再次顯示

  Scenario: settings.yaml 存在但 firstLaunchWarningAcknowledged 為 false
    Given ~/.novel-writer/settings.yaml 存在（從 Story 009 設定頁建立）
    And meta.firstLaunchWarningAcknowledged 為 false 或不存在
    When 我啟動應用
    Then 警語仍顯示
    And 按「我已了解」會更新 firstLaunchWarningAcknowledged 為 true（保留 settings.yaml 其他欄位）

  Scenario: 不可點對話框外面關掉
    Given 警語對話框顯示中
    When 我點對話框外的背景區域
    Then 對話框**不**關閉
    And 必須明確按一個按鈕才能離開警語

  Scenario: 不可用 ESC 鍵跳過
    Given 警語對話框顯示中
    When 我按 ESC 鍵
    Then 對話框**不**關閉
