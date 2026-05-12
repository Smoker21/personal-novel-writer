# 故事與人物狀態更新（status-updater）

> Story ID: `007-update-story-character-status`
> Persona: `serial-author`（最受益）、`hobbyist-author`、`worldbuilder-author`
> Epic: `EPIC-04-ai-writing-and-memory`
> Priority: `P0`
> Size: `M`
> Status: `Ready`
> Depends on: `006`、`009`（設定頁需配置 LLM）、`010`（git 版控保證可還原）
> 修訂：`2026-05-12` — 對齊使用者新方向：拿掉 token 上限與自動截短；改為「使用者觸發 + AI 精簡按鈕 + 手動編輯 + git 版控還原」四件套；character_status 改為一人一檔。

## 使用者故事

身為 **個人創作者**，
我想要 **在採用章節定稿、按下儲存或主動點「更新狀態」按鈕時，AI 把該章的劇情演進與人物關係變化寫進 `story_status.md` 與該章涉及的每個角色的 `<slug>_status.md`，且我可以隨時打開這些 status 檔手動編輯、或按「AI 精簡」按鈕讓 AI 壓縮太長的段落（但保留我釘住的伏筆與轉折點）**，
以便 **下一章寫作時 chapter-writer 仍記得之前的世界觀、伏筆、人物關係，但又不會因為章數累積讓 status 檔失控膨脹或失去重點**。

## 背景與動機

idea.md 第 26 條：「根據章節內容更新故事狀態與人物關係狀態 ... 把必要的劇情演進和人物關係變化寫進故事狀態與人物狀態，提供續寫與故事演進參考，以免 AI 在撰寫後續章節時喪失記憶。Story status 與 Character status 需要精簡，以免佔用過多 context size。」

**「精簡」與「不失憶」是內在矛盾**。本版設計給的解：

1. **內容範疇切割清楚**（C 點）：story_status 只記長期記憶（世界觀 / 重要劇情點 / 伏筆 / 轉折點 / 場景清單）。當前狀態（蘇晴此刻在哪、心情如何）由「上一章完整內容」+「本章大綱」帶
2. **沒有 token 上限**（A、B 點）：檔案多長都接受。靠 AI 精簡按鈕與人工編輯把無關緊要的舊細節壓掉。長度爆炸由使用者自己負責管理
3. **伏筆 / 轉折用 markdown 段落標註**（E、F 點）：`## 🔖 伏筆` `## ✨ 轉折點` 兩段被視為「關鍵記憶」，AI 精簡時預設不動
4. **人物 status 一人一檔**（D 點）：`characters/<slug>_status.md`，只更新該章涉及的角色檔。10 個角色 = 10 個檔，每個檔長度自由
5. **記憶分層**（G 點）：
   - **短期** = 上一章完整內容（chapter-writer 直接讀；不再用 200 字摘要）
   - **中期** = 不存在
   - **長期** = story_status + 各 character_<slug>_status
6. **觸發時機**（H 點）：採用 / 儲存 / 「立刻更新狀態」按鈕。autosave 不觸發
7. **無並發 / race**（H 點）：每次 LLM 呼叫都是 stateless「讀觸發當下的檔案 → 改檔」。手改和 AI 改是先後順序，沒有特殊 marker、沒有 race detection
8. **失敗 / 後悔的退路** = git 版控（Story 010）：所有 status 檔都在 git 裡，亂改了 `git checkout` 還原

這是 **AI 記憶機制的閉環**：

```
撰寫 (chapter-writer 讀 story_status + 該章涉及的 char_status + 上一章完整內容 + 本章大綱)
   ↓
儲存 / 採用 (草稿寫進 chapter_NNNN.md)
   ↓
本 Story (status-updater 讀該章 + 既有 status 檔 → 寫新版)
   ↓
下一章撰寫 (chapter-writer 又讀新 status)
```

少了這環，章數一多 AI 必失憶。

## 範圍

**包含：**

1. **status-updater 觸發機制** — 在三個觸發點呼叫：
   - 章節「採用」按鈕（Story 006）— 將 AI 草稿寫進 chapter_NNNN.md 後自動跑
   - 章節「儲存」按鈕（Story 003 修訂版）— 將 browser 草稿寫進 chapter_NNNN.md 後自動跑
   - 編輯器側邊「立刻更新狀態」按鈕 — 使用者主動觸發
   - **autosave 不觸發**（autosave 只寫 browser storage，不動 markdown）

2. **status-updater 處理範疇** — 給 LLM 的輸入：
   - 該章主檔內容（完整）
   - 既有 `status/story_status.md`（完整）
   - 該章主檔中**有提到的角色**對應的 `characters/<slug>_status.md`（完整）
   - 該章相關角色卡 `characters/<slug>.md`（從章節大綱取）
   - **不傳**：其他章節的主檔、其他角色的 status、其他角色卡

3. **status-updater 輸出** — 寫入：
   - 新版 `status/story_status.md`
   - 該章涉及角色的新版 `characters/<slug>_status.md`（多個檔）

4. **AI 精簡按鈕**（在 status 編輯畫面）— 適用於 story_status.md 與所有 character_<slug>_status.md 檔：
   - 一個按鈕：精簡整個檔案
   - **`## 🔖 伏筆` 與 `## ✨ 轉折點` 段預設保留**（除非使用者另外勾選「也精簡這兩段」）
   - 結果寫到「敘述」可編輯區（與 002 角色卡同模式），使用者可微調再儲存

5. **Status 檔的手動編輯** — 使用者可隨時打開 `story_status.md` / `<slug>_status.md` 在編輯器修改（這就是 Story 003 的編輯器，status 也是 .md 檔）

6. **git 版控** — 每次 status-updater 寫入或使用者手動編輯後儲存，都觸發一個 git commit（依 Story 010 機制）。亂改了用 git 還原

**不包含：**

- `status-updater` Skill / Agent 的提示詞細節 → 由 ai-agent-designer 撰寫 `docs/skills/status-updater.md`（短任務 → 應為 Skill 不是 Agent）
- token 上限 / 自動截短 / 精簡重試三段邏輯 → **明確拿掉**
- per-project queue / lock → **明確拿掉**（沒有並發爭用問題：使用者觸發、git 版控還原）
- 跨章節向量檢索 → Story 020
- AI 自動分類段落是否「重要到變伏筆」→ 使用者自己用 markdown heading 分

## 資料模型

### `status/story_status.md` 骨架

建立專案時（Story 001）自動產出含預設 heading 的空檔：

```markdown
# 故事狀態 — 春日記事

## 世界觀
（背景設定的演進。例：故事發生於 2020 年代台北雨季；言字書店是兩年前盤下的舊書店）

## 重要劇情點
（按章節時序記錄。每條格式：`(第 N 章) 內容`）

## 🔖 伏筆
（已埋待回收。每條格式：`(第 N 章) 內容 — 待第 X 章揭曉` 或 `(第 N 章) 內容 — 未定揭曉時機`）
**精簡時 AI 預設跳過此區。**

## ✨ 轉折點
（角色 / 故事走向轉折。每條格式：`(第 N 章) 內容`）
**精簡時 AI 預設跳過此區。**

## 場景
### 場景：言字書店
- 地址：XX 市 YY 區 ZZ 巷 14 號
- 環境：木質地板、舊書架、長型空間
- 氛圍：墨香、舊紙味
- 關鍵物品：木桌上的舊筆記本

### 場景：蘇晴的公寓
（章節有用到新場景時 AI 自動加入；使用者也可手動補）
```

### `characters/<slug>_status.md` 骨架

建立角色時（Story 002）自動產出空檔：

```markdown
# 蘇晴 — 狀態

## 重要狀態變化
（按章節時序記錄。例：`(第 5 章) 確認母親二十年前住過言字書店附近`、`(第 7 章) 確認與林書言的好感`）

## 與其他角色的關係
- 與 [[林書言]]：（描述當前關係 + 演進）

## 🔖 個人伏筆
（與此角色相關的伏筆。**精簡時 AI 預設跳過此區。**）

## ✨ 個人轉折點
（此角色的內心或外顯轉折。**精簡時 AI 預設跳過此區。**）
```

### Markdown 約定

- `## 🔖 伏筆`、`## ✨ 轉折點` 在兩種 status 檔都用同樣標記
- AI 精簡邏輯只看 emoji 標題：`🔖` / `✨`
- 條目標準格式：`(第 N 章) 內容`，N 是章節編號；未定章節用 `(待定)`

## 觸發機制細節

```
使用者按「儲存」或「採用」按鈕（在章節編輯器）
  → 把 browser draft 寫進 chapter_NNNN.md
  → status-updater 自動跑
      └→ 讀：該章主檔 + 既有 story_status + 涉及角色的 char_status + 角色卡
      └→ LLM 跑（不串流；背景任務）
      └→ 寫新版 story_status + 各 char_status
      └→ git commit（Story 010）
  → toast 通知「狀態已更新」

使用者在編輯器側邊按「立刻更新狀態」按鈕（任何時候）
  → 同上流程

使用者打開 story_status.md / <slug>_status.md 在編輯器
  → 編輯（與 chapter 一樣，autosave 到 browser storage）
  → 按「儲存」寫進 .md
  → git commit（不跑 status-updater，因為這是使用者直接編輯，不是章節觸發）

使用者在 status 編輯畫面按「AI 精簡」按鈕
  → LLM 跑（讀整檔 → 跳過 🔖/✨ 段 → 壓縮其他段）
  → 結果填入「敘述」可編輯區，使用者微調
  → 按「儲存」寫進 .md
  → git commit
```

**autosave 不觸發 status-updater**。autosave 只寫 browser storage（Story 003 修訂版會說明）。

## 並發

**沒有特別處理**。LLM 呼叫都是 stateless「讀檔 → 寫檔」。如果使用者連續按兩次按鈕，第二次呼叫會讀第一次寫完的結果作為輸入。git commit 序列上看得到先後順序。

實作時：UI 在 LLM 跑的時候 disable 按鈕，避免重複觸發；不需要 server-side queue 或 lock。

## 驗收條件 (Gherkin)

### Scenario: 採用第一章後產生初版 story_status 與 character_status
```gherkin
Given 我已開啟專案「春日記事」
And 設定頁（009）已設定預設 LLM
And status/story_status.md 是建立專案時的空骨架
And characters/蘇晴_status.md 與 characters/林書言_status.md 都是空骨架
And 第一章 chapter_0001.md 主檔已透過「採用」按鈕從草稿寫入
When 採用流程結束，自動觸發 status-updater
Then 系統呼叫 LLM，輸入：第一章主檔 + 兩個空骨架 status + 兩個角色卡
And status/story_status.md 的「重要劇情點」段新增 `(第 1 章) 蘇晴避雨進入言字書店，發現舊筆記本上的母親地址`
And status/story_status.md 的「場景」段新增「### 場景：言字書店」並描述地址、環境、氛圍、關鍵物品
And characters/蘇晴_status.md 的「重要狀態變化」段新增 `(第 1 章) 因避雨初訪言字書店，意外發現舊筆記本中母親二十年前的地址`
And characters/蘇晴_status.md 的「與其他角色的關係」段新增 `與 [[林書言]]：初次相識，互相試探`
And characters/林書言_status.md 同樣有對應更新
And 系統 git commit 訊息「status: update after adopt chapter 1」
And 編輯器右下角 toast 通知「狀態已更新」
```

### Scenario: 「儲存」按鈕（不是採用）也觸發 status 更新
```gherkin
Given 我在第二章編輯器已寫了一段，內容存在 browser storage
When 我按「儲存」按鈕
Then chapter_0002.md 被寫入
And status-updater 自動觸發，讀第二章主檔 + 既有 status → 更新 status 各檔
And git commit「status: update after save chapter 2」
```

### Scenario: 「立刻更新狀態」按鈕主動觸發
```gherkin
Given 我已採用第三章一段時間，但中途修改過 character_<slug>_status.md 補了一些細節
When 我在編輯器側邊按「立刻更新狀態」按鈕
And 系統提示「以最新的 chapter_0003.md 重新跑 status-updater？」我按確認
Then status-updater 跑，讀第三章主檔 + 我手改後的 status 各檔 → 寫新版
And git commit「status: manual update after chapter 3」
```

### Scenario: status-updater 只動該章涉及的角色檔
```gherkin
Given 專案有 5 個角色（蘇晴、林書言、謝伯、小美、阿凱）
And 第二章主檔只提到「蘇晴」「林書言」
When 我採用第二章，status-updater 跑
Then characters/蘇晴_status.md 與 characters/林書言_status.md 被更新
And characters/謝伯_status.md、小美_status.md、阿凱_status.md 完全不動
And git commit 顯示只有兩個 char_status 檔有變動
```

### Scenario: AI 精簡按鈕（story_status.md）
```gherkin
Given status/story_status.md 累積了 30 章後變得很長
And 「重要劇情點」段有 50 條，「世界觀」段被反覆 append 變得很冗長
And 「🔖 伏筆」段有 8 條重要伏筆
And 「✨ 轉折點」段有 5 條
When 我打開 story_status.md 編輯畫面，按「AI 精簡」按鈕
Then 系統呼叫 LLM，提示為「精簡此檔，但 `🔖` 與 `✨` 段不要動」
And 結果填入「敘述」可編輯區
And 「重要劇情點」「世界觀」「場景」段被合併 / 縮短
And 「🔖 伏筆」段 8 條原封保留
And 「✨ 轉折點」段 5 條原封保留
When 我微調文字後按「儲存」
Then story_status.md 寫入新版
And git commit「status: AI shorten story_status.md」
```

### Scenario: AI 精簡時使用者勾選「也精簡 🔖/✨ 段」
```gherkin
Given 我在 story_status.md 編輯畫面，勾選「也精簡 🔖 伏筆 與 ✨ 轉折點 段」
When 我按「AI 精簡」按鈕
Then LLM 同時精簡所有段（包括 🔖 / ✨）
And 「敘述」區顯示新版，使用者再微調
```

### Scenario: status-updater 失敗不破壞既有 status
```gherkin
Given 我採用第三章草稿
And status-updater 呼叫 LLM 時連線失敗
When 系統重試 3 次仍失敗
Then status/story_status.md 與所有 character_<slug>_status.md 保持上次寫入的內容（不被部分寫入）
And 編輯器 toast 提示「狀態更新失敗：第 3 章。可至章節旁的『重試狀態更新』按鈕重跑」
And 第三章主檔 chapter_0003.md 仍正常保留（採用動作不被視為失敗）
And git 沒有新增 commit（因為 status 沒變）
```

### Scenario: status-updater 不修改既有角色名稱（品質性質）
```gherkin
Given characters/_index.md 中存在角色「蘇晴」「林書言」
And 既有 status 檔中也使用這兩個名字
When status-updater 在採用某章後產出新版各檔
Then 新版中這些角色的名字字元不被修改
And 不出現該章中未提及的新角色名（避免幻覺）
```

### Scenario: 場景清單在新場景出現時自動加入
```gherkin
Given 第三章主檔出現新場景「咖啡廳」（之前未在 story_status.md 提過）
When status-updater 跑
Then story_status.md 的「場景」段新增「### 場景：咖啡廳」並描述地址、環境、氛圍、關鍵物品
And 既有的「### 場景：言字書店」「### 場景：蘇晴的公寓」段不被刪
```

### Scenario: 章節提及新角色時不自動建立 char_status 檔
```gherkin
Given 第四章主檔提到一個新名字「老闆娘」（非角色卡裡的角色）
When status-updater 跑
Then 系統不自動建立 characters/老闆娘.md 或 老闆娘_status.md
And status/story_status.md 的「重要劇情點」可以提到「(第 4 章) 出現一名老闆娘角色」
And UI 提示「第 4 章出現未在角色卡中的新名字『老闆娘』，是否建立角色卡？」
```

### Scenario: 使用者手改 status 後再觸發 status-updater
```gherkin
Given 我手動編輯 story_status.md，補了一條 `🔖 伏筆：(第 3 章) 蘇晴的母親其實還活著`
And 我按「儲存」寫進 .md
When 我接著採用第四章，status-updater 自動跑
Then LLM 讀的是「我手改後」的 story_status.md（含我加的伏筆條）
And 新版 status 中該伏筆條被保留（因為在 🔖 段，預設不動）
And LLM 不會「察覺」是我改的還是它前次寫的，純粹依當下檔案內容生新版
```

## AI 互動細節

- **觸發點**：採用按鈕、儲存按鈕、編輯器側邊「立刻更新狀態」按鈕、status 編輯畫面「AI 精簡」按鈕
- **預期 Skill**：`docs/skills/status-updater.md`（status update 用）+ `docs/skills/status-shortener.md`（AI 精簡用）— 兩者都待 ai-agent-designer 撰寫
  - 是 Skill 不是 Agent（單次操作）
- **預設模型**：用設定頁（009）的「預設模型」即可
- **串流**：否（背景任務，toast 通知即可）
- **失敗處置**：依 ADR-0004，retryable 自動重試 3 次（指數退避 1s / 2s / 4s）；都失敗則保留舊 status 並通知
- **品質保證（golden test 要驗）**：
  - 不新增未在輸入中出現的角色姓名
  - 不修改既有角色姓名字元
  - 輸出符合 Markdown 格式（不破壞檔案結構）
  - `🔖 伏筆` `✨ 轉折點` 段在「不勾選」精簡時必須保留
  - 該章未提及的角色 status 檔完全不被讀取也不被寫入

## UX 注意事項

- **「儲存」「採用」「立刻更新狀態」三個按鈕並列**在編輯器工具列：
  - 儲存：browser draft → .md（觸發 status-updater）
  - 採用：AI 草稿 → .md（觸發 status-updater）
  - 立刻更新狀態：直接跑 status-updater，不寫 chapter（用於使用者改了 status 後想用最新檔重跑）
- 觸發 status-updater 後 UI 顯示 spinner（右下角），不阻塞編輯
- 完成後 toast「狀態已更新」(2 秒消失)
- 失敗時 toast 紅色 + 永久側邊提示「狀態更新失敗：第 N 章」直到使用者按「重試」或「忽略」
- status 編輯畫面 = 與 chapter 編輯器同樣的 markdown editor + 多一個「AI 精簡」按鈕（含 checkbox「也精簡 🔖 / ✨ 段」）
- AI 精簡按鈕跑 LLM 時 disable 自己 + 顯示「精簡中…」spinner
- 精簡完成後結果不直接寫 .md — 填到 textarea 給使用者微調，使用者按「儲存」才寫入

## 開放問題

- [ ] 「儲存」按鈕每按一次都跑 status-updater，連按多次（譬如使用者習慣性 Ctrl+S）會浪費 LLM 呼叫。是否加 debounce（例：連續按 30s 內只跑一次）？建議：UI debounce 即可，按鈕 30s 內變灰
- [ ] 「立刻更新狀態」按鈕是否要在某些情境隱藏（例：該章還沒寫任何東西）？建議：永遠顯示，但無變更時點下去 toast「沒有需要更新的內容」
- [ ] AI 精簡時，使用者可不可以選「精簡某一段」？目前設計是整檔精簡 + 跳過 🔖/✨。建議先不做段選，使用者要精細控制就手改
- [ ] `🔖` `✨` 段除了預設 markdown convention，UI 是否要提供「在游標處插入伏筆條目」按鈕？建議：MVP 不做，使用者直接打 markdown 即可；未來考慮
- [ ] 章節主檔出現未建角色卡的新名字時，UI 提示「是否建立？」是否要做？建議：MVP **不做**（簡化），使用者自己在角色面板按「新增」即可；未來再做
