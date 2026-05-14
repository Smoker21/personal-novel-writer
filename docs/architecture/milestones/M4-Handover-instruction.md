# M4 — 打磨與發布 v0.1.0 開工指令

> 適用 milestone: [M4 Polish & Release](./M4-polish-and-release.md)
> 建立日期: 2026-05-14
> 用途: 直接貼給接手 M4 的 Claude Code dev session 作為第一條訊息
> 前置: M3 已 merged 進 main（PR #10~19，HEAD 89cf664）；typecheck 綠；401 tests pass

---

> **使用方式**：把下方水平線之間的整段 markdown 複製，貼進新 session 的第一條訊息。下個 session 不必讀本專案的對話歷史；所有資訊在此 brief + 引用的文件裡。

---

# Novel Writer — M4 打磨與發布 v0.1.0 動工

你接手 Novel Writer 專案的 **M4 打磨與發布 v0.1.0** milestone。M0（基礎建設）、M1（寫作骨架）、M2（角色卡 + AI 撰寫 + Vision）、M3（記憶閉環 + git 歷史）已合進 main，MVP 功能完整。M4 的工作是把「功能完整但需手把手」的版本，**打磨**為「**第一次用的使用者也能順利跑完**」的可發布版本，產出 GitHub Releases 上的 **v0.1.0**，含 Windows / macOS / Linux 三平台 binary。

**不加新功能**；專注：UX 拋光 / 衝突處理 UX / 使用者引導 / 跨平台打包 / 使用者手冊 / 品質保證 / release。

## 第一件事：讀使用者的人工 review 結果（**動工前必讀**）

M4 動工前，使用者已（或應）跑過兩份人工驗證表單，產出具體改善意見：

| 檔案 | 內容 |
|---|---|
| [`docs/qa/m4-ux-review.md`](../../qa/m4-ux-review.md) | 21 個 UI 表面（5 Pages + 6 MainPanels + 7 Dialogs + 3 Flows）人工 review 結果，含 ✅/⚠️/❌ + 改善意見 + 對應 M4 任務 ID |
| [`docs/qa/m4-bdd-review.md`](../../qa/m4-bdd-review.md) | 108 個 BDD scenarios（12 stories）的手工驗證結果，含 spec / 實作不一致時的修改方向 |

**Dev session 起手前先讀完這兩份**：所有 pol-* / conf-* / on-* / qa-* 任務的具體內容由這兩份報告驅動。若報告尚未填，先請使用者填完再動工（不要自己猜改善方向）。

## 第二件事：對使用者問清楚這幾件決策（**動工前必問**）

M4 有幾個無法由 dev 自己決定的事，先問使用者：

| 決策 | 影響 | 預設 |
|---|---|---|
| 有無 **Apple Developer 帳號**（USD$99/年） | macOS codesign + notarize（ci-6）；無則 Mac 使用者首次跑會看到 Gatekeeper 警告，需手動允許 | 假設「無」→ 寫進 user-guide/installation.md 「如何允許未公證應用」 |
| 有無 **Windows code-signing cert** | Windows SmartScreen 警告等級；自簽 cert 不能消警告，要 EV cert（USD$300+/年） | 假設「無」→ 接受 SmartScreen 警告，寫進文件 |
| 是否要做 **dark mode** | M4 brief 標「可選」 | 假設「不做」（v0.2）；只確認 light mode 一致性 |
| **應用 icon** | M4 ci-4 需要實際設計 | 問使用者：要 AI 生圖（DALL·E / Midjourney）/ 委外 / 暫用佔位純色 ico |
| 是否設 **Tauri auto-updater** | M4 brief 標「P1」 | 假設「不做」（v0.2）；release 時走 GitHub Release 手動下載 |

問完使用者後把答案記到 [project-decisions memory](memory/) 或 README 開頭，dev 之後不用再問。

## 讀齊脈絡（≈ 30 分鐘）

按這順序讀，**不要跳過**：

```
1. memory/MEMORY.md                                ← 索引
2. memory/mvp_status.md                            ← 現在位置：M0~M3 完成、M4 待開工
3. memory/tech_stack.md                            ← 9 個 ADR 結論一覽
4. memory/preference_concise_execution.md          ← 互動風格
5. memory/preference_simplification.md             ← 設計取捨偏好
6. memory/preference_traditional_chinese_terse.md  ← 寫作風格
7. memory/reference_key_paths.md                   ← 目錄地圖
8. memory/tauri_env_notes.md                       ← Tauri 環境踩雷紀錄

9.  F:/workspace/novel_writer/docs/architecture/milestones/M4-polish-and-release.md  ← 你的完整任務清單（30+ 任務）

10. F:/workspace/novel_writer/docs/architecture/milestones/M3-memory-loop.md          ← 「完成紀錄」段看 M3 踩雷
11. F:/workspace/novel_writer/docs/architecture/specs/010-git-version-control.md      ← 衝突偵測 / git 引導
12. F:/workspace/novel_writer/docs/architecture/adr/0006-tauri-packaging.md           ← tauri 打包約定
13. F:/workspace/novel_writer/docs/architecture/adr/0007-git-integration.md           ← git shell out

14. F:/workspace/novel_writer/README.md                                               ← 現況 README（M4 要重寫）
15. F:/workspace/novel_writer/docs/architecture/overview.md                           ← 架構總覽
```

讀完 9（M4 brief）就是你的「任務清單」。10-15 為實作 / 文件背景。

## 你的範圍

完整任務清單見 `M4-polish-and-release.md` 「任務拆解」段，共 **30+ 任務**分布在七個分區（A~G）：

| 分區 | 任務 | Session 線 |
|---|---|---|
| A. UX 拋光 | pol-1~7 | A |
| B. 衝突處理 UX | conf-1~4 | A |
| C. 使用者引導 | on-1~4 | A |
| D. 跨平台打包與 CI | ci-1~7 | B |
| E. 使用者手冊 | doc-1~7 | C（依賴 A 完成可截圖） |
| F. 品質保證 | qa-1~6 | C |
| G. Release | rel-1~4 | 最後串接 |

### 三條並行 session 線

| 線 | 範圍 | 比例 |
|---|---|---|
| **A** | UX 拋光 + 衝突處理 UX + 使用者引導（pol-* / conf-* / on-*）+ **M3 遺留尾巴** | 40% |
| **B** | 跨平台打包與 CI（ci-*） | 30% |
| **C** | 使用者手冊（doc-*）+ QA 補漏（qa-*） | 30% |

**A 與 B 完全獨立**可並行。**C 依賴 A 接近完成才能截圖**。

### M4 重要設計約束

1. **不加新功能**：M4 brief「不在範圍」清單嚴格執行；遇到誘惑（例：發現某 UX 不夠好想加新交互）寫進 v0.2 backlog，不擠進 M4
2. **跨平台一致性**：所有 UI 在 Windows / Mac / Linux 都要看起來合理；中文字型載入優先（self-host Noto Serif TC / Inter）
3. **第一次使用者視角**：UX / 文件 / onboarding 全以「從未跑過此應用的人」為標準驗收
4. **跨平台煙霧測試**：每個 PR merge 前 CI 三平台 build pass；不接受「在我機器跑得起來」
5. **截圖內容**：避免用 idea.md 中的成人題材作為宣傳；用「春日記事 / 蘇晴 / 林書言」這類中性範例

## M3 遺留尾巴（合進 M4 A 線，brief 未明列）

| 項目 | 來源 | 處理 |
|---|---|---|
| BDD step definitions 待補（qa-1/2/3：006/007/010 feature files） | M3 brief 已列但未做 | M4 brief `qa-1`「補全 M0-M3 漏掉的 BDD step definitions」涵蓋；明確列入優先 |
| **Ctrl+Z → unadopt CM6 整合**（目前只有後端 API） | M3 ad-fe-6 未做 | **新增任務 `pol-8`**：CM6 transaction integration + Ctrl+Z hook → POST /unadopt |
| **status 編輯畫面獨立路由**（目前只有 UpdateStatusButton） | M3 stat-fe-5 未做 | **新增任務 `pol-9`**：複用章節編輯器，加入 status 路由 `/editor/:hash/status/...` + AI 精簡按鈕整合 |
| **git status 面板 + 手動 commit 對話框**（次要功能） | M3 git-fe-5 標「次要」未做 | **新增任務 `pol-10`**：藏進階選單，補完 |
| **M3 DoD 10 步 demo walk-through 手動驗證未跑** | M3 完成紀錄列 | M4 `qa-6` 跨平台手動測試報告涵蓋；明確列入要跑 M3 demo + M4 demo 兩次 |

## 動工協議

1. **branch 命名**：`feat/m4a-polish` / `feat/m4b-release-pipeline` / `feat/m4c-docs-qa`；或細到 `feat/m4-pol-*` / `feat/m4-ci-*`
2. **base 為 main**（已綠；M3 HEAD 89cf664）；不要 stacked PR
3. **PR 小而頻**：一條任務一個 PR；對應 brief 的 task ID
4. **commit message**：`<type>: <scope> <短描述>`（type: feat / fix / refactor / docs / test / chore / build）
5. **CI 必綠才 merge**
6. **release rc 流程**：D 分區（CI）跑通後，先 push `v0.1.0-rc1` tag 試 build，三平台 binary 都過再正式 `v0.1.0`

## CI fail 預防（沿用 M2/M3 教訓）

- `apps/web` 的 `moduleResolution: "Bundler"` **禁止** relative import 寫 `.js` 副檔名 → 寫 `from "./X"`（無副檔名）
- `apps/api` / `packages/*` 用 `moduleResolution: "NodeNext"`，**必須** 寫 `.js`
- **動工前先在本地跑** `pnpm typecheck && pnpm test && pnpm lint` 三項都綠才 push
- Windows fs case-insensitive：git 中的 case 要正確；用 `git ls-files` 驗

## CI fail 預防（M4 新增：跨平台）

- **better-sqlite3 native module**：先在 CI 三平台跑 `pnpm install` + `pnpm test` 確認 prebuilt 都拿到
- **sharp lib**：同上（M2 已用，跨平台 prebuilt 需驗）
- **Hono sidecar pkg 打包**：在 Mac arm64 上特別注意 binding；備援是 Rosetta x64
- **檔名 unicode normalize**：Mac APFS 用 NFD，其他平台 NFC；Spec 001 已規範但 M4 跨平台測試要驗

## M4 完成定義（DoD）

依 M4 brief「demo 驗收 walk-through」**11 步**全通過，且在**三平台**都能跑：

1. 從 GitHub Release 下載對應平台 binary，安裝執行
2. 首次啟動看到首次警語 → 「我已了解，不再顯示」
3. 偵測 git 是否安裝；未裝照引導裝完 → 重啟
4. 設定頁填 API key → 「測試連線」綠 → 套用 preset → 儲存
5. 「新小說」三步表單 → 進入第一章編輯器
6. 手寫 → autosave → Ctrl+S
7. 「AI 撰寫本章」→ 草稿 → 「採用」→ 確認 → status 更新
8. 「角色」面板 → 補欄位 → 「AI 生成角色描述」→ 儲存
9. 寫第 2 章 → 「AI 撰寫」→ 看到草稿含第 1 章記憶
10. 「歷史」按鈕 → 預覽 + diff + 還原
11. 關閉重開 → 從「最近開啟」繼續

加上：

- [ ] 全部 30+ 任務 PR 已 merge
- [ ] GitHub Release v0.1.0 已發布，含三平台 binary
- [ ] BDD step definitions 全 pass（含 M3 遺留 qa-1/2/3）
- [ ] Playwright E2E pass
- [ ] vitest 覆蓋率 ≥ 80%（critical path：git wrapper / atomic-fs / context-collector / status-updater-service / adopt service）
- [ ] CHANGELOG.md v0.1.0 entry 已寫
- [ ] 使用者手冊完整且含 screenshots

## 動工順序建議

```
Day 1: 對使用者問清決策（Apple Dev / Windows cert / dark mode / icon / updater）
Day 1: branch 同步 + memory 確認

Phase 1 (parallel, 60% 時間):
  A 線：pol-1~10（含 M3 遺留 pol-8/9/10）+ conf-1~4 + on-1~4
  B 線：ci-1~7（早期 v0.1.0-rc1 tag 試 build）

Phase 2 (parallel, 30% 時間, 依賴 A 線部分完成):
  C 線：doc-1~7（截圖依賴 A 完成）+ qa-1~6

Phase 3 (10% 時間，串接):
  rel-1~4：tag v0.1.0 → release workflow → 上 release notes
  發布後 24-72 小時集中監看 issue
```

A 與 B 完全獨立，可由不同 session 並行。C 線截圖任務（doc-7）必須在 A 接近完成才動。

## 關鍵風險

詳見 M4 brief 「關鍵風險」段，重點：

- **macOS notarize**：若無 Apple Developer 帳號，使用者第一次跑 Gatekeeper 警告；接受但 user-guide 寫清「如何允許未公證應用」
- **Windows SmartScreen**：自簽 cert 仍會觸發；同上，寫進文件
- **Linux AppImage 路徑**：fs watcher / git path 偵測在 AppImage 沙箱可能異常；ci-7 早期煙霧測試確認
- **跨平台中文檔名**：Mac NFD vs 其他 NFC；建立專案 NFC normalize（Spec 001 已規範），M4 跨平台測試要驗
- **sidecar binary 大小**：pkg-packaged Node + better-sqlite3 + LLM SDKs 可能 100+ MB；可接受但記錄到 release notes
- **截圖 placeholder 內容**：避免用 idea.md 成人題材；用「春日記事」中性範例
- **tauri-action 跨平台 build 在某平台炸**：早期 dry-run（push `v0.1.0-rc1` 試 build），保留 rc 版本流程
- **第一波使用者 issue 多**：release 後 24-72 小時集中監看；準備好 hotfix v0.1.1 流程

## 不在範圍（v0.2+）

- 章節大綱 AI 生成（Story 017）
- AI 章節續寫（Story 018）
- 局部潤飾 Skill（Story 021-022）
- AI 章節標題（Story 019）
- 跨章節向量檢索（Story 020）
- 模型選擇器 UI（Story 026）
- per-Agent override（Story 027）
- 角色關係圖（Story 013）
- 場景模組（Story 029-031）
- 故事發想模組（Story 034）
- 匯出（Story 035；Markdown / EPUB / PDF）
- 雲端 git remote 推送
- 多人協作
- 完整無障礙符合 WCAG（M4 只做基礎；完整審計 P1）
- 應用 auto-update（Tauri updater 整合 P1）
- AI 生圖（Story 002c；v0.3+）

## 起手第一步

```bash
cd F:/workspace/novel_writer
git checkout main && git pull          # 確認同步到 M3 HEAD 89cf664
git status                              # 確認 working tree clean

# 用 AskUserQuestion 問清五個決策（Apple Dev / Windows cert / dark mode / icon / updater）
# 把答案記到 README 開頭或專案決策 memory

# 用 TaskCreate 把 M4 brief 30+ 任務 + 三條 session 線 mirror 進 todo list
# A 線 + B 線並行；C 線等 A 接近完成

# 開始：先做 ci-1（release.yml 早期建好）+ pol-1（design token）+ doc-1（README 重寫起頭）
```

## 跟使用者的回報節奏

- **完成決策問答**（Day 1 開頭）報告一次
- **完成一條 session 線**（A/B/C 任一）或**完成一個分區**（pol / conf / on / ci / doc / qa）時報告一次
- **發出 v0.1.0-rc1**（第一次跨平台試 build）報告一次
- **正式 v0.1.0 release**前報告一次（review CHANGELOG + release notes 草稿）
- **發布後 24h、72h** 各報告一次（issue 監看摘要）
- **遇到必須使用者決定的事**才打斷（例：cert 申請、release notes 用詞、發現重大 bug 要不要延後 release）

## 發布後 v0.1.1 hotfix 流程（**重要**）

`tauri-action` workflow 已能 by-tag 觸發。發布 v0.1.0 後遇到 P0 bug：

1. 從 `v0.1.0` tag 切 `hotfix/v0.1.1-<slug>` branch
2. 修 + 開 PR → merge 到 main
3. 確認 main CI 綠 → 標 `v0.1.1` tag
4. tauri-action 自動 build + 發 v0.1.1 release
5. 在 v0.1.0 release notes 加註「**已被 v0.1.1 取代**」橫幅

開工。

---

## 本檔變更紀錄

- `2026-05-14`: 初版；對應 M4 milestone（含五個動工前決策 + M3 遺留尾巴 + v0.1.1 hotfix 流程）
