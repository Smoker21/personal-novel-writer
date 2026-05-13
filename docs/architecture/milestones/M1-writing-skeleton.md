# M1 — 寫作骨架（無 AI 寫作流）

> Status: **未開工**
> 預估規模：30-40 PR
> 對應 spec：[001](../specs/001-create-novel-project.md)、[003](../specs/003-edit-chapter-basic.md)、[008](../specs/008-open-existing-project.md)、[009](../specs/009-settings-page.md)（部分）、[010](../specs/010-git-version-control.md)（部分）
> 對應 story：[004 Undo/Redo](../../requirements/stories/004-undo-redo-chapter.md)、[032 首次警語](../../requirements/stories/032-first-launch-warning.md)
> 前置依賴：[M0 基礎建設](./M0-foundation.md) DoD 全通過

## 目標

使用者能完整跑「**建立專案 → 寫一章 → 儲存 → 關閉重開 → 繼續寫**」這個閉環。**不含**任何 AI 寫作功能；AI 留 M2。

但設定頁的「LLM provider 連線測試」要能跑（給使用者驗證 API key 用），讓 M2 動工時不需要回頭做設定 UI。

## 範圍

### Spec 009 設定頁（部分）

完成：

- providers 區段（7 個 provider 全部：anthropic / openai / google / xai / ollama / lmstudio / rwkv-runner）
- 「測試連線」按鈕（依 Spec 009 的測試流程；雲端用 /models，地端用 /v1/models）
- settings.yaml 讀寫 + atomic write
- API key 遮蔽 / 顯示完整 key 分流 endpoint
- 「重設為出廠預設」按鈕
- meta.firstLaunchWarningAcknowledged 欄位寫入（為 Story 032 用）

**留 M2 補完**：
- per-Agent routing UI（dropdown + fallback 陣列編輯）
- preset 按鈕（Cloud / Cloud+地端 / 全地端 / 測試版 RWKV）
- 005 / 002 / 007 對「routing 未設定」的引導 UI（M2 才需要，因為 AI 流程在 M2）

### Spec 010 Git 版控（部分）

完成：

- `apps/api/src/services/commit-policy.ts` 集中管理 commit timing（先放 Story 001 / 003 / 008 對應的觸發點）
- 各 spec 寫檔流程末端呼叫 `commitIfChanged`
- `GET /api/projects/:hash/git/status`（啟動時用）
- `GET /api/projects/:hash/git/check-git-binary`
- Tauri fs watcher 啟用（M0 已建骨架；M1 啟動 event 傳遞給前端）
- Drive 同步衝突偵測（啟動時 git status + UI banner）
- 未裝 git 引導對話框（前端在 detect_git 失敗時顯示）

**留 M3 補完**：
- 歷史面板（log + show + diff + revert UI）
- 手動 commit 面板（git status 面板）

### Spec 001 建立新小說專案（完整）

依 Spec 001 完整實作：

- POST /api/novels endpoint
- 目錄樹建立（含 style.md、status/story_status.md、characters/<slug>_status.md 骨架）
- git init + initial commit
- recentProjects 加入
- 前端「新小說」對話框（書名 / 大綱 / 角色多步表單）
- Ctrl+N 快捷鍵
- 全部 6 個 Scenario 通過

### Spec 008 開啟既有專案（完整）

依 Spec 008 完整實作：

- POST /api/projects/open + 驗證流程
- POST /api/projects/recent/{remove,clear,relocate}
- POST /api/projects/init-git（無 .git 時補 init）
- 前端首頁「最近開啟」清單 + 「瀏覽資料夾」按鈕
- 「無法定位」對話框
- BroadcastChannel 多視窗偵測（依 Spec 008 § 「多視窗 / 多 tab 同專案偵測」）

### Spec 003 章節編輯器（完整）

依 Spec 003 完整實作。**這是 M1 最重的部分**：

- CM6 EditorView 整合（[ADR-0005](../adr/0005-editor-selection.md)）
- IndexedDB schema（Dexie v1）
- Zustand editor-store
- autosave 鉤子（1.5s debounce + blur / 切章 / beforeunload）
- 「儲存」按鈕（PUT chapter + git commit + 觸發 status-updater 的 placeholder）
- 衝突處理 matrix（A/B/C/D/E 五情境）
- title rename 流程
- 章節列表 + 新增 + 切換
- 三狀態 UI indicator（🟢/🟡/🔴）
- Ctrl+S 快捷鍵

**M1 不啟用 status-updater 觸發**（M3 才實作 status-updater Skill）；儲存流程末端的 status-updater 觸發點先用 noop placeholder（記 log「skipped status-updater (not implemented yet)」）。

### Story 004 Undo / Redo

直接用 CM6 `@codemirror/commands` 內建 history 與 undo / redo 命令；綁定 Ctrl+Z / Ctrl+Y。**不寫**客製合併規則。

### Story 032 首次啟動警語

- 完整警語對話框（依 Story 032 內容）
- 「不再顯示」寫入 settings.yaml `meta.firstLaunchWarningAcknowledged`
- 「離開應用」呼叫 Tauri `window.close()`
- ESC 鍵與點擊背景**不**關閉
- 重啟測試

## 任務拆解

### Types & shared lib（先做）
- [ ] **types-1**: `packages/shared-types/src/project.ts`（依 Spec 001 / 008）
- [ ] **types-2**: `packages/shared-types/src/settings.ts`（依 Spec 009）
- [ ] **types-3**: `packages/shared-types/src/git.ts`（依 Spec 010）
- [ ] **types-4**: `packages/shared-types/src/chapter.ts`（依 Spec 003）+ `text-count.ts`

### 設定頁（並行可動）
- [ ] **set-be-1**: `apps/api/src/services/provider-tester.ts`（依 Spec 009 § 連線測試實作）
- [ ] **set-be-2**: `apps/api/src/routes/settings.ts`（GET / PUT / POST test-provider / POST reset / GET secret/:provider）
- [ ] **set-fe-1**: `apps/web/src/features/settings/SettingsPage.tsx`（path: `/settings`）
- [ ] **set-fe-2**: `apps/web/src/features/settings/ProviderCard.tsx`（啟用 toggle + 欄位 + 測試按鈕 + 結果）
- [ ] **set-fe-3**: API key 遮蔽 / 顯示 toggle 元件

### Git 整合（並行可動）
- [ ] **git-be-1**: `apps/api/src/services/commit-policy.ts`（commit timing matrix + commitIfChanged helper）
- [ ] **git-be-2**: `apps/api/src/services/git-status-parser.ts`（--porcelain=v2 解析）
- [ ] **git-be-3**: `apps/api/src/routes/git.ts` 的 status / check-git-binary endpoint
- [ ] **git-fe-1**: 啟動時呼叫 detect_git；未裝時顯示阻擋對話框
- [ ] **git-fe-2**: Drive 同步衝突 banner（啟動 / 章節開啟時 git status）
- [ ] **tau-1**: 啟用 fs_watcher（M0 已建 module，M1 連到 Hono 端 → 前端 listen Tauri event）

### Spec 001 建立專案（依 git-be-1, set-be-2）
- [ ] **proj-be-1**: `apps/api/src/services/sanitize.ts`（slug + title sanitization）
- [ ] **proj-be-2**: `apps/api/src/services/project-fs.ts`（建目錄樹 + rollback + 並行寫入 + 骨架模板 style.md / story_status.md / <slug>_status.md）
- [ ] **proj-be-3**: `apps/api/src/services/recent-projects-store.ts`（settings.yaml.recentProjects CRUD）
- [ ] **proj-be-4**: `apps/api/src/routes/novels.ts`（POST /api/novels + zod 驗證 + git init + initial commit）
- [ ] **proj-fe-1**: `apps/web/src/features/new-project/NewProjectDialog.tsx`（三步表單）
- [ ] **proj-fe-2**: 角色輸入子元件 + 多角色支援
- [ ] **proj-fe-3**: 表單驗證 + fieldErrors 對映
- [ ] **proj-fe-4**: Ctrl+N 快捷鍵 + 提交後路由到編輯器

### Spec 008 開啟專案（依 proj-be-3）
- [ ] **open-be-1**: `apps/api/src/services/project-validator.ts`（驗證流程 6 步）
- [ ] **open-be-2**: `apps/api/src/services/project-summary.ts`（chapter count、title 等）
- [ ] **open-be-3**: `apps/api/src/routes/projects-open.ts`（POST /open、recent CRUD、init-git）
- [ ] **open-fe-1**: `apps/web/src/features/home/HomePage.tsx`
- [ ] **open-fe-2**: `RecentProjectsList.tsx`（卡片式）
- [ ] **open-fe-3**: `BrowseFolderButton.tsx`（Tauri dialog 整合）
- [ ] **open-fe-4**: `MissingProjectDialog.tsx`（無法定位 / 重新指定路徑）
- [ ] **open-fe-5**: BroadcastChannel 多視窗偵測（lib + 編輯器整合）

### Spec 003 章節編輯器（M1 重頭戲）
- [ ] **ed-fe-1**: `apps/web/src/lib/db.ts`（Dexie database v1）
- [ ] **ed-fe-2**: `apps/web/src/stores/editor-store.ts`（Zustand store）
- [ ] **ed-fe-3**: `apps/web/src/features/editor/ChapterEditor.tsx`（CM6 整合 + autosave 鉤子 + lineWrapping + markdown extension）
- [ ] **ed-fe-4**: `apps/web/src/features/editor/SaveButton.tsx`（PUT chapter + 衝突對話框）
- [ ] **ed-fe-5**: `apps/web/src/features/editor/ChapterList.tsx`
- [ ] **ed-fe-6**: `apps/web/src/features/editor/TitleInput.tsx`（含 sanitize hint）
- [ ] **ed-fe-7**: `apps/web/src/features/editor/ConflictDialog.tsx`（A-E 五情境）
- [ ] **ed-fe-8**: 字數即時顯示
- [ ] **ed-fe-9**: 三狀態 UI indicator 元件
- [ ] **ed-fe-10**: Ctrl+S 快捷鍵
- [ ] **ed-be-1**: `apps/api/src/services/chapter-fs.ts`（讀寫 .md、title sanitize、rename）
- [ ] **ed-be-2**: `apps/api/src/services/chapter-mtime.ts`
- [ ] **ed-be-3**: `apps/api/src/routes/chapters.ts`（GET / PUT / POST / DELETE / list / rename）
- [ ] **ed-be-4**: 整合 commit-policy（save 後 commit）
- [ ] **ed-be-5**: 整合 status-updater placeholder（M1 為 noop）

### Story 032 首次警語
- [ ] **warn-fe-1**: `apps/web/src/features/onboarding/FirstLaunchWarningDialog.tsx`
- [ ] **warn-fe-2**: 啟動時偵測 meta.firstLaunchWarningAcknowledged + 顯示邏輯

### QA
- [ ] **qa-1**: cucumber-js step definitions for `001.feature`
- [ ] **qa-2**: step definitions for `003.feature`
- [ ] **qa-3**: step definitions for `008.feature`
- [ ] **qa-4**: step definitions for `009.feature`（providers + 連線測試部分）
- [ ] **qa-5**: step definitions for `010.feature`（commit timing + git status 部分；history UI 留 M3）
- [ ] **qa-6**: step definitions for `032.feature`
- [ ] **qa-7**: vitest 對 git wrapper、sanitize、project-fs、settings-store、chapter-fs 等 service 全部單元測試
- [ ] **qa-8**: Playwright E2E：建立專案 → 編章節 → 儲存 → 重開 → 繼續寫的閉環

## demo 驗收 walk-through

```
1. 第一次啟動應用
   → 視窗開啟 → 顯示首次警語對話框
   → 點「我已了解，不再顯示」
   → 進入首頁（空清單 +「新小說」按鈕 +「瀏覽資料夾」按鈕）

2. 設定 LLM provider
   → 點工具列「設定」進設定頁
   → 在 anthropic 區段勾「啟用」+ 填 API key
   → 點「測試連線」→ 綠色「連線成功」
   → 點「儲存」→ 返回首頁

3. 建立新小說
   → 首頁點「新小說」（或 Ctrl+N）
   → 選資料夾 D:/MyNovels
   → 填書名「春日記事」、大綱、一名角色「蘇晴」
   → 提交
   → 系統建立目錄結構（project.yaml / synopsis.md / style.md / characters/_index.md /
                       characters/蘇晴.md / 蘇晴_status.md / chapters/chapter_0001_未命名.md /
                       status/story_status.md / .gitignore）
   → git init + initial commit
   → 進入第一章編輯器（內容空白）

4. 編輯章節
   → 打字「她推開書店木門時，雨剛好停了。」
   → 等 1.5 秒 → 編輯器右上角顯示「編輯中（已 autosave 到 browser）」
   → 開另一個 terminal：cat chapters/chapter_0001_未命名.md → 仍為空
   → 按 Ctrl+S（或「儲存」按鈕）→ 提示「請輸入章節標題」
   → 改章節標題為「梅雨初晴」+ 再按儲存
   → 編輯器狀態變「已儲存到 .md」
   → terminal：cat chapters/chapter_0001_梅雨初晴.md → 看到內容
   → terminal：git log --oneline → 看到 commit「init: ...」+「chapter: save chapter 1 梅雨初晴」

5. Undo / Redo
   → 編輯器中打更多字
   → 按 Ctrl+Z 多次 → 內容回到上一個 CM6 checkpoint
   → 按 Ctrl+Y → 還原

6. 切換章節
   → 「新增章節」→ 章節列表多一條「第二章」
   → 點第二章 → 編輯器切換內容
   → 編第二章 → 切回第一章 → 看到第一章內容仍在
   → 第一章編一段 → 不儲存 → 切到第二章 → 切回第一章 → 看到剛編的內容（從 IndexedDB 載入）

7. 關閉重開
   → 關閉應用
   → 重新啟動 → 首次警語**不**再顯示（已 acknowledged）
   → 首頁「最近開啟」清單顯示「春日記事」
   → 點擊 → 進入該專案 → 載入上次最後編輯的章節

8. Drive 同步衝突
   → 關閉應用
   → 從 terminal 手改 chapters/chapter_0001_梅雨初晴.md
   → 重新開啟應用 → 進入該章
   → UI 顯示「外部變更已載入」banner（依 Spec 003 衝突 case C）

9. git 命令列驗證
   → cd 到專案目錄 → git log --oneline → 看到完整 commit 歷史
   → git status → clean
```

## DoD

- [ ] 全部任務 PR 已 merge
- [ ] 上述 9 步 demo walk-through 全部通過
- [ ] vitest 覆蓋率 critical path ≥ 70%
- [ ] BDD step definitions for 001/003/008/009*/010*/032 全 pass（009/010 標 \* 為部分範圍）
- [ ] Playwright E2E 閉環測試 pass

## 給下個 session 的開工 brief

你接手的是 **M1 寫作骨架** milestone。M0（基礎建設）已完成；現在要實作使用者能跑的第一個完整體驗——**建立小說、編一章、儲存、重開、繼續寫**。**不含**任何 AI 寫作功能；AI 留 M2。

### 動工順序建議

1. **types 先做**（types-1 ~ types-4），讓後續所有 service 與 UI 都有型別可用
2. **設定頁 + git 整合** 並行（兩者不互相依賴）
3. **Spec 001 建立專案** 依賴 git + settings
4. **Spec 008 開啟既有專案** 依賴 settings + 001 的 recentProjects 機制
5. **Spec 003 章節編輯器** 是 M1 最重的部分；建議 dev 分配最大塊時間
6. **Story 032 首次警語** 與 **Story 004 Undo/Redo** 是輕量任務，可填空檔做
7. **QA** 持續滾動（不要全堆到最後）

### 動工前必讀

- 本檔（M1 brief）
- [Spec 001](../specs/001-create-novel-project.md)、[003](../specs/003-edit-chapter-basic.md)、[008](../specs/008-open-existing-project.md)、[009](../specs/009-settings-page.md)、[010](../specs/010-git-version-control.md)
- [ADR-0005 編輯器](../adr/0005-editor-selection.md)（CM6 整合細節）
- [ADR-0008 前端架構](../adr/0008-frontend-architecture.md)（Zustand store 設計、Dexie schema）
- [Story 003 兩層儲存](../../requirements/stories/003-edit-chapter-basic.md)（autosave 流程的 UX 細節）

### 關鍵風險

- **Spec 003 衝突 matrix 複雜**：A/B/C/D/E 五情境每個都要實作；建議先做 A/B（最常見），C/D/E 後做
- **CM6 + React 整合的 SSR / IME 邊界**：先把基本打字 + autosave 跑通，再處理進階互動
- **git rename 與 IndexedDB key 對齊**：rename 章節後 IndexedDB key 中的 chapterNumber 不變，但 title 變了；保險起見 key 用 chapterNumber 不用 title
- **fs watcher 假陽性**：app 自己寫 .md 也會觸發；用 200ms 內 「app 寫過旗標」過濾（依 Spec 003）

### 不在範圍

- **AI 撰寫 / 採用 / status-updater**：M2 / M3 處理；M1 的 save 流程末端**只記 log**「skipped status-updater」，不實作 LLM 呼叫
- **設定頁的 per-Agent routing UI**：M2 加；M1 的設定 schema 仍要寫完整 routing 欄位（給 settings.yaml 結構穩定），只是前端 UI 不暴露
- **git 歷史面板 / diff / revert UI**：M3 加
- **角色卡 CRUD**：M2 處理；M1 的「新小說」表單建立的角色卡只有 name + description 兩欄（最小可用版本，M2 補完整 6 區塊）

### 跨平台注意

- **Windows / Mac / Linux 行為差異**主要在：path 分隔字、檔案大小寫敏感性、git 路徑探測、Tauri fs dialog 風格
- 開發以 Win 為主驗證；CI 三平台跑 typecheck + test；M4 才做完整跨平台 release

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| 兩層儲存實作 bug 導致使用者打字遺失 | 廣覆蓋 E2E 測試（F5 / crash / 切章 / 多 tab）；Sentry-style local crash report 可選 P1 |
| CM6 在 Tauri WebView 的 IME 行為與瀏覽器不一致 | 早期 Win Mac 三平台測試中文輸入；發現問題早報 |
| Dexie schema migration 在未來 milestone 改動造成資料遺失 | M1 從一開始就用 Dexie version() + upgrade()；雖然 v1 暫無 migration 需求，但骨架到位 |
| fs watcher 在大型 Drive 同步資料夾 noise 太多 | 限縮 watch 範圍（只 watch 開啟的專案目錄）；debounce events |

## 完成紀錄

> dev 在 milestone 完成時填這裡

- 實際開工時間：
- 實際完成時間：
- 實際 PR 數：
- 偏離 plan 的範圍：
- 踩雷 / 教訓：
- 移交給 M2 的注意事項：
