# <Story 標題：簡短動詞短語，例「回溯章節版本」>

> Story ID: `<NNN>-<verb-noun-slug>`
> Persona: `<persona-name>`（見 personas.md）
> Epic: `<EPIC-XX-slug>` 或 `unassigned`
> Priority: `P0 | P1 | P2`
> Size: `S | M | L | XL`
> Status: `Draft | Ready | In Progress | Done`
> Depends on: `<其他 story id 或 'none'>`

## 使用者故事

身為 **<persona>**，
我想要 **<能做的事>**，
以便 **<取得的價值>**。

## 背景與動機

<為什麼此 story 重要？解決什麼痛點？2-4 句話即可，不寫實作細節>

## 範圍

**包含：**
- <做什麼>

**不包含：**
- <明確排除什麼，避免 scope creep>

## 驗收條件 (Gherkin)

### Scenario: <Happy path 名稱>
```gherkin
Given <初始情境>
And <附加條件>
When <使用者動作>
Then <可觀察結果>
And <次要結果>
```

### Scenario: <Edge / Error 名稱>
```gherkin
Given <異常情境>
When <使用者動作>
Then <錯誤處理或保護結果>
```

<!-- 至少 1 個 happy path + 1 個 edge/error。AI 功能類 story 額外需要至少 1 個品質性質場景 -->

## AI 互動細節（若涉及 AI 代理才填）

- 觸發點：<UI 哪裡 / 哪個動作>
- 上下文：<餵什麼資料給代理>
- 預期 Agent / Skill：<指向 docs/agents/<slug>.md 或 docs/skills/<slug>.md；若尚未設計則註記 "TBD by ai-agent-designer">
- 品質保證：<如何驗收主觀輸出，例「不變更角色名」「至少 3 方案」>

## UX 注意事項

<鍵盤捷徑、無障礙、效能（章節長度敏感）等。不寫視覺細節>

## 開放問題

- [ ] <尚未確認的事>
