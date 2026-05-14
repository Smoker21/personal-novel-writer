# 常見問題

## 啟動問題

### 應用程式無法啟動

**Windows：** 確認 Visual C++ 2019 Redistributable 已安裝：
```
winget install Microsoft.VCRedist.2015+.x64
```

**macOS：** 確認 macOS 12 以上，並允許「未知開發者」執行。

---

### 「需要 git」提示

安裝 git 後重啟應用：
- Windows：https://git-scm.com/download/win
- macOS：`xcode-select --install`
- Linux：`sudo apt install git`

---

## AI 功能問題

### AI 撰寫沒有輸出 / 轉圈圈

1. 確認 dev server 還在（`curl http://127.0.0.1:3001/api/health`）
2. 確認 LM Studio / Ollama server 已啟動
3. 設定頁「測試連線」確認綠色
4. 章節寫手路由是否已設定（設定頁 → Agent 預設模型）

### AI 輸出是英文 / 簡體字

chapter-writer prompt 已要求繁中輸出，但小模型（7B）可能不穩定：
- 換成 14B 以上模型
- 或改用雲端 Claude / Gemini

### 狀態更新 spinner 一直轉

- 若 30 秒後還沒結束，通常是 LLM 無回應
- 確認地端 server 還在跑（LM Studio / Ollama）
- 按「立刻更新狀態」手動重試

---

## 資料問題

### 章節顯示「載入中…」

- 等待 1-2 秒讓 API 回應
- 若一直卡住，重新整理頁面（在 Tauri 桌面版按 F5）

### 設定沒有儲存

確認點「儲存」按鈕後有出現「已儲存」提示，並確認 `~/.novel-writer/settings.yaml` 有被更新。

### git commit 失敗

常見原因：
1. git 未安裝或版本過舊（需 2.30+）
2. 專案目錄不是 git repo（需手動 `git init`）
3. Windows 路徑包含特殊字元

---

## 效能問題

### AI 撰寫很慢

- 地端模型：14B on CPU 約 2-5 分鐘，on GPU（8GB VRAM）約 30-60 秒
- 改用較小模型（7B）或改用雲端
- 確認系統 RAM > 16GB（跑 14B 量化需要約 12GB）

### 應用程式啟動慢

- 首次啟動需下載/編譯較多資源，後續會快
- Tauri 桌面版約 2-4 秒，dev 模式約 5-10 秒

---

## 回報 Bug

在 [GitHub Issues](https://github.com/Smoker21/personal-novel-writer/issues) 開 issue，請附上：
1. 作業系統 + 版本
2. 錯誤訊息截圖
3. 重現步驟
