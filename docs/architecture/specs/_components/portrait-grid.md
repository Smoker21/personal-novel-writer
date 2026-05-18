# `<PortraitGrid>` — 角色 portrait 卡片網格

> 跨 spec 共用 UI 元件。Canonical 規格由本檔定義。
> Status: `Ready`
> 引入：M5 PM Round 1（spec 002 重設計）

## 用途

CharactersPage 主視圖。以卡片網格呈現所有角色（portrait + 名稱 + 副標），支援即時搜尋、hover 操作、點擊進入編輯模式。

## 視覺結構

```
┌──────────────────────────────────────────────────────────────┐
│ ← 首頁 │ 角色  │ [搜尋: ___________ ▢] [+ 新增角色]            │
├──────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│ │ [圖]   │ │ [圖]   │ │ [icon] │ │ [icon] │                  │
│ │ 蘇晴   │ │ 林書言 │ │ 蕭母   │ │ 計程車 │                  │
│ │ 主角   │ │ 主角   │ │ 配角   │ │ 重要路人│                  │
│ └────────┘ └────────┘ └────────┘ └────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

## 元素規格

| 元素 | 規格 |
|---|---|
| Portrait | 來自 `characters/_assets/<slug>/default.{jpg/png/webp}`（Spec 002b）；無圖時 fallback 為角色定位 icon（主角 / 配角 / 反派 / 重要路人 對應 lucide-react icon） |
| 名稱 | frontmatter `name` |
| 副標 | frontmatter `role` 或 「（未設定定位）」 |
| Hover | 卡片浮起 + 顯示「編輯」「刪除」icon |
| Click | 進入該角色編輯模式（spec 002 核心區 + 5 tabs） |
| 搜尋框 | 即時 filter：`name` / `role` / `personalityTags` 任一 match（不分大小寫，NFC normalize 後 substring） |
| `+ 新增角色` | 第一張卡或工具列按鈕 → 開新建 dialog |

## CSS / Layout

- `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`
- 卡片寬度 ≥ 180px
- Portrait aspect-ratio 3:4

## Props

```ts
interface PortraitGridProps {
  characters: CharacterIndexRow[];     // 從 character_index SQLite cache
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCardClick: (slug: string) => void;
  onCardEdit: (slug: string) => void;  // hover icon
  onCardDelete: (slug: string) => void;
  onAddNew: () => void;
}

interface CharacterIndexRow {
  slug: string;
  name: string;
  role: string | null;                 // 主角 | 配角 | 反派 | 重要路人 | null
  defaultPortraitPath: string | null;
  personalityTags: string[];
}
```

## 使用位置

| spec | 位置 |
|---|---|
| 002 | CharactersPage 主視圖 |

## 實作位置

`apps/web/src/components/PortraitGrid.tsx`（與其子元件 `PortraitCard.tsx`）

## 變更紀錄

- `2026-05-17`：從 spec 002 line 418~447 遷出建檔（M6 SA-1）。
- `2026-05-15`：M5 PM Round 1 引入（取代 M4 的左欄清單模式）。
