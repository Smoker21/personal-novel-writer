Feature: 設定頁（LLM provider / 預設模型 / 個人偏好）
  身為個人創作者
  我想要在一個集中的設定頁配置我的 LLM provider（cloud 雲端 API key + 地端 endpoint）以及每個 AI 功能（chapter-writer / status-updater / 角色卡 AI 統整）使用的預設模型
  以便應用第一次跑時知道要用哪個模型，且我可以自由切換 / 增減 provider 不必去摸 settings.yaml

  Scenario: 第一次進設定頁，所有 provider 預設停用
    Given 我從未進過設定頁
    And ~/.novel-writer/settings.yaml 不存在
    When 我在導覽列點「設定」
    Then 系統建立預設 settings.yaml（所有 provider 都 enabled=false）
    And 設定頁顯示所有 provider 都未啟用
    And 預設模型 routing 區段每個 Agent 都顯示「未設定 — 請至少啟用一個 provider 並指定模型」

  Scenario: 啟用 cloud provider 並測試連線
    Given 我在設定頁的 anthropic 區段
    When 我勾選「啟用」
    And 我填入 API key「sk-ant-...」
    And 我點「測試連線」
    Then 系統呼叫 anthropic 的 /models 或最小 chat completion 驗證 key
    And 連線成功時顯示綠色勾「連線成功」
    And 連線失敗時顯示紅色叉 + 錯誤訊息（例：「unauthorized: API key 無效」）
    And 測試結果不寫進 settings.yaml（只是 UI 反饋）

  Scenario: 啟用地端 provider 並測試連線
    Given 我在設定頁的 lmstudio 區段
    And 我已啟用 LM Studio server 在 http://localhost:1234
    When 我勾選「啟用」
    And 我填入 endpoint「http://localhost:1234/v1」
    And 我點「測試連線」
    Then 系統 GET http://localhost:1234/v1/models
    And 連線成功時顯示「連線成功 — 偵測到 X 個模型」
    And 連線失敗時顯示錯誤

  Scenario: 套用快速設定 preset
    Given 我已啟用 anthropic 與 lmstudio 兩個 provider
    When 我在預設模型區段點「Cloud + 地端 fallback」preset 按鈕
    Then 所有 Agent 的 routing 被填入：
      | Agent | primary | fallbacks |
      | chapter-writer | anthropic:claude-sonnet-4-6 | [lmstudio:qwen3-vl-...] |
      | status-updater | anthropic:claude-sonnet-4-6 | [lmstudio:qwen3-vl-...] |
      | character-card-consolidator | anthropic:claude-haiku-4-5 | [lmstudio:qwen3-vl-...] |
      | status-shortener | anthropic:claude-haiku-4-5 | [lmstudio:qwen3-vl-...] |
    And UI 提示「已套用『Cloud + 地端 fallback』，按下『儲存』生效」

  Scenario: 為單一 Agent 自訂 routing
    Given 我已啟用 anthropic 與 lmstudio
    And 我預設 routing 是「全地端」preset
    When 我把 chapter-writer 的 primary 改為 anthropic:claude-sonnet-4-6
    And 把 fallbacks 加上 lmstudio:qwen3-vl-30b-...
    And 我按「儲存」
    Then settings.yaml 的 chapter-writer routing 被更新
    And 其他 Agent 的 routing 不動

  Scenario: 設定 primary 為「未啟用 provider 的模型」時阻擋儲存
    Given anthropic provider 是 enabled=false
    When 我把 chapter-writer 的 primary 改為 anthropic:claude-sonnet-4-6
    And 我按「儲存」
    Then 系統顯示「primary 模型對應的 provider (anthropic) 未啟用」
    And 不寫入 settings.yaml
    And 提供「啟用 anthropic」連結

  Scenario: 005 偵測到 chapter-writer routing 未設定時引導
    Given 我從未在 009 設定頁設過 chapter-writer 的 routing
    When 我在編輯器點「AI 撰寫本章」
    Then UI 顯示「請先到設定頁設定 chapter-writer 的預設模型」
    And 提供「前往設定頁」連結
    And 不呼叫任何 LLM

  Scenario: API key 在 UI 顯示為遮蔽
    Given anthropic 已填入 API key「sk-ant-secret-key-1234」
    When 我打開設定頁
    Then API key 欄位顯示為「sk-ant-...••••••••1234」（前綴 + 後 4 字 + 中間遮蔽）
    And 旁邊有「顯示」按鈕，點擊後顯示完整 key（給使用者驗證用）

  Scenario: 「重設為出廠預設」清除所有設定
    Given 我已設定多個 provider 與 routing
    When 我點「重設為出廠預設」
    And 在二次確認對話框點「確認」
    Then settings.yaml 被覆寫為初始狀態（所有 provider 停用、所有 Agent 未設定 routing）
    And 但 recentProjects 保留（不算「設定」）
