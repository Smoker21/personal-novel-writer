Feature: 章節文字潤稿（polish-prose）
  身為個人創作者
  我想要框選草稿段落並透過 AI 潤飾提示詞微調用詞節奏
  以便保留情節與角色原意，同時讓段落讀起來更流暢

  Background:
    Given 我在專案「春日記事」第二章「書店的訪客」的章節編輯器中
    And 章節已有使用者寫的或 AI 採用的段落文字

  Scenario: xiaohuangwen path — 框選後潤稿並採用
    Given 設定頁 polish-prose routing 的 primary 為「xiaohuangwen:latest」
    And 我在 CM6 編輯器框選「她推開書店木門時，雨剛好停了，空氣裡有泥土的味道。」
    When 浮動工具列出現
    And 我點擊「✨ 潤稿」
    Then PolishPanel 從右側滑入
    And 「選取文字」段顯示框選內容並預設收合
    And 「潤飾提示詞」段為空可編輯
    And 「潤飾結果」段為空
    And 「潤飾」按鈕為 active，「重新產生」「採用」為 disabled
    When 我在「潤飾提示詞」填入「調整節奏使其更有詩意」
    And 我點擊「潤飾」
    Then 系統呼叫 POST .../polish（含 selectedText / polishInput / contextBefore / contextAfter）
    And 「潤飾」按鈕改為 loading spinner
    And 「潤飾結果」段逐字串流顯示 AI 輸出
    When 串流完成
    Then 「重新產生」「採用」按鈕 active，「潤飾」按鈕 disabled
    And 使用者可閱讀潤飾結果
    When 我點擊「採用」
    Then 編輯器中的原選取段落被「潤飾結果」文字取代
    And PolishPanel 關閉
    And 編輯器 dirty 標記啟動（章節尚未儲存）
    And 原主檔 .md 尚未被寫入（需使用者手動儲存）

  Scenario: 一般 LLM path — 框選後潤稿並採用
    Given 設定頁 polish-prose routing 的 primary 為「anthropic:claude-haiku-4-5」
    And 我在 CM6 編輯器框選一段約 200 字的段落
    When 我點擊浮動工具列「✨ 潤稿」
    And PolishPanel 滑入後填寫「潤飾提示詞」
    And 我點擊「潤飾」
    Then 系統走普通 LLM path（prompt-library 的 polish-prose template）
    And 串流結果填入「潤飾結果」段
    When 串流完成後我點擊「採用」
    Then 編輯器選取段落被潤飾結果取代

  Scenario: 使用者手動修改潤飾結果後採用
    Given 我已完成一次潤稿，「潤飾結果」段顯示 AI 輸出
    When 我直接在「潤飾結果」textarea 修改數個字句
    And 我點擊「採用」
    Then 編輯器中取代的文字是修改後的版本（非原始 AI 輸出）

  Scenario: 重新產生覆蓋舊結果
    Given 我已完成一次潤稿，「潤飾結果」段顯示 AI 輸出
    When 我修改「潤飾提示詞」為「更加含蓄，不要直白的情緒字眼」
    And 我點擊「重新產生」
    Then 「潤飾結果」段清空並重新串流
    And 串流完成後顯示新的潤飾結果
    And 舊結果被覆蓋

  Scenario: 關閉 PolishPanel 編輯器內容完全不變
    Given PolishPanel 已開啟且「潤飾結果」段有 AI 輸出
    When 我點擊 Panel 右上角「×」關閉按鈕
    Then PolishPanel 關閉
    And 編輯器中的文字與框選前完全一致
    And 編輯器 dirty 標記未啟動

  Scenario: ESC 關閉 PolishPanel 同樣不修改編輯器
    Given PolishPanel 已開啟
    When 我按下 ESC 鍵
    Then PolishPanel 關閉
    And 編輯器內容不變

  Scenario: 未框選文字時不顯示潤稿按鈕
    Given 編輯器中無任何文字被框選（cursor 僅是一個插入點）
    Then CM6 浮動工具列不出現「✨ 潤稿」按鈕

  Scenario: 選段超過 5000 字時阻擋並提示分段
    Given 我框選了一段約 6000 字的大段落
    When 我點擊「✨ 潤稿」並填入提示詞後點「潤飾」
    Then API 回 400 INVALID_INPUT
    And PolishPanel 的「潤飾提示詞」下方顯示 inline 錯誤訊息「選取文字超過 5000 字，請縮小選取範圍後再潤稿」
    And 不呼叫 LLM

  Scenario: polish-prose routing 未設定時阻擋並引導
    Given 設定頁的 polish-prose routing 尚未設定任何 provider
    And 我框選一段文字後點擊「✨ 潤稿」
    When 我在 PolishPanel 點擊「潤飾」
    Then API 回 400 ROUTING_NOT_CONFIGURED
    And PolishPanel 顯示 modal 錯誤提示「請先到設定頁為「潤稿」指定一個 LLM 模型」
    And 提示含「前往設定頁」連結
    And 不呼叫 LLM

  Scenario: xiaohuangwen 餘額不足時 toast 引導查餘額
    Given 設定頁 polish-prose routing 的 primary 為「xiaohuangwen:latest」
    And xiaohuangwen 帳號餘額為 0
    And 我框選文字後開啟 PolishPanel 並點擊「潤飾」
    When xiaohuangwen API 回 quota_exhausted
    Then PolishPanel 底部顯示 toast「小黃文餘額不足，請到設定頁查詢餘額並加值」
    And 「採用」「重新產生」維持 disabled
    And 不修改編輯器

  Scenario: 潤稿結果不得修改角色名稱（品質性質）
    Given 選取段落含角色名「蘇晴」與「林書言」
    When 我完成一次 AI 潤稿
    Then 「潤飾結果」中「蘇晴」「林書言」的名稱與選取原文相同
    And 不出現其他未在原文出現的人名

  Scenario: 選取文字段可展開閱讀原文
    Given PolishPanel 已開啟，「選取文字」段預設收合，顯示前 50 字 + 「…」
    When 我點擊「▶ 展開」
    Then 「選取文字」段展開顯示完整框選內容（read-only）
    When 我點擊「▼ 收合」
    Then 「選取文字」段回到前 50 字 + 「…」的收合狀態
