# 技術規格 (Specs)

`docs/requirements/stories/` 是「使用者想要什麼」，本資料夾是「我們要怎麼做」。

每份 spec 對應一個 user story，由 `spec-architect` 子代理產生。dev 動工前必讀對應 spec；無 spec 或 spec 為 `Draft` 時不得動工。

## 結構

```
specs/
├── README.md            # 本檔
├── _template.md         # 規格範本
└── <NNN>-<slug>.md      # 與 docs/requirements/stories/<NNN>-... 一一對應
```

## Status flow

```
Draft   → 待釐清，dev 不可動工
Ready   → 內容完整、cross-story 審查通過
Frozen  → dev 已開始實作，變更需走 ADR
```

## 索引

| Story | Spec | Status |
|-------|------|--------|
| [001](../../requirements/stories/001-create-novel-project.md) | [001](./001-create-novel-project.md) 建立新小說專案 | Ready |
| [002](../../requirements/stories/002-edit-character-card.md) | [002](./002-edit-character-card.md) 角色卡（含 portrait/appearanceByChapter schema） | Ready |
| [002b](../../requirements/stories/002b-character-card-from-image.md) | [002b](./002b-character-card-from-image.md) 角色卡：圖片上傳 + vision 解析 | Ready 2026-05-13 |
| [003](../../requirements/stories/003-edit-chapter-basic.md) | [003](./003-edit-chapter-basic.md) 章節編輯器（兩層儲存） | Ready |
| [005](../../requirements/stories/005-ai-write-chapter.md) | [005](./005-ai-write-chapter.md) AI 撰寫單章（含 currentAppearance 章節敏感 lookup） | Ready 2026-05-13 |
| [006](../../requirements/stories/006-adopt-chapter-draft.md) | [006](./006-adopt-chapter-draft.md) 採用 AI 草稿並歸檔 | Ready |
| [007](../../requirements/stories/007-update-story-character-status.md) | [007](./007-update-story-character-status.md) status-updater | Ready |
| [008](../../requirements/stories/008-open-existing-project.md) | [008](./008-open-existing-project.md) 開啟既有專案 | Ready |
| [009](../../requirements/stories/009-settings-page.md) | [009](./009-settings-page.md) 設定頁（含 Story 032 首次警語） | Ready |
| [010](../../requirements/stories/010-git-version-control.md) | [010](./010-git-version-control.md) Git 版控 | Ready |
