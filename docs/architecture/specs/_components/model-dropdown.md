# `<ModelDropdown>` — Provider 模型下拉選單

> 跨 spec 共用 UI 元件。Canonical 規格由本檔定義。
> Status: `Ready`
> 引入：M5 PM Round 1（spec 009 listModels）

## 用途

從 `/api/settings/provider-models/:providerId` 拉模型清單，顯示為下拉選單，旁邊放手動 refresh 按鈕。取代 M4 的「文字輸入 model id」UX。

## Props

```ts
interface ModelDropdownProps {
  providerId: ProviderId;
  value: string | null;          // 當前選中的 model id（不含 provider 前綴）
  onChange: (modelId: string) => void;
  disabled?: boolean;
  showRefreshButton?: boolean;   // 預設 true
  hardcoded?: ProviderModel[];   // structured-only provider（如 xiaohuangwen）用：跳過 API、直接列固定選項
}
```

## 行為

| 觸發 | 行為 |
|---|---|
| 元件 mount | 從 `/api/settings/provider-models/:providerId` 拉清單；若 `fromCache: true` 則 dropdown 旁邊顯示「上次更新：M 分鐘前」灰字 |
| 點手動 refresh 按鈕 | 帶 `?refresh=true` 重打 endpoint；按鈕顯示 spinner（estimatedSeconds=2）|
| listModels 失敗 | toast 顯示「✗ 取不到模型清單：<msg>。重試」；dropdown 可手動輸入（fallback）|
| `hardcoded` 提供時 | 完全跳過 API，直接列 `hardcoded` 提供的選項（xiaohuangwen 用此 path 列 `latest` / `stable`）|
| `disabled=true` | 灰階顯示；不可選 |

## 視覺結構

```
┌────────────────────────────────────────────────┐
│ 預設模型: [claude-sonnet-4-6           ▼]  [↻] │
│                                                 │
│              上次更新：3 分鐘前                  │
└────────────────────────────────────────────────┘
```

## 使用位置

| spec | 位置 |
|---|---|
| 009 | ProviderCard 的「預設模型」欄；AgentRoutingCard 的 primary / fallback model 選擇（兩段下拉：先 provider → 再 model）|

## 與 listModels API 的關係

| 介面 | 用途 |
|---|---|
| `LLMProvider.listModels()` | 各 provider adapter 實作；spec 009 「Provider listModels 介面」段定義 |
| `/api/settings/provider-models/:providerId` | API 端 thin wrapper + 24h SQLite cache |
| `<ModelDropdown>` | UI 端 thin wrapper，消費上述 endpoint |

## 結構化-only provider 的特殊處理

xiaohuangwen 等 structured-only provider（spec 011）：

- `listModels()` adapter 端 hardcode return `[{id:"latest"},{id:"stable"}]`（不打 HTTP）
- `<ModelDropdown>` 接 `hardcoded` prop 直接列；不顯示「上次更新」 / refresh 按鈕（無意義）

## 實作位置

`apps/web/src/components/ModelDropdown.tsx`

## 變更紀錄

- `2026-05-17`：從 spec 009 fe-8 task + line 530 規格遷出建檔（M6 SA-1）；補 `hardcoded` prop 對應 xiaohuangwen path（spec 011）。
- `2026-05-15`：M5 PM Round 1 listModels + 下拉 UX 引入。
