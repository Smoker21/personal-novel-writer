# Spec: 角色卡：上傳參考圖 → vision 解析外貌（含章節敏感版本）

> Story: `docs/requirements/stories/002b-character-card-from-image.md`
> BDD: `docs/requirements/features/002b-character-card-from-image.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-13`
> Depends on ADR: 0001（儲存）、0003（技術棧）、0004（LLM adapter）、**0009（LLM adapter vision 擴充）**、0007（git）、0008（前端架構）
> Depends on spec: 002（CharacterFields schema）、009（settings provider routing）、010（git commit）

## 摘要

Story 002b 從 v0.2 defer 升級為 MVP（2026-05-13）。本 spec 涵蓋：

1. **圖片上傳**：將使用者選的本機檔案 resize / 重編碼後存到 `characters/_assets/<slug>/{default,chapter_NNNN}.{ext}`
2. **圖片解析**：呼叫 [`character-image-extractor`](../../skills/character-image-extractor.md) Skill，把圖 + 章節脈絡丟給 vision LLM → 結構化外貌 JSON → 填到 CharacterFields 對應欄位
3. **章節敏感的 byChapter lookup**：chapter-writer（Spec 005）撰寫第 N 章時依 `appearanceByChapter` 找 ≤ N 的最大者 fallback default
4. **資產跟隨 rename / delete**：當角色重命名 / 刪除時，`_assets/<slug>/` 一起搬 / 刪

`portrait` 與 `appearanceByChapter` schema 已在 [Spec 002](./002-edit-character-card.md) 定義；本 spec 只負責「圖片」這條路徑的 API + 檔案 I/O。

## API 合約

所有路徑前綴 `/api/projects/:projectHash/characters/:slug/`。

### POST .../portraits

上傳圖片到本機；MVP 不立即觸發解析（解析另一個 endpoint）。

**Request:** `multipart/form-data`
- `image`: File（必填）；JPG / PNG / WebP；MIME type 強制驗證
- `scope`: `"default"` | `"chapter"`（必填）
- `chapterNumber`: number（當 `scope=chapter` 時必填）

**Response 201:**
```ts
{
  scope: "default" | "chapter";
  chapterNumber: number | null;
  path: string;                            // 例 "characters/_assets/蘇晴/default.jpg"
  bytes: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  resized: boolean;                        // server 是否做了 resize / re-encode
  commitSha: string;
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_FORMAT` | MIME 不是 JPG/PNG/WebP；或副檔名不符 |
| 400 | `FILE_TOO_LARGE` | 上傳檔 > 10 MB |
| 400 | `INVALID_DIMENSIONS` | 寬或高 < 256 px |
| 400 | `INVALID_CHAPTER` | `scope=chapter` 但 chapterNumber 不在該專案範圍 |
| 404 | `CHARACTER_NOT_FOUND` |
| 500 | `IO_ERROR` |

### POST .../portraits/extract

對既已上傳的圖呼叫 character-image-extractor Skill；解析結果寫進 frontmatter（default → 扁平欄位；chapter → appearanceByChapter）。

**Request:**
```ts
{
  scope: "default" | "chapter";
  chapterNumber: number | null;
  modelOverride?: string;                  // optional
}
```

**Response 200:**
```ts
{
  extracted: {
    hairAndColor: string;
    eyes: string;
    bodyType: string;
    otherFeatures: string;
    clothing: string;
    heightHint?: string;
    confidence: Record<string, "high" | "medium" | "low">;
    chapterNote?: string;
  };
  writtenTo:
    | "fields.appearance"                  // scope=default → 扁平外貌欄位
    | { chapterNumber: number };           // scope=chapter → appearanceByChapter[N]
  modelId: string;                         // 實際使用的（含降級）
  durationMs: number;
  commitSha: string | null;                // 寫入 frontmatter 後的 commit
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `ROUTING_NOT_CONFIGURED` | character-image-extractor routing 未設定 |
| 404 | `PORTRAIT_NOT_FOUND` | 該 scope/chapterNumber 對應的圖未上傳 |
| 502 | `LLM_FAILED` | 所有 fallback 都失敗（含 content_blocked） |
| 502 | `EXTRACTION_PARSE_FAILED` | LLM 回應無法 parse 為合法 JSON（含 schema 驗證失敗） |

### DELETE .../portraits

刪除圖片 + 清空對應的 frontmatter 欄位。

**Request:**
```ts
{
  scope: "default" | "chapter";
  chapterNumber: number | null;
}
```

**Response 200:** `{ deleted: true; commitSha: string }`

刪除動作：
- `scope=default`：unlink `characters/_assets/<slug>/default.{ext}` + 清空 `portrait.default`
- `scope=chapter`：unlink `characters/_assets/<slug>/chapter_<NNNN>.{ext}` + 從 `portrait.byChapter` 移除該 key + 從 `appearanceByChapter` 移除該 key

### GET .../portraits

列出該角色所有圖片 metadata。

**Response:**
```ts
{
  default: PortraitInfo | null;
  byChapter: Array<PortraitInfo & { chapterNumber: number }>;
}

interface PortraitInfo {
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: string;
  uploadedAt: string;                      // ISO 8601
  hasExtracted: boolean;                   // 對應 frontmatter 是否已有解析結果
}
```

## 圖片儲存規則

### 路徑

```
<project>/characters/_assets/<slug>/
├── default.{jpg|png|webp}                 # 與 frontmatter portrait.default 一致
├── chapter_0001.{ext}                     # 4 位數補零，與章節主檔命名一致
├── chapter_0005.{ext}
└── ...
```

- 副檔名依上傳格式保留（不強制 JPG）；同 scope/chapter 只能存一個檔（不同副檔名衝突時舊檔被刪）
- `_assets/<slug>/` 是 angular bracket-less plain folder；slug 規則同 spec 001

### server 端處理

收到上傳後：

```
1. zod 驗證 request schema（scope、chapterNumber 對應）
2. 驗證 MIME type（拒絕 HEIC、SVG、TIFF、animated GIF）
3. 驗證檔案大小 ≤ 10 MB
4. 讀取圖片 metadata（用 sharp lib）：
   - 寬或高 < 256 px → INVALID_DIMENSIONS
5. 若任一邊 > 4096 px → resize 到 4096 內（保持比例）
6. 若 resize 後 > 5 MB → 重編碼為 JPEG quality 85
7. 計算目標 path（依 scope）
8. 若同路徑已存在（包含不同副檔名）→ unlink 舊檔
9. atomic write（tmp + rename）
10. 更新 frontmatter portrait 欄位
11. commitIfChanged（Spec 010）：「character: upload portrait <slug>/<scope>」
12. 回 201
```

### 編碼處理

- `sharp` lib（依 ADR-0009 已加入依賴）
- WebP 保留為 WebP；JPG / PNG 視大小決定是否轉 JPG
- EXIF 不主動清理（隱私強化留 P1）；但 sharp 預設會 strip orientation 以避免顯示翻轉

## 解析流程

```
POST .../portraits/extract { scope, chapterNumber, modelOverride? }
  │
  ▼
1. 讀 frontmatter 確認對應 scope/chapter 的圖 path 存在
   → 否 → 404 PORTRAIT_NOT_FOUND
  │
  ▼
2. 讀 settings.yaml.agents.character-image-extractor.routing
   → 未設定 → 400 ROUTING_NOT_CONFIGURED
  │
  ▼
3. 蒐集 context：
   - chapterNumber（null 或 N）
   - characterName（從 frontmatter.name）
   - storyGenre（從 project.yaml or synopsis 抽，可選 fallback "未指定"）
   - existingAppearance（scope=default 時是現有扁平欄位字串；scope=chapter 是現有 appearanceByChapter[N]）
  │
  ▼
4. 呼叫 character-image-extractor Skill via LLMRouter
   - image: { kind: "path", path: 絕對路徑 }
   - context: 上述
   - LLMRouter 降級規則（content_blocked → fallback；都失敗 → 502 LLM_FAILED）
  │
  ▼
5. zod 驗證 LLM 輸出符合 ExtractorOutput schema
   → 失敗 → 至多 1 次「請改格式重試」；仍失敗 → 502 EXTRACTION_PARSE_FAILED
  │
  ▼
6. 寫入 frontmatter：
   - scope=default → 更新扁平外貌欄位（heightHint 用作 heightCm 估算或 otherFeatures 註解）
   - scope=chapter → 寫 appearanceByChapter[N]（把 5 個欄位拼成 markdown 段落）
  │
  ▼
7. atomic write characters/<slug>.md
  │
  ▼
8. commitIfChanged：「character: extract appearance from portrait <slug>/<scope>」
  │
  ▼
9. 回 200 { extracted, writtenTo, modelId, durationMs, commitSha }
```

### scope=chapter 時的 markdown 拼接

把 ExtractorOutput 五欄位拼成單一 markdown 段落寫到 `appearanceByChapter[N]`：

```
{hairAndColor}。{eyes}。{bodyType}。{otherFeatures}

服裝：{clothing}{chapterNote ? "\n\n備註：" + chapterNote : ""}
```

例：

```
黑色長髮，雨夜放下散在肩前。雙眼皮，眼尾微下垂。中等偏瘦。鵝蛋臉，膚色偏白；指甲剪短沒擦顏色。

服裝：淺灰色棉麻長裙（過膝），內搭米白色細針織背心，外披一件深咖啡色的薄外套。雨夜走來的路上裙擺與外套下緣已被打濕。
```

## 對 Spec 005（chapter-writer）的影響

ChapterContext.characters 中每個 character 的 `currentAppearance` 欄位的 lookup 邏輯：

```ts
function lookupAppearance(
  fields: CharacterFields,
  currentChapter: number,
): string {
  const chapters = Object.keys(fields.appearanceByChapter)
    .map(Number)
    .filter(n => n <= currentChapter)
    .sort((a, b) => b - a);

  if (chapters.length > 0) {
    return fields.appearanceByChapter[chapters[0]];
  }

  // fallback default：拼接扁平欄位
  return [
    fields.hairAndColor,
    fields.eyes,
    fields.bodyType,
    fields.otherFeatures,
    fields.clothing && `服裝：${fields.clothing}`,
  ].filter(Boolean).join("\n");
}
```

ContextCollector 對每個 relevant character 呼叫此函式，把結果放到 ChapterContext.characters[i].currentAppearance（依 Spec 005 修訂）。

## 跨元件協議

```
client（角色卡編輯器「外貌（圖片）」區）
  │
  ├─ 點「上傳預設圖」 / 「為章節 N 上傳圖」
  │   ├─ 選檔（HTML <input type=file> 或 Tauri dialog）
  │   ├─ client 端先驗證 MIME + 大小
  │   ├─ POST .../portraits (multipart) ──▶
  │   │   apps/api:
  │   │     ├─ zod 驗證
  │   │     ├─ sharp resize / re-encode
  │   │     ├─ atomic write 到 _assets/<slug>/
  │   │     ├─ 更新 frontmatter portrait 欄位
  │   │     ├─ commitIfChanged
  │   │     └─ 回 201
  │   └─ UI 顯示縮圖 + 「從圖解析」按鈕
  │
  ├─ 點「從圖解析」
  │   ├─ POST .../portraits/extract ──▶
  │   │   apps/api:
  │   │     ├─ 蒐集 context
  │   │     ├─ LLMRouter.generate（image content + text prompt）
  │   │     ├─ zod 驗證輸出
  │   │     ├─ 寫 frontmatter
  │   │     ├─ commitIfChanged
  │   │     └─ 回 200
  │   └─ UI 顯示解析結果 + confidence 標記（spinner 期間 disable 按鈕）
  │
  └─ 點「刪除」
      ├─ DELETE .../portraits ──▶
      │   apps/api:
      │     ├─ unlink 檔案
      │     ├─ 清空 frontmatter 對應欄位
      │     ├─ commitIfChanged
      │     └─ 回 200
      └─ UI 移除縮圖
```

## Rename / Delete 角色的資產跟隨

依 Spec 002 對 character CRUD 的事務性，本 spec 補上 `_assets/` 的同步：

### Rename

Spec 002 PUT character 含 `rename` 欄位時，service 流程加：

```
若 rename 不同於現 slug：
  ...（既有：mv .md / mv _status.md / 更新 _index.md）
  + mv characters/_assets/<old>/ → characters/_assets/<new>/
  + 更新 frontmatter portrait.default / byChapter 中 path 字串（替換 _assets/<old>/ → _assets/<new>/）
```

### Delete

Spec 002 DELETE character 流程加：

```
unlink .md / _status.md / _index.md 條目
+ rm -rf characters/_assets/<slug>/  （遞迴刪除）
```

## 並發與一致性

- 圖片上傳走 PQueue per project（與 git 同串列）
- 同一角色同時多次 upload（罕見；UI 應 disable 上傳按鈕在上傳期間）→ server 端先到先服務
- extract 端點與 upload 端點互斥（同 angle 串列）

## 安全考量

1. **路徑驗證**：`_assets/<slug>/` 必須在 projectPath 下；slug 通過 spec 001 sanitize
2. **MIME 偽裝防護**：除了 MIME header，也用 sharp metadata 驗證實際 image 格式
3. **檔案大小硬上限**：10 MB（request body limit），避免 DoS
4. **路徑命名硬限制**：副檔名只接受 `.jpg/.jpeg/.png/.webp`；任何其他副檔名拒絕
5. **EXIF GPS**：MVP 不主動 strip（隱私強化留 P1）；但 sharp 預設不解析 orientation 以外的 EXIF，已部分降低風險

## 資料模型

`CharacterFields.portrait` 與 `appearanceByChapter` 已在 Spec 002 定義；本 spec 不重複。

新增至 `packages/shared-types/src/character-vision.ts`：

```ts
export type PortraitScope = "default" | "chapter";

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface PortraitInfo {
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  uploadedAt: string;
  hasExtracted: boolean;
}

export interface UploadPortraitResponse {
  scope: PortraitScope;
  chapterNumber: number | null;
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  resized: boolean;
  commitSha: string;
}

export interface ExtractPortraitRequest {
  scope: PortraitScope;
  chapterNumber: number | null;
  modelOverride?: string;
}

export interface ExtractPortraitResponse {
  extracted: ExtractorOutput;
  writtenTo: "fields.appearance" | { chapterNumber: number };
  modelId: string;
  durationMs: number;
  commitSha: string | null;
}

export interface ExtractorOutput {
  hairAndColor: string;
  eyes: string;
  bodyType: string;
  otherFeatures: string;
  clothing: string;
  heightHint?: string;
  confidence: Record<keyof ExtractorOutput, "high" | "medium" | "low">;
  chapterNote?: string;
}

export interface ListPortraitsResponse {
  default: PortraitInfo | null;
  byChapter: Array<PortraitInfo & { chapterNumber: number }>;
}
```

## 非功能性

- **效能**：
  - 上傳（resize + encode + write）p95 < 2s（5 MB 圖）
  - extract（含 LLM）p95 < 15s（雲端）/ < 30s（地端 vision）
  - 列表 p95 < 100ms（純 fs stat）
- **容量**：單角色圖檔總量 < 10 MB（軟限制；UI 上限提示）；單專案 < 50 角色 × 5 圖 = 250 MB 級別
- **安全**：見「安全考量」段
- **可用性**：上傳失敗保留原檔；extract 失敗保留 frontmatter
- **跨平台**：sharp lib 跨平台 prebuilt 涵蓋 Win/Mac/Linux；Apple Silicon arm64 已支援

## LLM adapter 合約

- 觸發的產品內 Skill：[`character-image-extractor`](../../skills/character-image-extractor.md)
- **不**受 `style.md` 影響（角色卡是設定文件）
- 上下文：見 character-image-extractor Skill 規格與本 spec 「解析流程」步驟 3
- 串流：否（單次返回 JSON）
- Routing：`settings.yaml.agents.character-image-extractor.routing`
- 失敗處置：依 ADR-0004 / ADR-0009 降級；都失敗則 502
- 品質保證：依 Skill 規格 8 條 golden test

## 開發任務拆解

- [ ] **types-1**: `packages/shared-types/src/character-vision.ts` — 上述全部 interface
- [ ] **types-2**: 補 `packages/shared-types/src/character.ts` 中 CharacterFields.portrait + appearanceByChapter（Spec 002 已宣告，需實際加進 TS）
- [ ] **adapter-1**: `packages/llm-adapter/src/types.ts` — 依 ADR-0009 改 ChatMessage.content + ImageContent
- [ ] **adapter-2**: AnthropicProvider 補 vision 支援
- [ ] **adapter-3**: OpenAIProvider / GoogleProvider / XAIProvider / LMStudioProvider / OllamaProvider 補 vision（M2 補完）
- [ ] **adapter-4**: LLMError 新增 codes（model_lacks_capability / image_too_large / image_format_unsupported）
- [ ] **adapter-5**: LLMRouter capability-aware fallback（含圖時跳過 supportsVision=false 的 fallback）
- [ ] **prompts**: `packages/prompt-library/skills/character-image-extractor.ts`（依 Skill 規格）
- [ ] **be-1**: `apps/api/src/services/portrait-fs.ts`（上傳 / resize / write / unlink / list；用 sharp）
- [ ] **be-2**: `apps/api/src/services/character-image-extract.ts`（呼叫 Skill + 寫 frontmatter + commit）
- [ ] **be-3**: `apps/api/src/routes/portraits.ts`（POST upload / POST extract / DELETE / GET list）
- [ ] **be-4**: Spec 002 既有 PUT character 流程補 rename → mv _assets/
- [ ] **be-5**: Spec 002 既有 DELETE character 流程補 rm -rf _assets/<slug>/
- [ ] **be-6**: 整合 commit-policy（Spec 010）：upload / extract / delete 對應 commit message
- [ ] **fe-1**: `apps/web/src/features/characters/PortraitSection.tsx`（外貌（圖片）區）
- [ ] **fe-2**: `DefaultPortraitCard.tsx`（預設圖 上傳 / 解析 / 刪除）
- [ ] **fe-3**: `ChapterPortraitList.tsx`（章節版本清單 + 「為章節新增照片」按鈕）
- [ ] **fe-4**: 章節下拉選單元件（從 chapter list API 拿）
- [ ] **fe-5**: 圖片上傳 hook：client 端驗證 + 進度
- [ ] **fe-6**: 縮圖 lightbox（點放大）
- [ ] **fe-7**: confidence 標記 ⚠️ icon
- [ ] **fe-8**: provider 連線失敗的 toast / 重試
- [ ] **qa-1**: cucumber-js step definitions for `002b.feature`
- [ ] **qa-2**: portrait-fs 單元測試（sharp resize / unlink / 衝突命名）
- [ ] **qa-3**: extract API 端對端測試（mock LLMProvider with vision capability）
- [ ] **qa-4**: rename / delete 時 _assets/ 跟隨的整合測試
- [ ] **qa-5**: 跨平台路徑測試（Windows 路徑分隔字）

## 變更紀錄

- `2026-05-13`: 初版 Ready（對應 Story 002b 升 P0）
