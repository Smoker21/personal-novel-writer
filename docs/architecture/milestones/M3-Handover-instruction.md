# M3 — 記憶閉環 + git 歷史 開工指令

> 適用 milestone: [M3 Memory Loop](./M3-memory-loop.md)
> 建立日期: 2026-05-13
> 用途: 直接貼給接手 M3 的 Claude Code dev session 作為第一條訊息
> 前置: M2 已 merged 進 main（PR #9，HEAD 5cfbd72）；typecheck 綠；387 tests pass

---

> **使用方式**：把下方水平線之間的整段 markdown 複製，貼進新 session 的第一條訊息。下個 session 不必讀本專案的對話歷史；所有資訊在此 brief + 引用的文件裡。

---

# Novel Writer — M3 記憶閉環 + git 歷史 動工

你接手 Novel Writer 專案的 **M3 記憶閉環 + git 歷史** milestone。M0（基礎建設）、M1（寫作骨架）、M2（角色卡 + AI 撰寫 + Vision）已合進 main；現在要把 **MVP 完整閉環**最後一塊拼上——採用 AI 草稿、status 自動更新、git 歷史完整 UI。完成後使用者跑「寫完第 1 章 → 採用 → status 更新 → 寫第 2 章看到 AI 記得第 1 章」這個 demo 應該水到渠成。

## 第一件事：Pre-flight 對齊（**必做**，~3-5 PR）

M2 完成後發現兩個 spec 沒同步到 2026-05-12 的對齊修訂，動工前**先處理**這幾件，再開始實作：

### P0. Branch / memory 同步

| 項目 | 動作 |
|---|---|
| Local branch | 若還在 `feat/m2-llm-adapter-vision`，切回 main、`git pull`、刪 local branch |
| Working tree | `.claude/settings.json` 若有 `enabledPlugins` 區段未提交，問使用者要 commit 還是 discard |
| memory/mvp_status.md | 確認狀態為「M2 完成（PR #9 merged）」；若還寫「等 PR」就更新 |

### P1. Spec 006 對齊（**真 blocker**，spec-architect agent 做）

**問題**：Spec 006 仍在「採用前自動快照到 `chapters/_versions/`」範式（line 16/43/85/126-132/140/235/253/262/268/275/277/291/315/317/323/335 共 17 處），但 M3 brief 明示「採用前不再自動快照（已被 git commit 取代，依 2026-05-12 修訂）」。

**動作**：
- 拿掉所有 `_versions/` 自動快照邏輯（採用前由 commit-policy 確保「採用前最後狀態」已有 commit 兜底）
- API response 拿掉 `snapshotPath` 欄位
- 11 步事務流程改寫為 M3 brief 列的範本（驗 draft → 比對 contextHash → 寫主檔 atomic → 寫 prompt.md → 標記 draft adopted → 觸發 status-updater → 記 UndoEntry → 回應）
- 標記 `Last updated: 2026-05-13`，附對齊紀錄
- Story 014/015（手動 / 回退章節版本快照）改標「**已淘汰**——被 git 歷史面板涵蓋」並從 stories README 清單拿掉 P0（保留檔案以保歷史紀錄）

### P2. Spec 007 對齊（**真 blocker**，spec-architect agent 做）

**問題**：Spec 007 整檔仍在「JobQueue + 背景 worker + jobs SQLite table + character_status.md 單檔」範式（line 13/26-46/54/72/108/118/168-171/198-221/225/258-275/284/304/307/333/337/342/346 共 20+ 處），但 M3 brief 明示新範式：

- **無 JobQueue / 無 worker**（stateless 直接呼叫，依 2026-05-12 對齊）
- **三個觸發點**：Spec 003 save 尾端、Spec 006 adopt 尾端、前端「立刻更新狀態」按鈕（reason 為 `auto-after-save` / `auto-after-adopt` / `manual`）
- **一人一檔**：`characters/<slug>_status.md`（不是單一 `character_status.md`）
- **無 Token 上限**：超量由「AI 精簡」按鈕解（status-shortener Skill）
- **AsyncIterable → SSE bridge**：取代 jobs table

**動作**：
- 改寫摘要、API 合約（POST /status/update-from-chapter + POST /status/shorten + GET /jobs/:id/events SSE bridge）
- 拿掉 JobQueue / jobs table / `currentCharacterStatus: string` 等舊概念
- 改寫資料模型為一人一檔（已對齊 M2 ChapterContext.characterStatuses: Record<slug, string>）
- 涉及角色篩選邏輯（outline 列 / 否則全部 / substring matching）
- 失敗處理：重試 3 次（指數退避 1s / 2s / 4s）→ SSE 失敗 → UI 持久顯示 banner + 重試按鈕
- 標記 `Last updated: 2026-05-13`，附對齊紀錄

### P3. Status-updater Skill 規格對齊性檢查（ai-agent-designer agent 做）

P2 完成後，過一遍 `docs/skills/status-updater.md`，確認對齊版 Spec 007 後不矛盾（特別是「StatusUpdateContext」「兩種模式 normal / shorten」「不修改角色名」等規則）。

### P4. 建本檔的兄弟（無需做，已是這個檔）

`docs/architecture/milestones/M3-Handover-instruction.md`（本檔）已建立。

## 讀齊脈絡（≈ 30-40 分鐘）

按這順序讀，**不要跳過**：

```
1. memory/MEMORY.md                                ← 索引
2. memory/mvp_status.md                            ← 現在位置：M0+M1+M2 完成、M3 待開工
3. memory/tech_stack.md                            ← 9 個 ADR 結論一覽
4. memory/preference_concise_execution.md          ← 互動風格
5. memory/preference_simplification.md             ← 設計取捨偏好
6. memory/preference_traditional_chinese_terse.md  ← 寫作風格
7. memory/style_md_boundary.md                     ← style.md 影響哪些 Agent / Skill
8. memory/reference_key_paths.md                   ← 目錄地圖

9.  F:/workspace/novel_writer/docs/architecture/milestones/M3-memory-loop.md  ← 你的完整任務清單

10. F:/workspace/novel_writer/docs/architecture/specs/006-adopt-chapter-draft.md      ← P1 對齊後讀
11. F:/workspace/novel_writer/docs/architecture/specs/007-update-story-character-status.md ← P2 對齊後讀
12. F:/workspace/novel_writer/docs/architecture/specs/010-git-version-control.md      ← git 歷史 UI 後端 API

13. F:/workspace/novel_writer/docs/skills/status-updater.md                            ← status-updater + status-shortener Skill 規格
14. F:/workspace/novel_writer/docs/agents/chapter-writer.md                            ← M2 已實作，M3 確認沒踩前章記憶相關 bug

15. F:/workspace/novel_writer/docs/requirements/stories/006-adopt-chapter-draft.md
16. F:/workspace/novel_writer/docs/requirements/stories/007-update-story-character-status.md
17. F:/workspace/novel_writer/docs/requirements/stories/010-git-version-control.md

18. F:/workspace/novel_writer/docs/architecture/adr/0007-git-integration.md            ← git shell out 約定
```

讀完 9（M3 brief）就是你的「任務清單」。10-18 為實作細節。

## 你的範圍

完整任務清單見 `M3-memory-loop.md` 「任務拆解」段。簡述如下：

### 兩條並行 session 線

| 線 | 範圍 |
|---|---|
| **A** | 採用流程 + status-updater（types-1/2、ad-be-*、ad-fe-*、stat-be-*、stat-fe-*、prompt-1/2/3、qa-1/2/4/5/6/7/8） |
| **B** | git 歷史 UI（git-be-1/2、git-fe-1~6、qa-3） |

**建議先 A 後 B**：A 線會驗證 commit-policy 完整對接所有 spec；B 線在 A 線完整 commit 歷史齊備後才有東西可玩。

### M3 重要設計約束

1. **採用流程是事務性 11 步**：任一失敗都要 rollback；測試「主檔寫入失敗」「prompt.md 寫入失敗」「status-updater 失敗（不阻擋採用成功）」三個分支
2. **CM6 transaction userEvent 與後端 UndoEntry 對齊**：採用時前端 `view.dispatch({ userEvent: "adopt.chapter-writer" })` 與後端產生的 UndoEntry id 要綁定；Ctrl+Z 觸發 unadopt 時帶上 entry id
3. **status-updater 無 token 上限**（Story 007 明示拿掉）；長度由「AI 精簡」按鈕負責；LLM context overflow 時 graceful（500 LLM_FAILED → UI 持久 banner）
4. **status-updater Skill 不受 style.md 影響**（structured data 處理；提示詞不插入 style 段）
5. **採用前不自動快照到 `_versions/`**（依 2026-05-12 對齊；改靠 git commit 兜底）
6. **status 一人一檔**：`characters/<slug>_status.md`（不是單一 `character_status.md`）
7. **三個觸發點 reason 對應**：`auto-after-save` / `auto-after-adopt` / `manual`

## M2 遺留尾巴（合進 M3 範圍，brief 未明列）

| 項目 | 處理 |
|---|---|
| 採用按鈕 disabled | M3 brief `ad-fe-1` 改 enabled |
| status-updater noop placeholder | M3 brief stat-be-* 取代 noop |
| **LlmNotConfiguredModal 已建但未串入 GenerateButton 400** | **新增任務 `ad-fe-7`**：GenerateButton 收 400 INVALID_ROUTING → 開 modal |
| BDD step definitions qa-1/2/3 待補 | M3 brief qa-1/2/3 涵蓋（006/007/010） |
| 多張同章節圖 | 留 v0.2，**不在 M3 範圍** |
| EXIF 清理 | 留 P1，**不在 M3 範圍** |

## 動工協議

1. **branch 命名**：`feat/m3a-adoption` / `feat/m3b-status-updater` / `feat/m3c-git-history`；或單一 `feat/m3-...`
2. **base 為 main**（已綠；M2 PR #9 合進）；不要 stacked PR
3. **PR 小而頻**：一條任務一個 PR；對應 brief 的 task ID（ad-be-1 / stat-fe-2 / git-fe-3 ...）
4. **commit message**：`<type>: <scope> <短描述>`（type: feat / fix / refactor / docs / test / chore）
5. **每個服務 vitest 單元測試 + 必要 integration test**
6. **CI 必綠才 merge**（不要重演 PR #6 的 admin override）

## CI fail 預防（**重要**，沿用 M2 教訓）

- `apps/web` 的 `moduleResolution: "Bundler"` **禁止** relative import 寫 `.js` 副檔名 → 寫 `from "./X"`（無副檔名）
- `apps/api` / `packages/*` 用 `moduleResolution: "NodeNext"`，**必須** 寫 `.js`
- **動工前先在本地跑** `pnpm typecheck && pnpm test && pnpm lint` 三項都綠才 push
- Windows fs case-insensitive：git 中的 case 要正確（`App.tsx` 不是 `app.tsx`），用 `git ls-files` 驗

## M3 完成定義（DoD）

依 M3 brief「demo 驗收 walk-through」10 步全通過。重點：

- 使用者能：採用 AI 草稿 → 進度條完成 → status 自動更新 → 寫第 2 章看到 AI 記得第 1 章
- Ctrl+Z 可 unadopt（CM6 transaction 整合）
- 「立刻更新狀態」按鈕可用
- 「AI 精簡」status 可用（preserveMarkedSections 預設 true，🔖/✨ 段不動）
- git 歷史面板可列 commits / 預覽 / Diff / 還原
- 採用 + Undo + revert 三條鏈端對端測試 pass
- MVP 完整閉環 E2E pass
- BDD step definitions for 006 / 007 / 010 完整 pass
- Golden test：status-updater 對固定 fixture 產出穩定 + 不修改角色名 + 該章未提及角色 status 不變
- vitest 覆蓋率 critical path ≥ 70%

## 動工順序建議

```
Day 1  (pre-flight): P0 branch / memory 同步、確認 settings.json
Day 1-2 (pre-flight): spec-architect 對齊 Spec 006/007（P1 + P2 並行）
Day 2  (pre-flight): ai-agent-designer 過 status-updater.md（P3）
Day 3+ (主動工):
  1. types 全部先做（packages/shared-types/src/project.ts UndoEntry、status-update.ts）
  2. Prompt library（packages/prompt-library/skills/status-updater.ts + status-shortener.ts + zod schema）
  3. A 線：採用後端 → 採用前端 → status-updater 後端 → status-updater 前端
  4. B 線：git 後端 wrapper 擴充 → git 前端歷史面板 / Diff / Revert
  5. QA 持續滾動
```

A 線完成後就能跑 demo 1-8 步；B 線完成後跑完整 10 步。

## 關鍵風險

詳見 M3 brief 「關鍵風險」段，重點：

- **採用 11 步事務 rollback 邊界**：每個失敗點寫一個 test；rollback 完整性是 P0
- **CM6 transaction userEvent 與 UndoEntry id 對齊**：前後端 id 綁定一致；Ctrl+Z 觸發 unadopt 帶 entry id
- **status-updater 對非預期 LLM 輸出**（不 JSON / 含 markdown fence）：Spec 007 規範 1 次「請改格式重試」；前端 graceful 錯誤
- **Undo 採用後 prompt.md 標記處理**：用 `<!-- adopt-marker -->` 包多次採用；unadopt 在尾端加註記但不刪 marker
- **歷史面板對 100+ commits 效能**：分頁載入（每頁 50）
- **Drive 同步未 commit 變更與 status-updater race**：啟動時 git status 偵測 + 提醒（M1 已實作）；M3 不額外處理
- **status-updater 也可能觸發雲端→地端降級**（`event: degraded` 路徑）：UI toast「狀態更新切換到地端模型」

## 不在範圍

- 跨章節向量檢索（Story 020；P1）
- 章節版本快照手動 UI（Story 014 / 015；已淘汰，被 git 歷史涵蓋）
- 多人協作 / 雲端 git remote（v0.2）
- 多張同章節圖（v0.2）
- EXIF 隱私清理（P1）
- M4（打磨 + 發布 v0.1.0）

## 起手第一步

```bash
cd F:/workspace/novel_writer
git checkout main && git pull          # 同步到 M2 HEAD
git checkout -b chore/m3-preflight     # pre-flight 對齊先做

# 用 TaskCreate 把 pre-flight P0~P3 + M3 主任務清單 mirror 進 todo list

# 開始 pre-flight P0~P3
# Pre-flight 完成 → 切 feat/m3a-adoption branch 從 main → types-1/2
```

## 跟使用者的回報節奏

- **完成 pre-flight** 報告一次（P0~P3 全 done）
- **完成一條 session 線**（A/B 任一）或**完成一個分區**（types / prompts / 採用後端 / 採用前端 / status-updater 後端 / status-updater 前端 / git 歷史 UI）時報告一次
- **報告格式**：一段話結論 + 表格列做了什麼 + 下一個分區
- **遇到必須使用者決定的事**才打斷（例：對齊 Spec 006/007 時又發現 story 矛盾、ADR 沒涵蓋的選型、CI 一直紅）

開工。

---

## 本檔變更紀錄

- `2026-05-13`: 初版；對應 M3 milestone（含 pre-flight Spec 006/007 對齊 + M2 遺留尾巴 LlmNotConfiguredModal）
