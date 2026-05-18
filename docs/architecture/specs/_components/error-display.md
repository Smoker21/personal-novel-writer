# Error 三層呈現 — inline / toast / modal

> 跨 spec 共用 UI 慣例。Canonical 規格由本檔定義。
> Status: `Ready`
> 引入：M5 Round 2（PM UX-6）

## 用途

統一錯誤呈現分級。依錯誤性質決定使用哪一層 — 避免 spec 各自決定造成 UX 不一致。

## 三層定義

| 層 | 用途 | UI |
|---|---|---|
| **(a) inline 紅字** | 欄位驗證錯誤（必填、格式不對、length 超限） | 欄位下方紅字 + 紅色邊框；不阻擋其他欄位 |
| **(b) toast** | 非阻擋性操作失敗（save 失敗、network blip、AI 統整失敗） | 右下角 toast，自動消失（5s）；可手動 dismiss；含「重試」按鈕 |
| **(c) modal** | 阻擋性錯誤（衝突、未設定 routing、stale draft 需確認） | 中央 modal，必須使用者明確選擇後才能繼續 |

## Error code 對應層

> 各 spec API 段所列 4xx/5xx 規範依此分類。

| Error code | 層 | 範例 |
|---|---|---|
| `INVALID_INPUT` / `INVALID_TITLE` / `INVALID_MODEL_ID` / `INVALID_FORMAT` / zod 驗證錯誤 | inline | 表單欄位下紅字 |
| `IO_ERROR` / `LLM_FAILED`（非首次嘗試）/ `EXTRACTION_PARSE_FAILED` | toast | 右下「✗ 失敗：<msg>。重試」|
| `ROUTING_NOT_CONFIGURED` / `DRAFT_STALE` / `MTIME_MISMATCH` / `ADOPT_IN_PROGRESS` / `RENAME_CONFLICT` | modal | 中央對話框含選項按鈕 |
| `QUOTA_EXHAUSTED`（xiaohuangwen 餘額不足）| toast | 右下「✗ 餘額不足。前往設定頁查餘額」|
| `OPERATION_NOT_SUPPORTED`（structured-only provider 收到 unstructured 請求）| toast | 開發階段保護網；正常 UI 不該觸發 |

## Modal 模態性

| 場景 | 模態 |
|---|---|
| 一般阻擋性錯誤 modal | **dismissable** — ESC + click-outside 可取消 |
| FirstLaunchWarningDialog | **lock** — ESC 攔截 + backdrop noop + focus trap（spec 009 TD-9） |
| Settings reset 二次確認 | **dismissable**（spec 009 UX-7） |
| Adopt dirty draft 三按鈕確認 | **dismissable**（spec 006） |

## Props（toast / modal 各自實作）

```ts
// toast
interface ToastErrorProps {
  message: string;
  errorCode?: string;
  onRetry?: () => void;
  autoDismissMs?: number;        // 預設 5000
}

// modal
interface ErrorModalProps {
  title: string;
  message: string;
  errorCode?: string;
  actions: Array<{ label: string; variant: "primary" | "secondary" | "danger"; onClick: () => void }>;
  dismissable: boolean;          // 預設 true；FirstLaunchWarning 為 false
}
```

inline 紅字無需獨立元件，由各表單欄位元件自行渲染。

## 使用位置

| spec | 用到的層 |
|---|---|
| 002 | inline（欄位驗證）/ toast（save 失敗 / consolidate 失敗） |
| 003 | toast（save 失敗）/ inline（標題格式） |
| 005 | modal（ROUTING_NOT_CONFIGURED）/ toast（LLM_FAILED）|
| 006 | modal（DRAFT_STALE / dirty draft 三按鈕）|
| 007 | toast（status-updater 失敗 / status-shortener 失敗） |
| 009 | inline（INVALID_MODEL_ID）/ toast（LIST_MODELS_FAILED）/ modal（reset 二次確認 / FirstLaunchWarning lock） |
| 011 | toast（QUOTA_EXHAUSTED / balance 查詢失敗）|
| 012 | toast（polish-prose 失敗 / 選段為空）|

## 實作位置

- `apps/web/src/components/ToastError.tsx`
- `apps/web/src/components/ErrorModal.tsx`
- inline 紅字由各 form field 元件內部渲染

## 變更紀錄

- `2026-05-17`：從 spec 002 line 648~671 遷出建檔（M6 SA-1）；補 011 / 012 對應 + `QUOTA_EXHAUSTED` / `OPERATION_NOT_SUPPORTED`。
- `2026-05-15`：M5 PM Round 2 UX-6 引入。
