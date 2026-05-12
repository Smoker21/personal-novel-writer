---
name: <slug>
type: skill
description: <一行給 LLM / 系統的描述：對什麼樣的選取輸入做什麼變換>
---

# <顯示名稱> (`<slug>`)

> **這是什麼**：<一句話：對選取文字做什麼變換>
> **何時用**：<觸發點，例：使用者選取段落後右鍵 →「<顯示名稱>」>
> **不做什麼**：<明確排除，例：不變更角色名、不增刪情節、不跨段落>

> Status: `Draft | Designed | Implemented | Deprecated`
> Owner spec: `docs/skills/<slug>.md`（本檔）
> Owner prompt: `packages/prompt-library/prompts/skills/<slug>.ts`
> Linked stories: `<NNN>-...md`, ...

## 1. 操作定位

<一段話：這個 Skill 對輸入做什麼變換、不做什麼變換>

## 2. 使用情境

- **觸發點**：選取文字 → 工具列 / 右鍵 / 快捷鍵
- **使用者目的**：使用者期待這次操作達到什麼效果
- **服務的 persona**：（指向 `docs/requirements/personas.md`）

## 3. 輸入合約

```ts
interface <Slug>Input {
  selectedText: string;        // 必填：選取的段落
  contextBefore?: string;      // 選取段落前 N 字（讓 Skill 不破壞銜接）
  contextAfter?: string;
  characters?: CharacterCard[]; // 該段落出現的角色
  userIntent?: string;          // 使用者輸入的額外指示（optional）
  styleHints?: string;          // 從 project.yaml 帶入的寫作風格
}
```

明確列出**不會**有的東西（例：整章內容、其他章節）。

## 4. 輸出合約

```ts
interface <Slug>Output {
  result: string;              // 變換後的文字，可直接取代 selectedText
  notes?: string[];            // optional：給使用者的說明（例：「保留角色名 / 縮短 28%」）
}
```

純文字優先；若需多方案改回 Agent 設計（Skill 是單次操作）。

## 5. System prompt

```
你是一個 <角色>，任務是 <動作>。

規則（不可違反）：
1. 不修改 <forbidden 1>
2. 不修改 <forbidden 2>
3. ...

輸入會包含：
- 選取段落
- 選取段落前後文（僅供銜接參考，不可修改）
- 角色清單（僅供保持名稱一致，不可新增 / 刪除角色）

只回傳變換後的選取段落，不要解釋。
```

## 6. 模型建議

- **雲端首選**：`anthropic:claude-haiku-4-5`（單次操作不需重武器）
- **地端最小可行**：`ollama:qwen2.5:7b`
- **最小 context window**：N tokens（選取 + 前後文 + 角色卡）

## 7. 驗收標準

- [ ] 輸出僅包含變換後的選取段落，不含解釋文字
- [ ] 不修改輸入中的角色名稱
- [ ] 不新增或刪除情節事件
- [ ] 字數變化 <X% 或 >X%（依 Skill 性質）
- [ ] ...

## 8. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|------|----------|------|
| 選取段落含半句 | Skill 補全半句改變句意 | UI 端禁止選取末尾不完整 |
| 角色名是罕見字 | Skill 改成常見字 | 提示詞強調原樣保留 |
| ... | ... | ... |

## 版本紀錄

- `v0.1` (YYYY-MM-DD): 初版
