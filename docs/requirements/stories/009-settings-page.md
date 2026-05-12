# 設定頁（LLM provider / 預設模型 / 個人偏好）

> Story ID: `009-settings-page`
> Persona: `hobbyist-author`、`serial-author`、`worldbuilder-author`
> Epic: `unassigned`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `none`（第一次使用就會碰到設定頁）

## 使用者故事

身為 **個人創作者**，
我想要 **在一個集中的設定頁配置我的 LLM provider（cloud 雲端 API key + 地端 endpoint）以及每個 AI 功能（chapter-writer / status-updater / 角色卡 AI 統整）使用的預設模型**，
以便 **應用第一次跑時知道要用哪個模型，且我可以自由切換 / 增減 provider 不必去摸 settings.yaml**。

## 背景與動機

依 [ADR-0004](../../architecture/adr/0004-llm-adapter.md)：所有 LLM provider 設定來自 `~/.novel-writer/settings.yaml`：

```yaml
providers:
  anthropic:
    apiKey: sk-ant-...
  ollama:
    endpoint: http://localhost:11434
  lmstudio:
    endpoint: http://localhost:1234/v1
defaults:
  routing:
    primary: anthropic:claude-sonnet-4-6
    fallbacks: [ollama:qwen2.5:14b]
```

PM 在 Phase A.1 通讀指出：「005 假設『已設定雲端與地端模型』，但**完全沒 story**。MVP 缺這個 005 第一次跑就會 500」。

本 story 補上設定頁的 UI 與基本驗證流程。**不寫**首次啟動 wizard——使用者第一次按「AI 撰寫本章」（005）會被引導到此設定頁。

依 model-evaluation 結果（[2026-05-12 qwen3-vl 結果](../../architecture/model-evaluation/results/2026-05-12-qwen3-vl-30b-a3b-abliterated.001.md)），預設 routing 建議的初始值會直接寫進設定頁的「快速設定」按鈕（如「套用 RWKV / Qwen / Cloud Claude 預設組合」）讓使用者一鍵帶入。

## 範圍

**包含：**
- 設定頁從應用導覽列「設定」進入，路徑 `/settings`
- **provider 區段**：列出所有支援的 provider（anthropic / openai / google / xai / ollama / lmstudio / rwkv-runner），每個可：
  - 啟用 / 停用
  - 雲端 provider：填 API key（密碼欄）+ 「測試連線」按鈕
  - 地端 provider：填 endpoint URL + 「測試連線」按鈕
  - 顯示測試結果（成功 / 失敗 + 錯誤訊息）
- **預設模型 routing 區段**：列出每個 AI 功能（chapter-writer / status-updater / character-card-consolidator / status-shortener / polish-prose-skill），每個可指定：
  - primary modelId（從已啟用 provider 的可用模型清單下拉選）
  - fallbacks modelId 陣列（多選）
- **快速設定** preset 按鈕：
  - 「全雲端 (Claude Haiku)」 → primary=anthropic:claude-haiku-4-5, fallbacks=[]
  - 「Cloud + 地端 fallback」→ primary=anthropic:claude-sonnet-4-6, fallbacks=[lmstudio:qwen3-vl-30b-...]
  - 「全地端 (Qwen3-VL)」→ primary=lmstudio:qwen3-vl-30b-..., fallbacks=[]
  - 「測試版 (RWKV-7)」→ primary=lmstudio:rwkv7-g1f-13.3b, fallbacks=[]
- 儲存設定到 `~/.novel-writer/settings.yaml`
- API key 在 settings.yaml 中**明文存**（個人本機應用，不加密；但 UI 顯示為 ****）
- 「重設為出廠預設」按鈕
- 005 / 002 等需要 LLM 的功能在未設定時顯示「請先到設定頁設」的引導（已寫進對應 story）

**不包含：**
- 多重設定 profile（工作 / 個人切換）→ 後續優化
- 雲端 push 設定備份 → 不做（個人 secrets，應留本機）
- 設定值的版本控制 / 還原 → 不做
- 模型清單的自動發現（每個 provider 跑 /v1/models）→ MVP 期可以做但簡化：列固定預設清單 + 自由文字補
- LLM 用量統計 / 成本估算 → 後續另開
- 個人偏好（編輯器字型 / 字寬 / theme）→ 暫時硬編，後續另開

## settings.yaml schema

```yaml
# ~/.novel-writer/settings.yaml
version: 1
providers:
  anthropic:
    enabled: true
    apiKey: sk-ant-...
  openai:
    enabled: false
    apiKey: ""
  google:
    enabled: false
    apiKey: ""
  xai:
    enabled: false
    apiKey: ""
  ollama:
    enabled: true
    endpoint: http://localhost:11434
  lmstudio:
    enabled: true
    endpoint: http://localhost:1234/v1
  rwkv-runner:
    enabled: false
    endpoint: http://localhost:27777/v1
agents:
  chapter-writer:
    routing:
      primary: lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus
      fallbacks:
        - anthropic:claude-sonnet-4-6
      retryPerModel: 3
  status-updater:
    routing:
      primary: lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus
      fallbacks: []
  character-card-consolidator:
    routing:
      primary: anthropic:claude-haiku-4-5
      fallbacks:
        - lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus
  status-shortener:
    routing:
      primary: anthropic:claude-haiku-4-5
      fallbacks:
        - lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus
recentProjects:
  # ... 由 Story 008 維護
```

## 驗收條件 (Gherkin)

### Scenario: 第一次進設定頁，所有 provider 預設停用
```gherkin
Given 我從未進過設定頁
And ~/.novel-writer/settings.yaml 不存在
When 我在導覽列點「設定」
Then 系統建立預設 settings.yaml（所有 provider 都 enabled=false）
And 設定頁顯示所有 provider 都未啟用
And 預設模型 routing 區段每個 Agent 都顯示「未設定 — 請至少啟用一個 provider 並指定模型」
```

### Scenario: 啟用 cloud provider 並測試連線
```gherkin
Given 我在設定頁的 anthropic 區段
When 我勾選「啟用」
And 我填入 API key「sk-ant-...」
And 我點「測試連線」
Then 系統呼叫 anthropic 的 /models 或最小 chat completion 驗證 key
And 連線成功時顯示綠色勾「連線成功」
And 連線失敗時顯示紅色叉 + 錯誤訊息（例：「unauthorized: API key 無效」）
And 測試結果不寫進 settings.yaml（只是 UI 反饋）
```

### Scenario: 啟用地端 provider 並測試連線
```gherkin
Given 我在設定頁的 lmstudio 區段
And 我已啟用 LM Studio server 在 http://localhost:1234
When 我勾選「啟用」
And 我填入 endpoint「http://localhost:1234/v1」
And 我點「測試連線」
Then 系統 GET http://localhost:1234/v1/models
And 連線成功時顯示「連線成功 — 偵測到 X 個模型」
And 連線失敗時顯示錯誤
```

### Scenario: 套用快速設定 preset
```gherkin
Given 我已啟用 anthropic 與 lmstudio 兩個 provider
When 我在預設模型區段點「Cloud + 地端 fallback」preset 按鈕
Then 所有 Agent 的 routing 被填入：
  | Agent | primary | fallbacks |
  | chapter-writer | anthropic:claude-sonnet-4-6 | [lmstudio:qwen3-vl-...] |
  | status-updater | anthropic:claude-sonnet-4-6 | [lmstudio:qwen3-vl-...] |
  | character-card-consolidator | anthropic:claude-haiku-4-5 | [lmstudio:qwen3-vl-...] |
  | status-shortener | anthropic:claude-haiku-4-5 | [lmstudio:qwen3-vl-...] |
And UI 提示「已套用『Cloud + 地端 fallback』，按下『儲存』生效」
```

### Scenario: 為單一 Agent 自訂 routing
```gherkin
Given 我已啟用 anthropic 與 lmstudio
And 我預設 routing 是「全地端」preset
When 我把 chapter-writer 的 primary 改為 anthropic:claude-sonnet-4-6
And 把 fallbacks 加上 lmstudio:qwen3-vl-30b-...
And 我按「儲存」
Then settings.yaml 的 chapter-writer routing 被更新
And 其他 Agent 的 routing 不動
```

### Scenario: 設定 primary 為「未啟用 provider 的模型」時阻擋儲存
```gherkin
Given anthropic provider 是 enabled=false
When 我把 chapter-writer 的 primary 改為 anthropic:claude-sonnet-4-6
And 我按「儲存」
Then 系統顯示「primary 模型對應的 provider (anthropic) 未啟用」
And 不寫入 settings.yaml
And 提供「啟用 anthropic」連結
```

### Scenario: 005 偵測到 chapter-writer routing 未設定時引導
```gherkin
Given 我從未在 009 設定頁設過 chapter-writer 的 routing
When 我在編輯器點「AI 撰寫本章」
Then UI 顯示「請先到設定頁設定 chapter-writer 的預設模型」
And 提供「前往設定頁」連結
And 不呼叫任何 LLM
```

### Scenario: API key 在 UI 顯示為遮蔽
```gherkin
Given anthropic 已填入 API key「sk-ant-secret-key-1234」
When 我打開設定頁
Then API key 欄位顯示為「sk-ant-...••••••••1234」（前綴 + 後 4 字 + 中間遮蔽）
And 旁邊有「顯示」按鈕，點擊後顯示完整 key（給使用者驗證用）
```

### Scenario: 「重設為出廠預設」清除所有設定
```gherkin
Given 我已設定多個 provider 與 routing
When 我點「重設為出廠預設」
And 在二次確認對話框點「確認」
Then settings.yaml 被覆寫為初始狀態（所有 provider 停用、所有 Agent 未設定 routing）
And 但 recentProjects 保留（不算「設定」）
```

## AI 互動細節

「測試連線」按鈕會發一個最小的 LLM 呼叫驗證 provider 可用性：
- cloud：取 /models endpoint 或發一個 1-token chat completion
- local：取 /v1/models endpoint
- 不消耗有意義的 token（cloud 用 /models 即可）

## UX 注意事項

- 設定頁分區：① providers（左欄）② agents routing（右欄）③ 操作區（reset / 快速設定）
- 每個 provider 一個卡片：啟用切換 + 對應欄位 + 測試按鈕 + 測試結果
- 模型 dropdown 列出已啟用 provider 的可用模型；下拉選單前綴顯示 provider tag（`[anthropic]`, `[lmstudio]`）
- API key 欄位是 password type，附「顯示」眼睛圖示
- 「儲存」按鈕在頁尾固定 sticky
- 未儲存的變動有 dirty indicator + 離開頁面提示
- 「測試連線」按鈕點擊後 disable + 顯示 spinner

## 開放問題

- [ ] 是否在 provider 卡片上自動發現模型清單（call /v1/models 列出來）？建議：是，提升 UX；模型 dropdown 用真實清單而非 hard-coded
- [ ] settings.yaml 寫入失敗時的處理？建議：顯示明確錯誤 + 維持 in-memory 設定可繼續用；下次啟動回到上次成功儲存的版本
- [ ] 將來 user-defined preset（使用者自己存組合）→ 後續優化
- [ ] xAI Grok 的 API key 規格與 Anthropic 是否一樣？需在 spec 階段確認；MVP 先按 OpenAI-compatible 處理
