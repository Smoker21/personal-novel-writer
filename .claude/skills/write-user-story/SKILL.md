---
name: write-user-story
description: Author a Connextra + Gherkin user story under docs/requirements/stories/ AND its matching executable BDD .feature file under docs/requirements/features/ for the novel-writing app. Use when the user says "write a story for…", "add a story about…", "let's spec out feature X", or otherwise asks to capture a feature as a backlog item. Always confirms persona and gathers acceptance scenarios before writing. Always produces both files in lockstep — they share Scenario text verbatim.
---

# Write User Story

## When to use

使用者要求把功能想法寫成 user story 時。例如：
- 「幫我寫一個關於『章節版本回溯』的 story」
- 「我想要一個能多人協作的功能，幫我建 story」
- 「我們要做 AI 角色卡片產生器，先寫 story」

## Steps

1. **讀情境**：用 Glob 列出 `docs/requirements/stories/` 與 `docs/requirements/features/` 既有檔案；用 Read 讀 `docs/requirements/personas.md` 與 `docs/requirements/_template.md`
2. **釐清未知**（用 AskUserQuestion，最多 3 題）：
   - 服務的 persona 是哪個？
   - 主要使用者目的（不是「按按鈕」，是「為何而做」）？
   - 至少 1 個 happy path 與 1 個 edge / error 場景？
   若使用者已在訊息中明確給出，跳過該題
3. **取編號**：掃 stories/ 目錄，下一個編號補零三位（與 features/ 對齊）
4. **產生 story markdown**：複製 `_template.md` 結構，填入內容，存到 `docs/requirements/stories/<NNN>-<verb-noun-slug>.md`
5. **產生對應 .feature 檔**：存到 `docs/requirements/features/<NNN>-<verb-noun-slug>.feature`，規則：
   - 第一行 `Feature: <story 標題>`
   - 接下來三行寫 Connextra 三句敘述（如 example/001 所示）
   - 每個 markdown 中的 `Scenario:` 區塊原封不動複製到 .feature
   - **Scenario 名稱與步驟文字逐字一致**——不可改字、不可加字、不可重排
   - Gherkin 關鍵字保留英文（`Feature` / `Scenario` / `Given` / `When` / `Then` / `And`）
6. **內部一致性檢核**：
   - story markdown「**範圍 – 包含**」是否與 Gherkin Scenario 對得上？對不上 → 不要硬寫，改回 step 2 用 AskUserQuestion 釐清
   - 每個 Scenario 是否獨立可測？
   - 驗收條件是否避開實作細節（不寫「呼叫 POST /api/x」）？
   - 是否標註優先序與規模？
7. **回報**：回給使用者**兩個檔名** + 一句摘要 + 點出**已寫死的假設**讓使用者覆核

## Scenario 對齊鐵律

markdown 的 Gherkin 區塊與 .feature 是**同一份內容的兩處鏡像**。QA 將來會用 .feature 中的 Scenario 文字當作 step definition 的綁定鍵。任何改動 → 兩處同步，禁止漂移。

## Output templates

- Story markdown：套 `docs/requirements/_template.md`，不自創欄位順序
- .feature 檔：參考 `docs/requirements/features/001-create-novel-project.feature`

## Common mistakes to avoid

- 把 UI 細節（按鈕位置、顏色）寫進 story → 改寫為使用者目的
- Scenario 之間互相依賴 → 每個 Scenario 必須能獨立執行
- 只寫 happy path → 至少要有一個 edge / error
- 對 AI 功能寫「AI 給出好建議」這種無法驗收的條件 → 改為可觀察性質：「至少 3 個方案」「不變更原有角色名」「回傳合法 JSON」
- **只寫 markdown 沒寫 .feature**（或反之）→ 兩份缺一不可
- **markdown 的 Scenario 與 .feature 漂移** → 漂移=破壞測試
