# `_components/` — 跨 spec 共用 UI 元件 canonical 規格

> 本目錄存放**跨 spec 共用的 UI 元件**規格。
> 由 M6 D4 拍板（2026-05-17）建立 — 把原本散落在 spec 002 / 009 的共用元件規格獨立出來。
>
> **新 spec 起手流程（D4）**：
> 1. spec-architect 起新 spec 前，先讀本 `_index.md`
> 2. 識別新 UI 需求中哪些是共用、哪些是 spec-local
> 3. 共用 → 寫新 `_components/<name>.md`（或補進既有）
> 4. spec 主檔 cross-reference 即可

## 索引

| 元件 | 用途 | 使用 spec |
|---|---|---|
| [`expandable-textarea.md`](./expandable-textarea.md) | 多行 textarea inline ↔ modal 全螢幕切換 | 002 / 003 / 005 / 007 / 009 / 012 |
| [`portrait-grid.md`](./portrait-grid.md) | 角色卡片 grid 視圖（縮圖 + 搜尋 + 新增）| 002 |
| [`spinner.md`](./spinner.md) | Loading spinner，依預估時長分三段顯示形式 | 002 / 005 / 007 / 009 / 011 / 012 |
| [`error-display.md`](./error-display.md) | Error 三層呈現（inline / toast / modal） | 002 / 003 / 005 / 006 / 007 / 009 / 011 / 012 |
| [`model-dropdown.md`](./model-dropdown.md) | Provider 模型下拉選單（24h cache + manual refresh） | 009 |

## 規範

- 每個元件**單一檔案**，包含：用途、props、行為、使用位置、變更紀錄
- 各 spec 主檔**禁止重複定義** props / 行為 — 只能寫「使用位置 + 一句話用途」+ link
- 元件規格變更時更新本 `_index.md` 與該檔的「變更紀錄」段；若 props 介面有 breaking change，影響到的 spec 全部標記回 `Draft` 並走 PM round
- 元件實作位置：`apps/web/src/components/`（共用元件目錄，不歸屬任一 feature folder）

## 變更紀錄

- `2026-05-17`：初版。建立 5 個元件規格（從 spec 002 / 009 遷出）。
