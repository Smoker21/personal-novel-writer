---
name: character-card-consolidator
type: skill
description: Read structured character card fields (frontmatter) and produce a coherent 200-500 character Chinese narrative describing the character (used as the body of characters/<slug>.md). Single-shot operation. Does NOT invent facts not in the input fields, does NOT receive style.md (character cards are setting documents, not novel prose).
---

# 角色卡統整員 (`character-card-consolidator`)

> **這是什麼**：讀角色卡的 6 區塊 frontmatter 欄位（基本 / 個性 / 外貌 / 對話 / 關係 / 親密），輸出 200~500 字的連貫中文敘述，作為 `characters/<slug>.md` 的 body 段。
> **何時用**：使用者在角色編輯面板按「AI 生成角色描述」按鈕（Spec 002）。
> **不做什麼**：不發明使用者沒填的事實；不寫小說正文；不更新章節 / status；不**受 `style.md` 影響**（角色卡是設定文件，不是小說正文）。

> Status: `Designed`
> Owner spec: `docs/skills/character-card-consolidator.md`（本檔）
> Owner prompt: `packages/prompt-library/skills/character-card-consolidator.ts`
> Linked specs: [002](../architecture/specs/002-edit-character-card.md)
> Linked stories: [002](../requirements/stories/002-edit-character-card.md)

## 1. 操作定位

把使用者「打勾選 + 填欄位」的結構化資訊，翻譯成 chapter-writer 真正會讀的**連貫敘述**。一次操作，明確輸入輸出。

為何需要這個 Skill：

- 使用者偏好「選標籤」（內向、INFJ、雙魚座）；chapter-writer 偏好「具體行為描寫」（思考時微微皺眉、對熟人才放鬆）
- 這個 Skill 是中介翻譯：標籤 → 行為描寫
- 評估結果（TC-08 8-1/8-2）證明「具體行為描寫」遠勝「人格標籤」

## 2. 使用情境

- **觸發點**：
  - Spec 002 新增角色：使用者填完欄位後按「AI 生成角色描述」
  - Spec 002 編輯角色：使用者改欄位後按「AI 重生成」
- **使用者目的**：取得連貫敘述當 body；不必親手寫 300 字段落
- **服務的 persona**：`worldbuilder-author`（最常用，會大量建角色卡）、其他 persona 偶爾用

## 3. 輸入合約

```ts
interface CharacterCardConsolidatorInput {
  fields: CharacterFields;                       // 完整 frontmatter 結構（見 Spec 002）
  // 不傳已生成的 body（每次重新生成，不基於上次微調）
}
```

`CharacterFields` 完整定義見 Spec 002；包含：

1. 身分基礎（name 必填；age / gender / pronoun / role 可選）
2. 個性參考（personalityTags / mbti / zodiac / bloodType / culturalBackground）
3. 外貌參考（heightCm / bodyType / hairAndColor / eyes / otherFeatures）
4. 對話與寫作（dialoguePace / wordingPreference / writingAvoid）
5. 與其他角色的關係（relations，自由文字）
6. 親密場景描寫參考（intimateAppendix，可選）

**不會有的東西**：

- `body`（已生成的敘述）— 每次都從 fields 重新生成
- `writingStyle` / `style.md` — 明確排除
- 其他角色卡
- 章節 / status 資訊
- userIntent

## 4. 輸出合約

```ts
interface CharacterCardConsolidatorOutput {
  body: string;                                  // 200~500 中文字連貫敘述
  oneLineSummary: string;                        // _index.md 用的一句話，例「30 歲女作家，內向敏感」
}
```

**格式要求**：

- `body`：3-4 個自然段（用空行分），純散文無 heading 無 list
- `oneLineSummary`：< 40 中文字，格式為「<年齡><性別>，<最突出特徵>」
- 純文字；無 frontmatter / heading / fence / 解釋

## 5. System prompt

```
你是小說人物設定的統整員。讀使用者填的角色卡欄位（YAML frontmatter），產出
一段連貫的中文敘述，作為角色卡的 body 段。

【嚴格規則 — 不可違反】

1. **不發明事實**：只用使用者填的欄位內容，不臆測未填的設定。
   - 例：使用者沒填職業 → 不可寫「她是一名作家」；可暗示思考方式但不直接賦予職業
   - 例：使用者沒填家庭背景 → 不可寫「童年喪母」
2. **保留角色名字元**：name 欄位的字元在 body 中一字不差
3. **繁體中文**：避免簡體字、大陸用語、英文夾雜
4. **不加 disclaimer**：不寫「以下是角色設定…」「希望這個描述符合您…」之類
5. **不寫小說正文**：本任務是「設定敘述」，不是小說片段
   - ❌ 寫場景對話、寫她當下在做什麼
   - ✅ 寫她平常的個性、習慣、外觀剪影
6. **親密欄位的處理**：
   - `intimateAppendix` 為 null：完全不提身體 measurement 與親密偏好
   - `intimateAppendix` 有內容：**不**寫入 body；它是給「成人題材場景」單獨用的參考區，不污染一般場景
7. **避免「<personalityTag> 標籤式」描寫**：
   - ❌ 「她是個內向、含蓄、敏感的人」（標籤堆砌）
   - ✅ 「她思考時習慣性微微皺眉，對陌生人話少；對熟人才會放鬆」（具體行為）
8. **wordingPreference / writingAvoid 必須轉述**：
   - 例：writingAvoid = "避免讓她說過於肯定的句子" → body 中包含對應描述

【輸出格式】

回傳 JSON：

{
  "body": "<3-4 段中文敘述>",
  "oneLineSummary": "<一句話，<40 字>"
}

**不加 markdown code fence；不加說明文字；直接回 JSON。**

【body 結構建議】

3-4 段，依需要包含：

- 段 1：個性與行為模式（從 personalityTags + mbti + zodiac + dialoguePace + wordingPreference + writingAvoid 翻譯）
- 段 2：容貌剪影（從 heightCm + bodyType + hairAndColor + eyes + otherFeatures 翻譯）
- 段 3：文化 / 背景（從 culturalBackground 翻譯；若該欄為空則省此段）
- 段 4：與其他角色的關係（從 relations 翻譯；若該欄為空則省此段）

字數控制：200-500 中文字。`oneLineSummary` < 40 字。

【tone】

中性、客觀、設定書語氣。不戲劇化、不褒貶、不抒情。
```

## 6. 模型建議

**雲端首選**：`anthropic:claude-haiku-4-5`
- 任務單純，haiku 級別足夠；成本低
- 中文設定書語氣穩定

**雲端備援**：
- `openai:gpt-4.1-mini`
- `google:gemini-2.5-flash`

**地端首選**：
- `lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus`（評估表現好）
- `ollama:qwen2.5:14b`

**地端最小可行**：
- `ollama:qwen2.5:7b`（任務單純可勝任；JSON 格式遵循需 prompt engineering）

**最小 context window**：4096 tokens
- 輸入：fields YAML（300-800 tokens）+ system prompt（500 tokens） ≈ 1500
- 輸出：body 200-500 中文字 ≈ 400-800 tokens
- 通常 < 3000 tokens

## 7. 驗收標準（golden test）

- [ ] **輸出為合法 JSON**：可被 `JSON.parse` 消化；無 markdown code fence
- [ ] **schema 對應**：含 `body`（string）+ `oneLineSummary`（string）
- [ ] **角色名一致**：`fields.name` 在 body 中字元完全保留
- [ ] **不發明事實**：body 中所有具體斷言可在 fields 中找到對應依據（人工抽樣或 LLM-as-judge）
- [ ] **字數合規**：body 落在 200~500 中文字 ±10%；oneLineSummary < 40 中文字
- [ ] **不寫小說正文**：body 不含對話 markers（「」“ ”）、場景描寫（「她在...房間裡」）；只有設定敘述
- [ ] **無 disclaimer**：body 不含「以下」「希望」「(註：」「設定如下」之類
- [ ] **親密欄位 isolation**：當 `intimateAppendix` 有內容時，body 中不出現 bodyMeasurements 數字 / preferences 內容
- [ ] **wordingPreference / writingAvoid 覆蓋**：若這兩欄非空，body 中必有對應描述
- [ ] **無大量簡體**：簡體字比例 < 5%

## 8. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|---|---|---|
| 模型發明職業 / 家庭背景 | 違反規則 #1 | golden test 抽樣比對；prompt 強調 |
| 模型輸出標籤堆砌 | 違反規則 #7 | prompt 給 ✓/✗ 範例（已加） |
| 模型把親密欄位寫進 body | 違反規則 #6 | prompt 明示「親密區隔」；golden test 偵測 bodyMeasurements 數字洩漏 |
| 模型寫成小說片段（含對話） | 違反規則 #5 | prompt 強調「設定書 vs 小說正文」；golden test 偵測引號 |
| 模型加 markdown fence | JSON parse 失敗 | 後處理 strip；Spec 002 接收方層 try-parse |
| 模型不寫 oneLineSummary 或寫太長 | schema 不對 / 違反字數 | zod schema 強制；前端顯示時 truncate |
| 7B 模型 JSON 格式不穩 | parse 失敗率高 | 評估後若 7B 不穩，提示詞加 few-shot example；最小可行調為 14B |
| 模型用簡體中文回應 | 違反規則 #3 | prompt 強調繁體；簡體比例 > 5% 視為不合格 |

## 9. 對 `_index.md` 的影響

回傳的 `oneLineSummary` 由 Spec 002 寫入 `characters/_index.md`：

```markdown
- [蘇晴](./蘇晴.md) — 30 歲女作家，內向敏感
```

格式由 Spec 002 控制，本 Skill 只提供文字。

## 版本紀錄

- `v0.1` (2026-05-12): 初版設計；依 Spec 002 與 model-evaluation TC-08 結果擬定
