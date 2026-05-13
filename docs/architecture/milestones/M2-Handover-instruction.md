# M2 — 角色卡 + AI 撰寫 + Vision 開工指令

> 適用 milestone: [M2 Characters & AI Writing](./M2-characters-and-ai-writing.md)
> 建立日期: 2026-05-13
> 用途: 直接貼給接手 M2 的 Claude Code dev session 作為第一條訊息
> 前置: PR #7 已 merged 進 main（HEAD ef8e3d3）；typecheck 綠

---

> **使用方式**：把下方水平線之間的整段 markdown 複製，貼進新 session 的第一條訊息。下個 session 不必讀本專案的對話歷史；所有資訊在此 brief + 引用的文件裡。

---

# Novel Writer — M2 角色卡 + AI 撰寫 + Vision 動工

你接手 Novel Writer 專案的 **M2 角色卡 + AI 撰寫（含 vision）** milestone。M0（基礎建設）與 M1（寫作骨架）已合進 main；最近的 PR #7 順手修了 PR #6 的 CI broken（apps/web 的 `.js` 副檔名 + `App.tsx` case mismatch）並把 Story 002b vision 升級為 MVP（含章節敏感外貌）。

## 第一件事：讀齊脈絡（≈ 30-40 分鐘）

按這順序讀，**不要跳過**：

```
1. memory/MEMORY.md                                ← 索引
2. memory/mvp_status.md                            ← 現在位置：M0+M1 完成、M2 待開工
3. memory/tech_stack.md                            ← 9 個 ADR 結論一覽
4. memory/preference_concise_execution.md          ← 互動風格
5. memory/preference_simplification.md             ← 設計取捨偏好
6. memory/preference_traditional_chinese_terse.md  ← 寫作風格
7. memory/style_md_boundary.md                     ← style.md 影響哪些 Agent / Skill
8. memory/reference_key_paths.md                   ← 目錄地圖

9.  F:/workspace/novel_writer/docs/architecture/milestones/M2-characters-and-ai-writing.md  ← 你的完整 PR 清單（35-50 PR）

10. F:/workspace/novel_writer/docs/architecture/specs/002-edit-character-card.md       ← 角色卡（含 portrait + appearanceByChapter）
11. F:/workspace/novel_writer/docs/architecture/specs/002b-character-card-from-image.md ← 圖片上傳 + vision 解析（2026-05-13 新）
12. F:/workspace/novel_writer/docs/architecture/specs/005-ai-write-chapter.md          ← AI 撰寫（含 currentAppearance lookup）
13. F:/workspace/novel_writer/docs/architecture/specs/009-settings-page.md             ← 設定頁（M2 補 per-Agent routing UI + preset）

14. F:/workspace/novel_writer/docs/agents/chapter-writer.md                            ← v0.2 含 currentAppearance 規則
15. F:/workspace/novel_writer/docs/skills/character-card-consolidator.md
16. F:/workspace/novel_writer/docs/skills/character-image-extractor.md                 ← 2026-05-13 新

17. F:/workspace/novel_writer/docs/architecture/adr/0004-llm-adapter.md
18. F:/workspace/novel_writer/docs/architecture/adr/0009-llm-adapter-vision.md         ← 2026-05-13 新；amends 0004

19. F:/workspace/novel_writer/docs/requirements/stories/002-edit-character-card.md
20. F:/workspace/novel_writer/docs/requirements/stories/002b-character-card-from-image.md  ← 升 P0
21. F:/workspace/novel_writer/docs/requirements/stories/005-ai-write-chapter.md
22. F:/workspace/novel_writer/docs/requirements/stories/009-settings-page.md
```

讀完 9（M2 brief）就是你的「任務清單」。10-22 為實作細節。

## 你的範圍

完整任務清單見 `M2-characters-and-ai-writing.md` 「任務拆解」段。簡述如下：

### 四條並行 session 線（types 完成後互不依賴）

| 線 | 範圍 |
|---|---|
| **A** | 角色卡文字（types-1, char-be-*, char-fe-*）+ consolidator prompt |
| **B** | AI 撰寫（types-2/3, gen-be-*, gen-fe-*）+ chapter-writer prompt + LLM adapter 文字 provider |
| **C** | 設定頁補完（set-fe-*, set-be-1）+ golden test 框架 |
| **D** | **vision 角色圖**（types vision、llm-1~llm-10、prompt-3、port-be-*, port-fe-*）+ image-extractor prompt |

單人開發可連續做 A → B → C → D 或拆多 session 並行。

### M2 重要設計約束

1. **採用 AI 草稿按鈕**在 M2 顯示為 **disabled** + hover 提示「採用功能將在下一版啟用」；採用流程留 M3
2. **status-updater 觸發**：M1 末端是 noop placeholder；M2 仍保持 noop（M3 才接 LLM）
3. **git 歷史面板**：M2 不做，留 M3
4. **chapter-writer 必須讀 currentAppearance**（章節敏感）：依當前章節 N 從 `appearanceByChapter` 找 ≤ N 的最大者，fallback default 扁平外貌欄位
5. **vision capability-aware fallback**：LLMRouter 在 image content 出現時跳過 `supportsVision=false` 的 fallback
6. **`_assets/<slug>/` 進 git**（不在 .gitignore）；rename / delete 角色時跟著搬 / 刪

## 動工協議

1. **branch 命名**：`feat/m2a-character-cards` / `feat/m2b-ai-writing` / `feat/m2c-settings-routing` / `feat/m2d-vision-portraits`；或單一 `feat/m2-...`
2. **base 為 main**（已綠；ef8e3d3 head）；不要 stacked PR
3. **PR 小而頻**：一條任務一個 PR；對應 spec 的 task ID（types-1 / char-be-2 / ...）
4. **commit message**：`<type>: <scope> <短描述>`（type: feat / fix / refactor / docs / test / chore）
5. **每個服務 vitest 單元測試 + 必要 integration test**
6. **依賴 `App.tsx` 大寫**：別寫成 `App.js`（apps/web 是 Bundler moduleResolution，禁 `.js`；前事不忘）
7. **CI 必綠才 merge**（PR #6 那次 admin override 是例外，別重演）

## CI fail 預防（**重要**）

PR #6/#7 慘痛教訓：

- `apps/web` 的 `moduleResolution: "Bundler"` **禁止** relative import 寫 `.js` 副檔名 → 寫 `from "./X"`（無副檔名）
- `apps/api` / `packages/*` 用 `moduleResolution: "NodeNext"`，**必須** 寫 `.js`
- **動工前先在本地跑** `pnpm typecheck && pnpm test && pnpm lint` 三項都綠才 push
- Windows fs case-insensitive：git 中的 case 要正確（`App.tsx` 不是 `app.tsx`），用 `git ls-files` 驗

## M2 完成定義（DoD）

依 M2 brief 「demo 驗收 walk-through」13 步全通過。重點：

- 使用者能：建專案 → 設定 LLM → 編角色卡（文字 + 上傳預設圖 + 為章節版上傳圖）→ AI 寫章節（草稿用該章節版本的外貌寫）→ 中止 / 重產 / 丟棄
- **採用按鈕 disabled**（M3 才啟用）
- 雲端 vision 拒絕時自動降級到地端 vision（`event: degraded` UI 提示）
- rename 角色帶 `_assets/<slug>/` 跟著遷移
- BDD step definitions for 002 / 002b / 005 / 009 全 pass
- Golden test：chapter-writer / consolidator / image-extractor 提示詞組裝 hash 穩定 5 次
- vitest 覆蓋率 critical path ≥ 70%

## 動工順序建議

1. **types 全部先做**（character.ts、character-vision.ts、llm.ts、sse.ts）
2. **LLM adapter 補完含 vision**（ADR-0009）+ **Prompt library**（含 image-extractor）並行
3. **設定頁補完** — 給後續 AI 流程的前置
4. **角色卡 Spec 002**（後端 + 前端，可並行）
5. **角色圖片 Spec 002b**（依賴 002 schema 與 LLM adapter vision）
6. **AI 撰寫 Spec 005**（最重；含章節敏感 currentAppearance lookup；建議單一 dev 連續寫）
7. **QA** 持續滾動

## 關鍵風險

詳見 M2 brief 「關鍵風險」段，重點：

- Style.md 整合（chapter-writer prompt 動態插入 style.md；空時跳過）
- CharacterStatuses 一人一檔（不是單一 string）
- **currentAppearance 章節敏感 lookup**（context-collector 對每個 relevant character 跑 lookupAppearance(N)）
- 草稿 cache 路徑（別寫到 Drive 同步目錄）
- 採用按鈕 disabled（明確標示「下一版啟用」）
- LLM 拒絕成人內容（自動降級到地端）
- **vision capability-aware fallback**（圖丟給純文字模型 → skip）
- **sharp 跨平台 native module**（在 Tauri 打包時要確保三平台 prebuilt）
- **`_assets/` 進 git**（圖檔不大但累積影響；MVP 接受）
- **rename / delete 連動 `_assets/`**（不要漏）

## 不在範圍

- 採用 AI 草稿（M3）
- status-updater 完整觸發（M3）
- git 歷史面板（M3）
- 002c AI 生圖（v0.3+）
- 多張同章節圖（v0.2）
- EXIF 清理（P1）

## 起手第一步

讀完上述文件後，立刻：

```bash
cd F:/workspace/novel_writer
git checkout main && git pull          # 確認 main 同步到 ef8e3d3
git checkout -b feat/m2a-types         # 第一個 branch：types 先行

# 用 TaskCreate 把 M2 brief 的任務清單 mirror 進 todo list

# 開始：types-1 / types-2 / types-3（packages/shared-types/）
```

## 跟使用者的回報節奏

- **完成一條 session 線**（A/B/C/D 任一）或**完成一個分區**（types / LLM adapter / 設定頁 / 角色卡 / vision 圖 / AI 撰寫）時報告一次
- **報告格式**：一段話結論 + 表格列做了什麼 + 下一個分區
- **遇到必須使用者決定的事**才打斷（例：ADR 沒涵蓋的選型、發現 spec 矛盾、CI 一直紅）

開工。

---

## 本檔變更紀錄

- `2026-05-13`: 初版；對應 M2 milestone（含 vision 升 P0 + 章節敏感外貌 + ADR-0009）

## 給未來 milestone 的命名 convention 建議

建議統一格式 `M<N>-Handover-instruction.md`，與對應的 `M<N>-<slug>.md` milestone brief 同層放置：

```
docs/architecture/milestones/
├── README.md
├── M0-foundation.md              ← brief
├── M0-Handover-instruction.md    ← 開工指令（可反向補）
├── M1-writing-skeleton.md
├── M1-Handover-instruction.md    ← 可反向補
├── M2-characters-and-ai-writing.md
├── M2-Handover-instruction.md    ← 本檔
├── M3-memory-loop.md
├── M3-Handover-instruction.md    ← 進 M3 時建立
├── M4-polish-and-release.md
└── M4-Handover-instruction.md    ← 進 M4 時建立
```

兩種文件職責分工：

| 文件 | 角色 | 讀者 |
|---|---|---|
| `M<N>-<slug>.md`（brief） | 實作該做什麼（PR 清單 / DoD / demo walk-through / 風險） | dev session（深入查細節） |
| `M<N>-Handover-instruction.md`（開工指令）| **如何起手**（讀檔順序 / 互動風格 / commit convention / 回報節奏） | dev session（第一條訊息） |

開工指令是「給人看的 prompt」，brief 是「給機器執行的 spec」。
