# `<Spinner>` — Loading 指示器

> 跨 spec 共用 UI 元件。Canonical 規格由本檔定義。
> Status: `Ready`
> 引入：M5 Round 2（PM UX-5）

## 用途

依預估時長分三段顯示形式的 loading 指示器。超過 15s 自動顯示取消按鈕。

## Props

```ts
interface SpinnerProps {
  estimatedSeconds?: number;     // 預估完成秒數；決定顯示形式
  onCancel?: () => void;         // > 15s 時顯示取消按鈕
  message?: string;              // 自訂訊息覆寫預設「處理中…」
}
```

## 顯示分級

依 `estimatedSeconds` 與**實際經過時間**動態切換：

| 經過時間 | 顯示形式 |
|---|---|
| `< 3s` | 行內 `<svg>` 旋轉 spinner（小尺寸）|
| `3 ~ 15s` | spinner + 文字「處理中…（約 N 秒）」 |
| `> 15s` | spinner + 文字「處理中…（已 M 秒 / 約 N 秒）」+「取消」按鈕（若 `onCancel` 提供） |

## 各操作預期時長

| 操作 | 預期 | 取消可用 | 來源 spec |
|---|---|---|---|
| character-card-consolidator | 8~20s | 是 | 002 |
| chapter-writer build-prompt | < 200ms | 否（不顯示 spinner） | 005 |
| chapter-writer generate（首 chunk）| 1~3s | 是（中止 SSE） | 005 |
| chapter-writer structured generate（首 chunk）| 1~3s | 是（中止 stream） | 011 |
| status-updater | 5~30s | 是 | 007 |
| status-shortener | 5~15s | 是 | 007 |
| character-image-extractor（vision） | 8~30s | 是 | 002b |
| provider test-connection | 3~5s | 是 | 009 |
| provider listModels | 1~3s | 是 | 009 |
| provider balance query（xiaohuangwen） | 1~3s | 是 | 011 |
| portrait upload + resize | < 2s | 否 | 002b |
| polish-prose（首 chunk） | 1~3s | 是 | 012 |

## 使用位置

| spec | 位置 |
|---|---|
| 002 | AI 統整 / portrait 上傳 / portrait 解析 |
| 005 | generate 首 chunk 等待 |
| 007 | StatusUpdateIndicator |
| 009 | Test connection / listModels / balance refresh |
| 011 | xiaohuangwen structured generate / balance query |
| 012 | polish-prose 等待 |

## 實作位置

`apps/web/src/components/Spinner.tsx`

## 變更紀錄

- `2026-05-17`：從 spec 002 line 616~646 遷出建檔（M6 SA-1）；補 011 / 012 對應時長。
- `2026-05-15`：M5 PM Round 2 UX-5 引入。
