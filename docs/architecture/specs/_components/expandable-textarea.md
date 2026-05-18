# `<ExpandableTextarea>` — 多行 textarea inline ↔ modal 切換

> 跨 spec 共用 UI 元件。Canonical 規格由本檔定義。
> Status: `Ready`
> 引入：M5 Round 2（PM UX-1）

## 用途

多行文字輸入元件，支援「inline 行內顯示」與「modal 全螢幕擴大」兩種模式無縫切換，編輯內容永遠同步。

## Props

```ts
interface ExpandableTextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minRowsInline?: number;        // 預設 6
  maxLength?: number;            // 預設無限
  label?: string;                // expanded modal 標題用
  ariaLabel?: string;
  disabled?: boolean;
}
```

## 行為

| 模式 | 行為 |
|---|---|
| **Inline 模式（預設）** | 多行 textarea，`min-rows={minRowsInline}` 預設 6；右上角 `⛶` icon（lucide-react `Maximize2`）；右下角字數計數 `<N> 字` |
| **Expanded 模式** | 點 `⛶` → 開 modal；textarea 撐 **80vh × 80vw**；modal backdrop 略暗（不全黑）；textarea focus 自動移入 |
| **收回 inline** | (a) 點 modal 右上 `⛟` icon（`Minimize2`）；(b) 按 ESC；(c) 點 backdrop — **dismissable modality**，與 FirstLaunchWarning 的 lock modal 對比 |
| **資料同步** | `onChange` 即時回呼 parent；inline / expanded 共用同一 `value` 來源；關 modal **不**丟資料、**不**需「儲存」按鈕 |
| **字數計數** | 中文字 + 半形字元都算 1 字（使用 `packages/shared-types/src/text-count.ts`）；超過 `maxLength` 紅字 |
| **placeholder** | 灰字輔助文字；對應 PM UX「填寫內容需要灰色內容輔助輸入」P1 |

## 使用位置

| spec | 位置 |
|---|---|
| 002 | 「角色描述（手動）」+「AI 統整敘述」（核心區兩段） |
| 003 | 本章劇情大綱 / 本章寫作需求 / system prompt 本章覆寫 / PromptPreviewModal 內 prompt 編輯區 |
| 005 | PromptPreviewModal 內 promptText 編輯區；structured generate path 的五欄結構化編輯 |
| 007 | StatusEditorPage 編輯區（story_status / character_status）+ status-shortener review textarea |
| 009 | `AgentRoutingCard.systemPromptOverride` textarea |
| 012 | polish-prose 對話框「潤稿指令」+「原文預覽」（read-only mode）|

## 實作位置

`apps/web/src/components/ExpandableTextarea.tsx`

## 變更紀錄

- `2026-05-17`：從 spec 002 line 580~614 遷出建檔（M6 SA-1）。
- `2026-05-15`：M5 PM Round 2 UX-1 引入。
