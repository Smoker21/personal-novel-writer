# 0002. Agent 與 Skill 的分層、命名規範與檔頭規則

- Status: `Accepted`
- Date: `2026-05-09`
- Deciders: 專案發起人 + product-manager + spec-architect

## Context

idea.md 第 37 條把 Agent 與 Skill 並列為「兩種可選的實作方式」，但兩者性質、觸發、生命週期均不同，必須區分；同時必須與 Claude Code 既有 `.claude/agents/` 與 `.claude/skills/`（開發期工具）切割清楚，否則文件會混淆。

PM 釐清 Q4 結論：分開放、命名要直覺。

## Decision

### 1. 三層命名空間

| 層 | 路徑 | 用途 | 由誰寫 |
|----|------|------|--------|
| 開發期 | `.claude/agents/`、`.claude/skills/` | 給 Claude Code 用，協助開發本專案 | 開發者 |
| 產品內 — 全域使用者層 | `~/.novel-writer/agents/`、`~/.novel-writer/skills/` | 應用執行時讀取 | 內建 default 出貨 + 使用者擴充 |
| 產品內 — 專案 override | `<project>/agents/`、`<project>/skills/` | 該專案特殊行為，會跟著 Drive 同步 | 使用者 |

**解析順序**（執行時）：專案 override > 全域使用者 > 內建 default。同名後者勝出。

### 2. Agent vs Skill 區分

| 物件 | 性質 | 命名規則 | 範例 |
|------|------|---------|------|
| **Agent** | 自主多步流程；內部會多輪呼叫 LLM、做決策、產出整段成果 | **角色職稱（名詞 / 名詞片語）** | `story-creator`、`chapter-writer`、`character-designer`、`scene-builder`、`continuity-checker`、`reviewer` |
| **Skill** | 單次操作；明確輸入輸出；使用者勾選或選取後觸發 | **動詞 + 受詞** | `polish-prose`、`shorten`、`expand`、`make-dialogue-natural`、`add-sensory-details` |

口訣：**Agent 是「誰」，Skill 是「做什麼」**。

### 3. 檔案命名

- 全 kebab-case：`story-creator.md`、`polish-prose.md`
- 副檔名一律 `.md`（含 YAML frontmatter）
- 禁用底線、空格、CamelCase 於檔名

### 4. 檔頭規則（強制）

每份 `.md` 檔開頭，frontmatter 之後**必須**有「人讀視角」說明區塊，三句話格式：

```markdown
---
name: <slug>
type: agent | skill
description: <給 LLM / 系統解析的單行描述>
---

# <顯示名稱> (`<slug>`)

> **這是什麼**：<一句話說明用途>
> **何時用**：<觸發點 / 使用情境>
> **不做什麼**：<明確的職責邊界，避免與其他 Agent/Skill 重疊>
```

驗收條件：缺少這三句話的 Agent / Skill 文件視為不合格。

### 5. 文件位置

- `docs/agents/` — 產品內 Agent **規格**（含內建 default 與設計指引）
- `docs/skills/` — 產品內 Skill **規格**
- 兩者皆有 `_template.md` 與 `README.md`
- 內建 default 出貨時隨應用打包到 `~/.novel-writer/` 的對應位置

### 6. Claude Code 開發期不受影響

`.claude/agents/` 與 `.claude/skills/` 沿用 Claude Code 慣例（既有檔案不動）。

## Consequences

**Positive:**

- 使用者讀檔名就知道是什麼（`polish-prose` 是動作、`story-creator` 是角色），不需翻文件
- 三層命名空間支援漸進客製化：先用 default、不滿意覆蓋全域、特定專案再 override
- 檔頭三句話強制讓開發者與使用者一打開檔就懂，不必看 frontmatter
- 與 Claude Code 既有風格一致（user/.claude vs project/.claude），學習負擔低

**Negative:**

- 既有 `docs/ai-agents/` 必須遷移為 `docs/agents/`，已寫的 README / template 要跟著動
- 命名邊界不總是明確：有些功能介於 Agent 與 Skill 之間（例「續寫」是流程還是操作？），需個案判斷
- 三層解析順序對使用者來說是隱性概念，UI 要清楚顯示「這次跑的是哪一層的版本」

**Neutral:**

- 內建 default 的版本管理走 semver 隨應用版本走；使用者自寫的 agent/skill 自負其責

## Alternatives considered

### Option A: 不區分 Agent / Skill，全部叫 Skill
- Pros: 最簡單
- Cons: 違背 idea 第 37 條的明確區分；自主流程與單次操作兩者特性差異大，混在一起難以設計 UI（Agent 需要「中止」按鈕，Skill 需要「套用 / 取消」按鈕）
- 為何不選：早期省事，後期會被反咬

### Option B: 沿用 Preset / Recipe / Style 等中性命名
- Pros: 與 Claude Code 完全切開，無誤會空間
- Cons: idea.md 已用 Agent / Skill 命名，使用者已建立心智模型；Preset / Recipe 對中文使用者更不直覺
- 為何不選：使用者明確表態偏好沿用 Agent / Skill

### Option C: 全部放 .claude/ 下與 Claude Code 共用
- Pros: 一個目錄
- Cons: Claude Code 開發期工具會被產品內檔案污染；產品執行時讀 `.claude/` 也讓開發 / 使用兩種角色混在同一個空間
- 為何不選：權限與責任要分得乾淨

## References

- `docs/requirements/idea.md` 第 37 條
- `docs/architecture/adr/0001-storage-strategy.md`（三層儲存決策）
- 對話紀錄：PM 釐清 Q4
