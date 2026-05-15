# Spec: 設定頁（LLM provider / 預設模型）

> Story: `docs/requirements/stories/009-settings-page.md`
> BDD: `docs/requirements/features/009-settings-page.feature`
> Status: `Ready`（PM 於 2026-05-15 拍板核准 M5 Round 3）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001（儲存策略）、0003（技術棧）、0004（LLM adapter）、0006（Tauri）、0008（前端架構）
> 修訂：`2026-05-15` — M4 release 後使用者人工 review（`docs/qa/m4-ux-review-result.md`）發現三項根本性需求變更：
> 1. **Model 下拉選單**：每個 provider 加 `listModels()` 介面 + 24h cache + 預設模型 UI 改下拉
> 2. **Per-routing-slot system prompt 覆寫**：新欄位 `agents.<slug>.routing.systemPromptOverride`；注入到該 routing slot 對應 Agent 的 system prompt 前段
> 3. **API key UX 修正**：預設**顯示**（本機個人工具偏好）；顯示/隱藏 toggle 不再清空資料（M4 bug）
> 4. **TD-9（Story 032）**：首次警語 Dialog 鎖 ESC + click-outside 行為驗證點補完

## 摘要

設定頁是使用者第一次接觸 LLM 設定的入口，也是 Story 005 / 002 / 007 等 AI 觸發功能能跑的前置。本 spec 涵蓋 `~/.novel-writer/settings.yaml` 的完整 schema、provider 啟用 / 連線測試流程、per-Agent routing 設定（含 model 下拉與 system prompt 覆寫）、preset 快速套用，以及首次啟動警語的 `meta` 區段（Story 032 併入本 spec）。

API key 與 endpoint 一律存 `~/.novel-writer/settings.yaml`，**絕不**進入專案目錄或 git。

## settings.yaml 完整 schema

```yaml
# ~/.novel-writer/settings.yaml
version: 1                                # 整個檔案的 schema 版本，未來 migrate 用

meta:
  firstLaunchWarningAcknowledged: true    # Story 032
  firstLaunchWarningAcknowledgedAt: 2026-05-12T10:00:00Z
  installId: "uuid-v4"                    # 隨機 UUID，純識別用（不上傳）

providers:
  anthropic:
    enabled: true
    apiKey: "sk-ant-..."
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
    endpoint: "http://localhost:11434"
  lmstudio:
    enabled: true
    endpoint: "http://localhost:1234/v1"
  rwkv-runner:
    enabled: false
    endpoint: "http://localhost:27777/v1"

agents:
  chapter-writer:
    routing:
      primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      fallbacks:
        - "anthropic:claude-sonnet-4-6"
      retryPerModel: 3
      systemPromptOverride: |
        你是一個繁體中文的小說寫作者，擅長描寫男女情愛細節。
      temperature: null              # null = 用 Agent 預設；可被「本章覆寫」進一步覆蓋（Spec 003+005）
  status-updater:
    routing:
      primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      fallbacks: []
      retryPerModel: 3
      systemPromptOverride: null      # structured-data Agent 預設不注入（見「Per-routing-slot system prompt」段）
      temperature: null
  character-card-consolidator:
    routing:
      primary: "anthropic:claude-haiku-4-5"
      fallbacks:
        - "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      retryPerModel: 3
      systemPromptOverride: null
      temperature: null
  status-shortener:
    routing:
      primary: "anthropic:claude-haiku-4-5"
      fallbacks:
        - "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      retryPerModel: 3
      systemPromptOverride: null
      temperature: null
  character-image-extractor:        # Spec 002b 引入
    routing:
      primary: "google:gemini-2.5-flash"
      fallbacks: []
      retryPerModel: 3
      systemPromptOverride: null
      temperature: null

recentProjects:                            # 由 Story 008 維護
  - hash: "a1b2c3d4e5f6"
    path: "D:/GoogleDrive/MyNovels/春日記事"
    title: "春日記事"
    lastOpenedAt: "2026-05-12T10:30:00Z"
    lastChapter: 3
    chapterCount: 12

ui:                                        # P1 加（編輯器字型 / theme），MVP 不暴露
  # 預留
```

### Schema 規則

- `apiKey` 為**明文**儲存（個人本機工具，不加密；ADR-0001 已說明）
- `enabled: false` 的 provider 不會被 LLM adapter 載入
- `agents.<name>.routing.primary` 必須對應到 `enabled: true` 的 provider；驗證在 API 端
- `agents.<name>.routing.primary` 與 `fallbacks[]` 對應的 `<model>` 必須出現在該 provider 的 `listModels()` 快取中；驗證在 API 端（見「Provider listModels 介面」）
- `retryPerModel` 預設 3，符合 ADR-0004
- `systemPromptOverride`：選填字串。null / 空字串 = 不注入。長度上限 4 KB（zod 驗證），避免使用者誤把整個 system prompt 塞入此欄位
- `temperature`：選填浮點數（0.0–2.0）。null = 用 Agent 預設值（在 `packages/prompt-library` 各 Agent 內定義）
- 路徑 `~/.novel-writer/` 對應 Tauri 的 `app_data_dir`（跨 OS 平台不同實體路徑）

## API 合約

### GET /api/settings

**Response 200:**
```ts
{
  version: 1;
  meta: {
    firstLaunchWarningAcknowledged: boolean;
    firstLaunchWarningAcknowledgedAt: string | null;
    installId: string;
  };
  providers: Record<ProviderId, ProviderConfig>;
  agents: Record<AgentSlug, { routing: RoutingPolicy }>;
}
```

API key 在 response 中**遮蔽**為 `"sk-ant-...****1234"`（前綴 + 後 4 + 中間 `****`）；前端「顯示完整 key」按鈕走另一個 endpoint（GET /api/settings/secret/:provider）以避免 dev tools 攔截。

### PUT /api/settings

**Request:**
```ts
{
  meta?: { firstLaunchWarningAcknowledged?: boolean };
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
  agents?: Partial<Record<AgentSlug, { routing: RoutingPolicy }>>;
}
```

部分更新（patch 語意）；未提供的欄位不動。

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | `INVALID_ROUTING` | `agents.X.routing.primary` 指向未啟用的 provider；`fieldErrors` 指出哪個 agent |
| 400 | `INVALID_MODEL_ID` | modelId 格式不對（非 `<provider>:<model>`） |
| 500 | `IO_ERROR` | settings.yaml 寫入失敗 |

### POST /api/settings/test-provider

**Request:**
```ts
{
  providerId: "anthropic" | "openai" | "google" | "xai" | "ollama" | "lmstudio" | "rwkv-runner";
  apiKey?: string;             // 雲端 provider 用
  endpoint?: string;           // 地端 provider 用
}
```

注意：使用 **request body 中的** key / endpoint，不依賴 settings.yaml 已儲存的值——讓使用者在填寫表單時即時測試。

**Response 200:**
```ts
{
  ok: boolean;
  latencyMs?: number;
  modelCount?: number;          // 對 OpenAI-compat 列出模型數
  errorCode?: "unauthorized" | "network" | "timeout" | "unknown";
  errorMessage?: string;
}
```

### GET /api/settings/secret/:provider

**Response 200:** `{ apiKey: string; endpoint?: string }` 完整明文，給「顯示完整 key」按鈕用。

> **M5 修訂**：UI 預設**顯示**完整 key（個人本機工具偏好；違反一般 a11y 慣例但符合本應用 threat model）。顯示/隱藏 toggle 純粹是 input type 切換（`text` ↔ `password`），不影響 React state — toggle 不再清空輸入（M4 bug 修復）。

### GET /api/settings/provider-models/:providerId

列出指定 provider 可用的模型（給設定頁「預設模型」下拉用）。

**Query:**
- `refresh` (bool, optional)：true 時強制重新拉取，忽略 24h cache

**Response 200:**
```ts
{
  providerId: ProviderId;
  models: Array<{
    id: string;                      // 不含 provider 前綴；UI 拼接時 = `<providerId>:<id>`
    displayName?: string;            // 可選：API 回的友善名稱
    contextWindow?: number;          // 可選：tokens
    supportsVision?: boolean;        // 可選：ADR-0009
  }>;
  fetchedAt: string;                 // ISO 8601；24h 內視為 fresh
  fromCache: boolean;
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `PROVIDER_DISABLED` | 該 provider `enabled: false`；前端應先啟用 |
| 502 | `LIST_MODELS_FAILED` | 呼叫 provider API 失敗；含 `errorCode: "unauthorized" \| "network" \| "timeout" \| "unknown"` |
| 501 | `LIST_MODELS_UNSUPPORTED` | 該 provider 的 adapter 未實作 listModels（保險用，MVP 七個 provider 全部要支援）|

**Cache 策略**：
- Cache key：`provider:<providerId>`
- TTL：24h
- 儲存位置：`~/.novel-writer/cache/index.db` 的 `provider_models` 表
- Invalidation：使用者按「手動 refresh」、provider apiKey/endpoint 改變、provider 從 `enabled: false` → `true` 時自動失效

```sql
CREATE TABLE provider_models (
  provider_id TEXT PRIMARY KEY,
  models_json TEXT NOT NULL,         -- JSON-serialized model array
  fetched_at TEXT NOT NULL,
  source_apikey_hash TEXT,           -- sha256(apiKey).slice(0, 16)；用以偵測 key 變動
  source_endpoint TEXT
);
```

### POST /api/settings/reset

清除 settings.yaml，回到出廠預設。`meta.firstLaunchWarningAcknowledged` 也重設（下次啟動會再次顯示警語）。`recentProjects` **保留**（不算「設定」）。

**Response 200:** `{ ok: true; resetAt: string }`

**M5 Round 2（UX-7）— 二次確認 modal**：

此 endpoint 為破壞性操作。前端按「重設為出廠預設」**必須**先彈 modal 二次確認：

```
┌─ ⚠️ 重設為出廠預設 ────────────────────────┐
│ 此動作會：                                    │
│ • 清除所有 provider 設定（API key 全部刪除）   │
│ • 清除所有 Agent routing 設定                  │
│ • 清除 system prompt 覆寫                      │
│ • 重新顯示首次啟動警語                          │
│                                              │
│ **保留**：「最近開啟」清單                     │
│                                              │
│           [取消]  [確認重設]                  │
└──────────────────────────────────────────────┘
```

「確認重設」才送 POST；modal 走 dismissable modality（ESC + click-outside 都可取消，與 FirstLaunchWarning 不同）。

## 連線測試實作

### 雲端 provider

| Provider | 測試方法 |
|---|---|
| Anthropic | `GET https://api.anthropic.com/v1/models`（不消耗 token） |
| OpenAI | `GET https://api.openai.com/v1/models` |
| Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` |
| xAI | `GET https://api.x.ai/v1/models` |

5 秒 timeout；HTTP 200 = ok，其他狀態映射到 LLMErrorCode（ADR-0004）。

### 地端 provider

| Provider | 測試方法 |
|---|---|
| Ollama | `GET <endpoint>/api/tags` |
| LM Studio | `GET <endpoint>/models`（OpenAI-compat） |
| RWKV-Runner | `GET <endpoint>/models`（OpenAI-compat） |

3 秒 timeout。

不執行實際 generation（避免消耗 token / 觸發地端模型載入）。

## Provider listModels 介面（新增）

新增到 `packages/llm-adapter/src/types.ts` 的 `LLMProvider` interface：

```ts
export interface LLMProvider {
  // ...既有方法
  /**
   * 列出此 provider 當前可用的模型 id 清單。
   * 不快取（呼叫端負責 cache）；可被 abort（5s timeout）。
   * 失敗時 throw LLMError with code in {"unauthorized","network","timeout","unknown"}。
   */
  listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]>;
}

export interface ProviderModel {
  id: string;                        // 不含 provider 前綴
  displayName?: string;
  contextWindow?: number;
  supportsVision?: boolean;
}
```

各 provider 的實作 endpoint：

| Provider | endpoint | 備註 |
|---|---|---|
| Anthropic | `GET https://api.anthropic.com/v1/models` | 與連線測試共用；可同時取得 |
| OpenAI | `GET https://api.openai.com/v1/models` | filter 「`gpt-*`」與 `o*` 系列 |
| Google | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` | filter 「`models/gemini-*`」、剝除 `models/` 前綴 |
| xAI | `GET https://api.x.ai/v1/models` | OpenAI-compat |
| Ollama | `GET <endpoint>/api/tags` | 回應的 `models[i].name` |
| LM Studio | `GET <endpoint>/models` | OpenAI-compat |
| RWKV-Runner | `GET <endpoint>/models` | OpenAI-compat |

**stale model 處理**：若 24h cache 中的 model 在新一輪 fetch 後消失（例 LM Studio 卸載 / 雲端 deprecate），而 settings.yaml 的某 `routing.primary` 指向此 model：

1. **儲存時驗證**：PUT /api/settings 比對新 routing 是否在最新 listModels 結果中；不在 → 400 `INVALID_MODEL_ID`（攔在使用者按儲存）
2. **執行時失敗**：若儲存時驗證已過但執行時 provider 回 model_not_found → 走 LLMRouter fallback；UI 顯示 toast「primary 模型已不可用，已切換到 fallback」

## Per-routing-slot system prompt 覆寫（新增）

### 設計決策：per-routing-slot 而非 per-provider

兩個替代方案：

| 方案 | Pros | Cons |
|---|---|---|
| Per-provider | 設定一次，所有 Agent 都套用 | structured-data Agent（status-updater / character-card-consolidator / character-image-extractor）會被「擅長描寫情愛細節」這類 prose 風格 prompt 污染，影響 JSON 輸出穩定度 |
| **Per-routing-slot**（採用） | 每個 Agent 獨立決定要不要注入；prose Agent 注入，structured Agent 留 null | settings.yaml 較長；preset 需要為每個 slot 填值 |

決定 per-routing-slot 的關鍵：[memory `style_md_boundary.md`] 已建立慣例 — structured-data Agent 不受 prose 風格約束。`systemPromptOverride` 沿用此邊界。

### 注入規則

呼叫 LLM 前，最終 system prompt 拼接順序：

```
[systemPromptOverride（若 null/空則 skip）]
[空行]
[Agent 本身的 system prompt（在 packages/prompt-library 中定義）]
```

`systemPromptOverride` **置於最前段**，讓 Agent 自己的指令（輸出格式、JSON schema、章節大綱規則）有最後話語權。

**特例：structured-data Agent**：

對 `status-updater` / `character-card-consolidator` / `character-image-extractor` / `status-shortener` 等 structured-data Agent，即使 `systemPromptOverride` 有值，也**強制忽略**（在 prompt-library 端 hard-code 白名單，或在 router 層判斷）。原因：使用者意圖的「我是繁中小說作者」對 JSON parser 沒有意義，反而可能讓地端模型回 prose 而非 JSON。

預設 settings.yaml 中這些 Agent 的 `systemPromptOverride` 留 null；preset 與 UI 應在這些 slot 上 disable 此欄位並顯示說明「此 Agent 不受 system prompt 覆寫影響」。

### 預設值（safe default）

新建 settings.yaml 時：

| Agent slot | systemPromptOverride 預設 |
|---|---|
| chapter-writer | `"你是一個繁體中文的小說寫作者，擅長描寫男女情愛細節。"`（手寫範例，使用者可改） |
| 其他全部 | `null` |

### 與 style.md 的關係

`style.md` 屬於專案級的「prose 風格指引」，由 chapter-writer prompt 在 user message 段附加（Spec 005 既有邏輯）。`systemPromptOverride` 屬於 settings 級的「整體 persona 設定」，在 system prompt 段注入。兩者**不衝突**：style.md 影響「文風」，systemPromptOverride 影響「身分定位 / 安全護欄鬆綁」。

style.md 邊界規則（structured-data Agent 不受影響）對 systemPromptOverride 同樣適用。

## 資料模型

新增至 `packages/shared-types/src/settings.ts`：

```ts
export type ProviderId =
  | "anthropic" | "openai" | "google" | "xai"
  | "ollama" | "lmstudio" | "rwkv-runner";

export type AgentSlug =
  | "chapter-writer"
  | "status-updater"
  | "character-card-consolidator"
  | "status-shortener"
  | "character-image-extractor"          // M5：Spec 002b 引入後納入正式列表
  | string;                              // 開放讓未來 Agent 加（Story 028）

/**
 * 接受 systemPromptOverride 注入的 Agent 白名單（M5 新增）。
 * 不在此列表的 Agent（structured-data）即使 settings 有填，也忽略 override。
 */
export const SYSTEM_PROMPT_OVERRIDE_ENABLED_AGENTS = [
  "chapter-writer",
] as const;

export interface CloudProviderConfig {
  enabled: boolean;
  apiKey: string;
}

export interface LocalProviderConfig {
  enabled: boolean;
  endpoint: string;
}

export type ProviderConfig = CloudProviderConfig | LocalProviderConfig;

export interface RoutingPolicy {
  primary: string;                       // <provider>:<model>
  fallbacks: string[];
  retryPerModel: number;
  systemPromptOverride: string | null;   // M5：per-routing-slot 系統提示詞覆寫；structured-data Agent 忽略
  temperature: number | null;            // M5：null = 用 Agent 預設；0.0–2.0；可被 Spec 005 「本章覆寫」進一步覆蓋
}

export interface ProviderModel {         // M5：listModels 的 row
  id: string;
  displayName?: string;
  contextWindow?: number;
  supportsVision?: boolean;
}

export interface ListProviderModelsResponse {
  providerId: ProviderId;
  models: ProviderModel[];
  fetchedAt: string;
  fromCache: boolean;
}

export interface SettingsMeta {
  firstLaunchWarningAcknowledged: boolean;
  firstLaunchWarningAcknowledgedAt: string | null;
  installId: string;
}

export interface Settings {
  version: 1;
  meta: SettingsMeta;
  providers: Record<ProviderId, ProviderConfig>;
  agents: Record<AgentSlug, { routing: RoutingPolicy }>;
  recentProjects: RecentProject[];       // 細節見 Spec 008
}

export interface RecentProject {
  hash: string;
  path: string;
  title: string;
  lastOpenedAt: string;
  lastChapter: number | null;
  chapterCount: number;
}

export interface TestProviderRequest {
  providerId: ProviderId;
  apiKey?: string;
  endpoint?: string;
}

export interface TestProviderResponse {
  ok: boolean;
  latencyMs?: number;
  modelCount?: number;
  errorCode?: "unauthorized" | "network" | "timeout" | "unknown";
  errorMessage?: string;
}
```

## Preset 定義

```ts
export const ROUTING_PRESETS = {
  "all-cloud-haiku": {
    label: "全雲端 (Claude Haiku)",
    requires: ["anthropic"],
    routing: {
      "chapter-writer":              { primary: "anthropic:claude-haiku-4-5",  fallbacks: [] },
      "status-updater":              { primary: "anthropic:claude-haiku-4-5",  fallbacks: [] },
      "character-card-consolidator": { primary: "anthropic:claude-haiku-4-5",  fallbacks: [] },
      "status-shortener":            { primary: "anthropic:claude-haiku-4-5",  fallbacks: [] },
    },
  },
  "cloud-with-local-fallback": {
    label: "Cloud + 地端 fallback",
    requires: ["anthropic", "lmstudio"],
    routing: {
      "chapter-writer":              { primary: "anthropic:claude-sonnet-4-6", fallbacks: ["lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"] },
      "status-updater":              { primary: "anthropic:claude-sonnet-4-6", fallbacks: ["lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"] },
      "character-card-consolidator": { primary: "anthropic:claude-haiku-4-5",  fallbacks: ["lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"] },
      "status-shortener":            { primary: "anthropic:claude-haiku-4-5",  fallbacks: ["lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"] },
    },
  },
  "all-local-qwen": {
    label: "全地端 (Qwen3-VL)",
    requires: ["lmstudio"],
    routing: {
      "chapter-writer":              { primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus", fallbacks: [] },
      "status-updater":              { primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus", fallbacks: [] },
      "character-card-consolidator": { primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus", fallbacks: [] },
      "status-shortener":            { primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus", fallbacks: [] },
    },
  },
  "experimental-rwkv": {
    label: "測試版 (RWKV-7)",
    requires: ["lmstudio"],
    routing: {
      "chapter-writer":              { primary: "lmstudio:rwkv7-g1f-13.3b", fallbacks: [] },
      "status-updater":              { primary: "lmstudio:rwkv7-g1f-13.3b", fallbacks: [] },
      "character-card-consolidator": { primary: "lmstudio:rwkv7-g1f-13.3b", fallbacks: [] },
      "status-shortener":            { primary: "lmstudio:rwkv7-g1f-13.3b", fallbacks: [] },
    },
  },
} as const;
```

套 preset 時：

1. 驗證 `requires` 中的 provider 都 enabled；否則顯示 toast「請先啟用 <provider>」並提供「啟用」連結
2. 填入 routing 但**不**立即儲存——使用者按「儲存」才寫 settings.yaml
3. **M5**：preset 不覆寫使用者既有 `systemPromptOverride` 與 `temperature`（preset 只動 primary / fallbacks）。新建 settings 時這兩欄按「預設值」段落填入。

## 設定頁 UX 規格（M5 補完）

| 元件 | M4 行為 | M5 行為 |
|---|---|---|
| Provider 卡片折疊 | 預設折疊，無展開指示符 | **預設展開**（簡化心智）；卡片右上角放 `▼` 收合 icon |
| Provider apiKey input | 預設隱藏（type=password）；toggle 顯示時清空輸入 | 預設**顯示**（type=text）；toggle 純切 input type，不動 React state；「顯示」按鈕加 lock icon 提示「本機個人工具，預設明文」 |
| Provider「測試連線」失敗訊息 | 顯示「✗ fetch failed」純技術訊息 | 顯示「✗ 無法連線到 `<endpoint>`，請確認 `<server name>` 已啟動」（依 provider 客製） |
| Provider 預設模型欄位 | 文字輸入 | **下拉選單**，options 從 `/api/settings/provider-models/:providerId` 拉；旁邊放手動「refresh 模型清單」按鈕 |
| AgentRoutingCard primary | 文字輸入 | 兩段下拉：先選 provider → 再選 model（model 清單依 primary provider 拉） |
| AgentRoutingCard systemPromptOverride | 不存在 | **`<ExpandableTextarea>`** 共用元件（spec 002 canonical 定義）；minRowsInline=4；placeholder 顯示預設範例；structured-data Agent 此欄 disable + 顯示說明 |
| AgentRoutingCard temperature | 不存在 | number input + slider（0.0–2.0，step 0.1）；空白 = null = 用 Agent 預設 |
| 「未設定」AgentRoutingCard | 沒視覺警告 | 橘色文字「⚠️ 未設定 — 此 Agent 無法使用」（依 TD-5 即 pol-on-4） |

## 跨元件協議

```
client (settings page)
  │
  ├─ GET /api/settings ────────▶ 載入既有設定（API key 遮蔽）
  │
  ├─ 使用者編輯 form（React Hook Form + zod）
  │
  ├─ 點「測試連線」
  │   └─ POST /api/settings/test-provider {providerId, apiKey/endpoint} ──▶
  │      ├─ apps/api 直接呼叫對應 provider 的 /models endpoint
  │      └─ 回 {ok, latencyMs, modelCount, errorCode}
  │
  ├─ 點「儲存」
  │   └─ PUT /api/settings {patch} ──▶
  │      ├─ zod 驗證 patch
  │      ├─ 驗證 routing.primary 對應 enabled provider
  │      ├─ atomic write settings.yaml (寫 .tmp → fsync → rename)
  │      └─ 回 200 / 400 INVALID_ROUTING / 500 IO_ERROR
  │
  └─ 點「重設」
      └─ POST /api/settings/reset ──▶
         ├─ 寫入 default settings.yaml（保留 recentProjects）
         └─ 回 200
```

### 005 / 002 / 007 對「routing 未設定」的引導

當這些 endpoint 偵測到 `settings.agents[<name>]` 不存在或 `routing.primary` 對應 provider 未 enabled，回 400 `ROUTING_NOT_CONFIGURED`，前端顯示「請先到設定頁設定 <Agent name> 的預設模型」+「前往設定頁」連結。

## Shared UI components reference（M5 Round 2）

本 spec UI 使用以下共用元件，canonical 規格見 [spec 002 §「Shared UI components」](./002-edit-character-card.md#shared-ui-components-m5-round-2--跨-spec-引用)：

| 元件 / 慣例 | 本 spec 使用點 |
|---|---|
| `<ExpandableTextarea>` | `AgentRoutingCard.systemPromptOverride` textarea |
| `<Spinner>` | provider test-connection（3~5s）/ provider listModels（1~3s） |
| Error 三層呈現 | inline：`INVALID_MODEL_ID` / 必填欄；toast：`IO_ERROR` / `LIST_MODELS_FAILED`；modal：reset 二次確認、`ROUTING_NOT_CONFIGURED` 引導 |

## 安全考量

1. **API key 絕不離開 `~/.novel-writer/`**：
   - 不寫到 stdout / log（Hono middleware 過濾）
   - 不寫到專案 git repo（路徑 deny list）
   - 不外傳給 telemetry（無 telemetry）
2. **誤入 Drive 同步路徑的偵測**：
   - settings.yaml 路徑為 `app_data_dir`，Tauri 預設不在 Drive 同步資料夾
   - 但若使用者把 `~/.novel-writer/` 自行 symlink 到 Drive，啟動時偵測到 `~/.novel-writer/` 在常見 cloud sync 路徑下（`/Drive/`、`/Dropbox/`、`/OneDrive/`、`/iCloud/`），警告
3. **API key 顯示**：UI 預設遮蔽；「顯示」按鈕需要使用者主動點擊
4. **request body 上限**：64 KB（API key 短，正常不會超）

## 非功能性

- **效能**：載入設定 p95 < 50ms；連線測試 5 秒 timeout
- **容量**：settings.yaml 約 < 4 KB（多 provider + multi-agent routing）
- **安全**：見「安全考量」段
- **可用性**：純本機；settings.yaml 損毀時備援為「使用 in-memory default 並警告」
- **可觀察性**：所有 PUT / POST / reset 操作寫 log（含時間戳、操作類型）；API key 過濾

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/settings.ts` — Settings、ProviderConfig、RoutingPolicy 等（M5：補 systemPromptOverride / temperature / ProviderModel / SYSTEM_PROMPT_OVERRIDE_ENABLED_AGENTS 白名單）
- [ ] **be-1**: `apps/api/src/services/settings-store.ts` — 讀寫 settings.yaml（atomic write、預設值 merge、API key 遮蔽 helper）；M5：新欄位 schema migration（舊 yaml 缺 systemPromptOverride / temperature → 自動補 null）
- [ ] **be-2**: `apps/api/src/services/provider-tester.ts` — 對 7 個 provider 各自的 health check 實作；M5：友善錯誤訊息（已在 M4 BUG-B 修復，本 spec 形式化）
- [ ] **be-3**: `apps/api/src/routes/settings.ts` — `GET / PUT / POST test / POST reset / GET secret/:provider`；M5：補 `GET /provider-models/:providerId`
- [ ] **be-4**: 整合 `LLMRouter`（依 ADR-0004）讀取 settings.yaml 的 agents.routing
- [ ] **be-5（M5）**: `apps/api/src/services/provider-models-cache.ts` — 24h SQLite cache + invalidation on key/endpoint change
- [ ] **be-6（M5）**: `packages/llm-adapter` 各 provider 補 `listModels()` 實作（7 個 provider）
- [ ] **be-7（M5）**: prompt-library 整合 systemPromptOverride 注入邏輯 + structured-data Agent 白名單檢查
- [ ] **be-8（M5）**: PUT /api/settings 加 model id 驗證（比對 listModels cache）
- [ ] **fe-1**: `apps/web/src/features/settings/SettingsPage.tsx` 主頁
- [ ] **fe-2**: `ProviderCard` 元件（M5：預設展開 + API key 預設顯示 + toggle 不清資料）
- [ ] **fe-3**: `AgentRoutingCard` 元件（M5：primary 改 provider+model 兩段下拉；補 systemPromptOverride textarea 與 temperature input；structured-data Agent disable systemPromptOverride 欄位）
- [ ] **fe-4**: `PresetButtons` 元件（4 個 preset 卡片）
- [ ] **fe-5**: API key 顯示/隱藏 toggle 元件（M5：純切 input type，不動 state）
- [ ] **fe-6**: 「離開頁面但 form dirty」警告 hook
- [ ] **fe-7**: 005 / 002 / 007 偵測到 routing 未設定的引導 UI（顯示對話框 +「前往設定頁」連結）
- [ ] **fe-8（M5）**: `ModelDropdown` 元件 — 從 `/provider-models/:id` 拉清單 + 24h cache 提示 + 手動 refresh 按鈕
- [ ] **fe-9（TD-9）**: `FirstLaunchWarningDialog` lock modality — ESC 攔截 + backdrop noop + focus trap + Playwright 測試
- [ ] **qa-1**: cucumber-js step definitions for `009.feature`
- [ ] **qa-2**: 設定載入 / 儲存 / 重設的端對端測試
- [ ] **qa-3**: API key 遮蔽 / 不洩漏的驗證測試（M5：補 toggle 不清資料的測試）
- [ ] **qa-4（M5）**: provider-models cache 測試（24h TTL、key 變動 invalidation、stale model 拒儲存）
- [ ] **qa-5（M5）**: systemPromptOverride 注入測試（含 prose Agent 注入、structured-data Agent 忽略）
- [ ] **qa-6（TD-9）**: FirstLaunchWarningDialog modality Playwright 測試（ESC / backdrop / focus trap 三項）

## 對 Story 032 的承擔

Story 032 首次警語的「不再顯示」狀態存在 `meta.firstLaunchWarningAcknowledged`。本 spec 涵蓋此欄位的讀寫；Story 032 的對話框 UI 由前端獨立元件實作，呼叫 PUT /api/settings 寫入 meta 即可。

032 不需要獨立 spec。

### TD-9（M5 補完）：Dialog modality 行為驗證點

對應 Story 032 Scenario 6.6 / 6.7（「不可點對話框外面關掉」「不可用 ESC 鍵跳過」）。M4 實作未驗證；M5 spec 補規格：

| 互動 | 預期行為 | 實作要求 |
|---|---|---|
| 點對話框外背景（backdrop click） | Dialog **不**關閉 | `<dialog>` element 上 `onClick` 比對 `e.target === dialogRef.current` → `return`（不 close）；或自製 portal 時 `onClickBackdrop` 不接 close handler |
| 按 ESC 鍵 | Dialog **不**關閉 | 原生 HTML5 `<dialog>` 預設 ESC 會 close — 攔 `onKeyDown` 中 `e.key === "Escape"` → `e.preventDefault()`；或關掉原生 dialog 行為改用自製 modal |
| 鍵盤焦點 | 焦點被 trap 在對話框內 | tab 鍵循環於對話框內可 focus 元素；首次開啟時 focus 移到「離開應用」按鈕（destructive 在左、safe action 在右 — 避免誤點） |
| 失焦（blur） | Dialog 保持開啟 | 不依賴 focus 狀態 close；切到別的應用回來仍顯示 |

實作層級（Spec 003 既有的 ConflictDialog / Spec 008 的 MissingProjectDialog 不受此 modality 約束 — 它們是 dismissable）：

- 對 FirstLaunchWarningDialog 套用「lock modal」模式
- 加 `data-modality="lock"` 屬性供測試識別
- Playwright 測試：模擬 ESC + click backdrop → 驗證 dialog 仍在 DOM 中且 visible

## 變更紀錄

- `2026-05-12`: 初版 Ready
- `2026-05-15`: M5 修訂（待 PM 簽核轉 Ready）：
  - 新增 `RoutingPolicy.systemPromptOverride`（per-routing-slot 系統提示詞覆寫）；structured-data Agent 強制忽略
  - 新增 `RoutingPolicy.temperature`（per-routing-slot 預設溫度；Spec 005 「本章覆寫」可進一步覆蓋）
  - 新增 `GET /api/settings/provider-models/:providerId` + 24h SQLite cache；UI 預設模型改下拉選單
  - 新增 `LLMProvider.listModels()` 介面合約
  - `agents.character-image-extractor` 納入正式 schema（Spec 002b 引入）
  - 設定頁 UX 規格段：API key 預設顯示、Provider 卡片預設展開、disabled routing 警告
  - TD-9（Story 032）：FirstLaunchWarningDialog ESC + click-outside 行為驗證點補完
- `2026-05-15`（晚）: M5 PM Round 2 修訂：
  - UX-1：`systemPromptOverride` textarea 改用 `<ExpandableTextarea>` 共用元件
  - UX-5：補 Spinner 規格 reference（test-provider 3~5s / listModels 1~3s）
  - UX-6：補 Error 三層呈現規格 reference（inline / toast / modal 各對應的 error code）
  - UX-7：`POST /api/settings/reset` 前端必須先彈二次確認 modal（含影響範圍說明）
