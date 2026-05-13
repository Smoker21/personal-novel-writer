# M4 — 打磨與發布 v0.1.0

> Status: **未開工**
> 預估規模：15-25 PR
> 對應 spec：無新 spec；補完既有 spec 中標 P1 的小項 + 跨平台 release pipeline
> 前置依賴：[M3 記憶閉環](./M3-memory-loop.md) DoD 全通過

## 目標

把 M3 的「功能完整但需手把手」的版本，**打磨**為「**第一次用的使用者也能順利跑完**」的可發布版本。產出 GitHub Releases 上的 v0.1.0，含 Windows、macOS、Linux 三平台 binary。

不再加新功能；專注：

1. **整體 UX 拋光**：視覺、字型、間距、動畫、無障礙
2. **衝突處理 UX**：Drive 同步衝突、多 tab、git conflict marker 的完整處理流程
3. **使用者引導**：未裝 git / 未設定 LLM / 第一次使用的 onboarding
4. **跨平台打包**：GitHub Actions + tauri-action 三平台 build
5. **文件**：使用者手冊（README 加 screenshots）、安裝指引
6. **品質保證**：BDD 全綠、E2E 端對端通過、跨平台煙霧測試

## 範圍

### A. UX 拋光

- **視覺一致性**：建立完整 design token（color、typography、spacing），dark mode（**可選**，若時間允許）
- **字型**：繁中襯線（Noto Serif TC）+ 無襯線（Inter / Noto Sans TC）載入優化
- **動畫**：對話框 fade-in / 草稿面板 slide-in / 採用流程進度條（Motion lib 或 CSS）
- **無障礙**：tab 順序、focus indicator、ARIA labels、鍵盤完整可達性
- **空狀態 UI**：首頁無專案、編輯器無內容、角色清單為空時的友善提示
- **載入狀態**：所有非同步動作的 spinner / skeleton

### B. 衝突處理 UX 完善

- **Drive 同步衝突**：
  - 開啟專案時 git status 偵測「未 commit 變更」→ 對話框「Drive 同步帶來變更，是否一鍵 commit？」
  - 章節儲存遇 mtime 衝突 → 三方 diff UI（與 .md 比、與 IndexedDB 比、當前編輯區）
- **真實 git conflict**（含 `<<<<<<<` marker）：
  - 偵測到時 UI 紅色 banner「偵測到 git 衝突」
  - 列出衝突檔案
  - 指引使用者用命令列 / 第三方 git 工具解決（MVP 不內建衝突解決 UI）
- **多 tab 偵測**：M1 已實作 BroadcastChannel；M4 加「強制接管」流程

### C. 使用者引導

- **未裝 git** 完整對話框（M1 已實作骨架；M4 補三平台安裝連結 + 「我已安裝，重啟」按鈕）
- **未設定 LLM**：第一次按「AI 撰寫本章」/「AI 生成角色描述」時顯示對話框引導到設定頁（M2/M3 已有；M4 拋光文字 + 視覺）
- **第一次建立專案**：成功進入編輯器後顯示 onboarding tour（覆蓋三個提示：autosave / 「儲存」按鈕 / 「AI 撰寫本章」按鈕）
- **空專案歡迎畫面**：首頁無「最近開啟」時顯示「新小說」大按鈕 + 文案

### D. 跨平台打包與 CI

- **`tauri-action` GitHub Actions workflow**：on tag push → build Windows + macOS + Linux binary → release
- **Hono sidecar 跨平台二進位**：用 `pkg` 對 Win / Mac (arm64+x64) / Linux x64 各打一份 binary，內嵌進 Tauri `src-tauri/binaries/`
- **better-sqlite3 native module** 跨平台 prebuilt 驗證
- **應用簽署**：
  - Windows：MSI / NSIS（自簽即可，公開 cert 留 v0.2）
  - macOS：codesign + notarize（**若使用者有 Apple Developer 帳號**；否則使用者第一次跑會看到警告）
  - Linux：AppImage（無簽署需求）
- **icon**：app icon 三平台格式（.ico / .icns / .png）

### E. 使用者手冊

- **README.md 補完**：含安裝指引、第一次使用 walkthrough、screenshots
- **`docs/user-guide/` 目錄**（新增）：
  - `installation.md`：三平台安裝步驟（含 git 安裝指引）
  - `first-novel.md`：建立第一本小說的完整步驟
  - `ai-setup.md`：設定雲端 / 地端 LLM
  - `git-version-control.md`：怎麼用「歷史」功能 + 命令列 git 互動
  - `troubleshooting.md`：常見問題

### F. 品質保證

- **BDD step definitions 全綠**：001-010 + 032 的 .feature 全部跑通
- **Playwright E2E**：MVP 完整閉環走一輪自動化測試
- **跨平台煙霧測試**：在 GitHub Actions runners（Win / Mac / Linux）跑 install + 啟動 + 健康檢查
- **效能基準**：應用冷啟動 < 3s、章節儲存 p95 < 500ms（含 git commit）、AI 撰寫 TTFT < 5s（cloud）
- **vitest 覆蓋率**：critical path（git wrapper / atomic-fs / context-collector / status-updater-service / adopt service）≥ 80%

### G. v0.1.0 release

- 在 GitHub repo 標 tag `v0.1.0`
- `tauri-action` 自動 build + 上傳到 Release
- 發布 release notes（依使用者手冊濃縮）
- 留下 `CHANGELOG.md` 起頭

## 任務拆解

### A. UX 拋光（並行可動）
- [ ] **pol-1**: design token css（colors、fonts、spacing）；建立 `apps/web/src/styles/tokens.css`
- [ ] **pol-2**: 字型 self-host（Noto Serif TC / Inter）
- [ ] **pol-3**: 所有對話框 + 抽屜的進入動畫
- [ ] **pol-4**: focus indicator + tab 順序審查
- [ ] **pol-5**: 空狀態 UI 元件（首頁、編輯器、角色清單、status 編輯）
- [ ] **pol-6**: 載入狀態 spinner / skeleton 對所有非同步動作覆蓋
- [ ] **pol-7**: 鍵盤捷徑彙整（Cheatsheet 對話框，按 ? 開啟）

### B. 衝突處理 UX
- [ ] **conf-1**: Drive 同步開啟時 git status 偵測 + 一鍵 commit 對話框
- [ ] **conf-2**: 章節儲存 mtime 衝突的三方 diff UI（用 `diff-match-patch` 或 `react-diff-viewer`）
- [ ] **conf-3**: git conflict marker 偵測 + 紅色 banner + 指引
- [ ] **conf-4**: 多 tab BroadcastChannel「強制接管」流程

### C. 使用者引導
- [ ] **on-1**: 未裝 git 完整對話框（三平台連結 + 重啟按鈕）
- [ ] **on-2**: 第一次建立專案的 onboarding tour（覆蓋三個提示，用 `react-joyride` 或自寫）
- [ ] **on-3**: 空專案歡迎畫面
- [ ] **on-4**: 未設定 LLM 引導對話框文字 / 視覺拋光

### D. 跨平台打包與 CI
- [ ] **ci-1**: `.github/workflows/release.yml`（on tag → tauri-action → 三平台 build → release）
- [ ] **ci-2**: Hono sidecar 跨平台 binary 打包（pkg + 三平台 target）
- [ ] **ci-3**: better-sqlite3 prebuilt binary 整合到 sidecar 打包流程
- [ ] **ci-4**: app icon（產生 .ico / .icns / .png 三套）
- [ ] **ci-5**: Windows 自簽 cert 設定（**或**暫不簽署，使用者第一次跑會看到 SmartScreen）
- [ ] **ci-6**: macOS codesign + notarize 設定（**若**有 Apple Developer 帳號）
- [ ] **ci-7**: Linux AppImage 打包設定

### E. 使用者手冊
- [ ] **doc-1**: 重寫 root `README.md`（含 quick start + screenshots）
- [ ] **doc-2**: `docs/user-guide/installation.md`
- [ ] **doc-3**: `docs/user-guide/first-novel.md`
- [ ] **doc-4**: `docs/user-guide/ai-setup.md`
- [ ] **doc-5**: `docs/user-guide/git-version-control.md`
- [ ] **doc-6**: `docs/user-guide/troubleshooting.md`
- [ ] **doc-7**: 截圖（用實際應用截）

### F. 品質保證
- [ ] **qa-1**: 補全 M0-M3 漏掉的 BDD step definitions
- [ ] **qa-2**: Playwright E2E：MVP 完整閉環自動化
- [ ] **qa-3**: 跨平台煙霧測試 CI job（三平台 runner 跑 install + 啟動）
- [ ] **qa-4**: 效能基準測試（最起碼手動驗）
- [ ] **qa-5**: vitest 覆蓋率審查 + 補 critical path 測試到 80%
- [ ] **qa-6**: 三平台手動測試報告（每平台跑一輪 demo walk-through，記錄踩雷）

### G. Release
- [ ] **rel-1**: `CHANGELOG.md` 開頭 + v0.1.0 entry
- [ ] **rel-2**: 標 tag `v0.1.0` → 觸發 release workflow
- [ ] **rel-3**: GitHub Release 上手動編輯 release notes + 上傳 screenshots
- [ ] **rel-4**: 發布後 24 小時內監看 issue（若有早期測試者）

## demo 驗收 walk-through

```
完成定義 = 一個從未用過此應用的人，照 README 與 user-guide 跑下列流程能順利完成：

1. 從 GitHub Release 下載對應平台 binary，安裝執行
2. 首次啟動：看到首次警語 → 「我已了解，不再顯示」
3. 偵測 git 是否安裝：未裝時看到引導，照指引裝完 → 重啟應用
4. 主頁：點「設定」進設定頁 → 填 Anthropic API key → 「測試連線」綠 → 套用「全雲端 Haiku」preset → 儲存
5. 返回主頁 → 「新小說」→ 三步表單填好 → 進入第一章編輯器
6. 在編輯器：手寫一兩段 → autosave indicator 黃色 → 按 Ctrl+S → 變綠
7. 點工具列「AI 撰寫本章」→ 草稿側欄串流 → 完成 → 點「採用」→ 確認 → 主檔覆寫 + 右下角狀態更新 spinner → 完成
8. 切到「角色」面板 → 點蘇晴 → 補欄位 → 「AI 生成角色描述」→ 微調 → 儲存
9. 寫第 2 章 → 「AI 撰寫」→ 看到草稿中提到第 1 章發生的事（記憶閉環驗證）
10. 點章節「歷史」按鈕 → 看 commit 列表 → 點某個 → 預覽 + diff + 還原
11. 關閉應用 → 重開 → 從「最近開啟」清單繼續

跨平台驗證：上述流程在 Windows、macOS、Linux 三個平台都能跑（每個平台至少手動驗一輪）。
```

## DoD

- [ ] 全部任務 PR 已 merge
- [ ] GitHub Release v0.1.0 已發布，含三平台 binary
- [ ] 上述 11 步 demo walk-through 在三平台都通過
- [ ] BDD step definitions 全部 pass
- [ ] Playwright E2E 通過
- [ ] vitest 覆蓋率 ≥ 80%（critical path）
- [ ] CHANGELOG.md v0.1.0 entry 已寫
- [ ] 使用者手冊完整且含 screenshots

## 給下個 session 的開工 brief

你接手的是 **M4 打磨與發布** milestone。M0-M3 已完成；應用功能完整但 UX 還粗糙、未跨平台 build、文件還少。這個 milestone 把它**變成一個能交給陌生人下載安裝跑通的版本**。

### 動工順序建議

可拆 3 條 dev session 並行：

| Session 線 | 範圍 | 預估比例 |
|---|---|---|
| A | UX 拋光 + 衝突處理 UX + 使用者引導（A/B/C） | 40% |
| B | 跨平台打包與 CI（D） | 30% |
| C | 使用者手冊（E）+ QA 補漏（F） | 30% |

A 與 B 完全獨立。C 依賴 A 接近完成才能截圖。

### 動工前必讀

- 本檔
- M0-M3 各 milestone 的「完成紀錄」段（看實際踩雷與遺留 issue）
- [Spec 010 Git 衝突處理段](../specs/010-git-version-control.md#衝突偵測)
- 各 Story 的「UX 注意事項」段
- 既有 README.md 與 docs/architecture/overview.md

### 關鍵風險

- **macOS notarize**：若沒 Apple Developer 帳號，使用者第一次跑會看到 Gatekeeper 警告；可接受但要在 user-guide/installation.md 寫清楚「如何允許執行未公證應用」
- **Windows SmartScreen**：自簽 cert 仍會觸發；同上，寫進文件
- **Linux AppImage 路徑問題**：fs watcher / git path 偵測在 AppImage 沙箱中可能異常；早期煙霧測試確認
- **跨平台中文檔名**：Windows NTFS / Mac APFS / Linux ext4 對 unicode 行為不同（特別 Mac 用 NFD normalize）；建立專案時用 NFC normalize（spec 001 已規範），但 M4 跨平台測試要驗
- **sidecar binary 大小**：pkg-packaged Node + better-sqlite3 + LLM SDKs 可能讓 sidecar binary 達 100+ MB；可接受但要記錄
- **截圖時的 placeholder 內容**：避免用 idea.md 中提到的成人題材作為宣傳截圖；用「春日記事」這類中性範例

### 不在範圍

- v0.2 功能（章節大綱 AI、續寫、潤飾 Skill、角色卡 vision、模型選擇器 UI）
- 雲端 git remote 推送（GitHub）
- 多人協作
- 完整無障礙符合 WCAG（M4 只做基礎；完整審計 P1）
- 應用 auto-update（Tauri updater 整合 P1）

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| tauri-action 跨平台 build 在某平台炸 | 早期 dry-run（push tag `v0.1.0-rc1` 試 build）；保留 rc 版本流程 |
| Hono sidecar pkg 打包在 Mac arm64 上有 binding 問題 | 改用 prebuilt better-sqlite3；備援是 Mac arm64 跑 x64 透過 Rosetta |
| 使用者手冊截圖數量大 → 維護成本高 | 截圖只放關鍵流程；用 alt text 描述細節 |
| 第一波使用者 issue 多 | release 後 24-72 小時集中監看；準備好 hotfix v0.1.1 流程 |

## 發布後立即做

- 看 GitHub Issues / Discussions
- 修明顯 P0 bug 出 v0.1.1
- 收集使用者回饋 → 寫 v0.2 backlog

## 完成紀錄

> dev 在 milestone 完成時填這裡

- 實際開工時間：
- 實際完成時間：
- 實際 PR 數：
- 偏離 plan 的範圍：
- 踩雷 / 教訓：
- v0.1.0 release 連結：
- 第一波使用者回饋摘要：
