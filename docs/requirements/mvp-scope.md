# MVP Scope（v0.1）

> 作者：PM + 使用者共議，2026-05-12
> Status: `Draft`（最後一輪確認後升 Ready）
> 適用範圍：Novel Writer 應用程式 v0.1 — 第一個可用的個人本機小說撰寫工具

## 一句話定義

**v0.1 MVP** 是一個能讓單一使用者：
- 建立 / 開啟一本小說專案
- 用 AI（cloud + 地端任選）寫章節草稿並採用為定稿
- 以結構化欄位 + AI 統整方式維護角色卡
- 章節定稿後 AI 自動更新故事與人物的長期記憶（可手動 / 可精簡）
- 所有內容透過 git 版本控制保存

…的最小可用工具。**不**做：協作、雲端帳號、影像、生圖、章節大綱 AI、續寫、審稿、潤飾 Skill、模型選擇器 UI 等。

## Personas 對應

| Persona | MVP 是否覆蓋核心價值？ | 註解 |
|---|---|---|
| `hobbyist-author` | ✅ 是 | 全流程可用：手寫 / AI 寫 / 採用 / 狀態自動延續 |
| `serial-author` | ✅ 是（核心） | status-updater 解決連載失憶問題；多章歷程 git 可追 |
| `worldbuilder-author` | ⚠️ 部分 | 角色卡 MVP 有了（含 AI 統整），但場景庫只能手寫進 story_status.md（依 Story 007）；vision 角色卡延後 |

## MVP scope 表

> 編號為現行 Story ID。M = MVP / D = Defer / C = Cut。

| ID | 標題 | M/D/C | 規模 | 修訂後依賴 | 理由 |
|---|---|---|---|---|---|
| **001** | 建立新小說專案 | **M** | M | none | 根 story；其他 story 全依賴 |
| **002** | 角色卡編輯（欄位輸入 + AI 統整） | **M** | M | 001、009 | worldbuilder persona 核心；AI 統整為新 MVP 能力 |
| 002b | 角色卡：上傳參考圖 → vision | **D** | M | 002、009 | 雲端 vision 多模態 adapter 路徑 v0.2 才做 |
| 002c | 角色卡：文字 → 生圖 → vision | **D** | L | 002、002b | image-gen + vision 雙依賴；v0.3+ |
| **003** | 章節編輯器 + autosave（兩層儲存）| **M** | M | 001 | autosave→browser，「儲存」按鈕→.md（觸發 git/status）|
| **004** | Undo / Redo（用 lib 內建）| **M** | S | 003、005、006、010 | 簡化版：用 web editor lib 內建即可 |
| **005** | AI 撰寫單章（chapter-writer） | **M** | L | 001、002、003、009 | 產品核心理由；context 改為一人一檔 status + 上一章完整 |
| **006** | 採用 AI 草稿 | **M** | M | 005、007、010 | 與 005 綁；採用 = 寫 .md + git commit + 觸發 status |
| **007** | 故事與人物狀態更新（status-updater） | **M** | M | 006、009、010 | 連載核心；改手動 / 採用 / 儲存觸發 + AI 精簡按鈕 + 一人一檔 |
| **008**（新） | 開啟既有專案 | **M** | S | 001 | 補 PM 點出的硬性 gap |
| **009**（新） | 設定頁（LLM provider / 預設模型） | **M** | M | none | 補 PM 點出的硬性 gap；005/002/007 都依賴 |
| **010**（新） | git 版本控制 | **M** | M | 001 | 取代舊 `_versions/` 機制；undo / restore / diff 統一靠 git |
| 011 | 章節大綱產生器 | **D** | M | 005 | MVP 用使用者手寫大綱即可 |
| 012 | 章節續寫 | **D** | M | 005 | 005 一次寫整章可頂 |
| 013 | polish-prose Skill | **D** | M | 005 | 005 + 手寫修就夠 |
| 014 | 模型選擇器 UI | **D** | S | 009 | MVP 在 009 設定頁選預設即可 |
| 015 | 刪除 / 重新命名專案 | **D** | S | 008 | 邊緣，使用者手動改資料夾也行 |
| 016 | 推到雲端 git remote | **D** | M | 010 | Drive 同步 .git/ 已給備份；GitHub push v0.2 加 |

### MVP 共 11 個 story

001 / 002 / 003 / 004 / 005 / 006 / 007 / 008 / 009 / 010 + Story 002 隱含的 Skill `character-card-consolidator`（在 002 內處理）

### Defer 共 6 個 story

002b / 002c / 011 / 012 / 013 / 014 / 015 / 016（v0.2 / v0.3）

### Cut 項目

- 首次啟動 wizard（009 設定頁夠用，005 錯誤訊息引導即可）
- 客製 undo 合併規則（用 editor lib 內建）
- 自動快照到 `chapters/_versions/`（被 git commit 取代）
- 多開分頁 / 多開視窗
- 跨專案共用「角色資料庫」
- 第一次啟動的成人內容警語對話框（idea.md 提到但 MVP 簡化掉，使用者點開設定頁時才提示）

## 修訂後 Story 之間的依賴與閉環

```
                           ┌─────────────────────┐
                           │ 009 設定頁          │
                           │ (LLM provider 設定) │
                           └──────────┬──────────┘
                                      │ 為 002/005/007 提供模型
                                      ▼
┌──────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│ 008 開啟既有專案 │ ───► │ 002 角色卡          │ ───► │ 005 AI 撰寫單章     │
│                  │      │ (欄位+AI 統整)      │      │ (chapter-writer)    │
└─────────┬────────┘      └─────────────────────┘      └──────────┬──────────┘
          │                                                       │
          │                                                       ▼
          │         ┌──────────────────┐               ┌─────────────────────┐
          └────────►│ 001 建立新小說   │               │ 006 採用 AI 草稿    │
                    │ (gitinit + 骨架) │               │ (寫 .md + commit)   │
                    └─────────┬────────┘               └──────────┬──────────┘
                              │                                   │
                              ▼                                   ▼
                    ┌──────────────────────────────────────────────────────┐
                    │ 003 章節編輯器（autosave→browser, save 寫 .md）    │
                    │ 004 Undo/Redo（用 lib 內建）                       │
                    └─────────────────────┬────────────────────────────────┘
                                          │ 「儲存」/「採用」按鈕
                                          ▼
                              ┌─────────────────────┐
                              │ 010 git 版控        │
                              │ (commit on save)    │
                              └─────────┬───────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │ 007 status-updater  │
                              │ (一人一檔 + 精簡按鈕)│
                              └─────────────────────┘
                                        │
                                        ▼
                                  下一輪 005 寫作
```

## 關鍵設計決策（已固化進 stories）

### 記憶層（007 / 005 / 002）
- **長期記憶** = `status/story_status.md`（世界觀 / 重要劇情點 / 🔖伏筆 / ✨轉折點 / 場景）
- **長期記憶** = `characters/<slug>_status.md`（一人一檔 / 重要狀態變化 / 與其他角色的關係 / 🔖個人伏筆 / ✨個人轉折點）
- **短期記憶** = 上一章完整內容（chapter-writer 直接讀，不再 200 字摘要）
- **沒有中期記憶** — 已壓縮進 status
- **🔖 / ✨ 段落 AI 精簡時預設保留** — 唯一 user-pin 機制
- **status-updater 觸發** = 採用 / 儲存按鈕 / 「立刻更新狀態」按鈕（autosave 不觸發）
- **無 token 上限** — 靠 AI 精簡按鈕 + 手動編輯管理；長度爆炸由使用者自管
- **LLM stateless** — 每次都是「讀觸發當下的檔 → 寫」；無 race detection、無 marker

### 編輯器層（003 / 004 / 006）
- **兩層儲存**：autosave→browser storage（IndexedDB），「儲存」按鈕才寫 .md
- **AI 採用** = 走 web editor lib transaction API → undo stack 自動加一步
- **編輯器 lib 內建 undo/redo** — 不寫客製合併規則
- **跨 session undo** = git checkout（不靠 editor stack）

### 版控層（010）
- **每專案 = local git repo** — 建立專案時 `git init`
- **所有寫 .md 動作都自動 commit**，commit message 規範化
- **Drive 同步 .git/** = 跨機器同步機制（不用 GitHub）
- **歷史面板**：每個編輯器都有「歷史」按鈕，preview / 還原 / diff

### 設定層（009）
- **集中設定頁**，無 wizard
- 005/002/007 未設定時引導使用者來設定頁
- **Quick preset 按鈕**：全雲端 / Cloud+地端 / 全地端 / 測試版（依 model-evaluation 結果）
- **API key 明文存** `~/.novel-writer/settings.yaml`（個人本機應用，不加密）

### Vision 與 image-gen（defer）
- 002b：上傳參考圖 → vision LLM 寫外貌（雲端 Gemini / Grok 為主，地端 qwen3-vl 為 fallback）
- 002c：文字 → image-gen → vision 回寫（cloud DALL-E / Imagen 為主）
- 都 v0.2+

## MVP Skill / Agent 清單（待 ai-agent-designer 撰寫）

| Skill / Agent 名 | 類型 | 用途 | 對應 Story |
|---|---|---|---|
| `chapter-writer` | Agent（多步） | 寫整章草稿 | 005 |
| `status-updater` | Skill | 章節後更新 status | 007 |
| `status-shortener` | Skill | AI 精簡 status 檔 | 007 |
| `character-card-consolidator` | Skill | 欄位 → 連貫角色描述 | 002 |

未來 v0.2+ Agent / Skill：`chapter-titler`、`continuity-checker`、`outline-generator`、`polish-prose`、`scene-builder`、`character-vision-extractor` 等

## 不保證 / 已知 trade-off

| 取捨 | 結果 | 為什麼可接受 |
|---|---|---|
| status 沒有 token 上限 | status 檔可能變得很長 | 使用者自管 + AI 精簡按鈕 + 章數累積天然會 trigger 使用者去精簡 |
| 沒有「中期記憶」 | 5-10 章前的細節可能 status 已壓掉但仍未夠長期 | 上一章完整內容覆蓋短期；status 覆蓋長期；中段感由 AI 自然處理 |
| LLM 不感知「使用者剛改過 status」 | 偶爾 LLM 可能「誤改」使用者手改的部分 | 全部寫入 git，使用者用 history 還原；🔖✨ 段預設保留作主要保護 |
| autosave 不寫 .md | F5 不掉內容（在 browser），但 AI 看不到 | 明確分開「探索」與「定稿」；按儲存才進 AI 可見範圍 |
| 編輯器跨 session 不能 undo | undo stack 不持久 | 用 git history 還原；undo stack 只給「我剛剛打錯了 Ctrl+Z」用 |
| 無自動標題建議 | 使用者要手動命名章節 | 之後 chapter-titler Skill（v0.2）補 |

## v0.1 → v0.2 預期演進

v0.2 候選優先序（待後續另開計劃議定）：

1. **002b / 002c**：角色卡 vision + 生圖（含 cloud Gemini/Grok adapter 擴充）
2. **011** 章節大綱產生器
3. **012** 章節續寫
4. **013** polish-prose Skill
5. **016** 雲端 git remote 推送（GitHub）
6. **014** 模型選擇器 UI（per-call 切模型）
7. **015** 刪除 / 重新命名專案
8. 其他 Agent 如 `chapter-titler`、`continuity-checker`、`scene-builder`

## Phase B 對接

依本計劃 Phase B（可點擊 React prototype），prototype 的畫面需覆蓋以上所有 MVP-tagged story（001/002/003/004/005/006/007/008/009/010）。預估需要 8-12 個畫面：

- `/`（首頁 + 最近開啟清單 + 新小說按鈕）→ 008 / 001
- `/projects/new`（建立專案）→ 001
- `/p/:slug`（專案首頁，章節清單 / 角色清單 / status 速覽）→ 008
- `/p/:slug/characters/new` 與 `/p/:slug/characters/:id`（角色卡編輯，含 AI 統整 button）→ 002
- `/p/:slug/chapters/:n`（章節編輯器，三按鈕：儲存/採用/立刻更新狀態 + AI 寫本章 + 歷史 button）→ 003 / 004 / 005 / 006 / 010
- `/p/:slug/chapters/:n` 草稿側欄（fake stream）→ 005 / 006
- `/p/:slug/status/story` 與 `/p/:slug/status/characters/:slug`（status 編輯器 + AI 精簡 button + 歷史 button）→ 007 / 010
- `/settings`（設定頁）→ 009
- 所有編輯器旁的「歷史」抽屜 → 010
