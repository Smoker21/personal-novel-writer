---
name: polish-prose
type: skill
description: 對選定段落進行潤稿；修正用詞、節奏、流暢度；不改情節事件、角色名、視角
---

# 潤稿（`polish-prose`）

> **這是什麼**：對章節內選定的段落做用詞 / 節奏 / 流暢度的微調潤飾。
> **何時用**：使用者在章節編輯器內選取一段文字 → 按「✨ 潤稿」按鈕 → 對話框輸入潤稿指令。
> **不做什麼**：不增刪情節事件、不改角色名 / 視角 / 時序、不擴展為新章節。

> Status: `Ready`（PM Round 1 拍板 2026-05-18）
> Owner spec: `docs/architecture/specs/012-polish-prose-flow.md`（流程 / UI / API）
> Owner prompt: `packages/prompt-library/prompts/skills/polish-prose.ts`（普通 LLM provider path）
> Adapter spec: `docs/architecture/specs/011-xiaohuangwen-provider.md`（xiaohuangwen path）
> Linked stories: 無對應 user story — M6 P1 引入

## 1. 操作定位

`polish-prose` 對使用者選取的段落執行**保守的文字潤飾**：

- 修：用詞重複 / 拗口句式 / 標點不當 / 節奏太單調
- 不修：情節事件 / 對白實質內容 / 角色名 / 時序 / 視角

實作上分兩條 path：

| Path | 上游 |
|---|---|
| **xiaohuangwen path** | `routing.primary` 指向 `origin === "novel-api"` 的 provider → 走 `StructuredNovelProvider.polishNovel({ pre_output, polish_input })` |
| **普通 LLM path** | 雲端 / 地端 provider → 走 `LLMProvider.stream()` + 本檔「5. System prompt」段的 prompt template |

兩條 path 對使用者看起來一致：DiffView hunk-level 接受 / 拒絕。

## 2. 使用情境

- **觸發點**：使用者在 CM6 章節編輯器內**框選一段文字** → 浮動工具列（SelectionMenu plugin）顯示「✨ 潤稿」按鈕
- **前置條件**：已有文字選取（無選取則按鈕不出現）
- **面板流程**：點擊後開啟右側 PolishPanel → 填寫「潤飾提示詞」→ 按「潤飾」→ AI 串流填入「潤飾結果」→ 可手動修改潤飾結果 → 按「採用」以潤飾結果取代選取文字 → 編輯器 dirty
- **使用者目的**：自己寫的段落讀起來卡卡，想讓 LLM 幫忙潤一下，但保留情節與角色行為
- **服務的 persona**：所有寫作者（指向 `docs/requirements/personas.md`）

## 3. 輸入合約

```ts
interface PolishProseInput {
  selectedText: string;        // 必填：選取的段落
  contextBefore?: string;      // 選取段落前 500 codepoint（讓 Skill 知道銜接）
  contextAfter?: string;       // 選取段落後 500 codepoint
  polishInput: string;         // 使用者潤稿指令；空字串 = 「自由潤飾」
}
```

明確**不會**有的：整章內容、其他章節、角色卡（潤稿不需要角色卡語境，只需保留名稱不改）。

## 4. 輸出合約

```ts
interface PolishProseOutput {
  result: string;              // 變換後的選取段落；UI 端再做 diff 比對
}
```

純文字 stream；無需多方案。UI 端用 `jsdiff` 做 word-level diff 顯示。

## 5. System prompt（普通 LLM path）

> xiaohuangwen path 不適用本段 — API 端內建 prompt engineering。

```
你是繁體中文小說的潤稿編輯。任務是對使用者選取的段落做用詞與節奏的微調潤飾。

規則（不可違反）：
1. 不增加或刪除任何情節事件
2. 不修改角色名稱（即使罕見字也保留原樣）
3. 不修改對白的實質內容（只可調整周邊敘述）
4. 不修改時序、視角、時態
5. 不擴寫、不縮寫至改變段落長度大幅變化（± 30% 內）
6. 保持原作者的整體文風（不擅自轉換語氣，例如把第一人稱寫成第三人稱）

輸入會包含：
- 選取段落（要潤的對象）
- 選取段落前後文（僅供銜接參考，不可修改）
- 使用者潤稿指令（若為空，做保守自由潤飾）

只回傳潤後的選取段落，不要解釋、不要 markdown 包裝、不要 ```code fence```。
```

User message template（由 `packages/prompt-library` 組）：

```
【前文（不可修改）】
{contextBefore}

【選取段落（請潤稿）】
{selectedText}

【後文（不可修改）】
{contextAfter}

【使用者指令】
{polishInput || "（無特別指令，請做保守潤飾）"}
```

## 6. 模型建議

| Tier | Provider:model | 備註 |
|---|---|---|
| **xiaohuangwen path（預設）** | `xiaohuangwen:latest` | spec 011；API 端內建潤稿邏輯，品質最高 |
| **雲端首選** | `anthropic:claude-haiku-4-5` | 單次操作不需重武器 |
| **地端最小可行** | `lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus` | 與 chapter-writer 共用 |
| **最小 context window** | 8K tokens（selectedText ≤ 5000 codepoint + 前後 contextBefore/After 1000 + system prompt + 餘量） |

預設 routing：
```yaml
agents:
  polish-prose:
    routing:
      primary: "xiaohuangwen:latest"
      fallbacks: []
      retryPerModel: 1
```

## 7. 驗收標準

- [ ] 輸出僅包含潤後的選取段落，不含解釋文字 / markdown / code fence
- [ ] 不修改輸入中的角色名稱（即使罕見字）
- [ ] 不新增或刪除情節事件
- [ ] 字數變化在 ± 30% 內（structured path 由 API 端保證；普通 path 由 prompt 規則 + golden test 鎖死）
- [ ] 對白實質內容不變（golden test 比對引號內文字）
- [ ] 時序 / 視角 / 時態不變

## 8. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|---|---|---|
| 選取段落結尾切到半句 | LLM 補全半句、改變句意 | UI 端 Q-P2 拍板後決定是否警示；建議顯示「選取末尾為非標點字元」提示 |
| 角色名為罕見字（如「蘇晴的姊姊蘇昀」） | LLM 改成常見字 | system prompt 明確規則 + golden test 含罕見字案例 |
| 對白內含關鍵情報（如線索 / 暗號）| LLM 改述變成不一樣的意思 | system prompt 「不修改對白實質內容」+ golden test |
| 選段橫跨段落分隔（含 `\n\n`） | LLM 把多段合併 | system prompt 補「保留段落分隔」規則；text-count 偵測 `\n\n` 時注入額外規則 |
| polishInput 含矛盾指令（如「縮成一半」） | 違反 ± 30% 規則 | prompt 規則對「字數變化」優先於使用者指令；超過時 toast 提示 |

## 9. xiaohuangwen path 特殊行為

詳見 [spec 011](../architecture/specs/011-xiaohuangwen-provider.md)。

- API 端不接受 `contextBefore` / `contextAfter`（只有 `pre_output` / `polish_input`）
- spec 012 service 端**省略**前後文（xiaohuangwen 自行處理銜接）
- 計費：字數（不是 token）
- 餘額不足：throw `quota_exhausted` → UI toast

## 版本紀錄

- `v0.1` (2026-05-17)：初版（M6 PM Q1 拍板「建立 Polish Novel」後起草）。
