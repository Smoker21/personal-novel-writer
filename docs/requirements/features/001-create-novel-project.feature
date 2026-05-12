Feature: 建立新小說專案
  身為個人創作者
  我想要指定一個本機資料夾並輸入故事三要素（書名、大綱、人物描寫）來建立新小說專案
  以便在自己選的位置（可選擇放在 Drive 同步資料夾下）開始創作，並從一開始就提供 AI 撰寫所需的最小上下文

  Scenario: 在指定資料夾下建立第一個專案
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

  Scenario: 任一必填欄位為空時阻擋送出
    Given 我在「新小說」對話框
    When 我未填書名、或未填故事大綱、或未新增任何角色
    And 我提交表單
    Then 表單顯示對應的錯誤訊息（例：「請輸入書名」、「請輸入故事大綱」、「請至少新增一名角色」）
    And 沒有任何檔案、目錄或 git repo 被建立

  Scenario: 目標路徑已存在同名專案資料夾
    Given 「D:/GoogleDrive/MyNovels/陳伯後宮傳/」已存在
    When 我嘗試在「D:/GoogleDrive/MyNovels」下建立書名為「陳伯後宮傳」的專案
    Then 系統顯示「該位置已有同名資料夾，請改名或選擇其他位置」
    And 沒有任何檔案被建立或覆寫
    And 既有的「陳伯後宮傳」資料夾不被動到

  Scenario: 沒有資料夾寫入權限
    Given 我選擇了一個唯讀或不存在的資料夾
    When 我提交表單
    Then 系統顯示「無法寫入該位置：<原因>」
    And 沒有部分建立的檔案殘留
    And 沒有 git repo 殘留

  Scenario: git init 失敗時整個建立流程 rollback
    Given 我提交表單，目錄與檔案建立成功
    When 系統嘗試 git init 時失敗（例：git binary 不在 PATH）
    Then 已建立的目錄與檔案被刪除（rollback）
    And 系統顯示「git 初始化失敗：<原因>。請確認 git 已安裝並可在命令列執行」
    And 提供「未啟用 git 版控但仍建立專案」的選項供使用者退而求其次

  Scenario: 多角色一次建立
    Given 我在「新小說」對話框
    When 我新增三名角色「蘇晴」「林書言」「謝伯」
    And 我填齊書名與大綱並提交
    Then 系統建立 characters/蘇晴.md / 林書言.md / 謝伯.md（三個角色卡）
    And 同步建立 characters/蘇晴_status.md / 林書言_status.md / 謝伯_status.md（三個空骨架 status）
    And initial commit 包含所有檔案
