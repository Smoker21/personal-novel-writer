# Changelog

All notable changes to Novel Writer are documented here.

## [0.1.0] - 2026-05-14

### First Release — MVP 完整閉環

Novel Writer v0.1.0 是第一個可用版本，涵蓋完整的「AI 輔助撰寫 → 採用 → 記憶更新」閉環。

### Features

#### 核心寫作流程
- **章節編輯器**：CodeMirror 6，繁中輸入穩定，autosave 1.5s + Ctrl+S 手動儲存
- **AI 撰寫章節**：SSE 串流產出草稿，chapter-writer Agent（依角色外貌、前章記憶、大綱撰寫）
- **採用草稿**：9 步事務性採用（驗 draft → atomic 寫主檔 → prompt.md → git commit → 觸發 status 更新）
- **章節敏感外貌**：角色在不同章節可有不同外貌，chapter-writer 自動用正確版本

#### 記憶閉環
- **status 自動更新**：採用/儲存後自動分析章節，更新 story_status.md 和各角色 _status.md
- **三個觸發點**：auto-after-save / auto-after-adopt / 手動「立刻更新狀態」
- **AI 精簡**：status 過長時可一鍵 AI 精簡（保留 🔖/✨ 段條目）
- **跨章記憶**：第 2 章 AI 撰寫時能讀到第 1 章 status，維持故事連貫

#### 角色卡
- **六分區欄位**：身分 / 個性 / 外貌 / 對話 / 關係 / 親密
- **AI 統整描述**：從欄位生成連貫的角色 body 段落（character-card-consolidator）
- **Vision 圖片解析**：上傳角色參考圖，AI 解析外貌填入欄位（character-image-extractor）
- **章節版本圖片**：為不同章節上傳對應的外貌參考圖

#### Git 版控
- **每次寫入自動 commit**：儲存/採用/更新 status 都自動 git commit
- **歷史面板**：查看任何檔案的 commit 歷史 + 預覽 + unified diff + 還原

#### 設定
- **6 個 LLM Provider**：Anthropic / OpenAI / Google / xAI / Ollama / LM Studio
- **capability-aware fallback**：Vision 請求自動跳過純文字模型
- **Agent 路由**：每個 Agent/Skill 獨立設定使用哪個模型
- **4 個快速 preset**：全雲端 Haiku / Cloud+地端 fallback / 全地端 Qwen / 測試版 RWKV

### Technical
- Tauri 2 + Hono sidecar + Vite React + CodeMirror 6
- better-sqlite3（draft cache + undo entries）
- sharp（圖片 resize，支援 Node 18.9.0+）
- gpt-tokenizer（context window 守門）
- 401 unit + integration + E2E tests

### Known Issues
- Windows SmartScreen 警告（無 EV cert，點「更多資訊 → 仍要執行」即可）
- macOS Gatekeeper 警告（無 Apple Developer 帳號，見 docs/user-guide/installation.md）
- Ctrl+Z unadopt：CM6 view 還原，`.md` 保留 AI 草稿（需 git 歷史還原主檔）
- Status 編輯畫面：目前只能預覽，直接儲存功能待 v0.2
