# Spec: 建立新小說專案

> Story: `docs/requirements/stories/001-create-novel-project.md`
> BDD: `docs/requirements/features/001-create-novel-project.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-10`

## 摘要

建立新小說專案 = 在使用者選擇的本機資料夾下建立一個專案目錄，含 `project.yaml`、`synopsis.md`、`characters/`、`chapters/`、`status/` 子結構，並寫入使用者輸入的書名 / 大綱 / 至少一名角色描寫。完成後將該專案路徑加入「最近開啟」清單，前端路由至第一章編輯器。本 story 不觸發任何 LLM 呼叫。

實作層皆為本機檔案 I/O。apps/api 監聽 localhost，無認證；前端透過 HTTP 呼叫。

## API 合約

### POST /api/novels

**Auth:** `none`（localhost only；apps/api 在啟動時應綁定 `127.0.0.1`，拒絕外部連線）

**Request:**
```ts
{
  parentFolder: string;       // 絕對路徑，例 "D:/GoogleDrive/MyNovels"
  title: string;              // 書名，trim 後非空
  synopsis: string;           // 故事大綱，trim 後非空
  characters: Array<{
    name: string;             // trim 後非空
    description: string;      // trim 後非空
  }>;                         // 至少 1 筆
}
```

**Response 200:**
```ts
{
  project: {
    path: string;             // 例 "D:/GoogleDrive/MyNovels/銀河彼岸"
    title: string;
    createdAt: string;        // ISO 8601
  };
  firstChapter: {
    path: string;             // 例 ".../chapters/chapter_0001_未命名.md"
    title: string;            // "未命名"
    number: number;           // 1
  };
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | `INVALID_INPUT` | 必填欄位空（title / synopsis / characters[]）；errors 陣列指出哪些欄位 |
| 400 | `INVALID_PATH` | parentFolder 不是絕對路徑或路徑格式不合該 OS |
| 403 | `WRITE_FORBIDDEN` | parentFolder 不存在或無寫入權限 |
| 409 | `PROJECT_CONFLICT` | `<parentFolder>/<sanitized-title>` 已存在 |
| 500 | `IO_ERROR` | 寫入過程中失敗（含已寫入檔案的清理結果於 message） |

錯誤回應形式：
```ts
{
  code: string;          // 上表 Code
  message: string;       // 給人看
  fieldErrors?: Record<string, string>;  // INVALID_INPUT 用
}
```

## 資料模型

新增至 `packages/shared-types/src/project.ts`：

```ts
export interface ProjectMeta {
  title: string;
  createdAt: string;          // ISO 8601
  chapterNumbering: {
    digits: number;           // 預設 4
  };
  defaultModels: {
    agent?: string;           // 例 "ollama:qwen2.5:14b"
    skill?: string;
  };
  schemaVersion: number;      // 預設 1
}

export interface CharacterCard {
  slug: string;               // 檔名用，見「Slug 規則」
  name: string;               // 顯示用，原始輸入
  description: string;
}

export interface ChapterRef {
  number: number;             // 1-based
  title: string;              // "未命名" 為預設
  path: string;               // 絕對路徑
}

export interface CreateNovelRequest {
  parentFolder: string;
  title: string;
  synopsis: string;
  characters: Array<{ name: string; description: string }>;
}

export interface CreateNovelResponse {
  project: {
    path: string;
    title: string;
    createdAt: string;
  };
  firstChapter: ChapterRef;
}
```

## 檔案系統佈局（建立後）

```
<parentFolder>/<sanitizedTitle>/
├── project.yaml              # 序列化的 ProjectMeta
├── synopsis.md               # request.synopsis 原文
├── characters/
│   ├── _index.md             # Markdown list 連結到每個角色卡
│   └── <slug>.md             # 每名角色一份
├── chapters/
│   └── chapter_0001_未命名.md  # 空檔案
├── status/
│   ├── story_status.md       # 空檔案
│   └── character_status.md   # 空檔案
├── agents/                   # 空目錄（讓使用者放 override）
└── skills/                   # 空目錄
```

### `project.yaml` 範例

```yaml
title: 銀河彼岸
createdAt: 2026-05-10T03:21:00Z
chapterNumbering:
  digits: 4
defaultModels: {}
schemaVersion: 1
```

### `characters/<slug>.md` 範例

```markdown
# 林川

## 描寫

34 歲的衛星工程師，沉默寡言但心思細膩
```

### `characters/_index.md` 範例

```markdown
# 角色索引

- [林川](./林川.md) — 34 歲的衛星工程師，沉默寡言但心思細膩
```

## Slug 規則

回應 story 中「角色 slug 怎麼產生」這個開放問題：

1. 取 `name` 字串
2. NFC normalize（避免合成字元差異）
3. 移除 / 取代以下字元（檔名危險）：`/ \ : * ? " < > | \0`
4. trim 前後空白；連續空白合併為單個 `_`
5. 若結果為空字串 → 回 `INVALID_INPUT`，欄位錯誤指 `characters[i].name`
6. 同專案內衝突（同 slug 已存在）→ 加後綴 `-2`、`-3`...

書名的 sanitization 同上，套用於專案資料夾名（`<sanitizedTitle>`）。

## 跨元件協議

```
client ──POST /api/novels──▶ apps/api
                              │
                              ├─ 1. 驗證 request（zod schema）
                              ├─ 2. sanitize title → 算 projectPath
                              ├─ 3. 檢查 projectPath 不存在 + parentFolder 可寫
                              ├─ 4. 建立目錄樹（mkdir -p）
                              ├─ 5. 並行寫入：project.yaml / synopsis.md /
                              │           characters/* / chapters/chapter_0001_*.md /
                              │           status/*
                              ├─ 6. 任一寫入失敗 → 清掉已建立的整個 projectPath（rollback）
                              ├─ 7. 寫 ~/.novel-writer/settings.yaml 的 recentProjects
                              └─ 8. 回 200
client ◀──response──────────── api
client → 路由到 /editor?project=<urlencode(path)>&chapter=<encodedPath>
```

**事務性**：純檔案系統無 ACID，採「全有或全無」清理策略——任何步驟失敗則 `rm -rf <projectPath>`。在 5 步並行寫入前先用 6 步驟把錯誤捕捉成 `IO_ERROR` 並做清理。

**recentProjects 寫入**：失敗不影響專案建立成功（記 warn log，回應仍 200）。

## LLM adapter 合約

不涉及 AI。

## 非功能性

- **效能**：建立到回應 p95 < 1s（純檔案 I/O，本機 SSD）；前端到進入編輯器 < 2s
- **容量**：單一專案的子目錄結構固定，建立階段檔案數 ≤ 8；後續章節成長另開 spec 規範
- **安全**：apps/api 必須 bind `127.0.0.1`，不可 0.0.0.0；request body size 限制 1 MiB（足以容納大綱 + 多名角色）
- **可用性**：純本機，無離線 / 連線狀態之分；API 啟動失敗時前端應顯示「請重啟應用」
- **跨平台**：路徑分隔字以 Node `path.join` 處理；slug 規則對 NTFS / APFS / ext4 皆 OK；Windows reserved name（`CON`、`PRN`...）若 sanitize 後落入 → 加後綴 `-novel`

## 開發任務拆解

> 每項應可獨立 PR，且能對應到 .feature 中至少一個 Scenario。

- [ ] **types**: 在 `packages/shared-types/src/project.ts` 加上述 6 個 interface
- [ ] **be-1**: `apps/api/src/services/sanitize.ts` — slug 與 title sanitization 工具 + 單元測試
- [ ] **be-2**: `apps/api/src/services/project-fs.ts` — 建立目錄樹 + rollback + 並行寫入（→ Scenario 1, 4）
- [ ] **be-3**: `apps/api/src/services/recent-projects.ts` — 讀寫 `~/.novel-writer/settings.yaml` 的 recentProjects
- [ ] **be-4**: `apps/api/src/routes/novels.ts` — `POST /api/novels` handler（zod validation、錯誤映射）（→ Scenario 1-4）
- [ ] **be-5**: 在 `apps/api/src/server.ts` 強制 bind `127.0.0.1`、req body 上限
- [ ] **fe-1**: 「新小說」對話框元件（書名 → 大綱 → 角色三步表單）（→ Scenario 1, 2）
- [ ] **fe-2**: 資料夾選擇器（先用文字輸入 + 「上次選的位置」記憶；File System Access API 為 stretch）
- [ ] **fe-3**: 角色輸入子元件（可摺疊面板、+ 新增角色）
- [ ] **fe-4**: 表單驗證 + 錯誤訊息對應到 fieldErrors（→ Scenario 2）
- [ ] **fe-5**: 提交後路由到編輯器，並把 path / chapter 帶入 URL
- [ ] **fe-6**: 首頁「最近開啟」區塊（從 settings.yaml 讀，後續另一個 story 處理「點擊開啟」）
- [ ] **fe-7**: `Ctrl+N` 鍵盤快捷鍵
- [ ] **qa-1**: cucumber-js step definitions for `features/001-create-novel-project.feature`，後端走 supertest，前端走 Playwright
- [ ] **qa-2**: 測試 fixtures：暫存目錄 + 模擬唯讀目錄（permission 測試）
- [ ] **qa-3**: 跨平台 slug 規則的 unit test 矩陣（中文 / 西文 / 含特殊字元 / 空白）

## 變更紀錄

- `2026-05-09`: 初版（Draft，列出三方矛盾）
- `2026-05-10`: PM 釐清完畢；採「書名 + 大綱 + 至少一名角色」三必填；移除「已登入」前提；status → Ready
