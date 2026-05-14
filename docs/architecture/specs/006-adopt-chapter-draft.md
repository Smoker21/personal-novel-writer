# Spec: 採用 AI 草稿並歸檔

> Story: `docs/requirements/stories/006-adopt-chapter-draft.md`
> BDD: `docs/requirements/features/006-adopt-chapter-draft.feature`
> Status: `Draft`（M5 微調中，待 PM 簽核轉 Ready）
> Owner: `spec-architect`
> Last updated: `2026-05-15`
> Depends on ADR: 0001、0003
> Depends on spec: 003（chapter front-matter）、005（兩階段 Generate）
> Triggers spec: 007
> 修訂：`2026-05-15` — M5 串接 Spec 003 + 005 兩階段 Generate：
> 1. 採用時主檔 frontmatter 同步寫入 `participants` / `outline` / `requirements`（從 build-prompt 階段參數）
> 2. PromptSnapshot 改為「使用者編輯過的 promptText」（不是 server auto-built）；prompt.md 渲染加 `userEdited` 標記
> 3. DRAFT_STALE 比對的 contextHash 現在包含 participants / outline / requirements / writingStyle（依 Spec 005 ChapterContext 修訂）

## 摘要

採用 = 把 spec 005 在本機 cache 中產出的 draft 提升為**正式章節**：

1. 驗證 draft 狀態與上下文哈希（M5：contextHash 涵蓋 participants / outline / requirements）
2. 原子寫入主檔 `chapters/chapter_<NNNN>_<title>.md`（M5：含 frontmatter `participants` / `outline` / `requirements`，從 PromptSnapshot 取）
3. 寫入 / 追加 `chapters/chapter_<NNNN>_prompt.md`（含 marker 供 unadopt 定位；M5：渲染呈現 userEdited 狀態 + 使用者實際送出的 promptText）
4. 標記 draft 為已採用
5. 觸發 status-updater（非同步，不阻擋回應；M5：status-updater 讀新 frontmatter `participants` 決定要更新哪些角色 status）
6. 記錄 UndoEntry 供 CM6 + Ctrl+Z 使用

整個流程是**事務性**的：任一步失敗則整個 rollback，主檔不被部分覆寫。

> **2026-05-13 對齊修訂**：移除「採用前自動快照到 `chapters/_versions/`」邏輯（已被 git commit 取代）；response 移除 `snapshotPath` 欄位；`unadopt` 改為純標記（不從 `_versions/` 還原，改靠 CM6 本地 undo stack）。Story 014（手動章節版本快照）與 Story 015（從快照回退）已淘汰，被 git 歷史面板（Spec 010）涵蓋。

## API 合約

### POST /api/projects/:projectHash/chapters/:chapterNumber/adopt

**Auth:** `none`（127.0.0.1）

**Request:**
```ts
{
  draftId: string;             // 必須是該章 status='complete' 或 'aborted' 的 draft
  confirmed: true;             // server 強制要求，避免誤呼叫
  force?: boolean;             // DRAFT_STALE 後使用者確認強制採用時帶 true
}
```

**Response 200:**
```ts
{
  mainPath: string;            // chapters/chapter_0001_梅雨初晴.md
  promptPath: string;          // chapters/chapter_0001_prompt.md
  statusUpdateJobId: string;   // 背景觸發的 status-updater 任務 ID
  undoEntry: {
    id: string;                // client 端把它推進 undo stack
    label: string;             // "採用 chapter-writer 草稿"
  };
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | `MISSING_CONFIRMATION` | request 沒帶 `confirmed: true` |
| 400 | `INVALID_DRAFT_STATUS` | draft 仍在 `running` 不能採用；或已被採用 |
| 404 | `DRAFT_NOT_FOUND` | draftId 不存在 |
| 409 | `DRAFT_STALE` | draft 的 contextHash 與目前 context 不符（使用者在草稿產生後改了 synopsis / 角色卡 / status）；帶 force=true 重發可繞過 |
| 409 | `ADOPT_IN_PROGRESS` | 該章已有採用流程在進行中 |
| 500 | `IO_ERROR` | 任一檔案 I/O 失敗，事務 rollback |

`DRAFT_STALE` 是**告知性**錯誤——前端應顯示「您在草稿產生後修改了上下文，是否仍要採用此草稿？」並讓使用者再次確認（帶 `force: true` 重發）。

### POST /api/projects/:projectHash/chapters/:chapterNumber/unadopt

對應 Story 006 Scenario「採用後 Undo 還原採用前狀態（CM6 undo stack）」。

> **注意**：此 endpoint **不**還原主檔內容（`.md` 保留 AI 草稿）。Undo 的「還原」是 CM6 本地 undo stack 的動作；後端只記錄 unadopt 事件並在 prompt.md 加一行備註。如需還原主檔，使用 git 歷史面板（Spec 010）。

**Request:**
```ts
{
  undoEntryId: string;
}
```

**Response 200:**
```ts
{
  promptNote: string;          // 附加到 prompt.md 的「Undo 採用 at: ...」紀錄行
}
```

**邏輯：**

1. 查 undo_entries 找到對應 entry；確認未被 undone
2. 標記 entry 為 `undone: true`
3. 在 prompt.md 末尾追加：

   ```markdown

   ---

   **Undo 採用** at: 2026-05-10T12:45:00Z
   原因：使用者在 client 端按 Ctrl+Z

   ```

4. **不**回退主檔（git 歷史仍完整可還原）
5. **不**回退 status-updater（已執行的狀態更新保留；下一次採用會 overwrite）
6. commitIfChanged（prompt.md 的 Undo 備註）

## 採用事務 — 詳細步驟

```
adopt(draftId, confirmed, force?):
  if not confirmed: throw MISSING_CONFIRMATION

  # 防重複採用（per chapter 鎖）
  if isAdoptInFlight(projectHash, chapterNumber): throw ADOPT_IN_PROGRESS
  setAdoptInFlight(projectHash, chapterNumber, true)

  T = []  # rollback stack
  try:
    # 1. 驗證 draft
    draft = readDraftMeta(draftId)
    if draft.status not in (complete, aborted): throw INVALID_DRAFT_STATUS
    if draft.alreadyAdopted: throw INVALID_DRAFT_STATUS

    # 2. 對照當前 context（保護使用者）
    currentHash = collectContextHash(projectHash, chapterNumber)
    if currentHash != draft.contextHash and not force:
      throw DRAFT_STALE

    # 3. 讀 draft 內容
    draftText = readDraftText(projectHash, chapterNumber)
    promptSnapshot = readDraftPromptSnapshot(projectHash, chapterNumber)

    # 4. 算出主檔的目標路徑（可能因標題變化而與舊主檔不同）
    chapter = readChapterMeta(projectHash, chapterNumber)
    targetMainPath = chapters/chapter_<NNNN>_<chapter.title>.md
    currentMainPath = findExistingChapterFile(projectHash, chapterNumber)

    # 5. 原子寫主檔（write to .tmp, rename）
    # M5：拼接 frontmatter + draftText
    # PromptSnapshot.participants / outline / requirements 由 build-prompt 階段記錄
    frontmatter = serializeChapterFrontmatter({
      participants: promptSnapshot.participants,    # 從 PromptSnapshot 同步
      outline: promptSnapshot.outline,
      requirements: promptSnapshot.requirements
    })
    mainContent = frontmatter ? frontmatter + '\n' + draftText : draftText
    tmpMain = targetMainPath + '.tmp'
    writeFile(tmpMain, mainContent)
    rename(tmpMain, targetMainPath)
    T.push(() =>
      if currentMainPath and exists(currentMainPath): pass  # git revert 可還原
      else: unlink(targetMainPath)
    )

    # 6. 若舊主檔路徑與新不同（標題變化），刪舊
    if currentMainPath and currentMainPath != targetMainPath:
      unlink(currentMainPath)
      # 不需 rollback：原始內容已在 git 中

    # 7. 寫 prompt.md（append-mode，多次採用累積歷史）
    undoEntryId = generateUUID()
    promptText = renderPromptMarkdown(promptSnapshot, adoptedAt=now, undoEntryId=undoEntryId)
    markerStartOffset = getCurrentFileSize(promptPath)
    if exists(promptPath):
      appendFile(promptPath, '\n\n---\n\n' + promptText)
    else:
      writeFile(promptPath, promptText)
    T.push(() =>
      truncateFile(promptPath, markerStartOffset)  # 移除剛追加的部分
    )

    # 8. 標記 draft 為已採用
    updateDraft(draftId, { adoptedAt: now })

    # 9. git commit（含主檔 + prompt.md）
    commitIfChanged(projectPath,
      [targetMainPath, promptPath],
      "chapter: adopt AI draft for chapter <N> <title>"
    )

    # 10. 觸發 status-updater（非同步，不等待）
    jobId = triggerStatusUpdate(projectHash, chapterNumber, reason="auto-after-adopt")

    # 11. 產出 undo entry（記在 SQLite）
    undoEntry = recordUndoEntry({
      id: undoEntryId,
      type: "adopt-draft",
      draftId, chapterNumber,
      targetMainPath,
      promptMarkerStartOffset: markerStartOffset,
      label: "採用 chapter-writer 草稿"
    })

    return { mainPath: targetMainPath, promptPath, statusUpdateJobId: jobId, undoEntry }

  except Exception as e:
    for rollback in reversed(T): rollback()
    throw IO_ERROR or rethrow

  finally:
    setAdoptInFlight(projectHash, chapterNumber, false)
```

`prompt.md` 的 marker 採每次採用前後加 `<!-- adopt-marker:<undoEntryId> -->`，方便 unadopt 時準確定位；marker 對使用者不可見（HTML 註解）。

## prompt.md 渲染（M5 修訂）

```markdown
<!-- adopt-marker:<undoEntryId> -->
---
generatedAt: 2026-05-10T12:34:56Z
adoptedAt: 2026-05-10T12:40:01Z
agent: chapter-writer
agentVersion: v0.2
model: ollama:qwen2.5:14b
chapterNumber: 1
chapterTitle: 梅雨初晴
contextHash: 3f9a2b...
userEdited: true                # M5：使用者是否在 PromptPreviewModal 編輯過 prompt
participants: [蘇晴, 林書言]    # M5：採用時生效的 participants
outline: |                      # M5：採用時生效的 outline（可能與當前 chapter front-matter 不同）
  本章從蘇晴推開書店木門的雨後場景開始，與林書言初次正面交談……
requirements: |                 # M5：採用時生效的 requirements
  約 1500 字。第三人稱有限視角。書卷氣語感。
temperature: 1.0                # M5：採用時生效的 temperature
---

## 使用者送出的 Prompt（M5）

[完整 promptText — 即使使用者編輯過，也記錄使用者實際送 LLM 的版本]

<details>
<summary>原始 server auto-built prompt（編輯前）</summary>

[autoGeneratedPromptText — 給對比 audit 用]

</details>

## 上下文摘要

- synopsis 哈希: 8a2f...
- 用到角色: [蘇晴, 林書言]
- story_status 哈希: 02c1...
- character_status 哈希: { 蘇晴: 5e8b..., 林書言: 9d4a... }
- 前章完整內容哈希: <前章為空時為 null>
- writingStyle 哈希: c1f3...      # M5（spec 005 2026-05-13）
- currentAppearance 哈希: { 蘇晴: ..., 林書言: ... }  # M5（spec 002b 2026-05-13）

## 模型回應 metadata

- 串流耗時: 47s
- 輸入 token: 2310
- 輸出 token: 1842
<!-- /adopt-marker -->
```

**M5 變更要點**：
- 加 `userEdited` frontmatter 欄位（顯示給使用者看「我這次有沒有改」）
- 加 `participants` / `outline` / `requirements` / `temperature`（採用時的「真實參數」）
- 「## User prompt」改為「## 使用者送出的 Prompt」 + 摺疊區放 auto-built 版本（給對比 audit）
- 上下文摘要對齊 Spec 005 ChapterContext 修訂版欄位

## 資料模型

新增至 `packages/shared-types/src/project.ts`：

```ts
export interface UndoEntry {
  id: string;                  // uuid
  type: "adopt-draft" | "apply-skill";  // 預留 Skill 套用
  projectHash: string;
  chapterNumber: number;
  draftId?: string;
  targetMainPath: string;
  promptMarkerStartOffset: number | null;  // 用於 unadopt 時截斷 prompt.md
  label: string;
  createdAt: string;
  undone: boolean;
}
```

SQLite：

```sql
CREATE TABLE undo_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_hash TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  draft_id TEXT,
  target_main_path TEXT NOT NULL,
  prompt_marker_start_offset INTEGER,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0
);
```

## 跨元件協議

```
client                apps/api              ContextCollector  fs/cache  status-updater
  │                      │                       │             │          │
  │ POST .../adopt ─────▶│                       │             │          │
  │                      │── validate draft ───────────────────▶│          │
  │                      │── collect context hash ▶│             │          │
  │                      │◀── currentHash ─────────│             │          │
  │                      │── compare with draft.contextHash      │          │
  │                      │   if mismatch and not force: 409 DRAFT_STALE     │
  │                      │                       │             │          │
  │                      │── atomic write main ────────────────▶│          │
  │                      │── append prompt.md ─────────────────▶│          │
  │                      │── mark draft adopted ───────────────▶│          │
  │                      │── git commit ───────────────────────▶│          │
  │                      │── trigger status-update (async) ──────────────────▶│
  │                      │── record undoEntry ─────────────────▶│          │
  │ 200 OK ──────────────│                                       │          │
```

## 並發與一致性

- 同一 `(projectHash, chapterNumber)` 同時最多一個採用流程（in-flight 標記）
- 採用流程**不**等待 status-updater 完成才回應 client：採用 200 OK 後 status-updater 非同步跑（spec 007）

## LLM adapter 合約

不直接呼叫 LLM。但**觸發** spec 007 的 status-updater，後者會呼叫。

## 非功能性

- **效能**：採用整流程 p95 < 500ms（純檔案 I/O + git commit；不含 status-updater）
- **容量**：單章主檔上限 200 KB；prompt.md 隨採用次數線性成長，10 次採用內可控
- **安全**：主檔路徑必須在 projectPath 之下（防 path traversal）；snapshot 檔名只用時間戳（不來自使用者輸入）
- **可用性**：純本機；採用失敗 = 主檔不變、無副作用

## 開發任務拆解

- [ ] **types-1**: `packages/shared-types/src/project.ts` 補 `UndoEntry`（移除 snapshotPath 欄位）
- [ ] **ad-be-1**: `apps/api/src/services/prompt-md.ts`（渲染 + append + marker offset 記錄 + unadopt 切片）
- [ ] **ad-be-2**: `apps/api/src/services/undo-store.ts`（SQLite undo_entries table）
- [ ] **ad-be-3**: `apps/api/src/routes/adopt.ts`（POST /adopt 主流程；11 步事務；含 in-flight 鎖）
- [ ] **ad-be-4**: `apps/api/src/routes/unadopt.ts`（POST /unadopt；標記 + prompt.md 備註；不還原主檔）
- [ ] **ad-fe-1**: 「採用」按鈕從 disabled 改 enabled
- [ ] **ad-fe-2**: 二次確認對話框（含 git 還原提示）
- [ ] **ad-fe-3**: 採用流程進度條（寫主檔 / 寫 prompt / commit / 觸發 status-updater 四步）
- [ ] **ad-fe-4**: DRAFT_STALE 確認流程（顯示對話框 → force: true 重發）
- [ ] **ad-fe-5**: CM6 transaction 整合（採用後 view.dispatch({ userEvent: "adopt.chapter-writer" })；把草稿插入 CM6 doc）
- [ ] **ad-fe-6**: Ctrl+Z 觸發 unadopt（連到後端 POST /unadopt；前端 CM6 undo stack 還原 view）
- [ ] **ad-fe-7**: GenerateButton 收 400 ROUTING_NOT_CONFIGURED → 開 LlmNotConfiguredModal（M2 遺留）

## 變更紀錄

- `2026-05-10`: 初版 Ready
- `2026-05-13`: 移除 `_versions/` 自動快照邏輯（改靠 git commit 兜底）；移除 response.snapshotPath；unadopt 改為純標記（不從快照還原）；Story 014/015 已淘汰，被 Spec 010 git 歷史面板涵蓋；in-flight 鎖（ADOPT_IN_PROGRESS）加入
- `2026-05-15`: M5 微調（待 PM 簽核轉 Ready）— 串接 Spec 003 + 005 兩階段 Generate：
  - 主檔寫入時拼接 frontmatter（`participants` / `outline` / `requirements` 從 PromptSnapshot）
  - prompt.md 渲染改為「使用者送出的 promptText」（不是 server auto-built）+ 摺疊區保留 auto-built 版本以利對比
  - prompt.md frontmatter 補 `userEdited` / `participants` / `outline` / `requirements` / `temperature`
  - DRAFT_STALE 比對的 contextHash 涵蓋 participants / outline / requirements（隨 Spec 005 ChapterContext 修訂自然繼承）
