# M5 開工指令 — 核心 UX 重設計

> 給下個 session 接手 M5。本文件 = 起手第一步的完整 prompt。
> 動工前**必讀**：`docs/qa/m4-ux-review-result.md`（使用者人工 review，重點看「👤 你的 review」區）。

---

## 一句話定位

M4 已 release v0.1.0。QA review 揭露三個表面需要**根本設計變更**（非拋光）：
ChapterEditor / Character / Settings。M5 = 走完整 spec 流程重設計這三塊，順手把 M3/M4 遺留的 P0 清掉。

---

## 你是誰

新 session 的角色 = **spec-architect**。
你的任務：把 PM 的需求變更翻成正式 spec 修訂 + 對應 .feature 草稿。

完成的工件交回 PM 簽核才能轉 `status=Ready`，dev 才會動工。

---

## 動工前必讀

| 檔案 | 為何讀 |
|---|---|
| `docs/qa/m4-ux-review-result.md` | 使用者人工 review，每個 surface 下「👤 你的 review」區是需求金句 |
| `docs/qa/m4-bdd-ai-result.md` | BUG-D 修復後的 AI 測試結果（Story 005/007 通過） |
| `docs/qa/m4-followup-todo.md` | M4 遺留 punch list（含 TD-1/2/3/9 P0） |
| `docs/architecture/specs/002-edit-character-card.md` | 現行 spec，要改 |
| `docs/architecture/specs/003-edit-chapter-basic.md` | 現行 spec，要改 |
| `docs/architecture/specs/005-ai-write-chapter.md` | 現行 spec，要改 |
| `docs/architecture/specs/009-settings-page.md` | 現行 spec，要改 |
| `docs/architecture/specs/002b-character-card-from-image.md` | portrait grid 要 reuse 此 spec 的 `_assets/portrait.*` 機制 |
| `CLAUDE.md` | 開發規範 |
| `docs/architecture/adr/0002-agent-skill-naming.md` | Agent vs Skill 區分 |

---

## 要產出的 spec 修訂

### Spec 003 + 005（章節編輯器重設計）

**ChapterEditorPage 新介面元件**：

1. **上下文預覽面板**（read-only 顯示）
   - 前一章節（若無留空白）
   - story_status.md 摘要
   - 各參與角色的 character_status.md
2. **寫作參數 inline 編輯**
   - model（從目前 routing 拉，可單章覆寫）
   - temperature
   - system prompt 覆寫（per-章節 optional）
3. **本章劇情大綱**（文字輸入）— 給 AI 的劇情指引
4. **本章寫作需求**（文字輸入）— 給 AI 的風格/長度/特殊要求
5. **本章角色挑選器**（portrait grid，可多選）
   - 預設帶入「上一章選定角色」
   - 使用者可加入/移除
   - 只有選定角色的 character.md + character_status.md 會塞進 prompt
   - **chapter front-matter 加 `participants: [slug1, slug2]` 欄位**持久化
6. **Generate 流程改造**
   - 點「生成」→ 先呼叫 `POST /api/projects/:hash/chapters/:n/build-prompt`（產 prompt **不**呼 LLM）
   - 顯示完整 prompt 給 user → user 可編輯
   - user 按「送出」→ 用該 prompt 呼 LLM（既有 SSE generate）
   - 草稿出來 → 可採用 / 退回 / 重產
7. **ChapterPromptHistory.md**
   - 採用後寫入該章「本次採用」的提示詞
   - 累積該章歷次採用的 prompt 全文（用 markdown 分隔）
   - 路徑：`chapters/chapter_NNNN_<slug>_prompt-history.md`（或 spec-architect 決定的位置）

**API / 資料模型變更**：
- 新 endpoint：`POST /api/projects/:hash/chapters/:n/build-prompt`（input: 寫作參數+大綱+需求+participants；output: prompt string）
- `chapter.path` front-matter 增加 `participants: string[]`
- `context-collector.ts` 介面變更：accept `participantSlugs: string[]`
- shared-types: `Chapter` type 加 `participants` 欄位

**spec 003 既有的 Case A/B/C/D 衝突邏輯維持，不動**。

### Spec 002（角色卡手動為主 + portrait grid）

**CharactersPage 主視圖改 portrait grid**：

- 每張卡顯示 portrait + 名稱 + 角色定位
- portrait 沒設定時 fallback 為角色定位 icon
- portrait 沿用 spec 002b 的 `characters/_assets/<slug>/portrait.{jpg,png,webp}`
- 支援搜尋（名稱 / 定位）+ 新建按鈕
- 點卡進入編輯模式（取代現行左欄清單）

**邏輯翻轉：手動為主、AI 為輔**：

- 核心欄位（身分/個性/外貌/對話/關係/親密）以「使用者手動輸入」為主
- AI 統整改為 Option：使用者明示按「AI 統整」才呼叫 LLM
- AI 統整輸出寫入「AI 統整敘述」獨立區塊（折疊），**不蓋手動內容**
- 若手動內容已存在，AI 統整需經 dialog 確認才覆蓋
- 衍生資料（搜尋索引、tag 統計）進 SQLite cache（不影響 .md 為單一真實來源原則）

**親密 tab 處理**：
- 預設**展開**（spec 002 2.9 反轉）
- tab 名改為**「性愛場景表現」**

**AI 統整失敗時 UI 仍可正常使用**（user review 報告失敗時整個按鈕無法點）。

### Spec 009（設定頁強化）

1. **Model 下拉選單**
   - 每個 provider 加 `listModels()` 方法（packages/llm-adapter）
   - Anthropic / OpenAI / Google / xAI 各自實作（呼叫該家 API 的 models endpoint）
   - 啟用 provider 或手動 refresh 時拉清單，cache 24h
   - UI 改用下拉，不再用文字輸入
2. **外部模型系統提示詞**（**P0**）
   - 新欄位：per-provider 或 per-routing-slot（**spec-architect 評估**哪個語意更乾淨）
   - 注入到 chapter-writer / character-consolidator / status-updater 的 system prompt 前段
   - 預設範例：「你是一個繁體中文的小說寫作者，擅長描寫男女情愛細節」
3. **API key UX 修正**
   - 顯示/隱藏切換不再清資料（目前 toggle 會清 = bug）
   - **預設顯示**（user 偏好；雖然違反一般 a11y 慣例，但這是本機個人工具）

### 併入既有 spec 微調（不單獨開）

- **spec 007（status 更新）**：加 `POST /api/projects/:hash/status/write` endpoint（TD-1）
- **spec 008（開啟既有）**：補 hash dedupe migration（recent-projects-store 16-char vs project-resolver 8-char 統一）+ path normalize 一致性（TD-2/3）
- **spec 032（首次警語）**：6.6/6.7 行為驗證點補完 — Dialog 鎖 ESC + click-outside（TD-9）

---

## 跨 spec 一致性檢查

| 議題 | 動誰 |
|---|---|
| 003 「本章角色挑選器」與 002 portrait grid：portrait fallback、slug 對應、portrait 來源 | 兩份 spec 引用同一節 |
| 003 chapter front-matter 新增 `participants` 欄位 | chapter-fs.ts、shared-types/chapter.ts、現有章節 migration 規則 |
| `context-collector.ts` 介面變更（accept participantSlugs） | status-updater 是否一樣使用此列表？需評估 |
| Settings 系統提示詞如何注入 chapter-writer prompt | packages/prompt-library 介面變更 |
| 002 的 AI 統整不蓋手動 | character-consolidate.ts 的 manuallyEdited flag 邏輯翻新 |

---

## 進度表（spec-architect 在此維護）

| Spec | 修訂狀態 | PM 簽核 | 對應 .feature 草稿 |
|---|---|---|---|
| 003 + 005（章節編輯器重設計） | ✅ Draft (2026-05-15) | ⬜ | ✅ 003.feature + 005.feature 草稿 |
| **006**（採用流程串接 003+005）| ✅ Draft (2026-05-15) | ⬜ | （沿用既有 006.feature；M6 視需要補）|
| 002（角色卡 portrait grid + 手動為主） | ✅ Draft (2026-05-15) | ⬜ | ✅ 002.feature 草稿 |
| 009（設定強化）| ✅ Draft (2026-05-15) | ⬜ | ✅ 009.feature 草稿（含 TD-9 Story 032 修訂）|
| 007 微調（TD-1） | ✅ Draft (2026-05-15) | ⬜ | ✅ 007.feature 草稿 |
| 008 微調（TD-2/3） | ✅ Draft (2026-05-15) | ⬜ | ✅ 008.feature 草稿 |
| ~~032 微調（TD-9）~~ | ✅ 併入 spec 009 | ⬜ | （已在 009.feature） |

**spec-architect 修訂筆記（2026-05-15）**：
- spec 032 不開獨立檔（spec 009 既有「對 Story 032 的承擔」段已絕對承擔；TD-9 補在該段「Dialog modality 行為驗證點」小節）
- spec 003 + 005 視為「同一改動」處理：chapter front-matter 新增 `participants` / `outline` / `requirements` 在 003 定義，005 的 build-prompt + generate 消費；兩 spec 同步調整
- spec 002 / 002b 分工不變：002 改 body 兩 section + portrait grid UI；002b 仍負責圖片 I/O 與 vision 解析（不動）
- Spec 006 沿用：`chapter_<NNNN>_prompt.md` 形式化為「採用後 prompt 累積歷史」（即 handover 提的 ChapterPromptHistory），不新增第二個檔案
- **Spec 006 在 advisor review 後追加**：原本 handover 沒提，但採用流程必須同步寫入 chapter frontmatter（participants/outline/requirements）才能讓 003 的 contract 完整；spec 006 的 PromptSnapshot 渲染同步調整為「使用者編輯過的 promptText」+ 保留 auto-built 對比

**OPEN（待 PM 拍板的設計選擇）**：
- Spec 003「重產」語意：回 build-prompt 階段（spec-architect 推薦，更安全）vs. 直接重送同 promptText（更快）— 需 PM 在 review 時決定

---

## 完成定義（spec 階段）

全部 ✅ 才可進 dev：
- [ ] 六份 spec 修訂完成
- [ ] 每份對應 .feature 草稿（最終由 PM 確認）
- [ ] 跨 spec 一致性已標註（front-matter、context-collector、prompt-library 介面）
- [ ] PM 對每份 spec 簽核（status=Ready）
- [ ] 在此檔的進度表全勾

---

## Dev 階段順序（spec ready 後）

```
Phase 2-a: P0 patch（不卡 spec，可平行）
  TD-1 status 寫檔
  TD-2/3 hash 統一
  TD-9 FirstLaunch 鎖

Phase 2-b: ChapterEditor 重設計（spec 003+005 ready 後）
Phase 2-c: CharacterEditor portrait grid + 手動為主（spec 002 ready 後）
Phase 2-d: Settings 強化（spec 009 ready 後）

Phase 3: QA + 拋光
  BDD step defs（cucumber-js）
  TD-4 design token / TD-5~8 拋光
  重跑 BDD Story 002/003/005/006/009 整批
  release v0.2.0
```

---

## 回報節奏

每完成一份 spec 修訂 → 推 commit + 在此檔進度表打勾 + 通知 PM。
PM 簽核後改 status=Ready，dev 才能動工。

---

---

## PM Review Round 1（2026-05-15）— 第二輪修訂指令

PM 已 review 第一輪 6 份 spec drafts。三項拍板 + 七項 UX 一致性修訂如下，請 spec-architect 進第二輪修訂後再交回 PM 簽核。

### PM 拍板

| # | 議題 | 決策 | 影響 spec |
|---|---|---|---|
| Q1 | 「整理進人員狀態」語意 | (a) 泛稱角色資料，**使用兩個 TextArea**（手動 + AI 並存不互覆） | 002 已對齊，無需動 |
| Q2 | 上下文預覽預設展開 vs 摺疊 | (A) **預設摺疊**（一頁整合 ≠ 全部同時可見） | 003 line 251 維持 |
| Q3 | 「重產」語意 | (A) **回 build-prompt 階段**，使用者重調參數+ prompt 後再生成 | 003 + 005 確認 |

### UX 一致性修訂（PM 授權「仔細審核」後產出，全部進本輪）

| # | 修訂項 | 內容 | 影響 spec |
|---|---|---|---|
| UX-1 | **ExpandableTextarea 共用元件** | 抽 `<ExpandableTextarea>`：右上角 ⛶ icon → modal 全螢幕（80vh × 80vw）編輯 → 收回 inline；字數計數右下；ESC 可收回（非 lock dialog） | 002 / 003 / 007 / 009 在 UI 規格段加引用 |
| UX-2 | **CharacterEditor 結構澄清** | 6 個 tabs = 編 frontmatter 結構化欄位；**body 兩個 textarea（手動 + AI）為 tabs 外的固定區**（不是每個 tab 各自 2 個）；點任一 tab 不影響 body 兩 textarea 顯示 | 002 line 425 改寫；補一張結構圖 |
| UX-3 | **status-updater 採用後通知** | 維持自動寫 status 檔（ergonomics 不擋），但採用後 toast「status 已更新（[查看 diff]）」連結 git history 面板；配合 TD-1 直接寫檔允許隨時干預 | 007 |
| UX-4 | **AI 精簡 status 走 draft→review** | status-shortener AI 精簡：response **不寫檔**，進 textarea preview → 使用者編輯/確認 → 按儲存才寫；與 002 consolidate 流程對齊 | 007 |
| UX-5 | **Loading state 共用規格** | 抽 `<Spinner>` 元件：< 3s 行內 spinner；3~15s 加「處理中...（約 N 秒）」；> 15s 加進度文字 + 取消按鈕。spec 標註每個操作的預期時長 | 002（consolidate 8~20s）/ 009（test-provider 5s / list-models 3s） |
| UX-6 | **Error 三層呈現規範** | (a) inline 紅字 = 欄位驗證錯誤；(b) toast = 操作失敗（非阻擋）；(c) modal = 阻擋性錯誤（衝突、未設定）。每個 error code 對應到一層 | 003 / 005 / 009 |
| UX-7 | **採用前確認補完** | (a) 採用 AI 章節若 editor 內有 dirty browser draft，先 dialog 「您有未儲存的編輯，採用會丟棄這些變更，繼續？」；(b) settings reset 加 dialog 二次確認（spec 009 line 237 補上） | 003 + 009 |

### 修訂後進度表

PM Round 1 完成後，spec-architect 重跑進度表並推 commit。完成後**通知 PM 進 Round 2 review**（不直接轉 Ready）。

#### Round 2 修訂落點對照（2026-05-15 晚）

| # | 修訂項 | 落在哪 |
|---|---|---|
| Q3=A | 重產回 build-prompt 階段 | spec 003 §「重產」與「丟棄」段（OPEN 已關閉）+ 003.feature 新 scenario |
| UX-1 ExpandableTextarea | canonical 規格放 spec 002 「Shared UI components」段；spec 003 / 007 / 009 cross-reference | 002 / 003 / 007 / 009 + 全部 .feature 對應 scenario |
| UX-2 CharacterEditor 5 tabs | spec 002 「編輯模式」段整段重寫；6 → 5 tabs（合併身分外貌）；body 兩段為固定區；補 placeholder sample data | 002.feature 4 個新 scenario |
| UX-3 status-updater toast | spec 007 「三個觸發點」段加「完成後通知」小節 | 007.feature 2 個新 scenario |
| UX-4 status-shortener review | spec 007 `POST /status/shorten` 補「draft → review → save 流程」 | 007.feature 4 個新 scenario |
| UX-5 Spinner | canonical 規格放 spec 002；spec 009 cross-reference + 各操作預期時長 | 002 / 009 + 002.feature 1 scenario |
| UX-6 Error 三層 | canonical 規格放 spec 002；spec 003 / 005 / 009 cross-reference + 各 error code 分類 | 005 / 009 變更紀錄 |
| UX-7 確認 modal | spec 003「採用」流程補 dirty draft 確認；spec 009 reset endpoint 補二次確認 modal | 003.feature 1 scenario + 009.feature 1 scenario |

### 不在本輪範圍

- 親密 tab 改名為「性愛場景表現」+ 預設展開（已在 spec 002 第一輪寫入，不重做）
- 系統提示詞 per-routing-slot vs per-provider 決策（已在 spec 009 第一輪定案）
- Spec 006 PromptSnapshot 渲染（已在 spec-architect 第一輪追加 advisor 修訂）

### 開放問題 — 第二輪不擋

- spec 003 第一輪「OPEN」（重產語意）已由 Q3=A 關閉
- 若第二輪修訂中發現新跨 spec 一致性問題，spec-architect 自行記錄並在進度表標 ⚠️ 留 PM Round 2 處理（不擋本輪 commit）

---

## 變更紀錄

- 2026-05-15：M5 開工指令初版。PM 拍板「直接進 M5、全部走 spec」+ 追加 portrait grid + 本章角色挑選器。
- 2026-05-15（晚）：PM Round 1 review 完成。Q1=(a) 雙 TextArea / Q2=(A) 預設摺疊 / Q3=(A) 重產回 build-prompt。UX 一致性 7 項修訂指令交回 spec-architect 進第二輪。
