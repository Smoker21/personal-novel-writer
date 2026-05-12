# 角色卡：上傳參考圖 → AI 寫容貌與服裝

> Story ID: `002b-character-card-from-image`
> Persona: `worldbuilder-author`（主要）、`hobbyist-author`
> Epic: `EPIC-02-character-creation`
> Priority: `P1`
> Size: `M`
> Status: `Draft`（**MVP defer，預定 v0.2**）
> Depends on: `002`（角色卡基礎）、`009`（設定頁，需配置 vision-capable provider）

## 使用者故事

身為 **個人創作者**，
我想要 **上傳一張或多張角色參考圖（人物照、繪作、Pinterest 圖等），讓 AI 看圖自動填寫角色卡的「外貌」相關欄位**，
以便 **我不必親手把腦中的人物形象翻成文字描述，特別是 hairstyle / 服裝 / 體型這些難以言喻的視覺特徵**。

## 背景與動機

依 idea.md 第 35 條：「人物製作包含**輸入圖片**，使用 VL 輸出人物外貌。」

vision-capable LLM 在我們的評估（[2026-05-12 qwen3-vl 結果](../../architecture/model-evaluation/results/2026-05-12-qwen3-vl-30b-a3b-abliterated.001.md)）證實技術可行。但 MVP 階段選擇 **defer**，原因：

1. 雲端 vision LLM（Gemini / Grok / GPT-4o）需要 multimodal adapter 路徑，packages/llm-adapter v1 不含
2. 地端 vision（qwen3-vl-30b）VRAM 16 GB，不是所有使用者都有 4090 級別硬體
3. MVP 以「文字輸入」優先驗證 chapter-writer pipeline；vision 是 nice-to-have

## 範圍（待 v0.2 開工時細化）

**包含（草案）：**
- 角色卡編輯區新增「上傳參考圖」tab
- 支援多圖上傳（建議上限 5 張）
- 對每張圖呼叫 vision LLM 提取「外貌特徵」+「服裝」（依 002 schema）
- 結果填入對應欄位（身高、髮型、眼睛、其他特徵 textarea），使用者可編輯
- 多圖時 AI 整合（不是各圖獨立報告，是合併出單一描述）
- 圖檔本身存到 `characters/_assets/<slug>/` 並在 frontmatter 記 path

**不包含：**
- AI 生圖（→ 002c）
- 從圖判斷年齡 / 性別 / 個性（這些靠使用者輸入或 002 的 AI 統整）
- 即時 webcam 截圖

## 模型路線

雲端優先（成本效益、穩定）：
- Anthropic claude（vision OK，質量高）
- Google Gemini Pro Vision（cheap，多語）
- xAI Grok（內容自由度較高，適合成人題材參考圖）

地端 fallback：
- qwen3-vl-30b-instruct-abliterated（已評估）

## 開放問題

- [ ] 上傳的圖檔是否要做 EXIF 清理（隱私考量）？
- [ ] 多人合照如何處理？（要使用者標「這個是我要的角色」嗎？）
- [ ] 圖檔本身要不要 commit 進 git（會讓 repo size 暴漲）？

> 本 story 在 v0.2 開工前先以 Draft 保留，正式啟動時請用 `write-user-story` skill 走完整流程補 .feature。
