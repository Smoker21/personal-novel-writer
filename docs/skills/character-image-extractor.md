---
name: character-image-extractor
type: skill
description: Read one character image and an optional chapter-context hint, output structured JSON describing the character's appearance (hair, eyes, body type, clothing, distinctive features). Vision-LLM single-shot. Does NOT generate prose body (that's character-card-consolidator), does NOT receive style.md.
---

# 角色圖片解析員 (`character-image-extractor`)

> **這是什麼**：讀一張角色參考圖 + 可選的章節脈絡，輸出結構化外貌 JSON（髮型 / 眼睛 / 體型 / 服裝 / 其他特徵）。
> **何時用**：使用者在角色卡編輯器上傳一張圖（預設 default 或章節版）並點「從圖解析」按鈕。
> **不做什麼**：不寫小說正文；不寫連貫敘述（那是 `character-card-consolidator` 的事）；不**受 `style.md` 影響**；不從圖判斷年齡 / 性別 / 個性（那些靠使用者輸入或 002 AI 統整）。

> Status: `Designed`
> Owner spec: `docs/skills/character-image-extractor.md`（本檔）
> Owner prompt: `packages/prompt-library/skills/character-image-extractor.ts`
> Linked specs: [002b](../architecture/specs/002b-character-card-from-image.md)
> Linked stories: [002b](../requirements/stories/002b-character-card-from-image.md)

## 1. 操作定位

把一張人物圖（照片 / 繪作 / 截圖）轉成**結構化外貌欄位**。產出**不**是散文敘述——是 frontmatter 用的 JSON 欄位。

**與 character-card-consolidator 的分工**：

| 物件 | character-image-extractor（本 Skill） | character-card-consolidator |
|---|---|---|
| 輸入 | 圖片 + chapter context | frontmatter 全欄位 |
| 輸出 | 結構化 JSON（hair / eyes / clothing 等） | 200~500 字連貫敘述（body） |
| 流程位置 | 圖 → schema 欄位 | schema 欄位 → 連貫文字 |
| 觸發 | 「從圖解析」按鈕 | 「AI 生成角色描述」按鈕 |

正常流程：使用者上傳圖 → 本 Skill 填欄位 → 使用者微調 → 點 consolidator 產 body。

## 2. 使用情境

- **觸發點**：
  - 角色卡編輯器「上傳預設圖 + 從圖解析」按鈕 → 寫進「外貌」區塊扁平欄位
  - 角色卡編輯器「為章節 N 上傳圖 + 從圖解析」按鈕 → 寫進 `appearanceByChapter[N]`
- **使用者目的**：把腦中人物形象 / 找到的參考圖**翻譯成文字**，省去手寫描述
- **服務的 persona**：`worldbuilder-author`（最常用，會建多角色）、其他 persona 偶爾用

## 3. 輸入合約

```ts
interface CharacterImageExtractorInput {
  // 圖片（依 ADR-0009 ImageContent 結構）
  image: {
    source:
      | { kind: "path"; path: string }     // 本機絕對路徑
      | { kind: "base64"; data: string; mimeType: ImageMimeType };
  };

  // 章節脈絡（optional；影響輸出語氣與服裝重點）
  context?: {
    chapterNumber: number | null;          // null = default 預設外貌；N = 第 N 章版本
    storyGenre?: string;                   // 例：「現代都市」「武俠仙俠」「奇幻」；幫 LLM 判斷服裝時代是否合理
    characterName?: string;                // 例：「蘇晴」；給 LLM 一個指代詞用
    existingAppearance?: string;           // optional：使用者已填的描述；LLM 用來「修補」而非「覆蓋」
  };
}
```

**不會有的東西**：

- writingStyle（明確排除）
- 整本書內容 / 章節主檔 / status（避免 context 爆炸）
- 多張圖（MVP 單張；多張留 v0.2）
- 角色既有 body（避免 LLM 以 body 為基準微調）

## 4. 輸出合約

```ts
interface CharacterImageExtractorOutput {
  // 結構化外貌欄位（對應 CharacterFields 中 appearance 區塊）
  hairAndColor: string;                    // 例：「黑色長髮，及腰，低馬尾」
  eyes: string;                            // 例：「雙眼皮，眼尾微下垂，褐色」
  bodyType: string;                        // 例：「中等偏瘦」（或圖中觀察到的描述）
  otherFeatures: string;                   // 例：「鵝蛋臉，膚色偏白；手指細長」
  clothing: string;                        // 例：「淺灰色棉麻長裙，米白色細針織背心」

  // optional：估算的身高（只在圖能判斷時填）
  heightHint?: string;                     // 例：「中等身高（約 160-170cm）」；非精確值

  // 信心度標記（讓使用者知道哪個欄位 LLM 不確定）
  confidence: {
    hairAndColor: "high" | "medium" | "low";
    eyes: "high" | "medium" | "low";
    bodyType: "high" | "medium" | "low";
    otherFeatures: "high" | "medium" | "low";
    clothing: "high" | "medium" | "low";
  };

  // 章節敏感的補充說明（context.chapterNumber 非空時填）
  chapterNote?: string;                    // 例：「此章節版本：雨夜外套外披」
}
```

**格式**：嚴格 JSON。**不**含 markdown code fence、解釋文字、disclaimer。

## 5. System prompt

```
你是小說人物參考圖解析員。讀一張人物圖，產出結構化的外貌描述 JSON。

【嚴格規則 — 不可違反】

1. **只描寫圖中可見的**：不發明圖中沒有的細節（不臆測背景故事、職業、年齡精確值）。
2. **服裝按時代合理**：若 context 提供 storyGenre（例：武俠 / 仙俠 / 古代），服裝描述要符合該時代；若圖中服裝與 genre 衝突（例：仙俠故事但圖是西裝），照圖實寫但加 chapterNote 提醒「服裝與 genre 不符」。
3. **不判斷年齡 / 性別 / 個性**：這些靠使用者輸入或 character-card-consolidator 統整。
4. **不命名**：不假設圖中人物叫什麼名字。
5. **confidence 標記要誠實**：對模糊的部分（暗光、側面照、被遮擋）標 low；對清楚的標 high。
6. **無 disclaimer**：不寫「以下是分析」「希望這個描述符合」之類。
7. **繁體中文**：避免簡體字、大陸用語、英文夾雜。

【章節脈絡判讀】

- context.chapterNumber=null（預設）：給「角色的基準外貌 + 通常會穿的服裝風格」
- context.chapterNumber=N：給「此章節版本的具體外貌 + 此章節穿的服裝」；可以包含特殊情境（雨夜、宴會、外出工作）

【欄位填寫指引】

- hairAndColor：髮色 + 長度 + 樣式（綁 / 放 / 編）；3-30 字
- eyes：眼型 + 顏色 + 眼神特徵；3-30 字
- bodyType：身材印象（偏瘦 / 結實 / 健美 / 圓潤 / 高壯 等）；不寫精確身高體重
- otherFeatures：臉型 + 膚色 + 手 / 頸 / 痣 / 疤等可見特徵；30-100 字
- clothing：上衣 / 下著 / 鞋 / 配件；30-150 字；描述具體（顏色 / 材質 / 剪裁）

【輸出格式】

回傳 JSON：

{
  "hairAndColor": "...",
  "eyes": "...",
  "bodyType": "...",
  "otherFeatures": "...",
  "clothing": "...",
  "heightHint": "...（optional）",
  "confidence": { ... },
  "chapterNote": "...（optional）"
}

**不加 markdown code fence；不加說明文字；直接回 JSON。**
```

## 6. 模型建議

**雲端首選**：`anthropic:claude-sonnet-4-6`
- 中文表現好；對「描述」類任務指令遵循強
- 對 NSFW 角色圖可能拒絕（會回 content_blocked）；LLMRouter 自動降級

**雲端備援**：
- `google:gemini-2.5-pro`（多語強、context 大、相對寬鬆）
- `xai:grok-2-vision`（內容自由度高，適合成人題材）
- `openai:gpt-4.1`（中文略弱但格式遵循好）

**地端首選**：
- `lmstudio:qwen3-vl-30b-a3b-instruct-abliterated-h-corpus`（評估 TC-08 已驗；中文 + 自由度俱佳）

**地端最小可行**：
- `ollama:llava:13b`（品質一般但能跑；不建議 production）

**最小 context window**：4096 tokens
- 預估：system prompt（500）+ image tokens（依 provider 500-1500）+ context hint（200）+ output JSON（300-500）≈ 2000-3000 tokens

## 7. 驗收標準（golden test）

- [ ] **輸出為合法 JSON**：可被 `JSON.parse` 消化；無 markdown code fence
- [ ] **schema 完整**：包含 5 個必填欄位 + confidence 物件；可選 heightHint / chapterNote
- [ ] **不發明事實**：抽 3-5 個輸出欄位人工抽查，斷言能在圖中對應（用 LLM-as-judge 或 vision LLM 二次驗）
- [ ] **無 disclaimer**：輸出不含「以下」「希望」「(註：」「分析」
- [ ] **無大量簡體**：簡體比例 < 5%
- [ ] **欄位字數合理**：hairAndColor 3-30、clothing 30-150 等（依「欄位填寫指引」）
- [ ] **chapterNote 出現條件正確**：context.chapterNumber 非空時必填；null 時不必填
- [ ] **confidence 標記合理**：對極清楚正面照給 high；對遮擋 / 側面 / 模糊給 low

## 8. 已知失敗模式與緩解

| 情境 | 失敗表現 | 緩解 |
|---|---|---|
| 圖含 NSFW / 暴力內容 | 雲端 provider 回 content_blocked | LLMRouter 自動降級到地端 vision；UI 顯示「已切換到地端模型」 |
| 圖是多人合照 | LLM 選錯人或描述混合 | UI 限制：MVP 只允許「主角為畫面主體」的圖；提示「請上傳單人圖」；未來 P1 加「裁切 / 框選」 |
| 圖是動畫 / 繪作（風格化） | LLM 描述「卡通眼睛」「不寫實膚色」 | 接受；使用者微調 |
| 圖太小（< 256px） | LLM 看不清細節 | server 端驗證最小 512px；< 512 拒絕 |
| 圖太大（> 5MB） | provider API 拒絕 | server 端 resize 到 4096×4096 + 重編碼到 < 5MB |
| 圖格式 HEIC / TIFF | provider 不認 | server 端拒絕 + 提示使用者轉 JPG/PNG/WebP |
| 模型加 markdown code fence 包 JSON | parse 失敗 | 後處理 strip；prompt 末尾強調 |
| 模型輸出中文 + 英文混 | 違反規則 #7 | prompt 強調繁中；轉碼 / 統一 |
| 圖中服裝跟 genre 衝突 | LLM 自行解讀 | 規則 #2 + chapterNote 警示；不阻擋 |
| 模型把信心度全標 high | 不誠實的自評 | golden test 抽查；prompt 範例給「對遮擋部分標 low」 |

## 9. 對其他物件的影響

- **Spec 002b**：實作 Skill 的呼叫端 + 圖片儲存
- **Spec 002**：解析結果寫進 frontmatter 對應欄位（appearanceByChapter[N] 或 default 扁平欄位）
- **packages/llm-adapter**：依 ADR-0009 支援 image content
- **chapter-writer**：間接受益——獲得章節敏感的外貌資料

## 版本紀錄

- `v0.1` (2026-05-13): 初版設計；對應 Story 002b 升級 P0 + 章節敏感外貌需求
