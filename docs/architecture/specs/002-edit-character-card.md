# Spec: 新增 / 編輯角色卡（欄位輸入 + AI 統整）

> Story: `docs/requirements/stories/002-edit-character-card.md`
> BDD: `docs/requirements/features/002-edit-character-card.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-13`
> Depends on ADR: 0001（儲存）、0002（命名）、0003（技術棧）、0004（LLM adapter）、0007（git）、0008（前端架構）
> Depends on spec: 009（設定頁 LLM routing）、010（git）
> 修訂：`2026-05-13` — schema 加 `portrait` 與 `appearanceByChapter`（章節敏感外貌）；檔案佈局加 `characters/_assets/<slug>/`；圖片上傳與 vision 解析的具體 API 移到 [Spec 002b](./002b-character-card-from-image.md)；本 spec 只負責 schema 與「文字 + 統整」這條路徑

## 摘要

角色卡是 chapter-writer 撰寫章節時的核心人物素材。本 spec 規範三件事：

1. **角色卡的檔案格式**：frontmatter（結構化欄位 6 區塊）+ body（AI 統整的連貫敘述）
2. **CRUD 流程**：新增 / 編輯 / 刪除角色卡的 API 與檔案 I/O
3. **AI 統整觸發**：呼叫 `character-card-consolidator` Skill 把 frontmatter 轉成 body

每個角色卡同步維護 `characters/<slug>.md`、`characters/<slug>_status.md`（空骨架）、`characters/_index.md`（一行摘要）三個檔案，全部走 git commit。

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
  body?: string;                 // 使用者手動編輯 body（與 fields 互斥；同時更新時 body 後寫贏）
  consolidate?: boolean;
  rename?: string;               // 新的角色名；觸發檔案重命名
}
```

**Response 200:** 同 POST 的 response

更新 `manuallyEdited`：
- 使用者改 `body` → `manuallyEdited: true`
- 跑 `consolidate` → `manuallyEdited: false`（覆寫使用者編輯，UI 在前端先警告）

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
  body: string;                  // 新生成的連貫敘述
  oneLineSummary: string;        // _index.md 用的一句話描述
  consolidatedAt: string;
  consolidatedBy: string;        // modelId
  usage: { inputTokens: number; outputTokens: number };
}
```

**注意**：consolidate API 回應的 body **不直接寫入** `.md`；前端把它放到 textarea 給使用者微調（與角色卡 UX 一致），按「儲存」才送 PUT 寫入。

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

  // 6. 親密場景描寫參考（可選，預設摺疊）
  intimateAppendix: {
    bodyMeasurements: string | null;
    preferences: string | null;
  } | null;

  // AI 統整 metadata（不顯示，由後端維護）
  consolidatedAt: string | null;
  consolidatedBy: string | null;
  manuallyEdited: boolean;
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
  body: string;
}

export interface CharacterListItem {
  slug: string;
  name: string;
  role: string | null;
  age: number | null;
  oneLineSummary: string;
}
```

## 檔案格式

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

intimateAppendix: null

consolidatedAt: 2026-05-12T10:30:00Z
consolidatedBy: anthropic:claude-haiku-4-5
manuallyEdited: false
---

蘇晴是 30 歲的女作家，內向但觀察力極強。思考時微微皺眉，對陌生人話少；
對熟人才會放鬆，偶爾露出笑意。對於想要什麼通常用半句話帶過，不喜歡把
話說滿——情緒激動時反而會更安靜。

她身高 165 公分，中等偏瘦的身形。鵝蛋臉，膚色偏白；黑色長髮平日綁低馬
尾。雙眼皮，眼尾微下垂，看起來總像有心事。指甲剪短沒擦顏色。

文學系出身，畢業後進出版社做編輯——這份工作讓她養成「在文字裡找弦外
之音」的習慣。對話節奏偏慢，常用半句話結尾，給對方留空間；避免說出過
於肯定的句子。

與林書言從一場避雨開始認識，對他有具體好感但保持分寸。
```

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
- [ ] **fe-1**: `apps/web/src/features/characters/CharacterPanel.tsx` 主面板（列表 + 新增）
- [ ] **fe-2**: `CharacterEditor.tsx` 編輯對話框（六分區 tabs：身分 / 個性 / 外貌 / 對話 / 關係 / 親密）
- [ ] **fe-3**: `AIGenerateButton.tsx` 與 textarea body 預覽 / 微調
- [ ] **fe-4**: 親密區塊預設摺疊；reach 「展開」時 toast「題材不適用時可忽略」
- [ ] **fe-5**: `manuallyEdited` warning UI（顯示「下次 AI 生成會覆蓋你的修改」）
- [ ] **fe-6**: 重命名提示與 rename 流程整合
- [ ] **fe-7**: 刪除二次確認（含 git 還原指引）
- [ ] **qa-1**: cucumber-js step definitions for `002.feature`
- [ ] **qa-2**: slug 規則 unit test 矩陣（中文 / 拉丁 / 特殊字元 / reserved names）
- [ ] **qa-3**: rename 流程的檔案 / git commit 完整性測試
- [ ] **qa-4**: consolidate 失敗的 fallback 路徑測試

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
