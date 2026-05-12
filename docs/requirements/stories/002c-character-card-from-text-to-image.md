# 角色卡：文字描述 → AI 生參考圖 → AI 回寫詳細描述

> Story ID: `002c-character-card-from-text-to-image`
> Persona: `worldbuilder-author`、`hobbyist-author`
> Epic: `EPIC-02-character-creation`
> Priority: `P2`
> Size: `L`
> Status: `Draft`（**MVP defer，預定 v0.3 或更晚**）
> Depends on: `002`、`002b`、`009`

## 使用者故事

身為 **個人創作者**，
我想要 **用幾句文字描述一個角色（例：「30 歲女作家，內向敏感，鵝蛋臉黑色長髮」），讓 AI 先生成一張參考圖，我看了滿意後再讓 AI 看那張圖回寫詳細外貌描述**，
以便 **我心裡有粗略形象但畫不出來時，能跟 AI 用「看圖說話」的方式對齊細節，得到比純文字描述更具體的角色卡**。

## 背景與動機

延續 002b 的方向 —— 002b 是「使用者已有圖」，002c 是「使用者只有文字」。

兩個流程串起來實現「文字 ↔ 圖 ↔ 詳細描述」的雙向工具鏈，特別有用於：

- 想寫但畫不出來的使用者
- 想對齊「腦中形象」與「文字描述」的使用者
- 寫成人題材時，借生圖工具具象化身體特徵

## 範圍（待開工時細化）

**包含（草案）：**
- 角色卡編輯區新增「文字 → 生圖」tab
- 接受短文字 prompt（< 200 字）+ 既有結構欄位（個性、MBTI、文化背景）
- 呼叫 image-gen API（Imagen / DALL-E / SDXL / Flux）生成 1-4 張候選圖
- 使用者選一張 → 切到 002b 同流程，由 vision LLM 看圖回寫描述

**不包含：**
- 即時調整生圖 prompt（給細節控制）→ 留更後 story
- 生成多角度圖（正面 / 側面 / 全身 / 特寫）→ 留更後 story
- 風格選擇（寫實 / 動漫 / 油畫）→ 留更後 story（MVP 接受預設寫實）

## 模型路線

兩段路徑：

**Image gen：**
- 雲端：OpenAI DALL-E 3 / Google Imagen / xAI Grok-Image
- 地端：SDXL / Flux Schnell（VRAM 12 GB+）

**Vision（接 002b）：**
- 同 002b 模型路線

## 開放問題

- [ ] 生成的圖檔成本（cloud：每張 $0.02-$0.08）→ 要不要顯示「將消耗約 $X」確認框
- [ ] 生圖被內容政策擋住的處理（特別成人題材）→ 雲端 fallback 順序
- [ ] 圖檔授權（user 是否可以拿生成圖去發表）→ 跟 model provider TOS

> 本 story 在 v0.3 或更晚開工前先以 Draft 保留。技術依賴比 002b 多（image-gen + vision 兩家），優先級暫排在 002b 之後。
