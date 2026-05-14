# Novel Writer

> 個人本機小說撰寫工具。AI 輔助寫作，git 版控，完全本機執行。

[![Tests](https://github.com/Smoker21/personal-novel-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/Smoker21/personal-novel-writer/actions/workflows/ci.yml)

## ✨ 功能

| 功能 | 說明 |
|---|---|
| 📝 章節編輯器 | CodeMirror 6，autosave，Ctrl+S 手動儲存，git 自動備份 |
| 🤖 AI 撰寫 | 串流產出章節草稿；依角色外貌（章節敏感）+ 前章記憶撰寫 |
| 🧠 記憶閉環 | 採用草稿後自動更新 story/character status，下一章 AI 記得前章 |
| 👤 角色卡 | 6 分區欄位，AI 統整描述，Vision 圖片解析外貌 |
| 📚 git 歷史 | 每次儲存自動 commit，可預覽 / Diff / 還原任何版本 |
| ⚙️ 6 個 LLM | Anthropic / OpenAI / Google / xAI / Ollama / LM Studio |

## 🚀 快速開始

### 下載安裝（Windows）

1. 從 [Releases](https://github.com/Smoker21/personal-novel-writer/releases) 下載最新 `.exe`
2. 安裝（若出現 SmartScreen 警告：點「更多資訊」→「仍要執行」）
3. 確保已安裝 git：`git --version`

### 設定 LLM

**地端免費（推薦）**

1. 安裝 [LM Studio](https://lmstudio.ai/)，下載 `Qwen2.5-14B-Instruct-GGUF`（約 8GB）
2. LM Studio 啟動 Local Server（port 1234）
3. Novel Writer 設定頁 → 啟用 LM Studio → 套用「全地端 Qwen」preset → 儲存

**雲端（Anthropic）**

1. 取得 [Anthropic API key](https://console.anthropic.com/)
2. 設定頁填入 key → 套用「全雲端 Haiku」preset → 儲存

### 第一本小說

1. 點「新小說」→ 填書名 + 父資料夾 + 簡介 → 建立
2. 在編輯器輸入第一章，Ctrl+S 儲存
3. 點「AI 撰寫本章」→ 等待串流 → 點「採用」
4. 右下角 spinner 消失後，status 已自動更新
5. 新增第 2 章 → AI 撰寫 → 草稿會提到第 1 章發生的事（記憶閉環驗證）

## 📁 資料儲存

```
<你選的資料夾>/             ← 小說內容（可 Drive 同步）
  synopsis.md
  chapters/                ← 章節 .md + prompt.md（採用記錄）
  characters/              ← 角色卡 + _assets/ 圖片
  status/                  ← story_status.md + character_status.md
  style.md                 ← 寫作風格指引（可選）

~/.novel-writer/           ← 本機 cache（不同步）
  settings.yaml            ← API key + 路由設定
  cache/<hash>/drafts/     ← AI 草稿 cache
```

## 🛠 開發

```bash
# 需要：Node.js 18.17+、pnpm 9、git

git clone https://github.com/Smoker21/personal-novel-writer.git
cd personal-novel-writer
pnpm install

# 開發（API port 3001 + Web port 5173）
pnpm run dev

# 測試
pnpm test

# 型別檢查
pnpm typecheck

# E2E 測試（需先啟動 dev server）
pnpm --filter @novel-writer/e2e test
```

### 技術棧

- **殼**：Tauri 2（Rust）
- **API**：Hono + Node.js sidecar
- **前端**：React 18 + Vite + Tailwind v4 + CodeMirror 6 + Zustand
- **資料**：better-sqlite3（cache）+ .md 檔案
- **AI**：llm-adapter（6 providers）+ prompt-library

## 📖 文件

- [安裝指南](docs/user-guide/installation.md)
- [第一本小說](docs/user-guide/first-novel.md)
- [AI 設定](docs/user-guide/ai-setup.md)
- [git 版控](docs/user-guide/git-version-control.md)
- [常見問題](docs/user-guide/troubleshooting.md)

## 📄 授權

MIT
