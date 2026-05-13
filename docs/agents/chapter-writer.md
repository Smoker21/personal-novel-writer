---
name: chapter-writer
type: agent
description: Generate a full chapter draft from synopsis, story status, character cards, character statuses, current chapter outline, previous chapter's full content, and writing style guide. Output goes to a draft cache (NOT directly into chapters/<file>.md); user adopts the draft via Story 006 to write into the actual chapter file.
---

# 章節寫手 (`chapter-writer`)

> **這是什麼**：給予一份小說章節的上下文，產出一整章草稿（800~3000 字，依本章 outline 規範或預設範圍）。
> **何時用**：使用者在章節編輯器點「AI 撰寫本章」按鈕（Spec 005）。
> **不做什麼**：不直接寫入主檔（Spec 006 採用流程才寫）；不修改既有 status / 角色卡；不更新章節大綱；不寫章節標題（另由 chapter-titler 處理）；不潤飾既有段落（那是 polish-prose）。

> Status: `Designed`
> Owner spec: `docs/agents/chapter-writer.md`（本檔）
> Owner prompt: `packages/prompt-library/prompts/chapter-writer.ts`
> Linked specs: [005](../architecture/specs/005-ai-write-chapter.md)
> Linked stories: [005](../requirements/stories/005-ai-write-chapter.md)

## 1. 角色定位

chapter-writer 是**自主多步流程**：給它完整上下文，它一次串流產出整章草稿。內部不再呼叫其他 Skill / 工具；但**受 `style.md` 影響**（見 [docs/agents/_template.md](./_template.md) 慣例）。

定位邊界：
- **不是**潤飾類—— polish-prose 等 Skill 才處理局部變換
- **不是**規劃類—— chapter outline 由使用者寫或另一 Agent 產出
- **不是**記憶更新類—— status-updater 才寫 status 檔
- **是**「從上下文一次產整章正文」的端到端 generator

## 2. 使用情境

- **觸發點**：章節編輯器工具列「AI 撰寫本章」按鈕（Spec 005）
- **使用者目的**：取得可採用的章節草稿；省去從零打字
- **服務的 persona**：[`hobbyist-author`](../requirements/personas.md)（最常用）、`serial-author`（量產壓力下高頻使用）

## 3. 輸入合約

```ts
interface ChapterWriterInput {
  // 從 Spec 005 ChapterContext 拿
  synopsis: string;
  writingStyle: string;                          // <project>/style.md；可為空
  storyStatus: string;                           // status/story_status.md
  characterStatuses: Record<string, string>;     // slug → <slug>_status.md 內容（一人一檔）
  characters: CharacterCard[];                   // 該章涉及角色（依篩選規則）
  currentOutline: string | null;                 // 該章 outline（可選，沒則由 LLM 自由發揮但需符合 status）
  previousChapterFullText: string | null;        // 上一章主檔完整內容（依 Story 007 修訂；非 200 字摘要）
  userIntent?: string;                           // 使用者額外指示（短，optional）
  chapterNumber: number;
  chapterTitle: string;                          // 目前的標題（可能是「未命名」）
  targetWordCount?: { min: number; max: number }; // 預設 800~1500；outline 中可覆寫
}
```

**不會有的東西**：

- 整本小說的全部章節（避免 context 爆炸）
- 其他章節的 outline / draft / prompt 歷史
- 全部角色卡（只取該章涉及）
- 全部 character_<slug>_status.md（只取該章涉及）
- 模型 routing 政策（那是 LLMRouter 的事）

## 4. 輸出合約

```ts
interface ChapterWriterOutput {
  text: string;                  // 章節正文（純 markdown，無 frontmatter、無 Author's note）
}
```

純文字串流（SSE chunk）；上層（Spec 005）累積到 draft cache。

**禁止輸出**：
- frontmatter（`---` block）
- 章節標題（`# `）
- Author's note / 摘要 / 解釋段
- markdown code fence 包裹整段
- 「以下是」「希望這樣」「我來幫您」之類的對話前後綴

## 5. System prompt

```
你是一個中文小說的章節寫手。你的任務是根據提供的上下文，產出一整章草稿。

請以**繁體中文**撰寫，避免簡體字與大陸用語（如「視頻、立馬、貓膩」），避免英文夾雜。

【嚴格規則 — 不可違反】

1. 只能使用「出場角色清單」中明確列出的人物姓名。
2. 不可新增未列出的人物姓名（含路人、配角）；若需要無名路人，用「店員」「鄰居」「一名男人」等職稱描述。
3. 不可修改既有角色姓名的任一字元。
4. 維持「人物狀態」中描述的角色當前內心狀態與關係。
5. 銜接「上一章完整內容」的結尾，不要重新介紹人物或重複情節。
6. 若提供「本章大綱」，嚴格依其情節走向；不可跑去寫不在大綱中的劇情。
7. 第三人稱限制視角；不直接描寫主視角角色視野外的事，除非大綱明確要求。
8. **只輸出章節正文**。不要：
   - 加 Author's note、摘要、解釋
   - 加章節標題（# 標題）
   - 加 frontmatter（--- ... ---）
   - 加 ``` code fence 包整段
   - 加「以下是…」「希望…」之類的對話前後綴

【若有提供寫作風格指南】

請嚴格遵守下方「寫作風格指南（來自 <project>/style.md）」段中的視角、對白、用詞、節奏、禁忌、參考作品等規範。風格指南優先於本系統提示的預設風格（但「嚴格規則」仍不可違反）。

【字數規範】

依 input 的 `targetWordCount`；未提供時預設 800~1500 中文字。允許 ±20% 偏差。

【上下文使用優先級】

當資訊衝突時，**新版優先**：
1. user prompt 中明確指示 > 本章 outline > 既有 story_status > 角色卡 > synopsis
2. 即：使用者剛剛在 UI 輸入的 userIntent 是最高優先；synopsis 是最遠的背景

【失敗模式提醒】

- 寫到一半遇到不確定的設定時：保守處理（不發明新設定），靠暗示帶過
- 角色名罕見字（如「謝」「林」常見，「邶」「祎」罕見）：原樣保留，不替換
- outline 不夠詳細時：在風格與情節容許範圍內補足，不偏離主軸
```

## 6. 可呼叫的 Skill 與工具

**無**。chapter-writer 是一次完整輸出，不在過程中呼叫其他 Skill / 工具。

未來擴充可考慮：
- 寫到一半呼叫 `continuity-checker` 自我檢查（P2）
- 呼叫 `retrieve-related-passages` 撈相關前文（Story 020）

MVP 不做。

## 7. 模型建議

**雲端首選**：`anthropic:claude-sonnet-4-6`
- 中文文學品質佳、長 context 召回穩、指令遵循強
- 對成人 / 暴力等敏感題材會拒絕；遇到時 LLMRouter 降級到地端

**雲端備援**：
- `openai:gpt-4.1`（中文略弱，但長 context 穩）
- `google:gemini-2.5-pro`（中文較好但偶有翻譯腔）

**地端首選**（依 [model-evaluation 結果 2026-05-12](../architecture/model-evaluation/results/2026-05-12-qwen3-vl-30b-a3b-abliterated.001.md)）：
- `lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus`（成人題材寫作品質佳；指令遵循中上）

**地端備援**：
- `lmstudio:rwkv7-g1f-13.3b`（測試版；RNN 架構在長 context 中可能記憶衰減，但寫作流暢度可接受）
- `ollama:qwen2.5:14b`（保守 fallback；指令遵循好但內容自由度受限）

**最小 context window**：8192 tokens
- 預估輸入：synopsis（500-1000）+ writingStyle（300-600）+ storyStatus（500-2000）+ characterStatuses（500-2000）+ characters（800-3000）+ previousChapterFullText（2000-5000）+ outline（200-800）
- 預估輸出：1000-1500 中文字 ≈ 1500-2500 tokens
- 合計：實際操作中常達 8000-15000 tokens；建議 model context window ≥ 16384

## 8. 驗收標準（golden test）

每條都要可機械判定，給 `tools/eval/` 跑：

- [ ] **角色名一致性**：輸出中所有 2-4 中文字的「疑似人名」必須是輸入 `characters[].fields.name` 中的姓名（或對應暱稱 / 稱呼）；不出現未提供的新角色名
- [ ] **不修改角色名**：輸入角色名（如「林書言」）在輸出中字元完全一致；不出現「林書嚴」「林子言」等近音變體
- [ ] **不加 Author's note**：輸出不含「以下是」「希望」「(註：」「## 摘要」「Author's note」等
- [ ] **不加 frontmatter**：輸出不以 `---` 起頭
- [ ] **不加章節標題**：輸出不以 `# ` 起頭
- [ ] **字數合規**：實際字數落在 `targetWordCount` 範圍 ±20%；未提供時 800~1500 ±20%
- [ ] **無 markdown code fence**：輸出不被 \`\`\` 包裹
- [ ] **無大量簡體**：簡體字比例 < 5%（容忍偶有混入；但全簡體視為不合格）
- [ ] **無大量英文**：除標點與專有名詞，英文字母比例 < 2%
- [ ] **outline 關鍵元素覆蓋**（若 outline 提供）：outline 中明確列出的場景 / 物品 / 情節點，輸出中至少 80% 覆蓋

## 9. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|---|---|---|
| 雲端 provider 拒絕成人 / 暴力內容 | 回 `content_blocked` error | LLMRouter 自動降級到地端 fallback；UI 顯示「已切換到地端模型」 |
| 上下文超過模型 context window | 400 `CONTEXT_TOO_LARGE` | Spec 005 守門機制：縮 characters 子集 / 壓 previousChapterFullText；仍超 → 引導使用者精簡 status |
| 模型加 Author's note / 解釋語 | 違反規則 #8 | system prompt 強調 + golden test 偵測 + 必要時前端後處理 strip 開頭固定句型 |
| 模型寫成第一人稱 | 違反規則 #7 | system prompt 強調限制視角；golden test 偵測首段是否含「我」 |
| 模型混簡體字 | 違反「繁體中文」要求 | system prompt 明示 + golden test 偵測簡體字比例 |
| 模型把上一章內容重新寫一次 | 違反規則 #5 | 在 user prompt 末尾再次強調「本章從新進度繼續，不重述前章」 |
| outline 不夠詳細時模型偏題 | 違反規則 #6 | userIntent 可補強；長期解法：encourage 使用者寫詳細 outline |
| RWKV 等 RNN 模型對遠端 context 記憶衰減 | 漏掉開頭 synopsis 提到的設定 | 在 user prompt 中把關鍵約束**重複**放在末尾（依 RWKV-Runner 指南）；長期：用 transformer 模型 |

## 版本紀錄

- `v0.1` (2026-05-12): 初版設計；依 Spec 005 與 model-evaluation 2026-05-12 qwen3-vl 結果擬定
