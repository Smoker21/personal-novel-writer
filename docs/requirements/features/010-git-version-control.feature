Feature: 章節與狀態的 git 版本控制
  身為個人創作者
  我想要每個小說專案資料夾就是一個 local git repo；當我儲存章節、採用 AI 草稿、更新 status 等任何寫檔動作時，系統自動 git commit；我可以打開「歷史」面板看每章的版本歷史並回退到任何一筆
  以便在 AI 寫亂、status 被誤改、自己手滑刪到段落時都能還原；長期記錄我每章寫了什麼演進歷程

  Scenario: 建立專案時自動 git init + initial commit
    Given 我在首頁點「新小說」
    And 填齊書名「春日記事」、大綱、一名角色「蘇晴」
    When 我提交建立
    Then 系統在專案目錄執行 git init
    And 系統 git add . && git commit -m "init: novel project 春日記事"
    And `git log --oneline` 顯示一個 commit
    And `git status` 顯示 clean

  Scenario: 章節儲存時自動 commit
    Given 我在第一章編輯器，browser draft 有未儲存內容
    When 我按「儲存」按鈕
    Then chapters/chapter_0001_未命名.md 被寫入
    And 系統 git add chapters/chapter_0001_未命名.md && git commit -m "chapter: save chapter 1 未命名"
    And `git log --oneline` 顯示新 commit

  Scenario: 採用 AI 草稿時 commit 含主檔與 prompt.md
    Given 我在第一章編輯器，AI 草稿已產出在草稿面板
    When 我按「採用」並通過確認
    Then chapters/chapter_0001_梅雨初晴.md 與 chapters/chapter_0001_prompt.md 都被寫入
    And 系統 git add 兩個檔 && git commit -m "chapter: adopt AI draft for chapter 1 梅雨初晴"
    And `git log --oneline` 顯示新 commit
    And `git show HEAD --stat` 顯示兩個檔都被改

  Scenario: status-updater 跑完後 commit 多檔
    Given 我採用第二章，status-updater 跑完
    And status/story_status.md 與 characters/{蘇晴,林書言}_status.md 都被更新
    When status-updater 寫完所有檔
    Then 系統 git add 三個檔 && git commit -m "status: update after adopt chapter 2"
    And 一個 commit 涵蓋所有 status 檔的更新

  Scenario: status-updater 沒實際改動 status 檔則無 commit
    Given 我採用第三章
    And status-updater 跑完，但 LLM 認為「沒有重大演進需要更新 status」，新版內容與舊版完全相同
    When 系統嘗試 commit
    Then `git status` 顯示沒有變更
    And 系統不執行 commit（避免空 commit）

  Scenario: 「歷史」面板列出該章的 commit 歷史
    Given 第一章經過：建立 → 手動儲存 5 次 → AI 採用 → 手動修了一段再儲存
    And `git log --oneline -- chapters/chapter_0001_*.md` 顯示 8 個 commit
    When 我在第一章編輯器點「歷史」按鈕
    Then 歷史面板列出 8 個 commit，每個顯示：
      - commit message（例「chapter: adopt AI draft for chapter 1 梅雨初晴」）
      - 時間（相對時間「3 小時前」+ tooltip 完整時間）
      - 字數變化（例「+420 字」）
    And 最新的 commit 在最上方，標記「目前版本」

  Scenario: 預覽歷史 commit 的內容
    Given 我打開歷史面板
    When 我點某個歷史 commit
    Then 右側顯示該 commit 當時的章節內容（唯讀）
    And 顯示「還原到此版本」與「Diff 與當前比較」兩個按鈕

  Scenario: 還原到歷史版本
    Given 我在歷史面板選了一個歷史 commit「3 天前 chapter: save chapter 1」
    When 我點「還原到此版本」並通過二次確認
    Then 系統把該檔內容覆寫為該 commit 的版本
    And 系統 git add . && git commit -m "chapter: revert chapter 1 to <commit hash 短>"
    And 編輯器主編輯區更新顯示還原後內容
    And 歷史面板新增一個 commit
    And browser draft 被清空避免衝突

  Scenario: Diff 比較當前與歷史版本
    Given 我在歷史面板選了一個歷史 commit
    When 我點「Diff 與當前比較」
    Then 系統顯示 unified diff（紅 = 從該歷史版被刪、綠 = 當前新增）
    And 使用者可滾動瀏覽
    And 不能在 diff 視圖中編輯

  Scenario: 角色卡 / status 檔也有歷史面板
    Given characters/蘇晴.md 經歷 3 次編輯（每次按儲存都 commit）
    When 我在角色編輯畫面點「歷史」按鈕
    Then 同樣的歷史面板顯示這 3 個 commit
    And 可預覽 / 還原 / diff

  Scenario: Drive 同步把另一台電腦的變更帶來
    Given 我在 A 電腦寫了第三章並 commit
    And Drive 把 .git 與檔案都同步到 B 電腦
    When 我在 B 電腦打開該專案
    Then `git log --oneline` 在 B 電腦上看得到 A 電腦的 commit
    And 編輯器看得到第三章的最新內容
    And 不需要任何手動 push / pull（Drive 直接同步檔案，包括 .git/）

  Scenario: 手動觸發 commit
    Given 我從外部編輯器修改了 synopsis.md（沒透過 app）
    And `git status` 顯示 synopsis.md 為 modified 但 uncommitted
    When 我在 app 的「git status」面板點「commit 所有變更」
    And 填入 commit message「synopsis: 補完第三幕大綱」
    Then 系統 git add . && git commit -m "synopsis: 補完第三幕大綱"
    And 該變更進入版本歷史
