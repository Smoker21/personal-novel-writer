Feature: AI 撰寫單章（chapter-writer）
  身為個人創作者
  我想要點一個按鈕讓 AI 根據章節大綱、人物與故事狀態產出當前章節的草稿
  以便得到一個可以直接修改採用的初稿，省去從零開始打字的負擔

  # M5 起：trigger 按鈕統一為「生成本章」；M3/M4 scenarios 仍寫「AI 撰寫本章」者視為同義 alias（5.4–5.10 之後 scenarios 在 QA 寫 step-defs 時可同時接受兩種 wording，直到 M6 統一改寫）

  Scenario: 兩階段生成 — 先 build-prompt，再 generate（M5）
    Given 我在專案「春日記事」第二章「書店的訪客」編輯器中
    And 該章節 frontmatter 含 participants=[蘇晴, 林書言]、outline、requirements
    And 設定頁（009）已設定 chapter-writer 的預設模型
    And 「蘇晴」「林書言」兩個角色卡與其各自 _status.md 都存在
    When 我點擊「生成本章」
    Then 系統先呼叫 POST .../build-prompt（**不呼叫 LLM**）
    And 蒐集上下文：synopsis + story_status.md + characters/{蘇晴,林書言}.md + characters/{蘇晴,林書言}_status.md + chapter_0001 完整內容
    And response 200 含 promptText / contextHash / estimatedTokens / participants
    And UI 開啟 PromptPreviewModal 顯示完整 prompt（textarea，可編輯）
    When 我在 modal 中編輯 prompt 後點「送出」
    Then 系統呼叫 POST .../generate（含 promptText / contextHash / participants / outline / requirements）
    And 草稿面板開啟，逐字顯示產出
    And PromptSnapshot 記錄 userEdited=true

  Scenario: 未設定 LLM 時阻擋並引導
    Given 我在第一章編輯器中
    And 設定頁（009）尚未設定任何 LLM provider（或 chapter-writer 的 routing 為空）
    When 我點擊「AI 撰寫本章」
    Then UI 顯示「請先到設定頁設定一個 LLM provider 並指定 chapter-writer 的預設模型」
    And 提供「前往設定頁」連結
    And 不呼叫 LLM

  Scenario: 缺少必要上下文時阻擋並指引使用者
    Given 我在專案「春日記事」第一章編輯器中
    And synopsis.md 為空
    When 我點擊「生成本章」
    Then build-prompt 回 400 MISSING_CONTEXT
    And UI 顯示「故事大綱未填寫，請先到專案設定補上」
    And 不呼叫 LLM

  Scenario: participantSlugs 中的角色找不到時阻擋（M5）
    Given 我在第二章編輯器
    And 我在角色挑選器選了「林清風」但 characters/林清風.md 不存在
    When 我點擊「生成本章」
    Then build-prompt 回 400 INVALID_PARTICIPANT
    And 錯誤訊息列出「林清風」
    And UI 顯示「請新建角色卡，或從挑選器移除」
    And 不呼叫 LLM

  Scenario: build-prompt 是純函式無副作用（M5）
    Given 我在第二章編輯器，frontmatter outline 為「春雨找明哲」
    When 我在 UI 把 outline 改為「春雨獨自閱讀」
    And 點擊「生成本章」
    Then build-prompt 用「春雨獨自閱讀」拼接
    And chapter front-matter 的 outline 仍為「春雨找明哲」（未被寫入）
    When 我在 PromptPreviewModal 點「取消」
    Then 沒有任何 .md / cache 被寫入
    And LLM 未被呼叫

  Scenario: 串流中按「中止」保留已產出內容
    Given AI 撰寫正在串流，已產出約 300 字
    When 我點擊「中止」
    Then LLM 串流停止
    And 草稿面板保留已產出的 300 字
    And 主編輯區回復可編輯狀態
    And 「採用」、「丟棄」、「重產出」三個按鈕出現

  Scenario: 串流完成後可丟棄草稿
    Given AI 撰寫已完成，草稿面板顯示完整草稿
    When 我點擊「丟棄」並通過二次確認
    Then 草稿面板關閉
    And 主編輯區的內容不變
    And 該次的提示詞快照從本機 cache 移除

  Scenario: 串流完成後重產出
    Given AI 撰寫已完成，草稿面板顯示完整草稿
    When 我點擊「重產出」
    Then 草稿面板清空
    And 系統重新蒐集上下文（可能因為使用者剛改了角色卡或 status）
    And 重新呼叫 chapter-writer Agent
    And 上一次的提示詞快照從 cache 移除

  Scenario: AI 不修改使用者原有的章節主檔
    Given 主檔中已有使用者打的「她推開書店木門時，雨剛好停了。」
    And 我點擊「AI 撰寫本章」
    When chapter-writer 串流產出 1500 字草稿
    Then 草稿出現在草稿面板
    And chapters/chapter_0001_梅雨初晴.md 的內容仍為「她推開書店木門時，雨剛好停了。」

  Scenario: LLM 連線失敗時降級到地端
    Given 我已在 009 設定 chapter-writer routing：primary=雲端模型 / fallback=地端模型
    And 雲端模型回應 5xx 或網路超時
    When 我點擊「AI 撰寫本章」
    Then LLMRouter 自動切到 fallback 地端模型重試（在尚未有 chunk 流出前）
    And 草稿面板顯示「已降級到地端模型 <model id>」橫幅後開始串流
    And 若所有 fallback 都失敗，UI 顯示錯誤並保留主檔不變

  Scenario: 串流中切換章節時自動中止 + 保留草稿
    Given AI 正在第二章串流，已產出約 500 字
    When 我在側邊章節清單點到第三章
    Then 第二章的 LLM 串流被中止
    And 已產出的 500 字保留在第二章的草稿面板（暫存於本機 cache）
    And 第三章編輯器正常開啟
    When 我回到第二章
    Then 草稿面板自動恢復顯示「上次中止的草稿（500 字）」與三按鈕（採用 / 丟棄 / 重產出）

  Scenario: AI 草稿不得修改角色名稱（品質性質）
    Given 上下文中包含角色「蘇晴」與「林書言」
    When chapter-writer 產出 1500 字草稿
    Then 草稿中所有提及的人物姓名僅能是「蘇晴」、「林書言」或上下文中提供的其他名字
    And 草稿不出現未在上下文出現的新角色姓名

  Scenario: Context 太大時 UI 引導使用者精簡（M5 修訂）
    Given 累積到第 30 章，story_status.md 變得很長
    And participantSlugs 列了 8 個角色
    And 上下文總 token 超過模型 context window 的 75%
    When 我點擊「生成本章」
    Then build-prompt 回 400 CONTEXT_TOO_LARGE
    And UI 顯示建議：「(a) 在角色挑選器減少參與角色 (b) 在 story_status 按 AI 精簡 (c) 縮角色 status (d) 換大 context model」
    And 不呼叫 LLM

  # M5：移除「outline 列表 / 全選 / substring matching」相關 scenario — 角色由 participants 明示
