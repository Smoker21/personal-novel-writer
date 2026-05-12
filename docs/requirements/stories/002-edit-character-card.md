# 新增 / 編輯角色卡（欄位輸入 + AI 統整）

> Story ID: `002-edit-character-card`
> Persona: `worldbuilder-author`（主要）、`hobbyist-author`、`serial-author`
> Epic: `EPIC-02-character-creation`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `001`、`009`（設定頁；AI 統整步驟需要已設定的 LLM provider）
> 修訂：`2026-05-12` — 從「純樣板彙整」改為「結構化欄位 → AI 統整成連貫文字」；移除 weight、加入個性標籤 / 文化背景；vision 路徑明確切到 002b/002c。

## 使用者故事

身為 **個人創作者**，
我想要 **用結構化欄位（個性標籤、MBTI、星座、文化背景、外貌特徵 ...）快速描述一個角色，再讓 AI 把這些欄位統整成一段連貫的角色敘述**，
以便 **我不必親手寫長文段落，但仍能得到 chapter-writer 讀得連貫、寫得一致的角色卡**。

## 背景與動機

依 idea.md 第 35 條：「人物製作包含...個性 (MBTI 人格特質)，星座，身高體重，血型, 三圍等。最後彙整成文字。**使用 AI 輸出人物個性**。」

兩條設計原則：

1. **欄位輸入降低使用者門檻** — 與其要使用者親手寫 200 字「個性與行為模式」，不如讓他選「傲嬌、活潑、INTJ、處女座」打勾，剩下交給 AI
2. **AI 統整成的連貫文字才是 chapter-writer 真正讀的東西** — 評估結果（特別 TC-08 8-1/8-2 用 qwen3-vl）證明「具體行為描寫」遠勝「人格標籤」；但人類比較會選標籤 → AI 中間翻譯一次

vision-based 角色卡（上傳照片或文字生圖 → 自動填外貌欄位）切到 [002b](002b-character-card-from-image.md)、[002c](002c-character-card-from-text-to-image.md)（兩者均 defer 到 v0.2）。

## 範圍

**包含：**
- 在專案內新增、編輯、刪除角色卡
- 結構化欄位輸入（六個區塊；見「資料模型」）
- 「**AI 生成角色描述**」按鈕：把欄位送給外部 LLM（用 009 設定的預設模型）→ 產出連貫的角色敘述文字（200~500 字），填入「敘述」可編輯區
- 使用者可手動微調 AI 生成的敘述
- 角色卡儲存為 `characters/<slug>.md`：frontmatter 保留全部結構欄位（讓使用者下次回頭可改欄位 → re-generate）；body 為 AI 生成 / 使用者編輯的連貫敘述
- **新增角色時同步建立** `characters/<slug>_status.md` 空骨架（依 Story 007）
- **刪除角色時同步刪除** 對應的 `<slug>_status.md`
- 維護 `characters/_index.md`（角色列表 + 一句話描述）
- 角色 slug 規則沿用 spec 001
- 親密場景描寫參考區段獨立摺疊（避免一般場景被誤帶入；題材不適用時不擾人）
- 所有角色相關的檔案動作（建立 / 編輯 / 刪除 / status 同步建立）都進 git commit（Story 010）

**不包含（明確 defer）：**
- 上傳參考圖 → vision 自動填外貌欄位 → [Story 002b](002b-character-card-from-image.md)，雲端 vision LLM（Gemini / Grok）
- 文字描述 → AI 生圖 → vision 回寫描述 → [Story 002c](002c-character-card-from-text-to-image.md)，需要 image-gen 模型
- 角色關係圖（圖形化） → Story 013
- 跨專案共用角色「角色資料庫」 → 不在此版本
- 角色卡內嵌引用其他章節（ref / mentions）→ 不在此版本

## 資料模型

### 結構化欄位（frontmatter）

六個區塊，依目的分群。所有欄位**除了「身分基礎」必填外**都選填：

```yaml
# 1. 身分基礎 [必填]
name: 蘇晴
age: 30
gender: female              # male / female / other / 自由文字
pronoun: 她                  # 她 / 他 / 牠 / 自由文字
role: 主角                   # 主角 / 配角 / 反派 / 重要路人 / 自由文字

# 2. 個性參考（給 AI 推導行為的素材；皆選填）
personalityTags:            # 複選 + 自由加 tag
  - 內向
  - 含蓄
  - 敏感
mbti: INFJ                  # 16 種選一
zodiac: 處女座               # 12 個選一
bloodType: A                # A / B / O / AB
culturalBackground: |       # 自由文字
  台灣台北出生長大，大學文學系，畢業後進出版社做編輯。
  童年喪母，由祖母帶大。

# 3. 外貌參考（給 AI 推導視覺；皆選填）
heightCm: 165
bodyType: 中等偏瘦           # tag：偏瘦 / 中等 / 微胖 / 結實 / 壯碩 / 自由文字
hairAndColor: |             # 自由文字
  黑色長髮，平日綁低馬尾。
eyes: |
  雙眼皮，眼尾微下垂。
otherFeatures: |
  鵝蛋臉，膚色偏白。指甲剪短沒擦顏色。

# 4. 對話與寫作（給 AI 推導口吻；皆選填）
dialoguePace: 慢            # 快 / 穩 / 慢
wordingPreference: |
  半句話結尾，不喜歡把話說滿；對熟人才會放鬆。
writingAvoid: |
  避免讓她說過於肯定的句子。

# 5. 與其他角色的關係（選填）
relations: |
  與[[林書言]]從一場避雨開始認識。
  對他有具體好感但保持分寸。

# 6. 親密場景描寫參考（預設摺疊；只有要寫成人題材才填）
intimateAppendix:
  bodyMeasurements: 84/62/88   # 三圍，選填
  preferences: |               # 偏好 / 特徵 / 反應，自由文字
    （略）

# AI 統整 metadata
consolidatedAt: 2026-05-12T10:30:00Z   # 上一次 AI 生成時間
consolidatedBy: anthropic:claude-haiku-4-5   # 用了哪個 modelId
manuallyEdited: false                  # 使用者有沒有改過 AI 的輸出
```

### Body（AI 生成 / 使用者編輯的連貫敘述）

frontmatter 之後接一段連貫文字（~200~500 中文字），分 3-4 個自然段，依需要包含：個性與行為模式、容貌剪影、對話風格、關係背景。**這段是 chapter-writer 真正讀的東西**，frontmatter 只是讓使用者下次回頭改欄位再 regenerate。

範例 body：
```markdown
蘇晴是 30 歲的女作家，內向但觀察力極強。思考時微微皺眉，對陌生人話少；
對熟人才會放鬆，偶爾露出笑意。對於想要什麼通常用半句話帶過，不喜歡把
話說滿——情緒激動時反而會更安靜。

她身高 165 公分，中等偏瘦的身形。鵝蛋臉，膚色偏白；黑色長髮平日綁低馬
尾。雙眼皮，眼尾微下垂，看起來總像有心事。指甲剪短沒擦顏色。

文學系出身，畢業後進出版社做編輯——這份工作讓她養成「在文字裡找弦外
之音」的習慣。對話節奏偏慢，常用半句話結尾，給對方留空間；避免說出過
於肯定的句子。

與林書言從一場避雨開始認識，對他有具體好感但保持分寸。
```

### `_index.md` 一句話描述

由 AI 生成 body 時順便產出（`consolidate` Skill 的副產物），格式：

```markdown
- [蘇晴](./蘇晴.md) — 30 歲女作家，內向敏感，與林書言因舊筆記本結識
- [林書言](./林書言.md) — 28 歲書店老闆，健談但對熟人話少
```

## 驗收條件 (Gherkin)

### Scenario: 新增角色卡（填欄位 → AI 生成敘述 → 儲存）
```gherkin
Given 我已開啟專案「春日記事」
And 設定頁（009）已設定預設 LLM 為 anthropic:claude-haiku-4-5
And 該專案目前只有原始角色「蘇晴」
When 我在「角色」面板點擊「新增角色」
And 我填入名稱「林書言」、年齡「28」、性別「男」、代詞「他」、角色定位「配角」
And 我勾選個性標籤「健談」「好奇心旺」「對熟人含蓄」
And 我選 MBTI「ENTP」、星座「射手」、血型「O」
And 我填入文化背景「大學念哲學，畢業後盤下祖父留下的舊書店」
And 我填入身高「178」、體型「偏瘦但不單薄」、髮型髮色「短黑髮微亂」、眼睛「戴金屬細框眼鏡」、其他特徵「指尖常沾墨色」
And 我選對話節奏「快」、用詞偏好「常用反問句拋回去」、寫作避免「過度直白告白」
And 我點擊「AI 生成角色描述」
Then 系統將上述欄位送給 anthropic:claude-haiku-4-5 並等待回應
And 「敘述」編輯區內出現一段 200~500 字的連貫描寫，包含個性、外貌、對話風格、文化背景
And 我可以在「敘述」區手動微調文字
When 我點「儲存」
Then 系統建立檔案 characters/林書言.md
And 該檔案 frontmatter 包含上述全部結構化欄位
And 該檔案 body 是 AI 生成（且我可能微調過）的連貫敘述
And characters/_index.md 多一行 [林書言](./林書言.md) — 28 歲書店老闆，健談但對熟人含蓄
And 「角色」面板列出兩名角色
```

### Scenario: 重新生成角色描述（改欄位後）
```gherkin
Given 專案中已有角色「林書言」，frontmatter 寫 dialoguePace=快
And body 為 AI 上次生成的描寫
When 我打開角色「林書言」的編輯面板
And 我把對話節奏改為「穩」
And 我重新點「AI 生成角色描述」
Then 系統把更新後的欄位送給 LLM 重新生成
And 「敘述」區改為新版描寫（對話節奏改為穩重）
And manuallyEdited 標記為 false
And consolidatedAt 更新為現在時間
When 我點「儲存」
Then characters/林書言.md 的 frontmatter 與 body 都更新為新版
```

### Scenario: 手動編輯 AI 生成的敘述後儲存
```gherkin
Given 專案中已有角色「蘇晴」，body 為上次 AI 生成的描寫
When 我打開角色「蘇晴」的編輯面板
And 我直接在「敘述」區把「指甲剪短沒擦顏色」改為「指甲剪短，平日不擦但會在重要場合塗淡粉色」
And 我點「儲存」
Then characters/蘇晴.md 的 body 更新為我的編輯版本
And manuallyEdited 標記為 true
And frontmatter 的結構化欄位不變
And UI 提示「此角色卡的描寫已手動編輯，下次點『AI 生成』會覆蓋你的修改」
```

### Scenario: AI 生成失敗時不破壞既有 body
```gherkin
Given 專案中已有角色「蘇晴」，body 為上次 AI 生成的描寫
When 我改個性標籤後點「AI 生成角色描述」
And LLM 呼叫失敗（例如 network error）
Then 「敘述」區仍顯示上次的 body（不被清空）
And UI 顯示錯誤訊息「AI 生成失敗：網路錯誤。請重試或檢查設定頁」
And consolidatedAt / consolidatedBy 不變
```

### Scenario: 未設定 LLM 時點「AI 生成」
```gherkin
Given 我在「新增角色」對話框，已填部分欄位
And 設定頁（009）尚未設定任何 LLM provider
When 我點「AI 生成角色描述」
Then UI 顯示「請先到設定頁設定一個 LLM provider」並提供連結
And 沒有任何 LLM 呼叫被送出
And 我仍可選擇「不生成、直接寫敘述」進入手動模式
```

### Scenario: 必填欄位（名稱）為空時阻擋送出
```gherkin
Given 我在「新增角色」對話框
When 我未填名稱直接提交
Then 表單顯示「請輸入角色名稱」
And 沒有檔案被建立
And 「AI 生成」按鈕在名稱填上前 disabled
```

### Scenario: 角色 slug 衝突時加後綴
```gherkin
Given 專案中已有角色「林書言」（檔名 林書言.md）
When 我新增另一名角色，名稱也叫「林書言」
Then 系統建立 characters/林書言-2.md，不覆寫既有檔案
And _index.md 列出兩個同名角色，分別連到各自的檔案
```

### Scenario: 刪除角色卡
```gherkin
Given 專案中存在角色「林書言」
When 我在「角色」面板選擇「刪除」並通過二次確認
Then characters/林書言.md 被移除
And _index.md 中對應一行被移除
And 該角色不再出現在「角色」面板
And git 記錄一個 commit「刪除角色：林書言」（依 Story 010 版本控制）
```

### Scenario: 親密場景描寫區預設摺疊
```gherkin
Given 我在「新增角色」對話框
When 對話框第一次打開
Then 「親密場景描寫參考」區塊處於摺疊狀態，僅顯示標題與說明「只有要寫成人題材才填」
And 我點擊區塊標題可展開、再點可收合
```

## AI 互動細節

- **觸發點**：「AI 生成角色描述」按鈕（在欄位編輯區下方）
- **上下文**：把全部已填的結構化欄位（YAML 格式）+ 一段固定 prompt 模板送給 LLM
- **預期 Skill**：`character-card-consolidator`（TBD by `ai-agent-designer`）
  - 是 Skill 不是 Agent（單次操作，無多步流程）
  - 對應檔案：`docs/skills/character-card-consolidator.md`（待寫）
  - 對應 prompt：`packages/prompt-library/skills/character-card-consolidator.ts`（待寫）
- **預設模型**：用設定頁（009）的「預設模型」即可。短任務（單次幾百 token）對模型選擇不敏感；雲端 cheap models（claude-haiku-4-5、gemini-flash、gpt-4.1-mini）皆可
- **品質保證**：
  - 連貫敘述必須涵蓋使用者填的核心欄位（個性標籤至少 70% 提到、外貌特徵全提）
  - 不發明使用者沒填的事實（不亂編家庭、不擅自決定職業）
  - 不超過 600 中文字（避免 chapter-writer context 太多）
  - 寫作備註的「避免事項」要照樣轉述（例：「避免讓她說過於肯定的句子」）

## UX 注意事項

- **欄位分區用 tabs 或 accordion**：身分基礎 / 個性 / 外貌 / 對話 / 關係 / 親密（後者摺疊）
- **個性標籤 chip-style**：常用標籤點選 + 「+ 自訂」加自由文字標籤
- **MBTI / 星座 / 血型 dropdown**：內建選項，避免拼錯
- **「AI 生成」按鈕**：
  - 名稱未填時 disabled
  - 點擊後 button 顯示 spinner + 「生成中...」(預期 5-15 秒)
  - 生成期間「敘述」區顯示「AI 正在統整...」placeholder
  - 失敗時顯示錯誤但保留舊 body
- **「敘述」區是可編輯 textarea**，下方標 `consolidatedBy: <model> @ <時間>` + `manuallyEdited` 警示
- 名稱變更時提示「將同步重命名 characters/<old>.md → characters/<new>.md，是否繼續？」
- 刪除二次確認，提示「此動作會 git commit 一筆刪除記錄；可從 git 歷史復原」

## 開放問題

- [ ] AI 生成的 prompt 模板要不要支援使用者自訂？（先不支援，存內建模板於 prompt-library）
- [ ] 大量角色（>50）時的清單效能 → 留到後續優化（v0.2）
- [ ] 是否在 frontmatter 加 `lockedFields` 標記某些欄位「下次 regenerate 別動我手填的這個」→ 先不做，靠 manuallyEdited 警示讓使用者知道
- [ ] 親密場景描寫區內容應不應該影響非親密場景的 body 生成？（建議：不影響，prompt 中明確區隔）→ 留待 `character-card-consolidator` Skill 設計時定案
