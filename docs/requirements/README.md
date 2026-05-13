# 需求文件

User stories 統一採 **Connextra + Gherkin** 格式。idea.md 為原始構想，已切成下列 epic / story。

## 結構

```
requirements/
├── README.md          # 本檔（含 epic / story 清單）
├── _template.md       # Story 範本
├── personas.md        # 使用者人物誌
├── idea.md            # 原始構想
├── epics/             # 大型功能集合（≥3 個 stories 才開 epic）
├── stories/           # 個別 user stories，編號連續
└── features/          # 對應 BDD .feature
```

## 命名

- Story：`<NNN>-<verb-noun-slug>.md`，例 `001-create-novel-project.md`
- Epic：`EPIC-<NN>-<slug>.md`

## 主軸

整個應用的核心是：**AI 在小說撰寫過程中持續維持對故事與人物的記憶**。技術上由「狀態檔（`story_status.md` / `character_status.md`）+ 章節歸檔提示詞 + 跨章記憶檢索」三件事構成。EPIC-04 是這個主軸的核心，其他 epics 圍繞它。

## Epic 與 Story 清單

> ✅ 寫好 / ✏️ 草稿 / 📋 待寫

### EPIC-01 — 專案資料骨架

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 001 | 建立新小說專案 | P0 | M | ✏️ Ready |
| 008 | 開啟既有小說專案 | P0 | S | 📋 |
| 009 | 編輯專案設定（書名、預設模型、寫作風格、額外需求） | P0 | M | 📋 |
| 010 | 「最近開啟」清單管理 | P1 | S | 📋 |

### EPIC-02 — 人物創作

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 002 | 新增 / 編輯角色卡（欄位 + AI 統整 + portrait/appearanceByChapter schema） | P0 | M | ✅ Ready |
| **002b** | **角色卡：上傳參考圖 → vision 解析（含章節敏感版本）** | **P0**（2026-05-13 升） | **M** | **✅ Ready** |
| 002c | 文字 → AI 生圖 → vision 回寫 | P2 | L | 📋 v0.3+ |
| 012 | AI 輔助產生角色個性（基於 MBTI + 設定） | P1 | M | 📋 |
| 013 | 角色關係圖 / 索引維護 | P2 | M | 📋 |

### EPIC-03 — 章節撰寫流程（人）

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 003 | 章節編輯器：開啟、編輯、自動儲存 | P0 | M | ✏️ |
| 004 | 章節編輯器：Undo / Redo | P0 | S | ✏️ |
| 014 | 章節版本快照：手動儲存 | P0 | S | 📋 |
| 015 | 章節版本快照：回退到舊版本 | P0 | S | 📋 |
| 016 | 手動撰寫章節大綱（chapter.md） | P0 | S | 📋 |

### EPIC-04 — AI 撰寫與記憶（核心）

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 005 | AI 撰寫單章（chapter-writer 串流產出） | P0 | L | ✏️ |
| 006 | 採用 AI 草稿並歸檔（含寫提示詞） | P0 | M | ✏️ |
| 007 | 採用後更新故事 / 人物狀態 | P0 | M | ✏️ |
| 017 | AI 產生章節大綱（多方案） | P0 | M | 📋 |
| 018 | AI 章節續寫（避免割裂） | P0 | M | 📋 |
| 019 | AI 章節標題產生 | P1 | S | 📋 |
| 020 | 跨章節記憶檢索（FTS5 撈相關前文） | P1 | L | 📋 |

### EPIC-05 — 局部潤飾與審稿

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 021 | 選取潤飾（polish-prose Skill） | P1 | M | 📋 |
| 022 | 潤飾結果可回退 | P1 | S | 📋 |
| 023 | 編輯審稿模式（reviewer Agent） | P2 | L | 📋 |
| 024 | 自訂審稿 Skill | P2 | M | 📋 |

### EPIC-06 — 模型與 Agent / Skill 設定

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 025 | 設定 API key 與地端 endpoint | P0 | S | 📋 |
| 026 | 模型選擇器 UI（雲端 / 地端 + 模型清單） | P1 | M | 📋 |
| 027 | 為各 Agent 指定不同模型 | P1 | M | 📋 |
| 028 | 編輯 Agent / Skill 定義檔 | P2 | L | 📋 |

### EPIC-07 — 場景與世界觀

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 029 | 場景模組：選時代 / 背景 | P2 | M | 📋 |
| 030 | 自訂世界觀片段（時代道具白名單 / 黑名單） | P2 | M | 📋 |
| 031 | AI 場景建構：從種子推導細節 | P2 | M | 📋 |

### EPIC-08 — 應用基礎

| ID | Story | Priority | Size | Status |
|----|-------|----------|------|--------|
| 032 | 首次啟動警語 | P0 | S | 📋 |
| 033 | Drive 同步衝突偵測 | P1 | M | 📋 |
| 034 | 故事發想模組（optional 入口） | P2 | M | 📋 |
| 035 | 匯出（Markdown / EPUB / PDF） | P2 | L | 📋 |

## 撰寫流程

1. 確認 persona 已存在於 `personas.md`
2. 用 `write-user-story` skill 或請 `product-manager` 子代理協助
3. 至少 1 個 happy path + 1 個 edge/error scenario
4. AI 功能類額外加品質性質 scenario
5. 設定 priority（P0/P1/P2）與 size（S/M/L/XL）
6. **同步產出 `.feature` 檔，Scenario 文字逐字一致**

## Status flow

```
Draft → Ready → In Progress → Done
                    ↓
                 Blocked
```

## 範例值約定

為了讓 BDD .feature 可重用 fixture，新 stories 預設使用以下範例值（除 001 外）：

- 專案名：「春日記事」
- 角色：「蘇晴」（30 歲女作家）、「林書言」（28 歲書店老闆）
- 章節：第一章「梅雨初晴」、第二章「書店的訪客」

001 因業務情境特殊保留原範例。
