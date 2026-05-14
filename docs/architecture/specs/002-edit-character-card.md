# Spec: 角色卡（手動為主 + AI 統整為輔 + portrait grid）

> Story: `docs/requirements/stories/002-edit-character-card.md`
> BDD: `docs/requirements/features/002-edit-character-card.feature`
> Status: `Draft`（M5 修訂中，待 PM 簽核轉 Ready）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001（儲存）、0002（命名）、0003（技術棧）、0004（LLM adapter）、0007（git）、0008（前端架構）
> Depends on spec: 009（設定頁 LLM routing）、010（git）
> 修訂：`2026-05-13` — schema 加 `portrait` 與 `appearanceByChapter`；檔案佈局加 `characters/_assets/<slug>/`
> 修訂：`2026-05-15` — M5（M4 UX review 揭露根本性需求變更）：
> 1. **CharactersPage 主視圖改 portrait grid**（每張卡顯示 portrait + 名稱 + 角色定位）；reuse Spec 002b 的 `characters/_assets/<slug>/portrait.*`
> 2. **邏輯翻轉：手動為主、AI 為輔**：body 切兩段（`## 角色描述（手動）` + `## AI 統整敘述`）；AI 統整**不**蓋手動段；UI 上 AI 統整改為 Option
> 3. **親密 tab 預設展開**（spec 002 2.9 反轉）+ tab 名改為「性愛場景表現」
> 4. **衍生資料進 SQLite cache**（搜尋索引、tag 統計）；`.md` 仍為單一真實來源
> 5. **AI 統整失敗時 UI 仍可正常使用**（M4 bug：失敗時整個按鈕無法點 → 修）
> 6. **CRUD API 對 `body` 欄位的語意改變**（manuallyEdited 變 per-section）

## 摘要

角色卡是 chapter-writer 撰寫章節時的核心人物素材。本 spec 規範四件事：

1. **角色卡的檔案格式**：frontmatter（結構化欄位 6 區塊）+ body（兩個固定 markdown section：手動描述 + AI 統整）
2. **CharactersPage UI**（M5 改）：portrait grid 主視圖；點卡進入 6-tab 編輯器
3. **CRUD 流程**：新增 / 編輯 / 刪除角色卡的 API 與檔案 I/O
4. **AI 統整觸發（M5 改）**：使用者明示按「AI 統整」才呼叫 LLM；輸出寫入「## AI 統整敘述」段；若手動段已有內容，AI 統整完成後**不**寫入手動段（spec 002 既有的 manuallyEdited dialog 改為 per-section）

每個角色卡同步維護 `characters/<slug>.md`、`characters/<slug>_status.md`（空骨架）、`characters/_index.md`（一行摘要）三個檔案，全部走 git commit。衍生資料（tag 搜尋索引、portrait 縮圖路徑）存 `~/.novel-writer/cache/<projectHash>/character-index.db`（可重建）。

## API 合約

所有路徑前綴 `/api/projects/:projectHash/characters/`。

### POST .../

新增角色。

**Request:**
```ts
{
  name: string;                  // 必填
  fields: CharacterFields;       // 6 區塊結構化欄位；除 name 外都選填
  consolidate?: boolean;         // 是否立即跑 AI 統整；預設 false（使用者後續可手動觸發）
}
```

`name` 與 `fields.name` 必須一致（前端會自動帶；後端驗證）。

**Response 201:**
```ts
{
  slug: string;
  path: string;                  // characters/<slug>.md 絕對路徑
  fields: CharacterFields;       // echo back
  body: string;                  // 若 consolidate=true 為 AI 統整結果；否則為「(尚未統整)」placeholder
  consolidatedAt: string | null;
  consolidatedBy: string | null;
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | name 空、必填欄位缺、欄位型別錯 |
| 409 | `SLUG_CONFLICT` | 同 slug 已存在；response 含「建議 slug」例 `林書言-2` |
| 422 | `CONSOLIDATE_FAILED` | consolidate=true 但 LLM 呼叫失敗；角色卡仍建立但 body 為 placeholder |
| 500 | `IO_ERROR` |

### PUT .../:slug

部分更新角色卡的 fields；可選擇是否重跑 consolidate。

**Request:**
```ts
{
  fields?: Partial<CharacterFields>;
  manualDescription?: string;          // M5：對應 body 「## 角色描述（手動）」段；undefined = 不動；空字串 = 清空該段
  aiSummary?: string;                  // M5：對應 body 「## AI 統整敘述」段（罕見直接寫；通常由 consolidate 流程透過 PUT 寫入）
  consolidate?: boolean;
  rename?: string;
}
```

**Response 200:** 同 POST 的 response

**M5 變更**：移除既有的 `body?: string` 欄位（單一字串）。改為兩個獨立欄位 `manualDescription` + `aiSummary`，server 端拼接成 body 寫入。

`manuallyEditedSections`（取代 `manuallyEdited: boolean`）：
- 使用者改 `manualDescription` → `manuallyEditedSections.manualDescription: true`
- 使用者改 `aiSummary` → `manuallyEditedSections.aiSummary: true`
- 跑 `consolidate` → 只寫 `aiSummary` 段；`manualDescription` 段**完全不動**
- 若 `manualDescription` 為空且使用者按了 `consolidate` 並要求「也寫入手動段」（UI dialog 後）→ 才寫；預設不寫

### DELETE .../:slug

**Response 200:** `{ deleted: true; commitSha: string }`

刪除三檔（`<slug>.md`、`<slug>_status.md`、更新 `_index.md` 移除一行）+ git commit。

### POST .../:slug/consolidate

主動觸發 AI 統整。

**Request:**
```ts
{
  modelOverride?: string;        // optional，覆寫 settings.yaml 的 character-card-consolidator 路由
}
```

**Response 200:**
```ts
{
  aiSummary: string;             // M5：新生成的連貫敘述（只對應「## AI 統整敘述」段）
  oneLineSummary: string;
  consolidatedAt: string;
  consolidatedBy: string;
  usage: { inputTokens: number; outputTokens: number };
}
```

**M5 變更**：
- 欄位名從 `body` 改為 `aiSummary`（語意更清楚 — 這是 AI 統整段，不是整個 body）
- consolidate API 回應**不直接寫入** `.md`；前端把它放到 textarea 預覽 → 使用者可微調 → 按「儲存」才送 PUT 寫入 `aiSummary` 欄位
- consolidate 永遠**不**寫入「## 角色描述（手動）」段（使用者手動段 sacrosanct）
- AI 統整失敗時 UI 不 disable 任何其他按鈕（M4 bug：失敗時整個按鈕無法點 → 修）；失敗訊息以 inline error 顯示在 AI 統整區，其餘 UI 正常

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `ROUTING_NOT_CONFIGURED` | settings.yaml 中 character-card-consolidator routing 未設定 |
| 404 | `CHARACTER_NOT_FOUND` |
| 502 | `LLM_FAILED` | LLM 呼叫失敗；含 LLMErrorCode |

### GET .../

列出該專案所有角色（簡要版，供「角色」面板用）。

**Response:**
```ts
{
  characters: Array<{
    slug: string;
    name: string;
    role: string | null;         // 主角 / 配角 / ...
    age: number | null;
    oneLineSummary: string;      // 從 _index.md 拉
  }>;
}
```

### GET .../:slug

完整讀取單個角色卡。

**Response:** 同 POST response 結構

## 資料模型

新增至 `packages/shared-types/src/character.ts`：

```ts
export interface CharacterFields {
  // 1. 身分基礎（name 必填）
  name: string;
  age: number | null;
  gender: string | null;         // male / female / other / 自由文字
  pronoun: string | null;
  role: "主角" | "配角" | "反派" | "重要路人" | string | null;

  // 2. 個性參考
  personalityTags: string[];
  mbti: MBTI | null;
  zodiac: Zodiac | null;
  bloodType: "A" | "B" | "O" | "AB" | null;
  culturalBackground: string | null;

  // 3. 外貌參考（預設 / 基準）
  heightCm: number | null;
  bodyType: string | null;       // tag 或自由文字
  hairAndColor: string | null;
  eyes: string | null;
  otherFeatures: string | null;
  clothing: string | null;       // 預設服裝風格（2026-05-13 新增）

  // 3b. 圖片（path 相對於專案根；Story 002b）
  portrait: {
    default: string | null;                // 例：characters/_assets/蘇晴/default.jpg
    byChapter: Record<number, string>;     // 例：{ 1: ".../chapter_0001.jpg", 5: ".../chapter_0005.jpg" }
  };

  // 3c. 章節外貌演進（optional；Story 002b 解析後或使用者手填；2026-05-13 新增）
  appearanceByChapter: Record<number, string>;  // 章節編號 → markdown 段落

  // 4. 對話與寫作（此角色獨有；整體文風在 style.md）
  dialoguePace: "快" | "穩" | "慢" | null;
  wordingPreference: string | null;
  writingAvoid: string | null;

  // 5. 與其他角色的關係（自由文字，支援 [[wiki-link]]）
  relations: string | null;

  // 6. 性愛場景表現（M5：tab 改名 + 預設展開；原 intimateAppendix）
  sexualScenePerformance: {                // M5：欄位 rename 自 intimateAppendix（schema migration 必要）
    bodyMeasurements: string | null;
    preferences: string | null;
  } | null;

  // AI 統整 metadata（不顯示，由後端維護）
  consolidatedAt: string | null;
  consolidatedBy: string | null;
  // M5：替換 manuallyEdited（boolean）為 per-section
  manuallyEditedSections: {
    manualDescription: boolean;            // 「## 角色描述（手動）」段被使用者改過
    aiSummary: boolean;                    // 「## AI 統整敘述」段被使用者改過（非 consolidate 結果）
  };
}

export type MBTI =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

export type Zodiac =
  | "牡羊座" | "金牛座" | "雙子座" | "巨蟹座"
  | "獅子座" | "處女座" | "天秤座" | "天蠍座"
  | "射手座" | "摩羯座" | "水瓶座" | "雙魚座";

export interface CharacterCard {
  slug: string;
  fields: CharacterFields;
  body: string;                          // server 端拼接後的完整 body（含兩 section）；前端可解析或直接取分欄位
  manualDescription: string;             // M5：「## 角色描述（手動）」段（不含 heading）
  aiSummary: string;                     // M5：「## AI 統整敘述」段（不含 heading）
}

export interface CharacterListItem {
  slug: string;
  name: string;
  role: string | null;
  age: number | null;
  oneLineSummary: string;
}
```

## 檔案格式（M5 修訂）

### `characters/<slug>.md`

```markdown
---
name: 蘇晴
age: 30
gender: female
pronoun: 她
role: 主角

personalityTags:
  - 內向
  - 含蓄
  - 敏感
mbti: INFJ
zodiac: 處女座
bloodType: A
culturalBackground: |
  台灣台北出生長大，大學文學系，畢業後進出版社做編輯。
  童年喪母，由祖母帶大。

heightCm: 165
bodyType: 中等偏瘦
hairAndColor: |
  黑色長髮，平日綁低馬尾。
eyes: |
  雙眼皮，眼尾微下垂。
otherFeatures: |
  鵝蛋臉，膚色偏白。指甲剪短沒擦顏色。

dialoguePace: 慢
wordingPreference: |
  半句話結尾，不喜歡把話說滿；對熟人才會放鬆。
writingAvoid: |
  避免讓她說過於肯定的句子。

relations: |
  與[[林書言]]從一場避雨開始認識。
  對他有具體好感但保持分寸。

sexualScenePerformance: null

consolidatedAt: 2026-05-12T10:30:00Z
consolidatedBy: anthropic:claude-haiku-4-5
manuallyEditedSections:
  manualDescription: true
  aiSummary: false
---

## 角色描述（手動）

蘇晴 30 歲，文學系出身的編輯。話不多但聽得進去，常用半句話收尾。
她對人保持距離但不冷漠，跟祖母長大養成的「不主動麻煩別人」變成
習慣。喜歡的細節：紙質、手寫、雨後石板路的味道。

對林書言有興趣但謹慎；和他講話會比平常多一兩句，這對她已經是
明顯破例。

## AI 統整敘述

蘇晴是 30 歲的女作家，內向但觀察力極強。思考時微微皺眉，對陌生
人話少；對熟人才會放鬆，偶爾露出笑意。對於想要什麼通常用半句
話帶過，不喜歡把話說滿——情緒激動時反而會更安靜。

她身高 165 公分，中等偏瘦的身形。鵝蛋臉，膚色偏白；黑色長髮平
日綁低馬尾。雙眼皮，眼尾微下垂，看起來總像有心事。指甲剪短沒
擦顏色。

文學系出身，畢業後進出版社做編輯——這份工作讓她養成「在文字
裡找弦外之音」的習慣。對話節奏偏慢，常用半句話結尾。

與林書言從一場避雨開始認識，對他有具體好感但保持分寸。
```

### Body 兩段 section 規則（M5）

| Section heading | Markdown 標記 | 來源 | chapter-writer 看到 |
|---|---|---|---|
| 角色描述（手動） | `## 角色描述（手動）` | 使用者輸入；AI consolidate **不**動 | ✅ 是（拼接成 `<slug>.md` 的 body 一部分） |
| AI 統整敘述 | `## AI 統整敘述` | AI consolidate 輸出；使用者也可改 | ✅ 是 |

- Parser：對輸入做 NFC normalize 後用以下正規表示式匹配 heading（行首 + 行尾），容錯尾段 whitespace：
  - `^##\s+角色描述（手動）\s*$`
  - `^##\s+AI 統整敘述\s*$`
  - 不接受 `###`（更深層）或 `#`（更淺層）；不接受半形括號替代（`(手動)` 視為使用者自寫第三段，不解析為 manualDescription）
  - 不接受 `## 角色描述 (手動)`（半形 + 空格）— 嚴格要求全形括號保持一致
- 兩個 section 順序固定：手動段在前、AI 段在後
- 若任一 section 完全空白，仍寫 heading + 空行（保持 schema 穩定）
- 若 .md 中沒有任何 `##` heading（例如 M3/M4 既存 body）：視為「全部是手動段」（保守 migration，使用者意圖優先）
- 若 .md 中有額外的 `##` heading（使用者手寫了第三段）：保留但不解析；視為手動段的附錄

### Migration（M5）

| 既有檔案狀態 | M5 read 行為 | M5 首次 write 行為 |
|---|---|---|
| 純 body（無 `##` heading） | manualDescription = body 全文，aiSummary = "" | 寫成兩 section 格式 |
| body 已有 `## AI 統整敘述`（不太可能，未來相容） | aiSummary = 該段，manualDescription = 該段前的內容 | 兩 section 格式 |
| body 完全空 | 兩者都 "" | 寫兩個空 section heading |

### frontmatter migration

- `intimateAppendix` → `sexualScenePerformance`：讀 M3/M4 既有 `.md` 時，若有 `intimateAppendix` 欄位 → migrate 為 `sexualScenePerformance`；首次 PUT 寫回時用新欄位名。**保留**舊欄位讀取相容性 6 個月（之後移除）。
- `manuallyEdited` (boolean) → `manuallyEditedSections` (object)：讀時若見舊欄位，自動 migrate 為 `{ manualDescription: <oldValue>, aiSummary: false }`；首次 PUT 寫回時用新結構。

### `characters/<slug>_status.md`（建立角色時的空骨架）

```markdown
# 蘇晴 — 狀態

## 重要狀態變化
（按章節時序記錄）

## 與其他角色的關係

## 🔖 個人伏筆
**精簡時 AI 預設跳過此區。**

## ✨ 個人轉折點
**精簡時 AI 預設跳過此區。**
```

### `characters/_index.md`

```markdown
# 角色索引

- [蘇晴](./蘇晴.md) — 30 歲女作家，內向敏感，與林書言因舊筆記本結識
- [林書言](./林書言.md) — 28 歲書店老闆，健談但對熟人話少
```

`_index.md` 由後端自動維護（在新增 / 編輯 / 刪除角色時更新對應行）。順序按建立時間，使用者不直接編輯。

## CharactersPage UI（M5 重設計）

### 主視圖：Portrait grid

```
┌──────────────────────────────────────────────────────────────┐
│ ← 首頁 │ 角色  │ [搜尋: ___________ ▢] [+ 新增角色]            │
├──────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│ │ [圖]   │ │ [圖]   │ │ [icon] │ │ [icon] │                  │
│ │ 蘇晴   │ │ 林書言 │ │ 蕭母   │ │ 計程車 │                  │
│ │ 主角   │ │ 主角   │ │ 配角   │ │ 重要路人│                  │
│ └────────┘ └────────┘ └────────┘ └────────┘                  │
│ ┌────────┐                                                    │
│ │ [icon] │                                                    │
│ │ ?      │                                                    │
│ │ 新角色 │                                                    │
│ └────────┘                                                    │
└──────────────────────────────────────────────────────────────┘
```

| 元素 | 規格 |
|---|---|
| Portrait | 來自 `characters/_assets/<slug>/default.{jpg/png/webp}`（Spec 002b）；無圖時 fallback 為角色定位 icon（主角 / 配角 / 反派 / 重要路人 對應 lucide-react icon） |
| 名稱 | frontmatter `name` |
| 副標 | frontmatter `role` 或 「（未設定定位）」 |
| Hover | 卡片浮起 + 顯示「編輯」「刪除」icon |
| Click | 進入該角色 6-tab 編輯模式（取代 M4 的左欄清單模式） |
| 搜尋框 | 即時 filter：name / role / personalityTags 任一 match（不分大小寫，NFC normalize 後 substring） |
| `+ 新增角色` | 第一張卡或工具列按鈕 → 開新建 dialog |

實作：grid CSS layout（`grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`）；卡片寬 ≥ 180px；portrait aspect-ratio 3:4。

### 編輯模式：6 個 tabs（沿用 M4 結構，M5 調整）

點 portrait grid 卡進入。Tabs：

1. **身分**（既有）
2. **個性**（既有）
3. **外貌**（既有）
4. **對話**（既有）
5. **關係**（既有）
6. **性愛場景表現**（M5：tab 改名自「親密」；預設**展開**而非摺疊）

每個 tab 下方有兩個 markdown editor section：

- **「角色描述（手動）」**（M5 新增 — 重點）：textarea / CM6，讓使用者寫該角色的完整文字描述。這是 chapter-writer 主要看的內容。placeholder 引導 grey text：「在這裡寫下此角色的完整描述。不用擔心結構，可以是個性、外貌、口吻、習慣、過去等任何重要資訊。」
- **「AI 統整敘述」**（M5 新增 — 可折疊）：唯讀 + 「重新統整」按鈕 + 「展開編輯」按鈕；預設摺疊；展開後 textarea 可手動微調

### 性愛場景表現 tab（M5）

| Item | 規格 |
|---|---|
| Tab 名稱 | 「性愛場景表現」（取代 M4「親密」）|
| 預設摺疊 | **預設展開**（M5；spec 002 2.9 反轉）|
| 內容 | 既有 `sexualScenePerformance.bodyMeasurements` + `sexualScenePerformance.preferences` 欄位；plus 兩 section markdown body（手動 + AI 統整） |
| 警告文字 | tab 頂部顯示「此區內容會餵給 chapter-writer。題材不適用時請留空。」（不再像 M4 那樣需要展開才提示）|

## 衍生資料 SQLite cache（M5 新增）

為了支援 portrait grid 的搜尋 / 排序 / tag 統計，新增衍生 cache。**`.md` 仍為單一真實來源**（M5 不改 ADR-0001 儲存策略）。

### Schema

`~/.novel-writer/cache/<projectHash>/character-index.db`：

```sql
CREATE TABLE character_index (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  age INTEGER,
  one_line_summary TEXT,
  -- 搜尋欄位（NFC normalize 後的小寫，加速 LIKE 查詢）
  search_blob TEXT NOT NULL,             -- name + role + tags + summary 拼接
  -- portrait metadata（從 _assets/ 掃出）
  portrait_default_path TEXT,
  portrait_default_format TEXT,
  -- mtime 用以決定 cache 是否 stale
  source_mtime TEXT NOT NULL,            -- characters/<slug>.md 的 mtime
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_character_index_search ON character_index(search_blob);

CREATE TABLE tag_stats (
  tag TEXT PRIMARY KEY,
  usage_count INTEGER NOT NULL DEFAULT 0
);
```

### Rebuild 條件

- 應用啟動偵測到 cache 不存在 → 全量掃 `characters/*.md` rebuild
- 任一 character CRUD → 增量更新該 slug 的 row（與檔案寫入同一事務）
- 偵測到 `<slug>.md` mtime > `source_mtime`（外部編輯）→ 該 row invalidate + reload
- 使用者按設定中「重建 cache」按鈕 → 全量 rebuild

### Query

```sql
-- 搜尋 (UI 即時查詢)
SELECT slug, name, role, portrait_default_path FROM character_index
  WHERE search_blob LIKE ? ESCAPE '\'
  ORDER BY name COLLATE NOCASE;

-- 列表 (CharactersPage 主視圖)
SELECT slug, name, role, age, portrait_default_path, portrait_default_format
  FROM character_index
  ORDER BY name COLLATE NOCASE;
```

### 與 `_index.md` 的關係

- `_index.md` 仍是 git tracked、Drive sync 的單一真實清單（一行一角色 + oneLineSummary）
- SQLite cache 是 read-optimized 衍生資料；掉了能從 `_index.md` + `<slug>.md` rebuild
- 兩者不衝突：`_index.md` 給「外部閱讀 / git diff / merge」用，SQLite 給「應用內 UI 高速查詢」用

## Slug 規則

沿用 spec 001：

1. 取 `name` 字串
2. NFC normalize
3. 移除 / 取代 `/ \ : * ? " < > | \0`
4. trim 前後空白；連續空白合併為 `_`
5. 結果為空 → 400 `INVALID_INPUT`，fieldError 指 `name`
6. 同專案內衝突 → 加後綴 `-2`、`-3`...
7. Windows reserved names（`CON`、`PRN`...）→ 加後綴 `-character`

### Rename 流程

`PUT .../:slug { rename: "新名字" }`：

1. 計算新 slug（依規則）
2. 若新 slug 與舊相同 → 只改 `fields.name` 不動檔名
3. 若新 slug 已存在 → 409 `SLUG_CONFLICT`
4. 否則：
   - rename `characters/<old>.md` → `characters/<new>.md`
   - rename `characters/<old>_status.md` → `characters/<new>_status.md`
   - 更新 `_index.md` 中該行
   - 更新 frontmatter `name`
   - git commit：`character: rename <old> to <new>`

### 跨檔的 `[[wiki-link]]` 失效處理

Rename 後其他角色 / status 檔中的 `[[<old>]]` 參考會失效。MVP **不**自動更新——只在 UI 顯示警告「重命名後，其他檔案中 [[<old>]] 連結需手動修正」；P1 加掃描與替換功能。

## character-card-consolidator Skill 觸發合約

完整 Skill 規格在 `docs/skills/character-card-consolidator.md`（Day 5 寫）。本 spec 規範**呼叫方**的合約：

```ts
interface ConsolidatorInput {
  fields: CharacterFields;
  // 不包含已生成的 body（避免 LLM 以舊 body 為基準微調，而是從欄位重新生成）
}

interface ConsolidatorOutput {
  body: string;                  // 200~500 中文字連貫敘述
  oneLineSummary: string;        // 一句話用於 _index.md
}
```

呼叫流程：

```
POST /api/projects/:hash/characters/:slug/consolidate
  │
  ▼
讀 characters/<slug>.md 的 frontmatter → CharacterFields
  │
  ▼
讀 settings.yaml → agents.character-card-consolidator.routing
  │
  ▼
LLMRouter.generate(req, policy) with prompt-library.skills.characterCardConsolidator(fields)
  │
  ▼
驗證輸出符合 ConsolidatorOutput schema
  │
  ▼
回 response（不寫檔；前端 textarea 給使用者編）
```

**不受 style.md 影響**（依 docs/skills/_template.md 慣例；角色卡是設定文件而非小說正文）。

## 寫入流程（atomic + git commit）

```
新增角色：
  1. zod 驗證 request
  2. 計算 slug（含衝突檢查）
  3. 若 consolidate=true：先呼叫 consolidator → 取得 body & oneLineSummary
     若失敗：fallback body = "(尚未統整)"
  4. atomic write 三檔：
     - characters/<slug>.md（frontmatter + body）
     - characters/<slug>_status.md（空骨架）
     - characters/_index.md（追加一行）
  5. commitIfChanged(["characters/<slug>.md", "characters/<slug>_status.md", "characters/_index.md"], "character: create <slug>")
  6. 回 201

編輯角色：
  1. zod 驗證 request
  2. rename 路徑：見上
  3. 若 consolidate=true：呼叫 consolidator → 新 body
  4. atomic write 該角色 .md + 更新 _index.md（若 oneLineSummary 變了）
  5. commitIfChanged(...)
  6. 回 200

刪除角色：
  1. unlink characters/<slug>.md、<slug>_status.md
  2. 從 _index.md 移除該行
  3. commitIfChanged(["characters/<slug>.md", "characters/<slug>_status.md", "characters/_index.md"], "character: delete <slug>")
  4. 回 200
```

`_index.md` 維護：以「slug → 行」的 in-memory map，每次 CRUD 後 re-emit 整個檔案（避免增量更新的解析複雜度）。

## YAML frontmatter 解析

用 `yaml` 套件（eemeli/yaml）：

- 解析時保留欄位順序（spec 顯示穩定）
- `null` 與 missing 視為等價（讀時都當 null）
- 寫入時 missing 欄位寫成 `null` 而非省略，方便 git diff 觀察

## 跨元件協議

```
client
  ├─ 「新增角色」對話框：填欄位 → 預覽 frontmatter → 可選「AI 生成」→ 編輯 textarea body → 儲存
  │                                  │
  │                                  ▼
  │                            POST .../characters {fields, consolidate: true}
  │
  │  或：
  │
  ├─ 填完欄位 → 直接儲存（不生成）→ 後續再點「AI 生成」
  │
  └─ 編輯既有：GET .../:slug → 修改 → 可選「AI 重生成」→ 儲存

apps/api
  ├─ POST → 驗證 → 算 slug → 可選 consolidate → atomic write → git commit → 201
  ├─ PUT → 驗證 → rename 路徑 → 可選 consolidate → atomic write → git commit → 200
  ├─ DELETE → unlink → _index.md 更新 → git commit → 200
  ├─ POST .../:slug/consolidate → LLMRouter → 回 body（不寫檔）
  └─ GET → 讀檔解析 → 回 JSON

consolidator skill
  └─ packages/prompt-library/skills/character-card-consolidator.ts
     → LLMRouter.generate with prompt
     → 驗證輸出
     → 回 {body, oneLineSummary}
```

## 並發

- 同一專案的 character CRUD 走 PQueue（與 git 命令同串列）
- 不同專案 OK 並行
- `consolidate` 端點允許多個並行（不寫檔）——但前端 UI 在 disable 按鈕避免重複呼叫

## 非功能性

- **效能**：
  - POST / PUT（不含 consolidate）p95 < 200ms（檔案 I/O + git commit）
  - consolidate p95 < 8s（cloud haiku）或 < 20s（地端 7B）
  - GET .../ 列表 p95 < 100ms（即使 50+ 角色）
- **容量**：單個角色卡 < 20 KB；單專案 < 200 角色（軟限制）
- **安全**：所有路徑必須在 `<project>/characters/` 之下；slug 規則防 path traversal
- **可用性**：consolidate 失敗不影響角色卡建立（fallback body）
- **資料完整性**：寫三檔（`.md` + `_status.md` + `_index.md`）走 atomic + rollback；失敗清掉部分寫入

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/character.ts` — CharacterFields、CharacterCard、ConsolidatorInput/Output 等
- [ ] **be-1**: `apps/api/src/services/character-fs.ts` — 讀寫 `.md`、frontmatter 解析、_index.md 維護
- [ ] **be-2**: `apps/api/src/services/character-slug.ts` — slug 計算與衝突偵測（與 spec 001 共用）
- [ ] **be-3**: `apps/api/src/services/character-consolidate.ts` — 呼叫 consolidator skill + 驗證輸出
- [ ] **be-4**: `apps/api/src/routes/characters.ts` — `POST / PUT / DELETE / GET list / GET one / POST consolidate`
- [ ] **be-5**: 與 commit-policy（Spec 010）整合：每個 CRUD 動作觸發對應 commit message
- [ ] **prompts**: `packages/prompt-library/skills/character-card-consolidator.ts`（依 Day 5 寫的 skill 規格）
- [x] **fe-1**: `apps/web/src/features/characters/CharacterPanel.tsx` 主面板（M4：list 視圖；M5 重構為 portrait grid，見 fe-m5-1）
- [x] **fe-2**: `CharacterEditor.tsx` 編輯對話框（6 tabs）
- [x] **fe-3**: `AIGenerateButton.tsx`
- [ ] **fe-4**: ~~親密區塊預設摺疊~~（M5 反轉：預設展開，rename 為性愛場景表現）
- [ ] **fe-5**: ~~`manuallyEdited` warning UI（覆蓋警告）~~（M5：取消，AI 統整改為不蓋手動段）
- [ ] **fe-6**: 重命名提示與 rename 流程整合
- [ ] **fe-7**: 刪除二次確認（含 git 還原指引）

### M5 新增

- [ ] **be-m5-1**: `character-fs.ts` 補 body 兩 section parser / serializer；migration（無 heading → manualDescription 全收）
- [ ] **be-m5-2**: `character-fs.ts` frontmatter migration：`intimateAppendix` → `sexualScenePerformance`；`manuallyEdited` boolean → `manuallyEditedSections` object（讀容錯，寫新格式）
- [ ] **be-m5-3**: `apps/api/src/services/character-index-cache.ts`（SQLite cache CRUD + rebuild on stale mtime）
- [ ] **be-m5-4**: `apps/api/src/routes/characters.ts` PUT 補 `manualDescription` / `aiSummary` 欄位；移除 `body` 欄位（不再接受）
- [ ] **be-m5-5**: consolidate endpoint 改為只寫 `aiSummary`；不動 `manualDescription`
- [ ] **be-m5-6**: 應用啟動時 character-index cache rebuild（idempotent）
- [ ] **fe-m5-1**: `CharactersPage.tsx` 改 portrait grid 主視圖（取代 M4 list 視圖）
- [ ] **fe-m5-2**: `CharacterCard.tsx` grid 卡片元件（含 portrait + name + role + fallback icon）
- [ ] **fe-m5-3**: `CharacterEditor.tsx` 補兩 section markdown editor（手動段 + AI 統整段）
- [ ] **fe-m5-4**: AI 統整失敗時的 inline error（不擋其他按鈕）
- [ ] **fe-m5-5**: 性愛場景表現 tab 預設展開 + tab 改名
- [ ] **fe-m5-6**: 搜尋框 + 即時 filter（呼叫 GET .../?q=）
- [ ] **qa-1**: cucumber-js step definitions for `002.feature`（M5 補新 scenarios）
- [ ] **qa-2**: slug 規則 unit test 矩陣
- [ ] **qa-3**: rename 流程的檔案 / git commit 完整性測試
- [ ] **qa-4**: consolidate 失敗的 fallback 路徑測試（M5：UI 仍可用驗證）
- [ ] **qa-m5-1**: body 兩 section parser 單元測試（含 migration 路徑）
- [ ] **qa-m5-2**: frontmatter migration 測試（intimateAppendix / manuallyEdited 容錯）
- [ ] **qa-m5-3**: character-index cache rebuild 測試（stale mtime / 全量 / 增量）
- [ ] **qa-m5-4**: AI 統整不蓋手動段測試（含「手動段已有內容 vs 為空」兩條路）

## 與 Spec 002b 的分工

| 議題 | Spec 002（本檔） | [Spec 002b](./002b-character-card-from-image.md) |
|---|---|---|
| CharacterFields schema | 定義（含 portrait / appearanceByChapter） | 引用 |
| Frontmatter 序列化 / 解析 | 實作 | 引用 |
| _index.md 維護 | 實作 | — |
| AI 統整（character-card-consolidator） | 觸發合約 | — |
| 角色 CRUD（新增 / 編輯文字欄位 / 刪除） | 完整 API | — |
| **圖片上傳 / 儲存 / 解析** | — | 完整 API + Skill 觸發 |
| Rename 時 _assets/ 跟著搬 | 邏輯（fs 操作） | 引用 |
| Delete 時 _assets/ 跟著刪 | 邏輯（fs 操作） | 引用 |

## 檔案系統佈局（修訂）

```
<project>/
└── characters/
    ├── _index.md
    ├── _assets/                         # 圖片資產（Story 002b；2026-05-13 新增）
    │   ├── 蘇晴/
    │   │   ├── default.jpg              # portrait.default
    │   │   ├── chapter_0001.jpg          # portrait.byChapter[1]
    │   │   └── chapter_0005.jpg
    │   └── 林書言/
    │       └── default.png
    ├── 蘇晴.md
    ├── 蘇晴_status.md
    ├── 林書言.md
    └── 林書言_status.md
```

`_assets/` 進 git（無 .gitignore 排除）；MVP 接受 git repo 因圖片略增大。Rename / Delete 角色時 `_assets/<slug>/` 跟著搬 / 刪。

## 變更紀錄

- `2026-05-12`: 初版 Ready
- `2026-05-13`: schema 加 `portrait` 與 `appearanceByChapter` + clothing 欄位；檔案佈局加 `characters/_assets/<slug>/`；明列與 Spec 002b 的分工
- `2026-05-15`: M5 修訂（待 PM 簽核轉 Ready）：
  - CharactersPage 主視圖改 portrait grid（reuse Spec 002b `_assets/<slug>/portrait.*`）
  - 邏輯翻轉：手動為主、AI 為輔。Body 切兩 section（`## 角色描述（手動）` + `## AI 統整敘述`）
  - PUT API：欄位從單一 `body` 改為 `manualDescription` + `aiSummary`
  - consolidate endpoint：只寫 `aiSummary`，永遠不動 `manualDescription`
  - `manuallyEdited` (boolean) → `manuallyEditedSections` (per-section object)
  - frontmatter `intimateAppendix` → `sexualScenePerformance`（含讀取容錯 migration）
  - 性愛場景表現 tab 預設**展開**（spec 002 2.9 反轉）+ tab 改名
  - 新增衍生資料 SQLite cache `~/.novel-writer/cache/<projectHash>/character-index.db`
  - 修 M4 bug：AI 統整失敗時 UI 整個鎖住 → 改為 inline error 不擋其他按鈕
