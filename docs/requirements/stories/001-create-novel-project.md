# 建立新小說專案

> Story ID: `001-create-novel-project`
> Persona: `hobbyist-author`（同樣適用 `serial-author`、`worldbuilder-author`）
> Epic: `unassigned`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `none`
> 修訂：`2026-05-12` — 加入 `git init`（Story 010）+ 建立 `status/story_status.md` 含 heading 骨架（Story 007）+ 每個初始角色同步建立空 `<slug>_status.md`；拿掉建立單檔 `status/character_status.md`（已改一人一檔）；修內部範例不一致

## 使用者故事

身為 **個人創作者**，
我想要 **指定一個本機資料夾並輸入故事三要素（書名、大綱、人物描寫）來建立新小說專案**，
以便 **在自己選的位置（可選擇放在 Drive 同步資料夾下）開始創作，並從一開始就提供 AI 撰寫所需的最小上下文**。

## 背景與動機

依 idea.md：「使用者必須提供故事大綱、人物描寫與人物關係、故事背景、寫作風格與額外寫作需求給 AI 產生故事」。三要素（書名、大綱、人物描寫）是後續所有 AI Agent 動作的最小依據——少了它們，`chapter-writer` 等 Agent 沒有上下文可用。故事背景、寫作風格、額外需求的填寫**留到後續 stories**，避免一次塞太多欄位。

依 [ADR-0001](../../architecture/adr/0001-storage-strategy.md)：本應用為個人本機工具，無登入；專案是使用者本機檔案系統上的一個目錄，可放在 Google Drive 同步路徑下達成備援。

依 Story 010（git 版控）：每個專案資料夾**就是一個 git repo**。建立專案時自動 `git init` 並做 initial commit。

依 Story 007（status memory）：建立專案時同步建立 `status/story_status.md` 含預設 heading 骨架；每個初始角色同步建立 `characters/<slug>_status.md` 空骨架。

## 範圍

**包含：**
- 使用者選擇本機資料夾位置（可在 Drive 同步路徑下）
- 必填欄位：**書名**、**故事大綱**（多行）、**人物描寫**（多行；至少一名角色）— 角色用 Story 002 的「欄位輸入 + AI 統整」流程建立，本 story 入口可以只填名稱與描寫，AI 統整可以延後
- 建立完整專案目錄結構：
  - `project.yaml`
  - `synopsis.md`
  - `characters/_index.md`
  - `characters/<slug>.md`（每個初始角色）
  - `characters/<slug>_status.md`（每個初始角色，空骨架）
  - `chapters/`
  - `chapters/chapter_0001_未命名.md`
  - `status/story_status.md`（含 heading 骨架）
  - `.gitignore`（包含 `.DS_Store`、IDE 暫存檔、`.venv/` 等）
- `git init` + initial commit「init: novel project <name>」
- 將此專案加入「最近開啟」清單（存在 `~/.novel-writer/settings.yaml`）
- 進入第一章編輯器

**不包含：**
- 不要求填寫故事背景、寫作風格、額外寫作需求（後續 stories 處理）
- 不處理多人協作、不需登入
- **不處理開啟既有專案** → Story 008
- 不在此 story 觸發 AI 產生章節大綱（idea 流程第 2 步，另開 Story 011）
- 角色卡的 AI 統整（Story 002）可以在 001 流程後使用者自己進角色編輯做，001 入口只給最小欄位

## `status/story_status.md` 初始骨架

```markdown
# 故事狀態 — <書名>

## 世界觀
（背景設定的演進。建立專案時為空）

## 重要劇情點
（按章節時序記錄）

## 🔖 伏筆
（已埋待回收）
**精簡時 AI 預設跳過此區。**

## ✨ 轉折點
（角色 / 故事走向轉折）
**精簡時 AI 預設跳過此區。**

## 場景
（章節提到的場景描述）
```

## `characters/<slug>_status.md` 初始骨架

```markdown
# <角色名> — 狀態

## 重要狀態變化
（按章節時序記錄）

## 與其他角色的關係

## 🔖 個人伏筆
**精簡時 AI 預設跳過此區。**

## ✨ 個人轉折點
**精簡時 AI 預設跳過此區。**
```

## 驗收條件 (Gherkin)

### Scenario: 在指定資料夾下建立第一個專案
```gherkin
Given 我首次開啟應用，已通過首次啟動警語
When 我在首頁點擊「新小說」
And 我選擇本機資料夾「D:/GoogleDrive/MyNovels」作為專案存放位置
And 我輸入書名「陳伯後宮傳」
And 我輸入故事大綱「陳伯在現代社會中，如何靠著性能力征服女性，建立後宮的故事」
And 我新增一名角色，名稱「陳伯」、描寫「60歲的回收老人，故事中的霸主。外貌醜陋，身材壯碩，186公分、98公斤的高大肥胖身軀。」
And 我提交表單
Then 系統在「D:/GoogleDrive/MyNovels/陳伯後宮傳/」下建立完整專案目錄結構
And 該目錄下存在以下檔案：
  | 路徑 |
  | project.yaml |
  | synopsis.md |
  | characters/_index.md |
  | characters/陳伯.md |
  | characters/陳伯_status.md |
  | chapters/chapter_0001_未命名.md |
  | status/story_status.md |
  | .gitignore |
And synopsis.md 的內容為我輸入的大綱
And characters/陳伯.md 含 frontmatter 欄位（name=陳伯, age=60 等）+ 我輸入的描寫
And characters/陳伯_status.md 是空骨架（含 heading「重要狀態變化 / 與其他角色的關係 / 🔖 個人伏筆 / ✨ 個人轉折點」）
And status/story_status.md 是空骨架（含 heading「世界觀 / 重要劇情點 / 🔖 伏筆 / ✨ 轉折點 / 場景」）
And 該目錄下執行 `git status` 顯示為 clean（已 initial commit）
And `git log` 顯示一個 commit「init: novel project 陳伯後宮傳」
And 我被導向章節編輯器，當前檔案為 chapters/chapter_0001_未命名.md
And 該專案被加入「最近開啟」清單（→ Story 008、009 使用）
```

### Scenario: 任一必填欄位為空時阻擋送出
```gherkin
Given 我在「新小說」對話框
When 我未填書名、或未填故事大綱、或未新增任何角色
And 我提交表單
Then 表單顯示對應的錯誤訊息（例：「請輸入書名」、「請輸入故事大綱」、「請至少新增一名角色」）
And 沒有任何檔案、目錄或 git repo 被建立
```

### Scenario: 目標路徑已存在同名專案資料夾
```gherkin
Given 「D:/GoogleDrive/MyNovels/陳伯後宮傳/」已存在
When 我嘗試在「D:/GoogleDrive/MyNovels」下建立書名為「陳伯後宮傳」的專案
Then 系統顯示「該位置已有同名資料夾，請改名或選擇其他位置」
And 沒有任何檔案被建立或覆寫
And 既有的「陳伯後宮傳」資料夾不被動到
```

### Scenario: 沒有資料夾寫入權限
```gherkin
Given 我選擇了一個唯讀或不存在的資料夾
When 我提交表單
Then 系統顯示「無法寫入該位置：<原因>」
And 沒有部分建立的檔案殘留
And 沒有 git repo 殘留
```

### Scenario: git init 失敗時整個建立流程 rollback
```gherkin
Given 我提交表單，目錄與檔案建立成功
When 系統嘗試 git init 時失敗（例：git binary 不在 PATH）
Then 已建立的目錄與檔案被刪除（rollback）
And 系統顯示「git 初始化失敗：<原因>。請確認 git 已安裝並可在命令列執行」
And 提供「未啟用 git 版控但仍建立專案」的選項供使用者退而求其次
```

### Scenario: 多角色一次建立
```gherkin
Given 我在「新小說」對話框
When 我新增三名角色「蘇晴」「林書言」「謝伯」
And 我填齊書名與大綱並提交
Then 系統建立 characters/蘇晴.md / 林書言.md / 謝伯.md（三個角色卡）
And 同步建立 characters/蘇晴_status.md / 林書言_status.md / 謝伯_status.md（三個空骨架 status）
And initial commit 包含所有檔案
```

## AI 互動細節

不涉及 AI 代理。本 story 僅建立資料骨架，AI 撰寫流程從後續 stories（章節大綱產生、章節撰寫）開始。

注意：使用者也可以在角色填寫面板按「AI 生成角色描述」（Story 002）— 但這是可選的，不阻擋建立流程。沒按 AI 生成的話，角色 .md 的 body 是使用者填的描寫原文。

## UX 注意事項

- 「新小說」按鈕在首頁顯眼位置，鍵盤快捷鍵 `Ctrl+N`
- 對話框聚焦於書名輸入欄；分頁順序：書名 → 大綱 → 角色
- 角色輸入採可摺疊面板，支援「+ 新增角色」（Story 002 的完整欄位 UX）
- 預設專案路徑記住上次選擇的父目錄
- 建立到進入編輯器整體 ≤ 3 秒（檔案 I/O + git init 比 DB insert 慢，但仍應快）
- 大綱與人物描寫支援多行輸入與貼上格式
- git init 失敗時提供「不啟用 git」的退路，但顯示警告「無法 undo / 還原版本」

## 開放問題

- [ ] 第一章預設名稱「未命名」還是「第一章」？目前選「未命名」鼓勵使用者命名
- [ ] 角色 slug 怎麼產生？中文角色名直接當 slug 可能在跨平台檔案系統有風險；目前 Gherkin 用「陳伯.md」，需在 spec 中決定 slug 規則（可能 fallback 用拼音 / 編號）
- [ ] `.gitignore` 預設內容要包含什麼？建議：`.DS_Store`、`Thumbs.db`、編輯器暫存檔、`*.bak`、`*.swp`
- [ ] 使用者要不要看到「git 初始化中…」提示？建議：建立流程的進度條包含「建立檔案 → git init → initial commit」三步
- [ ] 建立專案時要不要詢問是否要 push 到雲端 git remote（GitHub）？答：否，太早；留設定頁（Story 009）日後加
