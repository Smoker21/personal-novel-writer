# 章節與狀態的 git 版本控制

> Story ID: `010-git-version-control`
> Persona: `hobbyist-author`、`serial-author`、`worldbuilder-author`
> Epic: `unassigned`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `001`（建立專案時 git init）

## 使用者故事

身為 **個人創作者**，
我想要 **每個小說專案資料夾就是一個 local git repo；當我儲存章節、採用 AI 草稿、更新 status 等任何寫檔動作時，系統自動 git commit；我可以打開「歷史」面板看每章的版本歷史並回退到任何一筆**，
以便 **在 AI 寫亂、status 被誤改、自己手滑刪到段落時都能還原；長期記錄我每章寫了什麼演進歷程**。

## 背景與動機

舊版本設計（Spec 006 / 007 修訂前）用 `chapters/_versions/v_TS.md` 與 `status/_versions/v_TS/` 自管快照，但：

1. 每改一次就拷一個檔，目錄很快爆
2. 只能整檔回退，沒有 diff 比較
3. 手動寫的版本管理重複造輪子

**改用 git** 解決所有問題：
- diff / log / blame / checkout 全部都有
- 內容相同的版本不重複存（git pack）
- 使用者熟 git 的話可在外面用任何 git tool（GitHub Desktop / SourceTree / git CLI）操作
- 將來若要 push 到 GitHub 雲端備份是現成的

依使用者明示（2026-05-12）：「**建立 git server，使用 git 存版本就好**」+ 「**每個小說專案就是一個 local git repo**」。

## 範圍

**包含：**
- 建立專案（Story 001）時自動 `git init` + initial commit
- 每個寫 .md 的動作（章節儲存 / 採用 / status 更新 / 角色卡編輯 / status 編輯）都自動 commit，commit message 描述動作
- 章節編輯器旁有「歷史」按鈕 → 開歷史面板，列出該章的 commit 歷史
- 歷史面板可：
  - 點任一 commit 看當時內容（preview）
  - 點「還原到此版本」→ 該檔內容回到該 commit 的版本（會新增一個 revert commit）
  - 點「diff」看與當前版本的差異
- status 檔（story_status.md / 各 character_status.md）也有同樣歷史面板
- 角色卡（characters/<slug>.md）也有同樣歷史面板
- 提供「git status」面板（次要功能）顯示整個 repo 的 dirty / untracked
- 必要時手動觸發「commit 所有未 commit 變更」（給 Drive 同步衝突修復用）

**不包含（v0.1 MVP）：**
- 推到雲端 git remote（GitHub / GitLab）→ Story 016（v0.2）
- branching / merge → 不做（小說寫作沒這需求）
- pull from remote → 同上
- 多人協作 → 不做
- git CLI passthrough（在 app 裡跑任意 git command）→ 不做

## Commit message 規範

每個觸發 commit 的動作有固定格式，方便日後 grep / 過濾：

| 動作 | Commit message |
|------|----------------|
| 建立專案 | `init: novel project <title>` |
| 章節儲存 | `chapter: save chapter <N> <title>` |
| 章節採用 AI 草稿 | `chapter: adopt AI draft for chapter <N> <title>` |
| 章節重命名 | `chapter: rename chapter <N> from <old> to <new>` |
| 章節刪除 | `chapter: delete chapter <N> <title>` |
| status 更新（採用後）| `status: update after adopt chapter <N>` |
| status 更新（儲存後）| `status: update after save chapter <N>` |
| status 更新（手動觸發）| `status: manual update after chapter <N>` |
| status AI 精簡 | `status: AI shorten <filename>` |
| status 手動編輯 | `status: manual edit <filename>` |
| 角色卡建立 | `character: create <slug>` |
| 角色卡編輯 | `character: edit <slug>` |
| 角色卡 AI 重生成 | `character: regenerate <slug>` |
| 角色卡刪除 | `character: delete <slug>` |

每個 commit 自動帶上 `author: novel-writer-app <noreply@local>` 與時間戳。

## 驗收條件 (Gherkin)

### Scenario: 建立專案時自動 git init + initial commit
```gherkin
Given 我在首頁點「新小說」
And 填齊書名「春日記事」、大綱、一名角色「蘇晴」
When 我提交建立
Then 系統在專案目錄執行 git init
And 系統 git add . && git commit -m "init: novel project 春日記事"
And `git log --oneline` 顯示一個 commit
And `git status` 顯示 clean
```

### Scenario: 章節儲存時自動 commit
```gherkin
Given 我在第一章編輯器，browser draft 有未儲存內容
When 我按「儲存」按鈕
Then chapters/chapter_0001_未命名.md 被寫入
And 系統 git add chapters/chapter_0001_未命名.md && git commit -m "chapter: save chapter 1 未命名"
And `git log --oneline` 顯示新 commit
```

### Scenario: 採用 AI 草稿時 commit 含主檔與 prompt.md
```gherkin
Given 我在第一章編輯器，AI 草稿已產出在草稿面板
When 我按「採用」並通過確認
Then chapters/chapter_0001_梅雨初晴.md 與 chapters/chapter_0001_prompt.md 都被寫入
And 系統 git add 兩個檔 && git commit -m "chapter: adopt AI draft for chapter 1 梅雨初晴"
And `git log --oneline` 顯示新 commit
And `git show HEAD --stat` 顯示兩個檔都被改
```

### Scenario: status-updater 跑完後 commit 多檔
```gherkin
Given 我採用第二章，status-updater 跑完
And status/story_status.md 與 characters/{蘇晴,林書言}_status.md 都被更新
When status-updater 寫完所有檔
Then 系統 git add 三個檔 && git commit -m "status: update after adopt chapter 2"
And 一個 commit 涵蓋所有 status 檔的更新
```

### Scenario: status-updater 沒實際改動 status 檔則無 commit
```gherkin
Given 我採用第三章
And status-updater 跑完，但 LLM 認為「沒有重大演進需要更新 status」，新版內容與舊版完全相同
When 系統嘗試 commit
Then `git status` 顯示沒有變更
And 系統不執行 commit（避免空 commit）
```

### Scenario: 「歷史」面板列出該章的 commit 歷史
```gherkin
Given 第一章經過：建立 → 手動儲存 5 次 → AI 採用 → 手動修了一段再儲存
And `git log --oneline -- chapters/chapter_0001_*.md` 顯示 8 個 commit
When 我在第一章編輯器點「歷史」按鈕
Then 歷史面板列出 8 個 commit，每個顯示：
  - commit message（例「chapter: adopt AI draft for chapter 1 梅雨初晴」）
  - 時間（相對時間「3 小時前」+ tooltip 完整時間）
  - 字數變化（例「+420 字」）
And 最新的 commit 在最上方，標記「目前版本」
```

### Scenario: 預覽歷史 commit 的內容
```gherkin
Given 我打開歷史面板
When 我點某個歷史 commit
Then 右側顯示該 commit 當時的章節內容（唯讀）
And 顯示「還原到此版本」與「Diff 與當前比較」兩個按鈕
```

### Scenario: 還原到歷史版本
```gherkin
Given 我在歷史面板選了一個歷史 commit「3 天前 chapter: save chapter 1」
When 我點「還原到此版本」並通過二次確認
Then 系統把該檔內容覆寫為該 commit 的版本
And 系統 git add . && git commit -m "chapter: revert chapter 1 to <commit hash 短>"
And 編輯器主編輯區更新顯示還原後內容
And 歷史面板新增一個 commit
And browser draft 被清空避免衝突
```

### Scenario: Diff 比較當前與歷史版本
```gherkin
Given 我在歷史面板選了一個歷史 commit
When 我點「Diff 與當前比較」
Then 系統顯示 unified diff（紅 = 從該歷史版被刪、綠 = 當前新增）
And 使用者可滾動瀏覽
And 不能在 diff 視圖中編輯
```

### Scenario: 角色卡 / status 檔也有歷史面板
```gherkin
Given characters/蘇晴.md 經歷 3 次編輯（每次按儲存都 commit）
When 我在角色編輯畫面點「歷史」按鈕
Then 同樣的歷史面板顯示這 3 個 commit
And 可預覽 / 還原 / diff
```

### Scenario: Drive 同步把另一台電腦的變更帶來
```gherkin
Given 我在 A 電腦寫了第三章並 commit
And Drive 把 .git 與檔案都同步到 B 電腦
When 我在 B 電腦打開該專案
Then `git log --oneline` 在 B 電腦上看得到 A 電腦的 commit
And 編輯器看得到第三章的最新內容
And 不需要任何手動 push / pull（Drive 直接同步檔案，包括 .git/）
```

> **說明**：Drive 同步 .git/ 是「整個 repo 當資料夾同步」，避開了 git 多 remote 推送的複雜性。Drive 同步衝突（罕見）會表現為 .git/ 內部檔案衝突，使用者要手動修復——這是 Drive 同步固有風險，本 story 不處理。

### Scenario: 手動觸發 commit
```gherkin
Given 我從外部編輯器修改了 synopsis.md（沒透過 app）
And `git status` 顯示 synopsis.md 為 modified 但 uncommitted
When 我在 app 的「git status」面板點「commit 所有變更」
And 填入 commit message「synopsis: 補完第三幕大綱」
Then 系統 git add . && git commit -m "synopsis: 補完第三幕大綱"
And 該變更進入版本歷史
```

## AI 互動細節

不直接呼叫 AI。但所有 AI 觸發的寫檔（005 採用、007 status-update、002 角色卡 AI 統整）都會自動 commit，commit message 透露這是 AI 動作（例 `chapter: adopt AI draft`、`status: update after adopt`）。

## UX 注意事項

- 「歷史」按鈕在每個編輯器（章節 / 角色卡 / status）的工具列
- 歷史面板採側邊抽屜（drawer），不擋編輯區
- 還原動作要二次確認，文字明確：「將 <檔名> 還原到 <時間> 的版本（commit hash <短>）。當前內容會被新 commit 覆蓋。是否繼續？」
- diff 視圖用標準 unified diff 格式，紅 / 綠色標示
- 「git status」面板是次要功能，藏在「進階」menu 下
- git 操作失敗時顯示具體錯誤（例：「commit 失敗：working tree dirty in 子目錄 X」）

## 開放問題

- [ ] 用 nodegit / simple-git / 直接呼叫 git CLI 哪個？
  - simple-git：純 JS wrapper 包 git CLI，輕量、簡單
  - nodegit：libgit2 binding，重、有原生編譯
  - **建議 simple-git**（spec 階段確認）
- [ ] 使用者沒裝 git 怎麼辦？
  - 偵測：`git --version` 失敗
  - 處理：提示「請先安裝 git」+ 連結到 git-scm.com；本 story 的所有功能都不可用直到使用者裝
  - 備選：bundled git binary（增加 app size）— 留待之後考慮
- [ ] commit message 的時間戳要不要包含？git log 已經有 author date，commit message 不必重複
- [ ] 大量 commit 後（例 1000+）的歷史面板效能？建議：分頁載入（每頁 50 個 commit），舊的需要時再 fetch
- [ ] 「還原到此版本」是否要保留 untracked 變更？建議：是，只 checkout 該檔；不動其他 untracked 檔
- [ ] git author 是固定 `novel-writer-app <noreply@local>` 還是讓使用者在 009 設定頁設？建議：MVP 用固定，後續加 user 自訂
