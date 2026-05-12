Feature: 新增 / 編輯角色卡（欄位輸入 + AI 統整）
  身為個人創作者
  我想要用結構化欄位（個性標籤、MBTI、星座、文化背景、外貌特徵 ...）快速描述一個角色，再讓 AI 把這些欄位統整成一段連貫的角色敘述
  以便 我不必親手寫長文段落，但仍能得到 chapter-writer 讀得連貫、寫得一致的角色卡

  Scenario: 新增角色卡（填欄位 → AI 生成敘述 → 儲存）
    Given 我已開啟專案「春日記事」
    And 設定頁（009）已設定預設 LLM 為 anthropic:claude-haiku-4-5
    And 該專案目前只有原始角色「蘇晴」
    When 我在「角色」面板點擊「新增角色」
    And 我填入名稱「林書言」、年齡「28」、性別「男」、代詞「他」、角色定位「配角」
    And 我勾選個性標籤「健談」「好奇心旺」「對熟人含蓄」
    And 我選 MBTI「ENTP」、星座「射手」、血型「O」
    And 我填入文化背景「大學念哲學，畢業後盤下祖父留下的舊書店」
    And 我填入身高「178」、體型「偏瘦但不單薄」、髮型髮色「短黑髮微亂」、眼睛「戴金屬細框眼鏡」、其他特徵「指尖常沾墨色」
    And 我選對話節奏「快」、用詞偏好「常用反問句拋回去」、寫作避免「過度直白告白」
    And 我點擊「AI 生成角色描述」
    Then 系統將上述欄位送給 anthropic:claude-haiku-4-5 並等待回應
    And 「敘述」編輯區內出現一段 200~500 字的連貫描寫，包含個性、外貌、對話風格、文化背景
    And 我可以在「敘述」區手動微調文字
    When 我點「儲存」
    Then 系統建立檔案 characters/林書言.md
    And 該檔案 frontmatter 包含上述全部結構化欄位
    And 該檔案 body 是 AI 生成（且我可能微調過）的連貫敘述
    And characters/_index.md 多一行 [林書言](./林書言.md) — 28 歲書店老闆，健談但對熟人含蓄
    And 「角色」面板列出兩名角色

  Scenario: 重新生成角色描述（改欄位後）
    Given 專案中已有角色「林書言」，frontmatter 寫 dialoguePace=快
    And body 為 AI 上次生成的描寫
    When 我打開角色「林書言」的編輯面板
    And 我把對話節奏改為「穩」
    And 我重新點「AI 生成角色描述」
    Then 系統把更新後的欄位送給 LLM 重新生成
    And 「敘述」區改為新版描寫（對話節奏改為穩重）
    And manuallyEdited 標記為 false
    And consolidatedAt 更新為現在時間
    When 我點「儲存」
    Then characters/林書言.md 的 frontmatter 與 body 都更新為新版

  Scenario: 手動編輯 AI 生成的敘述後儲存
    Given 專案中已有角色「蘇晴」，body 為上次 AI 生成的描寫
    When 我打開角色「蘇晴」的編輯面板
    And 我直接在「敘述」區把「指甲剪短沒擦顏色」改為「指甲剪短，平日不擦但會在重要場合塗淡粉色」
    And 我點「儲存」
    Then characters/蘇晴.md 的 body 更新為我的編輯版本
    And manuallyEdited 標記為 true
    And frontmatter 的結構化欄位不變
    And UI 提示「此角色卡的描寫已手動編輯，下次點『AI 生成』會覆蓋你的修改」

  Scenario: AI 生成失敗時不破壞既有 body
    Given 專案中已有角色「蘇晴」，body 為上次 AI 生成的描寫
    When 我改個性標籤後點「AI 生成角色描述」
    And LLM 呼叫失敗（例如 network error）
    Then 「敘述」區仍顯示上次的 body（不被清空）
    And UI 顯示錯誤訊息「AI 生成失敗：網路錯誤。請重試或檢查設定頁」
    And consolidatedAt / consolidatedBy 不變

  Scenario: 未設定 LLM 時點「AI 生成」
    Given 我在「新增角色」對話框，已填部分欄位
    And 設定頁（009）尚未設定任何 LLM provider
    When 我點「AI 生成角色描述」
    Then UI 顯示「請先到設定頁設定一個 LLM provider」並提供連結
    And 沒有任何 LLM 呼叫被送出
    And 我仍可選擇「不生成、直接寫敘述」進入手動模式

  Scenario: 必填欄位（名稱）為空時阻擋送出
    Given 我在「新增角色」對話框
    When 我未填名稱直接提交
    Then 表單顯示「請輸入角色名稱」
    And 沒有檔案被建立
    And 「AI 生成」按鈕在名稱填上前 disabled

  Scenario: 角色 slug 衝突時加後綴
    Given 專案中已有角色「林書言」（檔名 林書言.md）
    When 我新增另一名角色，名稱也叫「林書言」
    Then 系統建立 characters/林書言-2.md，不覆寫既有檔案
    And _index.md 列出兩個同名角色，分別連到各自的檔案

  Scenario: 刪除角色卡
    Given 專案中存在角色「林書言」
    When 我在「角色」面板選擇「刪除」並通過二次確認
    Then characters/林書言.md 被移除
    And _index.md 中對應一行被移除
    And 該角色不再出現在「角色」面板
    And git 記錄一個 commit「刪除角色：林書言」（依 Story 010 版本控制）

  Scenario: 親密場景描寫區預設摺疊
    Given 我在「新增角色」對話框
    When 對話框第一次打開
    Then 「親密場景描寫參考」區塊處於摺疊狀態，僅顯示標題與說明「只有要寫成人題材才填」
    And 我點擊區塊標題可展開、再點可收合
