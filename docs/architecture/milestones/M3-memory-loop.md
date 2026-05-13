# M3 — 記憶閉環 + git 歷史

> Status: **未開工**
> 預估規模：25-35 PR
> 對應 spec：[006](../specs/006-adopt-chapter-draft.md)、[007](../specs/007-update-story-character-status.md)、[010](../specs/010-git-version-control.md)（補完）
> 對應 Skill 規格：[status-updater](../../skills/status-updater.md)、status-shortener（附於同檔）
> 前置依賴：[M2 角色卡 + AI 撰寫](./M2-characters-and-ai-writing.md) DoD 全通過

## 目標

完成 **MVP 撰寫故事閉環**——從 AI 寫的草稿能採用、採用後 status 自動更新、下一章 AI 撰寫時「記得」前章；加上 **git 歷史 UI** 讓使用者能預覽 / 還原 / 比對任何版本。

完成後使用者跑「寫完第 1 章 → 採用 → status 更新 → 寫第 2 章看到 AI 記得第 1 章」這個 demo 應該水到渠成。

## 範圍

### Spec 006 採用 AI 草稿（完整）

依 Spec 006 全部範圍：

- POST /adopt endpoint（含 `confirmed: true` 強制驗證、`DRAFT_STALE` 偵測）
- POST /unadopt endpoint（對應 Undo 動作）
- 11 步採用事務（驗 draft → 比對 contextHash → 寫主檔 atomic → 寫 prompt.md → 標記 draft adopted → 觸發 status-updater → 記 UndoEntry → 回應）
- `chapters/chapter_NNNN_prompt.md` 完整渲染（含 marker 註解 `<!-- adopt-marker:<undoEntryId> -->`）
- 一章多次採用時 prompt.md 累積歷史
- 採用前不再自動快照到 `_versions/`（已被 git commit 取代，依 2026-05-12 修訂）
- UndoEntry 記到 SQLite + 連動 CM6 history（使用 transaction userEvent 標籤）

**前端**：

- 「採用」按鈕從 M2 的 disabled 改為 enabled
- 二次確認對話框（含「git 歷史可還原」提示）
- 「您在草稿產生後修改了上下文」確認流程（DRAFT_STALE → force: true）
- 採用流程進度條（寫主檔 → 寫 prompt → git commit → 觸發 status-updater）
- 採用後 toast「已採用，狀態更新中…」

### Spec 007 status-updater（完整）

依 [Spec 007 對齊版（2026-05-12）](../specs/007-update-story-character-status.md)：

- POST /status/update-from-chapter（SSE 串流進度）
- POST /status/shorten（同步回應）
- StatusUpdateContext 蒐集（一人一檔 character_<slug>_status）
- 三個觸發點接入：
  - Spec 003 儲存流程末端 → `reason: auto-after-save`
  - Spec 006 採用流程末端 → `reason: auto-after-adopt`
  - 前端「立刻更新狀態」按鈕 → `reason: manual`
- 「該章涉及角色」篩選邏輯（outline 列 / 否則全部 / substring matching）
- 寫入 → 比對舊內容 → 相同則 skip → 不同則 atomic write + commitIfChanged
- 重試 3 次（指數退避 1s / 2s / 4s）
- SSE 失敗時 UI 持久顯示「狀態更新失敗：第 N 章」+ 重試按鈕

**前端**：

- 編輯器右下角小型 spinner（subscribe statusUpdateJobId 的 SSE）
- 「立刻更新狀態」按鈕（在編輯器側邊）
- status 編輯畫面「AI 精簡」按鈕（含 checkbox「也精簡 🔖/✨ 段」）
- AI 精簡結果填到 textarea（不直接寫檔）
- 「狀態更新失敗」永久 banner + 重試按鈕

### Spec 010 Git 版控（UI 補完）

M1 已完成 commit timing + git status banner；M3 補：

- GET /git/log（含 file filter、limit、分頁）
- GET /git/show（讀特定 commit 的檔案內容）
- GET /git/diff（unified diff）
- POST /git/revert（單檔還原 → 產生 revert commit）
- POST /git/commit-manual（git status 面板手動 commit）

**前端**：

- 「歷史」按鈕在每個編輯器工具列（章節 / 角色卡 / status）
- `HistoryPanel.tsx`（drawer 從右邊滑出，列出 commits）
- `CommitPreview.tsx`（點 commit 看當時內容）
- `DiffView.tsx`（unified diff 渲染，紅 / 綠標示）
- `RevertButton`（含二次確認，呼叫 revert API → 重新載入編輯器內容 → 清 IndexedDB draft）
- 「git status」面板（次要功能，藏在「進階」選單）+ 「手動 commit」對話框

### Agent / Skill 提示詞實作

- `packages/prompt-library/skills/status-updater.ts`（依 [status-updater Skill 規格](../../skills/status-updater.md)）
- `packages/prompt-library/skills/status-shortener.ts`（附於 status-updater 檔末規格）
- JSON 輸出 schema 驗證（用 zod）
- Golden test：餵固定 fixture，驗 prompt 組裝 hash 穩定 + 輸出 JSON parse 成功

## 任務拆解

### Types
- [ ] **types-1**: `packages/shared-types/src/project.ts` 補 UndoEntry 與 RevertRequest / ManualCommitRequest
- [ ] **types-2**: `packages/shared-types/src/status-update.ts`（UpdateReason、StatusJobEvent 等）

### Status updater 後端
- [ ] **stat-be-1**: `apps/api/src/services/status-context-collector.ts`（蒐集 + 涉及角色篩選）
- [ ] **stat-be-2**: `apps/api/src/services/status-updater-service.ts`（主流程 + retry）
- [ ] **stat-be-3**: `apps/api/src/services/status-md-merger.ts`（識別 `## 🔖` `## ✨` heading + merge）
- [ ] **stat-be-4**: `apps/api/src/services/status-shortener-service.ts`
- [ ] **stat-be-5**: `apps/api/src/services/job-event-bus.ts`（AsyncIterable → SSE bridge）
- [ ] **stat-be-6**: `apps/api/src/routes/status.ts`（POST /update-from-chapter、POST /shorten）
- [ ] **stat-be-7**: `apps/api/src/routes/jobs.ts`（GET /jobs/:id/events SSE bridge）
- [ ] **stat-be-8**: 整合 Spec 003 PUT chapter 與 Spec 006 adopt 流程在尾端觸發 status-updater
- [ ] **stat-be-9**: 整合 commit-policy（寫完 status 後 commit）

### Adoption 後端
- [ ] **ad-be-1**: `apps/api/src/services/prompt-md.ts`（渲染 + append + marker offset 記錄 + unadopt 切片）
- [ ] **ad-be-2**: `apps/api/src/services/undo-store.ts`（SQLite undo_entries table）
- [ ] **ad-be-3**: `apps/api/src/routes/adopt.ts`（POST /adopt 主流程）
- [ ] **ad-be-4**: `apps/api/src/routes/unadopt.ts`（POST /unadopt）

### Adoption 前端
- [ ] **ad-fe-1**: 「採用」按鈕從 disabled 改 enabled（M2 留的 placeholder）
- [ ] **ad-fe-2**: 二次確認對話框（含 git 還原提示）
- [ ] **ad-fe-3**: 採用流程進度條（寫主檔 / 寫 prompt / commit / 觸發 status-updater 四步）
- [ ] **ad-fe-4**: DRAFT_STALE 確認流程（顯示對話框 → force: true 重發）
- [ ] **ad-fe-5**: CM6 transaction 整合（採用後 view.dispatch 把草稿插入，產生 undo entry）
- [ ] **ad-fe-6**: Ctrl+Z 觸發 unadopt（連到後端 POST /unadopt）

### Status updater 前端
- [ ] **stat-fe-1**: `StatusUpdateIndicator.tsx`（編輯器右下角 spinner + 完成 toast）
- [ ] **stat-fe-2**: `UpdateStatusButton.tsx`（「立刻更新狀態」按鈕）
- [ ] **stat-fe-3**: `StatusShortenButton.tsx`（「AI 精簡」按鈕 + 整段流程）
- [ ] **stat-fe-4**: 「狀態更新失敗」永久側邊提示 + 重試
- [ ] **stat-fe-5**: status 編輯畫面（複用章節編輯器，加「AI 精簡」按鈕）

### Git 歷史 UI
- [ ] **git-be-1**: `apps/api/src/services/git-log-parser.ts`（含 numstat、parents、message type 抽取）
- [ ] **git-be-2**: `apps/api/src/routes/git.ts` 補 log / show / diff / revert / commit-manual
- [ ] **git-fe-1**: `HistoryPanel.tsx`（drawer + commits 列表）
- [ ] **git-fe-2**: `CommitPreview.tsx`
- [ ] **git-fe-3**: `DiffView.tsx`（unified diff 渲染，可用 `diff2html-react` 或自寫）
- [ ] **git-fe-4**: `RevertButton.tsx` + 二次確認
- [ ] **git-fe-5**: 「git status」面板（次要功能，藏在進階選單）+ 「手動 commit」對話框
- [ ] **git-fe-6**: 每個編輯器工具列加「歷史」按鈕（章節 / 角色卡 / status）

### Prompt library
- [ ] **prompt-1**: `packages/prompt-library/skills/status-updater.ts`
- [ ] **prompt-2**: `packages/prompt-library/skills/status-shortener.ts`
- [ ] **prompt-3**: zod schema 驗證 LLM 輸出

### QA
- [ ] **qa-1**: cucumber-js step definitions for `006.feature`
- [ ] **qa-2**: step definitions for `007.feature`（10 scenarios）
- [ ] **qa-3**: step definitions for `010.feature` 剩餘部分（歷史 / diff / revert）
- [ ] **qa-4**: status-updater golden test：餵固定 fixture，斷言 JSON parse 成功 + 不修改角色名 + 該章未提及角色 status 不變
- [ ] **qa-5**: status-shortener golden test：preserveMarkedSections=true 時 🔖 / ✨ 段條目字元保留
- [ ] **qa-6**: prompt-md.ts 的 marker offset 記錄 + unadopt 切片正確性測試
- [ ] **qa-7**: 採用 + Undo + revert 三條鏈的端對端測試
- [ ] **qa-8**: MVP 完整閉環 E2E（第 1 章 AI 寫 → 採用 → status 更新 → 第 2 章 AI 寫看到記憶）

## demo 驗收 walk-through（MVP 完整閉環）

```
1. 啟動既有專案
   → 開啟 M2 已建好角色與寫過第 1 章草稿的「春日記事」

2. 採用第 1 章草稿
   → 進第一章編輯器
   → 點「AI 撰寫本章」→ 草稿產出
   → 點「採用」（M3 已 enabled）
   → 二次確認對話框「採用此草稿將覆寫第一章。git 歷史可還原。」
   → 點「確認」
   → 進度條：寫主檔 → 寫 prompt → git commit → 觸發 status-updater
   → 主編輯區內容變為草稿內容
   → 編輯器狀態變為「已儲存到 .md」
   → 右下角 spinner 顯示「狀態更新中…」
   → 約 30 秒後 toast「狀態已更新」

3. 驗證採用後檔案結構
   → terminal: ls chapters/
   → 看到 chapter_0001_梅雨初晴.md 與 chapter_0001_prompt.md
   → cat chapter_0001_prompt.md → 含 marker 註解、frontmatter、system prompt、user prompt、context hash
   → terminal: git log --oneline
   → 看到「chapter: adopt AI draft for chapter 1 梅雨初晴」與後續「status: update after adopt chapter 1」兩個 commit

4. 驗證 status 自動更新
   → 開 status/story_status.md
   → 看到「## 重要劇情點」段下新增「(第 1 章) 蘇晴避雨進入言字書店…」
   → 開 characters/蘇晴_status.md
   → 看到「## 重要狀態變化」段下新增「(第 1 章) 因避雨初訪…」
   → 「## 與其他角色的關係」段下新增「與 [[林書言]]：初次相識，互相試探」
   → 開 characters/林書言_status.md → 對應更新
   → 第三個未在第 1 章出現的角色（若有）status 不動

5. Undo 採用
   → 在第一章編輯器按 Ctrl+Z
   → 主編輯區內容回到採用前（M1 寫的內容）
   → toast 提示「您 undo 了採用動作，但 .md 還是 AI 草稿。如要還原 .md，請看 git 歷史」
   → 確認 chapters/chapter_0001_梅雨初晴.md 內容仍是 AI 草稿（未變）

6. 寫第 2 章 — 驗證 AI 記憶
   → 新增第 2 章
   → 點「AI 撰寫本章」
   → 對 chapter-writer 的 user prompt 抓取（在 dev tools 或 log）
   → 確認 prompt 含「story_status.md」與「characters/蘇晴_status.md」「characters/林書言_status.md」的完整內容
   → 確認 prompt 含上一章完整內容（previousChapterFullText）
   → 草稿產出 → 內容應「記得」第 1 章（例：提到筆記本、提到母親地址）

7. 採用第 2 章
   → 點「採用」→ 確認
   → 採用流程完成
   → 看 status/story_status.md → 「## 重要劇情點」累積到「(第 2 章) ...」

8. AI 精簡 status
   → 開 status/story_status.md 在編輯器
   → 點「AI 精簡」按鈕
   → spinner → textarea 顯示精簡後內容
   → 對照原內容：🔖 / ✨ 段條目原封保留；其他段被合併 / 縮短
   → 微調文字 → 按「儲存」
   → git commit「status: AI shorten story_status.md」

9. 歷史面板
   → 在第一章編輯器點「歷史」按鈕
   → drawer 從右側滑出
   → 列出第一章的 commit 歷史（依時間倒序）：
     - 目前版本
     - chapter: adopt AI draft for chapter 1 梅雨初晴
     - chapter: save chapter 1 梅雨初晴
     - init: novel project 春日記事
   → 點「chapter: save chapter 1 梅雨初晴」
   → 右側顯示當時的內容（M1 使用者寫的版本）
   → 點「Diff 與當前比較」→ unified diff 顯示差異
   → 點「還原到此版本」→ 二次確認 → 主檔內容回到 M1 版本 + 新增「revert」commit
   → 編輯器主編輯區重新載入 + 清 IndexedDB draft

10. 「立刻更新狀態」按鈕
    → 手動編輯 characters/蘇晴_status.md 補一條伏筆條目
    → 不採用 / 不寫新章節
    → 點「立刻更新狀態」按鈕（在編輯器側邊）
    → 系統提示「以最新的 chapter_0002.md 重新跑 status-updater？」→ 確認
    → status-updater 跑 → 我手改的伏筆條保留（在 🔖 段，預設不動）
```

## DoD

- [ ] 全部任務 PR 已 merge
- [ ] 上述 10 步 demo walk-through 全部通過
- [ ] MVP 完整閉環 E2E 測試 pass
- [ ] vitest 覆蓋率 critical path ≥ 70%
- [ ] BDD step definitions for 006 / 007 / 010 完整 pass
- [ ] Golden test：status-updater 對固定 fixture 產出穩定 + 不修改角色名 + 該章未提及角色不變

## 給下個 session 的開工 brief

你接手的是 **M3 記憶閉環 + git 歷史** milestone。M0 / M1 / M2 已完成；現在要把 MVP 的最後一塊拼上——**採用 AI 草稿、status 自動更新、git 歷史完整 UI**。

### 動工順序建議

可拆兩條 dev session 並行：

| Session 線 | 範圍 |
|---|---|
| A | 採用流程 + status-updater（spec 006 + 007 + status-updater/shortener prompts） |
| B | git 歷史 UI（spec 010 補完） |

或單一 session 連續做：先 A 線（採用 → status 觸發 → status 寫入），再 B 線（git history UI）。建議**先 A 後 B**因為 A 線會驗證 commit-policy 完整對接所有 spec。

### 動工前必讀

- 本檔
- [Spec 006](../specs/006-adopt-chapter-draft.md)、[Spec 007](../specs/007-update-story-character-status.md)、[Spec 010](../specs/010-git-version-control.md)
- [status-updater + status-shortener Skill 規格](../../skills/status-updater.md)
- [chapter-writer Agent 規格](../../agents/chapter-writer.md)（M2 已實作，M3 需確認沒踩前章記憶相關 bug）
- [Story 006](../../requirements/stories/006-adopt-chapter-draft.md)、[Story 007](../../requirements/stories/007-update-story-character-status.md)、[Story 010](../../requirements/stories/010-git-version-control.md)

### 關鍵風險

- **採用流程的事務性**：11 步流程任一失敗都要 rollback；測試「主檔寫入失敗」「prompt.md 寫入失敗」「status-updater 失敗（不阻擋採用成功）」三個分支
- **CM6 transaction userEvent 與後端 UndoEntry 對齊**：採用時前端 `view.dispatch({ userEvent: "adopt.chapter-writer" })` 與後端產生的 UndoEntry id 要綁定；Ctrl+Z 觸發 unadopt 時帶上 entry id
- **status-updater 對長 status 的處理**：M3 仍**沒有** token 上限（Story 007 明示拿掉）；長度由「AI 精簡」按鈕負責；但 LLM context overflow 時要 graceful（500 LLM_FAILED → UI 持久 banner）
- **Drive 同步衝突 vs 採用 race**：採用前後 .git/ 與 .md 都改了，Drive 開始同步——可能造成另一台機器看到 prompt.md 但沒主檔的瞬態。可接受（短暫不一致），但 dev 要知道
- **`event: degraded` 路徑**：status-updater 也可能觸發雲端→地端降級；UI toast 提示「狀態更新切換到地端模型」

### 不在範圍

- **跨章節向量檢索（Story 020）**：M3 仍用「上一章完整內容 + status 累積」這條路；向量檢索是 P1
- **章節版本快照手動 UI（Story 014 / 015）**：被 git 歷史面板涵蓋，已淘汰
- **多人協作 / 雲端 git remote**：留 v0.2

### 模型相關

`packages/prompt-library/skills/status-updater.ts` 與 `status-shortener.ts` 的提示詞**不**插入 style.md（依新慣例；structured data 處理）。實作時不要寫進 style 段。

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| 採用 11 步事務 rollback 邊界情境多 | 詳細 fixture 覆蓋；每個失敗點寫一個 test |
| status-updater 對非預期 LLM 輸出（不 JSON / 含 markdown fence）的 robustness | Spec 007 規範 1 次「請改格式重試」；前端顯示 graceful 錯誤 |
| Undo 採用後 prompt.md 含「Undo」標記但實質上沒有清除 → 重複採用混亂 | prompt.md 用 `<!-- adopt-marker -->` 包多次採用；unadopt 在最後加一行註記但不刪 marker |
| 歷史面板對 100+ commits 效能 | 分頁載入（每頁 50）；先實作再驗效能 |
| Drive 同步未 commit 變更與 status-updater race | 啟動時 git status 偵測 + 提醒（M1 已實作）；M3 不額外處理 |

## 完成紀錄

> dev 在 milestone 完成時填這裡

- 實際開工時間：
- 實際完成時間：
- 實際 PR 數：
- 偏離 plan 的範圍：
- 踩雷 / 教訓：
- 移交給 M4 的注意事項：
