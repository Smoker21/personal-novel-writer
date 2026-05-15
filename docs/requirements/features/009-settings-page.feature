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

  Scenario: API key 在 UI 預設明文顯示（M5 修訂）
    Given anthropic 已填入 API key「sk-ant-secret-key-1234」
    When 我打開設定頁
    Then API key 欄位**預設顯示完整 key**（type=text）
    And 旁邊有「隱藏」按鈕，點擊後切換為 type=password 遮蔽顯示
    And 「隱藏」/「顯示」切換**不**清空 input 欄位的內容
    And 欄位旁邊有 lock icon + 提示文字「本機個人工具，預設明文」

  Scenario: 「重設為出廠預設」清除所有設定
    Given 我已設定多個 provider 與 routing
    When 我點「重設為出廠預設」
    And 在二次確認對話框點「確認」
    Then settings.yaml 被覆寫為初始狀態（所有 provider 停用、所有 Agent 未設定 routing）
    And 但 recentProjects 保留（不算「設定」）

  # === M5 新增 ===

  Scenario: Provider 預設模型欄位改下拉選單（M5）
    Given anthropic provider 已啟用且 API key 已填寫
    When 我點 anthropic 卡片的「預設模型」下拉
    Then 系統呼叫 GET /api/settings/provider-models/anthropic
    And 下拉顯示該 provider 當前可用的模型清單
    And 旁邊顯示 fetchedAt 時間戳（「24h 內快取」或「剛剛重新取得」）
    And 旁邊有「手動 refresh」按鈕
    When 我點「手動 refresh」
    Then 系統強制重新呼叫並 invalidate cache

  Scenario: provider apiKey 變更時 listModels cache 失效（M5）
    Given anthropic 已啟用且模型清單已 cache
    When 我修改 anthropic apiKey 為新值並儲存
    Then settings.yaml 寫入新 key
    And provider_models cache 對應 row 被 invalidate
    When 我再次展開 anthropic「預設模型」下拉
    Then 系統重新呼叫 listModels（fromCache=false）

  Scenario: 嘗試儲存 stale model 時阻擋（M5）
    Given anthropic 之前 cache 中有 model「claude-3-sonnet-20240229」
    And 我把 chapter-writer 的 primary 設為 anthropic:claude-3-sonnet-20240229
    And 該 model 已從最新 listModels 結果消失
    When 我按「儲存」
    Then 系統回 400 INVALID_MODEL_ID
    And UI 顯示「primary 模型 claude-3-sonnet-20240229 不再可用，請從下拉重新選擇」
    And settings.yaml 不變更

  Scenario: 為 chapter-writer 設定 systemPromptOverride（M5）
    Given chapter-writer 已選 primary 模型
    When 我在 chapter-writer 卡片的「系統提示詞覆寫」textarea 填入「你是繁體中文情愛小說作者」
    And 我按「儲存」
    Then settings.yaml 的 agents.chapter-writer.routing.systemPromptOverride 被設為該字串
    When 該章節觸發 chapter-writer 撰寫
    Then 該字串被注入到 system prompt 最前段（在 Agent 自己的 system prompt 前）

  Scenario: structured-data Agent 的 systemPromptOverride 欄位被 disable（M5）
    Given 我在設定頁的「Agent 預設模型」區段
    When 我展開 status-updater 卡片
    Then 「系統提示詞覆寫」欄位呈 disabled 狀態
    And 旁邊顯示說明「此 Agent 為結構化資料輸出，不受 system prompt 覆寫影響」
    And 即使我能寫入 settings.yaml 的此欄位，執行時也會被忽略

  Scenario: 為 chapter-writer 設定 temperature（M5）
    Given chapter-writer 已選 primary 模型
    When 我把 temperature 從預設改為 1.2
    And 我按「儲存」
    Then settings.yaml 的 agents.chapter-writer.routing.temperature 為 1.2
    When 該章節觸發 chapter-writer（無「本章溫度覆寫」）
    Then LLM 呼叫帶 temperature=1.2

  Scenario: Provider 卡片預設展開（M5）
    Given 我打開設定頁
    When 任一 provider 卡片初次渲染
    Then 卡片預設**展開**顯示所有欄位（apiKey / endpoint / 預設模型）
    And 卡片右上角有 `▼` icon 可手動收合
    When 我點 `▼` icon
    Then 卡片收合，只顯示 provider 名稱與啟用 checkbox

  # === TD-9 / Story 032 補完（M5）===

  Scenario: 首次警語對話框 backdrop click 不關閉（TD-9）
    Given 應用首次啟動，FirstLaunchWarningDialog 顯示中
    When 我點對話框外的背景區域
    Then 對話框**不**關閉
    And 視覺上仍可見

  Scenario: 首次警語對話框 ESC 不關閉（TD-9）
    Given 應用首次啟動，FirstLaunchWarningDialog 顯示中
    When 我按 ESC 鍵
    Then 對話框**不**關閉
    And 必須明確按按鈕才能離開

  Scenario: 首次警語對話框焦點 trap（TD-9）
    Given FirstLaunchWarningDialog 顯示中
    Then 鍵盤焦點預設停在「離開應用」按鈕（destructive action）
    When 我連續按 Tab 鍵循環
    Then 焦點只在對話框內可 focus 元素之間循環
    And 不會 escape 到對話框外的元素

  # === M5 PM Round 2（UX-1 / UX-7）===

  Scenario: 重設為出廠預設前先彈二次確認 modal（UX-7）
    Given 我已設定多個 provider 與 routing
    When 我點「重設為出廠預設」按鈕
    Then 開啟確認 modal，標題「⚠️ 重設為出廠預設」
    And modal 列出影響範圍：
      | 影響 | 細節 |
      | 清除 | 所有 provider API key、Agent routing、system prompt 覆寫 |
      | 重新顯示 | 首次啟動警語 |
      | 保留 | 「最近開啟」清單 |
    And modal 含 [取消] [確認重設] 兩按鈕
    And modal 為 dismissable（ESC / click backdrop 可取消，與 FirstLaunchWarning 不同）
    When 我點「取消」或按 ESC
    Then settings.yaml 不變
    When 我重新打開 modal 並點「確認重設」
    Then 系統呼叫 POST /api/settings/reset
    And settings.yaml 被覆寫為初始狀態
    And recentProjects 保留

  Scenario: systemPromptOverride 用 ExpandableTextarea（UX-1）
    Given 我在設定頁的 chapter-writer 卡片
    When 我點「系統提示詞覆寫」textarea 右上角 ⛶ icon
    Then 開啟 modal，textarea 撐 80vh × 80vw
    When 我在 modal 編輯後按 ESC
    Then modal 關閉，inline textarea 顯示完整編輯內容
    And 字數計數即時更新

  # === UX-6 Error 三層（PM Round 3 補）===

  Scenario: chapter-writer routing 未設定時阻擋 modal（UX-6 — modal 層）
    Given 我在編輯器，settings.agents.chapter-writer.routing.primary 為空
    When 我點「生成本章」
    Then build-prompt API 回 400 ROUTING_NOT_CONFIGURED
    And 前端開啟中央 modal「⚠️ chapter-writer 模型尚未設定」
    And modal 內文「請先到設定頁啟用一個 provider 並指定 chapter-writer 的預設模型。」
    And modal 含兩按鈕：[取消] [前往設定頁]
    And modal 為 dismissable（ESC 可取消）
    When 我點「前往設定頁」
    Then 前端 route 到設定頁
    And 設定頁高亮 chapter-writer 的 AgentRoutingCard
    When 我改點「取消」或按 ESC
    Then modal 關閉，編輯器停留在原位
