---
name: status-updater
type: skill
description: Read a freshly written chapter plus existing story_status.md and the chapter's relevant character_<slug>_status.md files, output updated versions of those status files. Single-shot operation; no streaming, no multi-step. Does NOT update style.md, character cards, or chapter content.
---

# 故事狀態更新員 (`status-updater`)

> **這是什麼**：讀剛寫入的章節主檔 + 既有 story_status.md + 該章涉及角色的 `<slug>_status.md` + 角色卡，產出新版的 story_status.md 與 character_<slug>_status.md。
> **何時用**：使用者按「儲存」（Spec 003）/ 「採用」（Spec 006）/ 「立刻更新狀態」按鈕觸發；由 Spec 007 服務呼叫。
> **不做什麼**：不寫小說正文；不修改 style.md / 角色卡 / 章節主檔；不主動建立未在角色卡中的新角色（即使章節提到）；不**受 `style.md` 影響**（這是設定文件處理，不是文學寫作）。

> Status: `Designed`
> Owner spec: `docs/skills/status-updater.md`（本檔）
> Owner prompt: `packages/prompt-library/skills/status-updater.ts`
> Linked specs: [007](../architecture/specs/007-update-story-character-status.md)
> Linked stories: [007](../requirements/stories/007-update-story-character-status.md)

## 1. 操作定位

status-updater 是**單次操作 Skill**：明確輸入（章節 + 既有 status + 角色清單）→ 明確輸出（新版 status 檔內容）。不串流、不多步、不呼叫其他工具。

與 chapter-writer 的差異：

| 維度 | chapter-writer (Agent) | status-updater (Skill) |
|---|---|---|
| 性質 | 自主多步流程，產出長文 | 單次輸入輸出，產出條列 |
| 輸出 | 小說正文（散文） | Markdown 結構化條列 |
| style.md 影響 | ✅ 受影響 | ❌ 不受影響 |
| 串流 | 是 | 否 |
| 預期輸出長度 | 800-1500 字 | 視 status 規模（通常 < 2000 tokens） |

## 2. 使用情境

- **觸發點**：
  - 章節「儲存」按鈕（Spec 003 修訂版）— reason: `auto-after-save`
  - 章節「採用」按鈕（Spec 006）— reason: `auto-after-adopt`
  - 編輯器側邊「立刻更新狀態」按鈕 — reason: `manual`
- **使用者目的**：讓 AI「記得」此章發生什麼，供下一章撰寫時用
- **服務的 persona**：`serial-author` 最受益（章數累積後失憶風險高），其他 persona 同樣需要

## 3. 輸入合約

```ts
interface StatusUpdaterInput {
  chapterNumber: number;
  chapterTitle: string;
  chapterText: string;                           // 該章主檔完整內容
  currentStoryStatus: string;                    // status/story_status.md 完整內容
  relevantCharacters: Array<{
    slug: string;
    name: string;
    card: string;                                // characters/<slug>.md body（連貫敘述部分）
    status: string;                              // characters/<slug>_status.md 完整內容
  }>;
}
```

**不會有的東西**：

- writingStyle（明確排除；此 Skill 不受 style.md 影響）
- 其他章節主檔（避免 context 爆炸；status 本身就是「跨章記憶」）
- 未在該章出現的其他角色 / status
- previousChapterFullText（status 已涵蓋；避免重複資訊）
- userIntent（使用者沒有特別指示空間；要改要直接編 status 檔）

## 4. 輸出合約

```ts
interface StatusUpdaterOutput {
  storyStatus: string;                           // 新版 status/story_status.md 完整內容
  characterStatuses: Record<string, string>;     // slug → 新版 <slug>_status.md 完整內容
  unrecognizedNames?: string[];                  // optional：章節中提到但不在 relevantCharacters 中的疑似人名
}
```

**格式要求**：

- `storyStatus` 與 `characterStatuses[slug]` 是**完整檔案內容**（不是 diff、不是 patch）
- 必須保留輸入中對應 status 檔的 heading 結構（依 Story 001 / 007 規範的骨架）
- 若沒有實質變化，輸出與輸入完全相同（讓 Spec 007 比對後 skip 寫檔）

## 5. System prompt

```
你是小說的故事狀態維護員。你的任務是讀剛寫好的一章，把該章發生的關鍵劇情演進與
人物關係變化，寫進 story_status.md 與該章涉及角色的 character_<slug>_status.md。

【嚴格規則 — 不可違反】

1. 只寫**結構化條列**，不寫小說正文，不寫散文段落。
2. 不新增「relevantCharacters」之外的角色姓名（即使章節中提到也不寫入）。
   章節中提到但不在清單中的疑似人名，列在輸出的 `unrecognizedNames` 欄位。
3. 不修改既有角色姓名的任一字元。
4. 保留 status 檔的既有 heading 結構：
   - story_status.md 必有的 heading：`## 世界觀` / `## 重要劇情點` / `## 🔖 伏筆` /
     `## ✨ 轉折點` / `## 場景` / `### 場景：<場景名>`
   - <slug>_status.md 必有的 heading：`## 重要狀態變化` / `## 與其他角色的關係` /
     `## 🔖 個人伏筆` / `## ✨ 個人轉折點`
5. 既有 status 內容**保留**（按章節時序累積）；新內容**追加**到對應段落。
   不要刪舊內容，除非該舊內容明確被本章推翻。
6. 重要劇情點 / 狀態變化條目格式：`(第 N 章) <簡短描述>`
7. 場景描述格式：在 `## 場景` 下用 `### 場景：<場景名>` heading 包，內含
   - 地址（若文中有提）
   - 環境（建築 / 空間特徵）
   - 氛圍
   - 關鍵物品
8. 不更動「## 🔖 伏筆」「## ✨ 轉折點」「## 🔖 個人伏筆」「## ✨ 個人轉折點」
   段落的既有條目；本章新埋的伏筆 / 新出現的轉折點可加進對應段落。
9. 章節中**沒有**新演進的角色，其 status 檔輸出與輸入完全相同。

【輸出格式】

回傳 JSON：

{
  "storyStatus": "<新版 story_status.md 完整內容>",
  "characterStatuses": {
    "<slug>": "<新版 <slug>_status.md 完整內容>"
  },
  "unrecognizedNames": ["<疑似人名>", ...]
}

不要加 markdown code fence、不要加說明文字。直接回 JSON。

【精簡與累積的平衡】

- status 是「長期記憶」，目標是讓下一章撰寫時 AI「想得起來」前面發生過什麼
- 但不可膨脹過快——只記**對未來章節有影響**的劇情點 / 關係 / 物品
- 細枝末節（無關後續的對話、過場）不要寫進 status
- 條目盡量短：1-2 句話內描述清楚

【關係條目格式】

在 character_<slug>_status.md 的「## 與其他角色的關係」段：

`- 與 [[<另一角色名>]]：<關係描述 + 演進>`

用 `[[wiki-link]]` 引用另一個角色，方便日後 UI 跳轉。
```

## 6. 模型建議

**雲端首選**：`anthropic:claude-sonnet-4-6`
- 長 context 對 status 累積場景必要；指令遵循強
- status-updater 任務專一不需 sonnet 級別，但 sonnet 在 JSON 格式遵循比 haiku 穩

**雲端備援**：
- `anthropic:claude-haiku-4-5`（成本低，可作為 default 起手）
- `openai:gpt-4.1-mini`

**地端首選**：
- `lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus`
- `ollama:qwen2.5:14b`

**地端最小可行**：
- `ollama:qwen2.5:7b`（任務單純，7B 級可勝任；但 JSON 結構穩定度需 prompt engineering）

**最小 context window**：8192 tokens
- 預估輸入：chapterText（2000-4000）+ storyStatus（500-2000）+ 角色卡 × 2-5（1000-3000）+ 角色 status × 2-5（500-2000）
- 預估輸出：與輸入 status 相當（500-3000）
- 通常落在 5000-12000 tokens

## 7. 驗收標準（golden test）

- [ ] **輸出為合法 JSON**：可被 `JSON.parse` 直接消化；無 markdown code fence、無前後說明文字
- [ ] **JSON schema 對應**：含 `storyStatus`（string）+ `characterStatuses`（Record<string, string>）；可選 `unrecognizedNames`
- [ ] **不新增未提供角色**：`characterStatuses` 的 key 必須是 `relevantCharacters[].slug` 的子集；不含其他 key
- [ ] **不修改既有角色名**：輸入中的所有角色名稱在輸出中字元完全一致
- [ ] **保留 heading 結構**：輸出的 `storyStatus` 中 `## 世界觀` / `## 重要劇情點` / `## 🔖 伏筆` / `## ✨ 轉折點` / `## 場景` 全部存在
- [ ] **保留 🔖 / ✨ 段既有條目**：對照輸入，這兩段的既有 bullet 條目在輸出中字元級保留
- [ ] **章節未提及的角色 status 不變**：對該章未涉及的角色，其 status 與輸入完全相同（透過比對 hash）
- [ ] **條目格式**：「重要劇情點」段的新增 bullet 含 `(第 N 章)` 前綴
- [ ] **無 chain-of-thought leakage**：輸出不含「我認為…」「分析：…」等思考過程

## 8. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|---|---|---|
| 模型加 markdown code fence 包 JSON | JSON.parse 失敗 | 後處理 strip ``` 與 ```json 前後；prompt 末尾再次強調 |
| 模型輸出 markdown 而非 JSON | 完全 parse 失敗 | Spec 007 中規範「至多 1 次改格式重試」；仍失敗 → SSE error |
| 模型新增「老闆娘」這類章節提到但未在 characters 的人名 | 違反規則 #2 | 規則檢查；違反時把 unrecognizedNames 抽出，但對應 character status 不建立 |
| 模型刪除既有 🔖 / ✨ 條目 | 違反規則 #8 | golden test 偵測；強提示詞 |
| 7B 模型對 8000+ token 輸入 attention 稀釋 | 漏記章節後半段內容 | 模型建議至少 14B；7B 為「最小可行」需評估結果驗證 |
| RWKV 等 RNN 對遠端 context 衰減 | 漏前段內容 | 不建議用 RNN 跑 status-updater；若用，把最關鍵的「保留條目」放 user prompt 末尾 |
| status 累積後變超長（30+ 章），輸入 token 超限 | 400 CONTEXT_TOO_LARGE | 使用者透過「AI 精簡」按鈕（呼叫 `status-shortener` Skill）壓縮；本 Skill 不自動截短 |
| 模型擅自重寫整個 status（不是 append） | 違反規則 #5 | prompt 強調「累積」；golden test 比對既有條目保留率 |

## 版本紀錄

- `v0.1` (2026-05-12): 初版設計；對齊 Story / Spec 007 2026-05-12 修訂版（一人一檔、無 token 上限、stateless）

---

# 附錄：`status-shortener` Skill

由 Spec 007 的「AI 精簡」按鈕觸發，獨立於 status-updater。為簡化文件，附在本檔末尾。

## 操作定位

讀單一 status 檔 → 輸出精簡版。預設跳過 `## 🔖 ...` 與 `## ✨ ...` 段（保留所有條目）；勾選「也精簡 🔖/✨ 段」時才一併處理。

## 輸入

```ts
interface StatusShortenerInput {
  fileContent: string;
  fileType: "story" | "character";
  characterSlug?: string;                        // fileType === "character" 時
  preserveMarkedSections: boolean;               // 預設 true
}
```

## 輸出

```ts
interface StatusShortenerOutput {
  shortenedContent: string;
  preservedSections: string[];                   // 哪些 heading 段被保留
}
```

## System prompt

```
你是小說設定文件的精簡員。讀一個 status 檔，產出精簡版。

【嚴格規則】

1. 保留所有 heading 結構（## 世界觀 / ## 重要劇情點 / ...）
2. 若 `preserveMarkedSections=true`：
   - `## 🔖 ...` 與 `## ✨ ...` 段下的條目**完全不動**
   - 你的精簡只作用於其他段
3. 若 `preserveMarkedSections=false`：所有段都可精簡（但保留 heading）
4. 精簡 = 把同類條目合併、刪冗詞、壓縮描述；不刪關鍵資訊
5. 不新增資訊（不發明新劇情點 / 新關係）
6. 不改角色名字元
7. 只輸出新版 status 內容；不加說明、不加 fence、不加 frontmatter
```

## 模型建議

預設用便宜模型（`anthropic:claude-haiku-4-5` / `gpt-4.1-mini` / 地端 7B），任務單純。

## 驗收標準

- [ ] 輸出仍保留所有 heading
- [ ] preserveMarkedSections=true 時，🔖 / ✨ 段條目字元完全保留
- [ ] 不新增資訊（透過 longest common subsequence 比對輸入確認）
- [ ] 輸出長度 < 輸入長度（明確有精簡效果）

## 版本紀錄

- `v0.1` (2026-05-12): 與 status-updater 同期設計
