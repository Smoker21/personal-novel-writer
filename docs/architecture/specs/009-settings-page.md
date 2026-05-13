# Spec: 設定頁（LLM provider / 預設模型）

> Story: `docs/requirements/stories/009-settings-page.md`
> BDD: `docs/requirements/features/009-settings-page.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-12`
> Depends on ADR: 0001（儲存策略）、0003（技術棧）、0004（LLM adapter）、0006（Tauri）、0008（前端架構）

## 摘要

設定頁是使用者第一次接觸 LLM 設定的入口，也是 Story 005 / 002 / 007 等 AI 觸發功能能跑的前置。本 spec 涵蓋 `~/.novel-writer/settings.yaml` 的完整 schema、provider 啟用 / 連線測試流程、per-Agent routing 設定、preset 快速套用，以及首次啟動警語的 `meta` 區段（Story 032 併入本 spec）。

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
  status-updater:
    routing:
      primary: "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      fallbacks: []
      retryPerModel: 3
  character-card-consolidator:
    routing:
      primary: "anthropic:claude-haiku-4-5"
      fallbacks:
        - "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      retryPerModel: 3
  status-shortener:
    routing:
      primary: "anthropic:claude-haiku-4-5"
      fallbacks:
        - "lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus"
      retryPerModel: 3

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
- `retryPerModel` 預設 3，符合 ADR-0004
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

### POST /api/settings/reset

清除 settings.yaml，回到出廠預設。`meta.firstLaunchWarningAcknowledged` 也重設（下次啟動會再次顯示警語）。`recentProjects` **保留**（不算「設定」）。

**Response 200:** `{ ok: true; resetAt: string }`

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
  | string;                              // 開放讓未來 Agent 加（Story 028）

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

- [ ] **types**: `packages/shared-types/src/settings.ts` — Settings、ProviderConfig、RoutingPolicy 等
- [ ] **be-1**: `apps/api/src/services/settings-store.ts` — 讀寫 settings.yaml（atomic write、預設值 merge、API key 遮蔽 helper）
- [ ] **be-2**: `apps/api/src/services/provider-tester.ts` — 對 7 個 provider 各自的 health check 實作
- [ ] **be-3**: `apps/api/src/routes/settings.ts` — `GET / PUT / POST test / POST reset / GET secret/:provider`
- [ ] **be-4**: 整合 `LLMRouter`（依 ADR-0004）讀取 settings.yaml 的 agents.routing
- [ ] **fe-1**: `apps/web/src/features/settings/SettingsPage.tsx` 主頁
- [ ] **fe-2**: `ProviderCard` 元件（啟用 toggle + 對應欄位 + 測試按鈕）
- [ ] **fe-3**: `AgentRoutingCard` 元件（primary / fallbacks dropdown，列出已啟用 provider 的模型）
- [ ] **fe-4**: `PresetButtons` 元件（4 個 preset 卡片）
- [ ] **fe-5**: API key 遮蔽 / 顯示 toggle 元件
- [ ] **fe-6**: 「離開頁面但 form dirty」警告 hook
- [ ] **fe-7**: 005 / 002 / 007 偵測到 routing 未設定的引導 UI（顯示對話框 +「前往設定頁」連結）
- [ ] **qa-1**: cucumber-js step definitions for `009.feature`
- [ ] **qa-2**: 設定載入 / 儲存 / 重設的端對端測試
- [ ] **qa-3**: API key 遮蔽 / 不洩漏的驗證測試

## 對 Story 032 的承擔

Story 032 首次警語的「不再顯示」狀態存在 `meta.firstLaunchWarningAcknowledged`。本 spec 涵蓋此欄位的讀寫；Story 032 的對話框 UI 由前端獨立元件實作，呼叫 PUT /api/settings 寫入 meta 即可。

032 不需要獨立 spec。

## 變更紀錄

- `2026-05-12`: 初版 Ready
