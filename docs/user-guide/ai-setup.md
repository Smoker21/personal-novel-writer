# AI 設定指南

Novel Writer 支援地端（免費）與雲端（付費）兩種模式。

---

## 地端模式（免費，推薦）

### LM Studio

最簡單的地端方案，圖形介面，無需命令列。

1. 下載 [LM Studio](https://lmstudio.ai/)
2. 在 Discover 頁搜尋並下載：
   - `Qwen2.5-14B-Instruct-GGUF`（需 ≥8GB VRAM 或 16GB RAM）
   - 或 `Qwen2.5-7B-Instruct-GGUF`（較小，4GB VRAM）
   - Vision 功能需：`Qwen2.5-VL-7B-Instruct-GGUF`
3. 點 Local Server → Start Server（port 1234）
4. Novel Writer 設定頁：
   - 啟用「LM Studio（地端）」→ 點「測試連線」確認綠色
   - 在「Agent 預設模型」點「全地端 Qwen」preset
   - 儲存

### Ollama

命令列方式，適合習慣 terminal 的使用者。

```bash
# 安裝 Ollama: https://ollama.ai/
ollama pull qwen2.5:14b
ollama pull qwen2.5:7b   # 較小版本
# Ollama 預設在 port 11434 運行
```

Novel Writer 設定頁：啟用「Ollama（地端）」→ 測試連線 → 選擇 preset。

---

## 雲端模式

### Anthropic Claude（推薦雲端）

- 申請：https://console.anthropic.com/
- 費用：claude-haiku 每千 tokens 約 $0.001（非常便宜）
- 設定：填入 API Key → 套用「全雲端 Haiku」preset

### OpenAI

- 申請：https://platform.openai.com/
- 推薦：`gpt-4o-mini`（低成本）
- 設定：填入 API Key → 手動設定各 Agent 路由

### Google Gemini

- 申請：https://ai.google.dev/
- 推薦：`gemini-2.5-flash`（有免費配額）
- 設定：填入 API Key

---

## 混合模式（推薦進階用戶）

套用「Cloud + 地端 fallback」preset：
- 一般寫作用雲端（速度快）
- 成人題材自動降級到地端（規避雲端審查）

---

## 常見問題

**Q: 測試連線失敗**
- 確認 provider 已啟用（checkbox 打勾）
- 確認 API key 正確（無多餘空白）
- LM Studio/Ollama：確認 server 已啟動

**Q: AI 撰寫按鈕不出現**
- 需先在設定頁設定 chapter-writer 的路由，並儲存
- 點「AI 撰寫本章」時若彈出 modal，照步驟設定即可
