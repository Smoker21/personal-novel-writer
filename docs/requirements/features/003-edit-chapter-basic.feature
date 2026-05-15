Feature: 章節編輯器：開啟、編輯、自動儲存（含 browser 草稿）
  身為個人創作者
  我想要打開任意一章開始打字，編輯期間 browser 自動保存讓我不必擔心忘記儲存；當我覺得這版本可以了再按「儲存」按鈕，內容才寫進 markdown 檔讓 AI 看得到並進入 git 版控
  以便保持寫作專注、編輯期間 F5 / 切章 / 關 tab 都不會掉內容；同時清楚分開「我還在改」與「這版本確定了」兩個狀態

  Scenario: 打字 1.5 秒後 autosave 到 browser，但 .md 不變
    Given 我已開啟專案「春日記事」第一章「梅雨初晴」，當前內容為空
    When 我在編輯器輸入「她推開書店木門時，雨剛好停了。」
    And 我停止打字 1.5 秒
    Then 該內容寫入 browser storage（IndexedDB key="<projectHash>:chapter:1:draft"）
    And chapters/chapter_0001_梅雨初晴.md 仍為空
    And 編輯器右上角狀態顯示「編輯中（已 autosave 到 browser）」
    And 沒有 git commit
    And 沒有 status-updater 觸發

  Scenario: 按「儲存」按鈕才寫進 .md 並觸發後續流程
    Given 我在第一章編輯器，browser draft 有 200 字內容
    And 狀態為「編輯中（已 autosave 到 browser）」
    When 我按「儲存」按鈕（或 Ctrl+S）
    Then chapters/chapter_0001_梅雨初晴.md 被寫入該 200 字內容
    And 系統 git commit 訊息「chapter: save chapter 1」
    And status-updater 自動觸發（依 Story 007）
    And 編輯器狀態變為「已儲存到 .md」
    And toast 通知「已儲存」

  Scenario: F5 重整後 browser draft 仍在
    Given 我在第一章編輯器輸入了「她推開書店木門時」
    And 1.5 秒後 autosave 觸發，browser storage 有此 draft
    And 我尚未按「儲存」
    When 我按 F5 重整瀏覽器
    Then 編輯器重新開啟第一章
    And 顯示「她推開書店木門時」（從 browser draft 載入）
    And chapters/chapter_0001_梅雨初晴.md 仍為空
    And 狀態顯示「編輯中（已 autosave 到 browser）」+ 提示「這是上次未存入 .md 的草稿，按儲存才會寫入檔案」

  Scenario: 切換章節時自動 flush 到 browser
    Given 我在第一章編輯器輸入了「未存的最後一段」
    And 自動儲存的 1.5s debounce 尚未觸發
    When 我點擊章節列表的第二章
    Then 第一章的內容立即 flush 到 browser storage
    And 第二章編輯器開啟
    And chapters/chapter_0001_梅雨初晴.md 不變（仍是上次儲存的內容）
    When 我回到第一章
    Then 「未存的最後一段」仍在編輯器中

  Scenario: 採用 AI 草稿時直接寫 .md（不經 browser draft）
    Given AI 撰寫已完成，草稿面板顯示完整草稿
    When 我按「採用」按鈕（→ Story 006）
    Then chapters/chapter_0001_梅雨初晴.md 被寫入 AI 草稿內容
    And browser draft 被清空（避免下次開啟混淆）
    And 編輯器狀態變為「已儲存到 .md」
    And 觸發 git commit + status-updater（依 006 / 007）

  Scenario: 標題變更，按儲存才生效
    Given 第一章目前的檔名為 chapters/chapter_0001_未命名.md
    When 我把章節標題從「未命名」改為「梅雨初晴」
    Then 編輯器內標題顯示「梅雨初晴」
    And browser storage 記錄新標題
    And chapters/chapter_0001_未命名.md 仍存在（檔名未改）
    When 我按「儲存」
    Then 系統把檔案重命名為 chapters/chapter_0001_梅雨初晴.md
    And 章節列表的顯示更新為「第一章 梅雨初晴」
    And 內容保持不變
    And git commit 訊息「chapter: rename chapter 1 to 梅雨初晴 + save」

  Scenario: 儲存失敗時 browser draft 仍保留
    Given 我在編輯器打字並按「儲存」
    And 檔案系統暫時不可寫入
    When 系統嘗試寫 .md 失敗
    Then 編輯器顯示「儲存失敗：<原因>，請檢查資料夾權限」
    And 系統以指數退避重試 3 次
    And 若 3 次後仍失敗，狀態回到「編輯中（已 autosave 到 browser）」
    And browser draft 保留（使用者再按一次儲存即可重試）
    And 不觸發 git commit / status-updater

  Scenario: 外部編輯了 .md 後重開章節
    Given 我在第一章寫了 200 字後按「儲存」，.md 與 browser 同步
    And 我關閉 app
    And 外部（例如直接編輯 .md 或 git pull）把 .md 內容改了
    When 我重開 app 並開啟第一章
    Then 編輯器載入 .md 的最新內容
    And browser storage 中的舊 draft 被覆蓋（提示「外部變更已載入」）
    And 狀態顯示「乾淨」

  Scenario: 使用編輯器 lib 內建 undo / redo
    Given 我在第一章編輯器寫了「她推開書店木門時，雨剛好停了。」
    When 我按 Ctrl+Z（或 Cmd+Z）
    Then 編輯器內容回到上一個編輯狀態（依 web editor lib 的內建合併規則）
    When 我按 Ctrl+Y / Ctrl+Shift+Z
    Then 編輯器內容前進一步
    And 編輯期間的 undo/redo 不寫 .md，只動 editor state + browser storage
    And 「儲存」前 undo/redo 隨意做都不影響檔案

  Scenario: Ctrl+S 等同按「儲存」按鈕
    Given 我在編輯器，browser draft 有未儲存內容
    When 我按 Ctrl+S
    Then 與按「儲存」按鈕同行為：寫 .md + git commit + status-updater

  # === M5 新增：AI 寫作工作台 UI ===

  Scenario: 開啟章節時上下文預覽面板顯示三項內容（M5）
    Given 我在專案第 7 章編輯器
    And chapter front-matter participants=[春雨, 明哲]
    And 第 6 章已存在
    And status/story_status.md 已存在
    And characters/春雨_status.md 與 characters/明哲_status.md 已存在
    When 編輯器渲染完成
    Then 上下文預覽面板顯示「前一章：第 6 章 (1500 字)」
    And 顯示「story_status 摘要 (前 200 字)」
    And 顯示「春雨_status (前 200 字)」
    And 顯示「明哲_status (前 200 字)」
    And 每項可展開看全文

  Scenario: 第一章開啟時前章預覽為空（M5）
    Given 我在第 1 章編輯器
    When 編輯器渲染完成
    Then 上下文預覽面板的「前一章」區顯示「（本章為第一章）」

  Scenario: 寫作參數本章覆寫不寫進 frontmatter（M5）
    Given 我在第 3 章編輯器
    And settings.agents.chapter-writer.routing.temperature = 0.7
    When 我在「寫作參數」inline 區把 temperature 改為 1.2
    Then 第 3 章 frontmatter 不含 temperature 欄位
    When 我切到第 4 章再切回第 3 章
    Then 「寫作參數」temperature 回到 settings 預設 0.7
    And 我剛才的 1.2 設定已遺失（本章覆寫為 ephemeral）

  Scenario: 本章劇情大綱持久化到 frontmatter（M5）
    Given 我在第 3 章編輯器，frontmatter 無 outline
    When 我在「本章劇情大綱」textarea 輸入「春雨在圖書館遇到明哲」
    And 我按「儲存」
    Then PUT chapter 帶 outline="春雨在圖書館遇到明哲"
    And chapter 主檔 frontmatter 新增 outline 欄位
    When 我切到第 4 章再切回第 3 章
    Then 「本章劇情大綱」textarea 顯示「春雨在圖書館遇到明哲」

  Scenario: 本章角色挑選器預設帶入上一章 participants（M5）
    Given 第 6 章 frontmatter participants=[春雨, 明哲]
    And 第 7 章 frontmatter 無 participants（新章節）
    When 我開啟第 7 章編輯器
    Then 角色挑選器預選「春雨」「明哲」
    And UI 顯示「(來自第 6 章)」標記
    When 我加入「林清風」並按儲存
    Then 第 7 章 frontmatter participants=[春雨, 明哲, 林清風]
    And 上次的「(來自第 6 章)」標記消失

  Scenario: 兩階段生成 — 顯示 prompt 給使用者編輯（M5）
    Given 我在第 7 章編輯器，已填好參數
    When 我點「生成本章」
    Then 系統呼叫 POST .../build-prompt
    And PromptPreviewModal 開啟，顯示完整 promptText（textarea，可編輯）
    And modal 顯示 estimatedTokens / modelId
    When 我在 modal 編輯 prompt（例：加一句「請以春雨的視角寫」）
    And 點「送出」
    Then 系統呼叫 POST .../generate 帶我編輯過的 promptText
    And SSE 串流開始
    And PromptSnapshot.userEdited = true

  Scenario: 兩階段生成 — 不滿意 prompt 可退回不啟動 LLM（M5）
    Given PromptPreviewModal 開啟中
    When 我點「取消」
    Then modal 關閉
    And 沒有 cache draft 被建立
    And 沒有 LLM 被呼叫
    And 我可以調整參數後再次點「生成本章」

  Scenario: 採用後 prompt 寫入 chapter_NNNN_prompt.md（M5 沿用既有 Spec 006）
    Given 我已用 build-prompt + generate 產出第 7 章草稿
    And 我編輯過 promptText（userEdited=true）
    When 我採用該草稿
    Then chapter 主檔 chapter_0007_<title>.md 內容為 AI 草稿
    And chapter_0007_prompt.md 追加一段，含：
      | 欄位 | 內容 |
      | timestamp | 採用當下 ISO 8601 |
      | modelId | 實際使用的 model |
      | promptText | 我編輯過的完整 prompt（不是 server auto-built） |
      | contextHash | build-prompt 階段的 hash |
      | adopt-marker | HTML 註解供 unadopt 定位 |
    And 第 7 章 frontmatter participants 同步寫入採用時使用的 participants

  Scenario: 舊章節（無 frontmatter）開啟向前相容（M5）
    Given chapters/chapter_0001_*.md 是 M4 既存檔案，無 YAML frontmatter
    When 我開啟第 1 章
    Then GET chapter 回應 hasFrontmatter=false / participants=[] / outline=null / requirements=null
    And 編輯器照常載入正文
    And 角色挑選器為空（不自動偵測 substring）
    When 我加入 participants 並按儲存
    Then chapter 主檔變為「frontmatter + 正文」格式
    And hasFrontmatter 之後為 true

  # === M5 PM Round 2（Q3=A / UX-7 / UX-1）===

  Scenario: 重產回 build-prompt 階段（Q3=A 拍板）
    Given AI 已產出第 7 章草稿，草稿面板顯示
    When 我點「⛢ 重產」
    Then 系統回到 build-prompt 階段
    And PromptPreviewModal 重新開啟
    And 寫作參數 / 大綱 / 需求 / participants / 我先前編輯過的 promptText **全部保留**（給我重調機會）
    And **不**直接重送 LLM（不會無聲消耗額度）

  Scenario: 採用前若有 dirty browser draft 先確認（UX-7）
    Given 第 7 章主編輯區我手打了「她推開門。」並 autosave 到 IndexedDB（dirty browser draft）
    And AI 已生出草稿待採用
    When 我點「採用」
    Then 系統偵測到 dirty browser draft
    And 開啟 modal「您有未儲存的編輯，採用 AI 草稿會丟棄這些變更」
    And modal 有三個選項：[先儲存編輯] [採用並丟棄編輯] [取消]
    When 我點「先儲存編輯」
    Then 先執行儲存 chapter 流程（PUT chapter）
    And 儲存成功後才繼續採用流程
    When 我改點「採用並丟棄編輯」
    Then IndexedDB draft 被刪除
    And 採用流程正常進行（AI 草稿覆蓋主檔）
    When 我改點「取消」
    Then 兩個操作都不發生

  Scenario: 本章劇情大綱用 ExpandableTextarea（UX-1）
    Given 我在第 7 章編輯器
    When 我點「本章劇情大綱」textarea 右上角 ⛶ icon
    Then 開啟 modal，textarea 撐 80vh × 80vw
    And 我輸入的內容即時同步到 inline textarea
    When 我按 ESC
    Then modal 關閉，內容保留在 inline textarea
