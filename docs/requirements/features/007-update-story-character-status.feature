Feature: 故事與人物狀態更新（status-updater）
  身為個人創作者
  我想要在採用章節定稿、按下儲存或主動點「更新狀態」按鈕時，AI 把該章的劇情演進與人物關係變化寫進 story_status.md 與該章涉及的每個角色的 <slug>_status.md，且我可以隨時打開這些 status 檔手動編輯、或按「AI 精簡」按鈕讓 AI 壓縮太長的段落（但保留我釘住的伏筆與轉折點）
  以便 下一章寫作時 chapter-writer 仍記得之前的世界觀、伏筆、人物關係，但又不會因為章數累積讓 status 檔失控膨脹或失去重點

  Scenario: 採用第一章後產生初版 story_status 與 character_status
    Given 我已開啟專案「春日記事」
    And 設定頁（009）已設定預設 LLM
    And status/story_status.md 是建立專案時的空骨架
    And characters/蘇晴_status.md 與 characters/林書言_status.md 都是空骨架
    And 第一章 chapter_0001.md 主檔已透過「採用」按鈕從草稿寫入
    When 採用流程結束，自動觸發 status-updater
    Then 系統呼叫 LLM，輸入：第一章主檔 + 兩個空骨架 status + 兩個角色卡
    And status/story_status.md 的「重要劇情點」段新增 `(第 1 章) 蘇晴避雨進入言字書店，發現舊筆記本上的母親地址`
    And status/story_status.md 的「場景」段新增「### 場景：言字書店」並描述地址、環境、氛圍、關鍵物品
    And characters/蘇晴_status.md 的「重要狀態變化」段新增 `(第 1 章) 因避雨初訪言字書店，意外發現舊筆記本中母親二十年前的地址`
    And characters/蘇晴_status.md 的「與其他角色的關係」段新增 `與 [[林書言]]：初次相識，互相試探`
    And characters/林書言_status.md 同樣有對應更新
    And 系統 git commit 訊息「status: update after adopt chapter 1」
    And 編輯器右下角 toast 通知「狀態已更新」

  Scenario: 「儲存」按鈕（不是採用）也觸發 status 更新
    Given 我在第二章編輯器已寫了一段，內容存在 browser storage
    When 我按「儲存」按鈕
    Then chapter_0002.md 被寫入
    And status-updater 自動觸發，讀第二章主檔 + 既有 status → 更新 status 各檔
    And git commit「status: update after save chapter 2」

  Scenario: 「立刻更新狀態」按鈕主動觸發
    Given 我已採用第三章一段時間，但中途修改過 character_<slug>_status.md 補了一些細節
    When 我在編輯器側邊按「立刻更新狀態」按鈕
    And 系統提示「以最新的 chapter_0003.md 重新跑 status-updater？」我按確認
    Then status-updater 跑，讀第三章主檔 + 我手改後的 status 各檔 → 寫新版
    And git commit「status: manual update after chapter 3」

  Scenario: status-updater 只動該章涉及的角色檔
    Given 專案有 5 個角色（蘇晴、林書言、謝伯、小美、阿凱）
    And 第二章主檔只提到「蘇晴」「林書言」
    When 我採用第二章，status-updater 跑
    Then characters/蘇晴_status.md 與 characters/林書言_status.md 被更新
    And characters/謝伯_status.md、小美_status.md、阿凱_status.md 完全不動
    And git commit 顯示只有兩個 char_status 檔有變動

  Scenario: AI 精簡按鈕（story_status.md）
    Given status/story_status.md 累積了 30 章後變得很長
    And 「重要劇情點」段有 50 條，「世界觀」段被反覆 append 變得很冗長
    And 「🔖 伏筆」段有 8 條重要伏筆
    And 「✨ 轉折點」段有 5 條
    When 我打開 story_status.md 編輯畫面，按「AI 精簡」按鈕
    Then 系統呼叫 LLM，提示為「精簡此檔，但 `🔖` 與 `✨` 段不要動」
    And 結果填入「敘述」可編輯區
    And 「重要劇情點」「世界觀」「場景」段被合併 / 縮短
    And 「🔖 伏筆」段 8 條原封保留
    And 「✨ 轉折點」段 5 條原封保留
    When 我微調文字後按「儲存」
    Then story_status.md 寫入新版
    And git commit「status: AI shorten story_status.md」

  Scenario: AI 精簡時使用者勾選「也精簡 🔖/✨ 段」
    Given 我在 story_status.md 編輯畫面，勾選「也精簡 🔖 伏筆 與 ✨ 轉折點 段」
    When 我按「AI 精簡」按鈕
    Then LLM 同時精簡所有段（包括 🔖 / ✨）
    And 「敘述」區顯示新版，使用者再微調

  Scenario: status-updater 失敗不破壞既有 status
    Given 我採用第三章草稿
    And status-updater 呼叫 LLM 時連線失敗
    When 系統重試 3 次仍失敗
    Then status/story_status.md 與所有 character_<slug>_status.md 保持上次寫入的內容（不被部分寫入）
    And 編輯器 toast 提示「狀態更新失敗：第 3 章。可至章節旁的『重試狀態更新』按鈕重跑」
    And 第三章主檔 chapter_0003.md 仍正常保留（採用動作不被視為失敗）
    And git 沒有新增 commit（因為 status 沒變）

  Scenario: status-updater 不修改既有角色名稱（品質性質）
    Given characters/_index.md 中存在角色「蘇晴」「林書言」
    And 既有 status 檔中也使用這兩個名字
    When status-updater 在採用某章後產出新版各檔
    Then 新版中這些角色的名字字元不被修改
    And 不出現該章中未提及的新角色名（避免幻覺）

  Scenario: 場景清單在新場景出現時自動加入
    Given 第三章主檔出現新場景「咖啡廳」（之前未在 story_status.md 提過）
    When status-updater 跑
    Then story_status.md 的「場景」段新增「### 場景：咖啡廳」並描述地址、環境、氛圍、關鍵物品
    And 既有的「### 場景：言字書店」「### 場景：蘇晴的公寓」段不被刪

  Scenario: 章節提及新角色時不自動建立 char_status 檔
    Given 第四章主檔提到一個新名字「老闆娘」（非角色卡裡的角色）
    When status-updater 跑
    Then 系統不自動建立 characters/老闆娘.md 或 老闆娘_status.md
    And status/story_status.md 的「重要劇情點」可以提到「(第 4 章) 出現一名老闆娘角色」
    And UI 提示「第 4 章出現未在角色卡中的新名字『老闆娘』，是否建立角色卡？」

  Scenario: 使用者手改 status 後再觸發 status-updater
    Given 我手動編輯 story_status.md，補了一條 `🔖 伏筆：(第 3 章) 蘇晴的母親其實還活著`
    And 我按「儲存」寫進 .md
    When 我接著採用第四章，status-updater 自動跑
    Then LLM 讀的是「我手改後」的 story_status.md（含我加的伏筆條）
    And 新版 status 中該伏筆條被保留（因為在 🔖 段，預設不動）
    And LLM 不會「察覺」是我改的還是它前次寫的，純粹依當下檔案內容生新版
