---
name: <slug>
type: agent
description: <一行給 LLM / 系統的描述：這個 Agent 在什麼條件下被呼叫、輸入什麼、輸出什麼>
---

# <顯示名稱> (`<slug>`)

> **這是什麼**：<一句話：這個 Agent 為使用者做什麼>
> **何時用**：<觸發點 / 使用情境，例：使用者按「AI 撰寫本章」時>
> **不做什麼**：<明確排除，例：不修飾文字（那是 polish-prose 的事）；不更新狀態檔（那是 status-updater 的事）>

> Status: `Draft | Designed | Implemented | Deprecated`
> Owner spec: `docs/agents/<slug>.md`（本檔）
> Owner prompt: `packages/prompt-library/prompts/<slug>.ts`
> Linked stories: `<NNN>-...md`, ...

## 1. 角色定位

<一段話：這個 Agent 在系統中的位置與職責邊界>

## 2. 使用情境

- **觸發點**：UI 哪裡 / 哪個動作（例：在編輯器選取段落 → 右鍵「請劇情顧問」）
- **使用者目的**：當使用者觸發此 Agent 時，他在期待什麼
- **服務的 persona**：（指向 `docs/requirements/personas.md` 中的 id）

## 3. 輸入合約

上層（apps/api）呼叫此 Agent 時必須提供：

```ts
interface <Slug>Input {
  // 例
  selectedText: string;
  chapterSummary: string;
  charactersInScene: CharacterCard[];
  worldContext: string;
  userIntent?: string;
}
```

明確列出**不會**有的東西（例：整本小說、其他章節原文），讓提示詞據此設計。

## 4. 輸出合約

```ts
interface <Slug>Output {
  options: Array<{
    summary: string;
    direction: string;
    pros: string[];
    cons: string[];
  }>;
}
```

說明預期格式：純文字 / Markdown / JSON。若 JSON，提供 schema 並由 adapter 強制驗證。

## 5. System prompt

完整可貼。提示詞變動視為**版本變更**，每次修改在底下加版本紀錄。

```
你是一個小說寫作的 <角色>...

[完整提示詞]
```

## 6. 可呼叫的 Skill 與工具（若有）

此 Agent 在流程中可呼叫的 Skill（單次操作，例：`polish-prose`）或外部工具（例：查角色卡、檢索前文）。給出每項的名稱、輸入、輸出。

## 7. 模型建議

- **雲端首選**：`anthropic:claude-sonnet-4-6`（理由：...）
- **雲端備援**：`openai:gpt-X`、`google:gemini-X`
- **地端最小可行**：`ollama:qwen2.5:14b` 或更高（小於此規模的模型會...）
- **最小 context window**：N tokens（含上述輸入合約）

## 8. 驗收標準

至少 3 條可觀察的性質。Golden test 會以這些為基礎。

- [ ] 輸出為合法 JSON，符合 `<Slug>Output` schema
- [ ] `options` 陣列長度 ≥ 3
- [ ] 不修改 `charactersInScene` 中的角色名稱
- [ ] ...

## 9. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|------|----------|------|
| 上層未提供角色卡 | Agent 自創角色名 | 提示詞檢查欄位，若空則要求上層補；adapter 端做 schema 驗證 |
| 使用者輸入過短 | 方案過於空泛 | UI 端要求最少 N 字才能觸發 |
| ... | ... | ... |

## 版本紀錄

- `v0.1` (YYYY-MM-DD): 初版
