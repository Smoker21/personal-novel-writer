Feature: 角色卡：上傳參考圖 → vision 解析外貌（含章節敏感版本）
  身為個人創作者
  我想要上傳角色參考圖（預設一張 + 可選的章節版多張），讓 vision LLM 解析圖中的髮型 / 服裝 / 外貌特徵，自動填寫角色卡對應欄位；尤其支援「同一角色在不同章節穿不同衣服 / 換了髮型」這種演進
  以便我不必親手把腦中或參考圖中的人物形象翻成文字描述，並且 chapter-writer 在寫第 N 章時讀到「該章的當前外貌」而非永遠停在角色基準形象

  Scenario: 為角色上傳預設圖並解析
    Given 我已開啟專案「春日記事」
    And 設定頁（009）已啟用至少一個 vision-capable provider（例 anthropic / google / xai / lmstudio:qwen3-vl）
    And character-image-extractor 的 routing 已設定
    And 該專案已有角色「蘇晴」（frontmatter 中 portrait.default 為空）
    When 我打開角色「蘇晴」的編輯面板
    And 我在「外貌（圖片）」區點「上傳預設圖」
    And 選擇本機檔案「su-qing-portrait.jpg」（1.2 MB JPG）
    Then 系統把圖儲存到 characters/_assets/蘇晴/default.jpg
    And frontmatter 的 portrait.default 更新為「characters/_assets/蘇晴/default.jpg」
    And UI 顯示縮圖 + 「從圖解析」按鈕
    When 我點「從圖解析」
    Then 系統把圖（+ chapterNumber=null + 角色名「蘇晴」+ 故事 genre）送給 character-image-extractor Skill
    And spinner 顯示「解析中…」（預期 5-15 秒）
    Then 解析回傳 JSON
    And frontmatter 扁平外貌欄位被填入：hairAndColor / eyes / bodyType / otherFeatures / clothing（依解析結果）
    And confidence < high 的欄位旁顯示「⚠️ 模型對此項信心較低」icon
    And 「敘述」textarea 仍是空（要使用者後續按「AI 生成角色描述」才產 body）
    When 我微調「otherFeatures」文字 + 按「儲存」
    Then characters/蘇晴.md 寫入新 frontmatter
    And git commit「character: edit 蘇晴」

  Scenario: 為章節 N 上傳專屬圖
    Given 我已開啟專案「春日記事」，已寫到第 5 章
    And 角色「蘇晴」frontmatter 已有 portrait.default 與扁平外貌欄位（從第 1 章解析來）
    When 我打開角色「蘇晴」編輯面板的「外貌（圖片）」區
    And 點「為章節新增照片」按鈕
    And 在下拉選單選「第 5 章」
    And 選擇本機檔案「su-qing-chapter5.jpg」
    Then 系統儲存到 characters/_assets/蘇晴/chapter_0005.jpg
    And frontmatter 的 portrait.byChapter[5] 更新為該路徑
    And UI 顯示「第 5 章版本」縮圖 + 「從圖解析」按鈕
    When 我點「從圖解析」
    Then 系統呼叫 character-image-extractor，chapterNumber=5
    And 解析結果寫到 appearanceByChapter[5]（一段 markdown 文字，3-4 行）
    And 「敘述」textarea 不變（appearanceByChapter[5] 是 frontmatter 而非 body）
    When 我儲存
    Then characters/蘇晴.md 寫入；新增 appearanceByChapter[5] 與 portrait.byChapter[5]
    And git commit「character: edit 蘇晴」

  Scenario: chapter-writer 寫第 5 章時讀到對應版本的外貌
    Given 角色「蘇晴」的 frontmatter 含下列欄位：
      | 欄位                                              | 值                             |
      | 扁平外貌欄位                                      | 從 default 圖解析來，描述基準外貌 |
      | portrait.default / byChapter[1] / byChapter[5]   | 各章圖片路徑                    |
      | appearanceByChapter[1]                            | 淺灰色棉麻長裙...               |
      | appearanceByChapter[5]                            | 深藍色套裝...                   |
    When 我點「AI 撰寫本章」開始寫第 3 章
    Then ChapterContext 蒐集到的「蘇晴外貌」為 appearanceByChapter[1]（最近 ≤ 3 的章節）
    When 我寫第 7 章
    Then ChapterContext 蒐集到的「蘇晴外貌」為 appearanceByChapter[5]（最近 ≤ 7 的章節）
    When 我寫第 0 章或無 appearanceByChapter 條目
    Then ChapterContext 用 frontmatter 扁平外貌欄位（default）

  Scenario: 上傳格式不支援
    Given 我在「上傳預設圖」對話框
    When 我選擇一張 .heic 檔
    Then UI 顯示「不支援的格式。請改用 JPG / PNG / WebP」
    And 沒有任何檔案儲存

  Scenario: 上傳圖片過大
    Given 我在「上傳預設圖」對話框
    When 我選擇一張 25 MB 的高解析 PNG
    Then UI 顯示「圖片過大（25 MB > 10 MB）。請壓縮後重試」
    And 沒有任何檔案儲存

  Scenario: 雲端 vision provider 拒絕解析（content_blocked）
    Given 我為角色「蘇晴」上傳一張裸體繪作（成人題材設定的角色）
    And settings.yaml 中 character-image-extractor primary 為 anthropic:claude-sonnet-4-6（對 NSFW 較嚴）
    And fallback 為 lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus（地端，較寬鬆）
    When 我點「從圖解析」
    And anthropic 回 content_blocked
    Then LLMRouter 自動降級到 lmstudio:qwen3-vl
    And UI banner「已切換到地端模型 lmstudio:qwen3-vl-30b-...」
    And 解析結果正常填入欄位

  Scenario: 未啟用任何 vision provider
    Given 我打開設定頁，所有 vision-capable provider 都 enabled=false
    And character-image-extractor 的 routing 為空
    When 我上傳一張圖 + 點「從圖解析」
    Then UI 顯示「請先到設定頁啟用一個 vision-capable provider 並設定 character-image-extractor 的 routing」
    And 提供「前往設定頁」連結
    And 不送 LLM 呼叫

  Scenario: 刪除章節圖
    Given 角色「蘇晴」已上傳 portrait.byChapter[5] 與 appearanceByChapter[5]
    When 我在 UI 點「第 5 章版本」旁的「刪除」 icon 並通過二次確認
    Then characters/_assets/蘇晴/chapter_0005.jpg 被 unlink
    And frontmatter 的 portrait.byChapter[5] 與 appearanceByChapter[5] 都被移除
    And 第 5 章後續 chapter-writer 撰寫時 fallback 到 < 5 的最近條目或 default
    And git commit「character: edit 蘇晴」

  Scenario: 刪除角色時清除所有資產
    Given 角色「林書言」已有 portrait.default + portrait.byChapter[3] + portrait.byChapter[8]
    When 我刪除角色「林書言」
    Then characters/林書言.md 與 林書言_status.md 都被 unlink
    And characters/_assets/林書言/ 整個目錄被刪除（含 default.jpg、chapter_0003.jpg、chapter_0008.jpg）
    And _index.md 移除該角色
    And git commit「character: delete 林書言」

  Scenario: 角色 rename 時 _assets 跟著搬
    Given 角色 frontmatter name=「林川」，_assets/林川/ 有兩張圖
    When 我把 frontmatter name 改為「林書言」並儲存
    Then characters/林川.md → characters/林書言.md
    And characters/林川_status.md → characters/林書言_status.md
    And characters/_assets/林川/ → characters/_assets/林書言/（含所有圖檔）
    And portrait.default / byChapter 的 path 同步更新為新目錄
    And git commit「character: rename 林川 to 林書言」
