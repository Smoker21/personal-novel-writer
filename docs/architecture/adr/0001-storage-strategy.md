# 0001. 儲存策略：本機檔案為主、本機 SQLite 為輔、Drive 同步使用者內容

- Status: `Accepted`
- Date: `2026-05-09`
- Deciders: 專案發起人 + spec-architect

## Context

本應用為**個人本機工具**（見 idea.md 第 31 條與 PM 釐清 Q2），無內建伺服器、無登入。但使用者要求支援把內容同步到自己的雲端硬碟（如 Google Drive）作為跨裝置備援。

需釐清三類資料的存放與同步策略：

1. **使用者珍貴資料**：小說內容、角色設定、世界觀、章節提示詞——掉了會痛
2. **衍生資料**：全文搜尋索引、章節摘要快取、metadata 索引——可從 (1) 重建
3. **環境資料**：API key、地端 endpoint、模型偏好——機密且綁裝置

idea.md 描述大量 `.md` 檔（`synopsis.md`、`Character.md`、`chapter_####_*.md`、`story_status.md`、`character_status.md` 等）。Google Drive 對單檔同步可靠，對多檔複雜資料庫不可靠（多裝置開啟易壞檔）。

## Decision

採用**三層儲存**：

### 1. 使用者內容層（Drive 同步友善）

每個小說專案是一個**目錄**，使用者自選擺在 Drive 同步路徑下。內部全為純文字檔（`.md` / `.yaml`）。

```
<使用者選的同步資料夾>/<專案名>/
├── project.yaml             # 專案 metadata（建立時間、預設模型、章節編號規則…）
├── synopsis.md              # 故事大綱（必填）
├── characters/              # 人物
│   ├── _index.md            # 人物關係概覽
│   └── <character-slug>.md  # 個別人物卡（必填至少 1 份）
├── world/                   # 世界觀（場景模組產出，optional）
│   └── *.md
├── chapters/                # 章節
│   ├── chapter_0001_<title>.md
│   ├── chapter_0001_prompt.md   # 該章生成時用的提示詞
│   ├── chapter_0001_versions/   # 該章採用前的歷史版本
│   │   └── v_YYYYMMDD_HHMMSS.md
│   └── ...
├── status/                  # 給 AI 續寫用的精簡狀態
│   ├── story_status.md
│   └── character_status.md
├── agents/                  # 此專案的 Agent override（optional）
└── skills/                  # 此專案的 Skill override（optional）
```

### 2. 本機衍生層（不同步）

```
~/.novel-writer/
├── cache/
│   └── <project-hash>/
│       ├── index.db         # SQLite：FTS5 全文索引、章節摘要、最後修改時間…
│       └── ...
└── logs/
```

`<project-hash>` 由專案目錄絕對路徑 hash 而來。換機 / 清快取 / 換路徑就重建，不會痛。

### 3. 全域設定層（不同步）

```
~/.novel-writer/
├── settings.yaml            # API key、地端 endpoint、預設模型、UI 偏好
├── agents/                  # 全域 Agent 預設（內建 + 使用者擴充）
└── skills/                  # 全域 Skill 預設
```

執行時 Agent / Skill 解析順序：**專案 override > 全域使用者 > 內建 default**（同名後者勝出）。

## Consequences

**Positive:**

- 使用者可直接用 Drive / git / 任何同步工具備份內容，不被應用綁架
- API key 絕不上 Drive，洩密風險低
- SQLite 不參與同步，避開「多裝置開同一份 DB 壞檔」的經典坑
- 衍生資料隨時可重建，沒有「修了又壞」的遷移痛
- 內容是純文字，使用者可手改、可 grep、可在離線時用任何編輯器處理

**Negative:**

- 全文搜尋與向量檢索需要重建 index，換機後第一次開專案要等
- 沒有 ACID 跨檔事務，併發寫入要靠應用層保證單一寫者（個人工具一般沒這問題）
- Drive 同步衝突仍可能發生（兩台機器同時改同一章），需設計衝突偵測與保留兩版

**Neutral:**

- 章節版本快照採資料夾＋時間戳（`chapter_####_versions/v_*.md`），不依賴 git，使用者自行接 git 也不衝突

## Alternatives considered

### Option A: 純 SQLite（單檔）放 Drive
- Pros: 查詢強、單檔好同步
- Cons: SQLite 跨裝置同步是已知大坑（並發 / fsync / 鎖檔）；使用者無法直接讀內容
- 為何不選：違背 idea 中「使用者可以讀寫 .md」的精神，且風險高

### Option B: LanceDB
- Pros: 原生向量、混合查詢方便
- Cons: 多檔目錄結構不適合同步；生態不如 SQLite；本應用前期不需要向量
- 為何不選：見討論記錄；未來真要向量檢索改走 sqlite-vec 擴充即可

### Option C: 純檔案，無 SQLite
- Pros: 最簡
- Cons: 100 章後全文搜尋會慢；摘要 / metadata 每次掃檔不可行
- 為何不選：可預期會在中期觸頂

## References

- `docs/requirements/idea.md`
- 對話紀錄：PM 釐清 Q2、Q3
