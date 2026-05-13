# 角色卡：上傳參考圖 → vision 解析外貌（含章節敏感版本）

> Story ID: `002b-character-card-from-image`
> Persona: `worldbuilder-author`（主要）、`hobbyist-author`、`serial-author`
> Epic: `EPIC-02-character-creation`
> Priority: **`P0`**（**2026-05-13 升級**，從 v0.2 defer 拉進 MVP）
> Size: M
> Status: `Ready`
> Depends on: 002（角色卡基礎 + schema）、009（設定頁，需配置 vision-capable provider）、ADR-0009（LLM adapter vision 擴充）
> 修訂：`2026-05-13` — Draft → Ready，P1 → P0；範圍從草案 → 完整 Scenarios + .feature；加章節敏感外貌（每章可上傳當章版本）

## 使用者故事

身為 **個人創作者**，
我想要 **上傳角色參考圖（預設一張 + 可選的章節版多張），讓 vision LLM 解析圖中的髮型 / 服裝 / 外貌特徵，自動填寫角色卡對應欄位；尤其支援「同一角色在不同章節穿不同衣服 / 換了髮型」這種演進**，
以便 **我不必親手把腦中或參考圖中的人物形象翻成文字描述，並且 chapter-writer 在寫第 N 章時讀到「該章的當前外貌」而非永遠停在角色基準形象**。

## 背景與動機

依 idea.md 第 35 條：「人物製作包含**輸入圖片**，使用 VL 輸出人物外貌。」

vision-capable LLM 在我們的評估（[2026-05-12 qwen3-vl 結果](../../architecture/model-evaluation/results/2026-05-12-qwen3-vl-30b-a3b-abliterated.001.md)）證實技術可行。原 v0.1 defer 是因為 multimodal adapter 未準備好；**2026-05-13 透過 [ADR-0009](../../architecture/adr/0009-llm-adapter-vision.md) 補完此基礎後升級為 MVP**。

**為何要章節敏感？**

使用者明確指示（2026-05-13）：「**圖片命名方式要包含章節和預設。因為人物的衣服和外貌可能隨著每章情節演進而改變。**」

例：
- 蘇晴第 1 章「梅雨初晴」雨夜避雨進入書店——淺灰色棉麻長裙、米白色針織背心、深咖啡色薄外套
- 第 5 章蘇晴去出版社應徵編輯——深藍色套裝
- 第 10 章蘇晴與林書言確認關係後——換了短瀏海，常穿輕便針織衫

每章的「當前蘇晴」不該套用永恆的「她穿什麼」。chapter-writer 在寫第 5 章時要讀到「第 5 章版本」，不是預設。

## 範圍

**包含：**

### 圖片上傳

- 在角色卡編輯器加「外貌（圖片）」區段（與「外貌參考」文字區並列）
- 兩種上傳模式：
  - **「上傳預設圖」**：寫到 `characters/_assets/<slug>/default.{ext}` + `portrait.default` 路徑
  - **「為章節 N 上傳圖」**：寫到 `characters/_assets/<slug>/chapter_<NNNN>.{ext}` + `portrait.byChapter[N]` 路徑；UI 顯示「為哪一章」的下拉選單（列出該專案已存在的章節）
- 圖片格式：JPG / PNG / WebP（拒絕 HEIC / TIFF / SVG / animated GIF）
- 圖片大小：上傳前 client 端先驗證 ≤ 10 MB；server 端 resize 到 ≤ 4096×4096 + 重編碼 ≤ 5 MB
- 既有圖片可被覆寫（再次上傳同章 / 預設 → 覆蓋）
- 圖片可被刪除（清掉 path 欄位 + unlink 檔案）

### 從圖解析

- 上傳後自動或手動觸發「從圖解析」按鈕（依使用者偏好；MVP 預設**手動**避免 surprise LLM 呼叫）
- 呼叫 `character-image-extractor` Skill（[docs/skills/character-image-extractor.md](../../skills/character-image-extractor.md)），傳入：
  - 圖片（本機 path 形式）
  - 章節脈絡（chapterNumber=N 或 null for default）
  - 角色名與 story genre（從 project.yaml / synopsis 推導）
- 解析結果（hairAndColor / eyes / bodyType / otherFeatures / clothing + confidence）填入：
  - 預設圖 → 寫進 frontmatter 扁平外貌欄位（heightCm / bodyType / hairAndColor / eyes / otherFeatures / clothing）
  - 章節圖 → 寫進 `appearanceByChapter[N]`（一段 markdown 文字，由前端把 JSON 各欄位組合成自然段）
- 使用者可在「敘述」textarea 微調解析結果，按「儲存」才寫入 .md + git commit

### git 與檔案管理

- `_assets/` 目錄進 git（圖檔不大時可接受；之後 v0.2 加 LFS 或排除）
- `.gitignore` **不**排除 `characters/_assets/`
- 刪除角色 → 同步 unlink `_assets/<slug>/`（依 Story 002 修訂）
- 角色 rename → 同步 mv `_assets/<old>/` → `_assets/<new>/`

**不包含（明確 defer）：**

- 多張**同章節**圖整合（MVP 一章一張；多張留 v0.2）
- 即時 webcam 截圖
- 圖檔 EXIF 清理 / GPS 移除（隱私強化留 P1）
- 多人合照中「框選某人」（MVP 限制單人為主體）
- 圖片標籤 / 分類 / 搜尋
- AI 生圖 → vision 回寫 → Story 002c（v0.3+）
- 從圖判斷年齡 / 性別 / 個性（依 character-image-extractor 規格明確排除）

## 章節版本的「該章用哪份外貌」邏輯

當 `chapter-writer`（Spec 005）在寫第 N 章時要決定該角色當前外貌：

1. 若 `appearanceByChapter[N]` 存在 → 用 N
2. 否則找 `appearanceByChapter` 中 chapter < N 的**最大者**（即最近一次更新）
3. 都沒有 → 用 frontmatter 扁平外貌欄位（default）

具體實作在 [Spec 005](../../architecture/specs/005-ai-write-chapter.md) 的 ChapterContext 蒐集邏輯。

## 驗收條件 (Gherkin)

### Scenario: 為角色上傳預設圖並解析
```gherkin
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
```

### Scenario: 為章節 N 上傳專屬圖
```gherkin
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
```

### Scenario: chapter-writer 寫第 5 章時讀到對應版本的外貌
```gherkin
Given 角色「蘇晴」的 frontmatter 含：
  - 扁平外貌欄位（從 default 圖解析來，描述基準外貌）
  - portrait.default + portrait.byChapter[1] + portrait.byChapter[5]
  - appearanceByChapter[1]「淺灰色棉麻長裙...」
  - appearanceByChapter[5]「深藍色套裝...」
When 我點「AI 撰寫本章」開始寫第 3 章
Then ChapterContext 蒐集到的「蘇晴外貌」為 appearanceByChapter[1]（最近 ≤ 3 的章節）
When 我寫第 7 章
Then ChapterContext 蒐集到的「蘇晴外貌」為 appearanceByChapter[5]（最近 ≤ 7 的章節）
When 我寫第 0 章或無 appearanceByChapter 條目
Then ChapterContext 用 frontmatter 扁平外貌欄位（default）
```

### Scenario: 上傳格式不支援
```gherkin
Given 我在「上傳預設圖」對話框
When 我選擇一張 .heic 檔
Then UI 顯示「不支援的格式。請改用 JPG / PNG / WebP」
And 沒有任何檔案儲存
```

### Scenario: 上傳圖片過大
```gherkin
Given 我在「上傳預設圖」對話框
When 我選擇一張 25 MB 的高解析 PNG
Then UI 顯示「圖片過大（25 MB > 10 MB）。請壓縮後重試」
And 沒有任何檔案儲存
```

### Scenario: 雲端 vision provider 拒絕解析（content_blocked）
```gherkin
Given 我為角色「蘇晴」上傳一張裸體繪作（成人題材設定的角色）
And settings.yaml 中 character-image-extractor primary 為 anthropic:claude-sonnet-4-6（對 NSFW 較嚴）
And fallback 為 lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus（地端，較寬鬆）
When 我點「從圖解析」
And anthropic 回 content_blocked
Then LLMRouter 自動降級到 lmstudio:qwen3-vl
And UI banner「已切換到地端模型 lmstudio:qwen3-vl-30b-...」
And 解析結果正常填入欄位
```

### Scenario: 未啟用任何 vision provider
```gherkin
Given 我打開設定頁，所有 vision-capable provider 都 enabled=false
And character-image-extractor 的 routing 為空
When 我上傳一張圖 + 點「從圖解析」
Then UI 顯示「請先到設定頁啟用一個 vision-capable provider 並設定 character-image-extractor 的 routing」
And 提供「前往設定頁」連結
And 不送 LLM 呼叫
```

### Scenario: 刪除章節圖
```gherkin
Given 角色「蘇晴」已上傳 portrait.byChapter[5] 與 appearanceByChapter[5]
When 我在 UI 點「第 5 章版本」旁的「刪除」 icon 並通過二次確認
Then characters/_assets/蘇晴/chapter_0005.jpg 被 unlink
And frontmatter 的 portrait.byChapter[5] 與 appearanceByChapter[5] 都被移除
And 第 5 章後續 chapter-writer 撰寫時 fallback 到 < 5 的最近條目或 default
And git commit「character: edit 蘇晴」
```

### Scenario: 刪除角色時清除所有資產
```gherkin
Given 角色「林書言」已有 portrait.default + portrait.byChapter[3] + portrait.byChapter[8]
When 我刪除角色「林書言」
Then characters/林書言.md 與 林書言_status.md 都被 unlink
And characters/_assets/林書言/ 整個目錄被刪除（含 default.jpg、chapter_0003.jpg、chapter_0008.jpg）
And _index.md 移除該角色
And git commit「character: delete 林書言」
```

### Scenario: 角色 rename 時 _assets 跟著搬
```gherkin
Given 角色 frontmatter name=「林川」，_assets/林川/ 有兩張圖
When 我把 frontmatter name 改為「林書言」並儲存
Then characters/林川.md → characters/林書言.md
And characters/林川_status.md → characters/林書言_status.md
And characters/_assets/林川/ → characters/_assets/林書言/（含所有圖檔）
And portrait.default / byChapter 的 path 同步更新為新目錄
And git commit「character: rename 林川 to 林書言」
```

## AI 互動細節

- **觸發點**：「上傳圖」按鈕 + 「從圖解析」按鈕（兩階段；上傳不自動觸發解析）
- **預期 Skill**：[`character-image-extractor`](../../skills/character-image-extractor.md)（Designed 2026-05-13）
- **預設模型**：用設定頁（009）的 `character-image-extractor.routing.primary`
- **失敗處置**：依 LLMRouter 規則自動降級到 fallback（雲端 → 地端 / xAI / Gemini）；都失敗則 UI 顯示錯誤、保留上傳的圖（不刪）
- **品質保證**：依 Skill 規格的 8 條 golden test

## UX 注意事項

- 「外貌（圖片）」區與「外貌參考（文字）」區並列；可摺疊
- **預設圖** 區顯示縮圖 + 三按鈕：「換圖」「從圖解析」「刪除」
- **章節版本** 區用清單顯示已有的 byChapter 條目；每條顯示「章節 N」+ 縮圖 + 三按鈕；最下方有「+ 為章節新增照片」按鈕（下拉選章節）
- 章節下拉選單列出該專案 chapters/ 中已存在的章節（從 chapter list API）
- 上傳進度顯示 spinner（resize 可能要 1-3 秒）
- 解析過程顯示 spinner「解析中…」（預期 5-15 秒）
- confidence 低的欄位旁加 ⚠️ icon，hover 顯示「LLM 對此項信心較低，請檢視」
- vision provider 連線失敗時 toast 紅色 + 「重試」按鈕
- 圖片預覽：點縮圖可放大（lightbox）

## 開放問題

- [ ] 圖檔超 1 MB 進 git 是否會讓 repo size 累積過快？建議：MVP 接受（單角色一張 default + 數張 byChapter，total < 5MB）；超量時 P1 加 git LFS 整合
- [ ] 同章節多張圖（不同角度 / 表情）整合？建議：MVP 一章一張；多張留 v0.2，可加 array schema
- [ ] EXIF / GPS 隱私清理：MVP 不做；P1 加 server 端 strip
- [ ] 「為章節新增照片」的章節下拉，是否允許「跳章節新增」（例：只寫到第 3 章但為第 10 章上傳圖）？建議：允許，使用者可能先準備
- [ ] 圖片解析失敗時是否保留 placeholder「解析失敗」標記在 frontmatter？建議：不保留 metadata；保留圖檔但解析欄位空白，使用者可重試或手填
- [ ] vision 解析後使用者再按「AI 生成角色描述」（character-card-consolidator）時，consolidator 是否覆蓋 vision 解析結果？建議：consolidator 用 frontmatter 全欄位（含 vision 解析填入的）為輸入，產生 body；不動 frontmatter 本身。即兩個 Skill 串接而非衝突
