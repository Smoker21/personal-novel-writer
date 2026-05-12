# Spec: 採用 AI 草稿並歸檔

> Story: `docs/requirements/stories/006-adopt-chapter-draft.md`
> BDD: `docs/requirements/features/006-adopt-chapter-draft.feature`
> Status: `Ready`
> Owner: `spec-architect`
> Last updated: `2026-05-10`
> Depends on ADR: 0001、0003
> Depends on spec: 005
> Triggers spec: 007

## 摘要

採用 = 把 spec 005 在本機 cache 中產出的 draft 提升為**正式章節**：

1. 把當前主檔內容快照到 `chapters/<slug>/_versions/v_*.md`（採用前自動快照）
2. 原子寫入主檔 `chapters/chapter_<NNNN>_<title>.md`
3. 寫入 / 追加 `chapters/chapter_<NNNN>_prompt.md`
4. 推送 undo entry 給 client（採用是單一 undo 步）
5. 觸發 status-updater 背景任務（spec 007）

整個流程是**事務性**的：任一步失敗則整個 rollback，主檔不被部分覆寫。draft cache 在採用成功後保留 7 天供查詢，然後清理。

## API 合約

### POST /api/projects/:projectHash/chapters/:chapterNumber/adopt

**Auth:** `none`（127.0.0.1）

**Request:**
```ts
{
  draftId: string;             // 必須是該章 status='complete' 或 'aborted' 的 draft
  confirmed: true;             // server 強制要求，避免誤呼叫；client 在二次確認後才能傳
}
```

**Response 200:**
```ts
{
  mainPath: string;            // chapters/chapter_0001_梅雨初晴.md
  promptPath: string;          // chapters/chapter_0001_prompt.md
  snapshotPath: string | null; // chapters/_versions/chapter_0001/v_20260510_124001.md，主檔原本為空時為 null
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
| 409 | `DRAFT_STALE` | draft 的 contextHash 與目前 context 不符（使用者在草稿產生後改了 synopsis / 角色卡 / status） |
| 500 | `IO_ERROR` | 任一檔案 I/O 失敗，事務 rollback |

`DRAFT_STALE` 是**告知性**錯誤——前端應顯示「您在草稿產生後修改了上下文，是否仍要採用此草稿？」並讓使用者再次確認（帶 `force: true` 重發）。

### POST /api/projects/:projectHash/chapters/:chapterNumber/unadopt

對應 Story 006 Scenario 「採用後 Undo 還原採用前狀態」。

**Request:**
```ts
{
  undoEntryId: string;
}
```

**Response 200:**
```ts
{
  restoredPath: string;        // 主檔的目前內容（已從 _versions 還原）
  promptNote: string;          // 附加到 prompt.md 的「Undo 採用 at: ...」紀錄行
}
```

**邏輯：**

1. 從 _versions 讀對應快照
2. 原子寫主檔
3. 在 prompt.md 末尾追加：

   ```markdown

   ---

   **Undo 採用** at: 2026-05-10T12:45:00Z
   原因：使用者在 client 端按 Ctrl+Z

   ```

4. **不**回退 status-updater（已執行的狀態更新保留；下一次採用會 overwrite）

## 採用事務 — 詳細步驟

```
adopt(draftId, confirmed):
  if not confirmed: throw MISSING_CONFIRMATION
  
  T = []  # rollback stack
  try:
    # 1. 驗證 draft
    draft = readDraftMeta(draftId)
    if draft.status not in (complete, aborted): throw INVALID_DRAFT_STATUS
    if draft.alreadyAdopted: throw INVALID_DRAFT_STATUS
    
    # 2. 對照當前 context（保護使用者）
    currentHash = collectContextHash(projectHash, chapterNumber)
    if currentHash != draft.contextHash and not request.force:
      throw DRAFT_STALE
    
    # 3. 讀 draft 內容
    draftText = read(draft.path)
    promptSnapshot = readJSON(draft.promptPath)
    
    # 4. 算出主檔的目標路徑（可能因標題變化而與舊主檔不同）
    chapter = readChapterMeta(projectHash, chapterNumber)  # 從 chapters/ 列舉
    targetMainPath = chapters/chapter_<NNNN>_<chapter.title>.md
    
    # 5. 自動快照當前主檔（若非空）
    snapshotPath = null
    if exists(currentMainPath) and size(currentMainPath) > 0:
      snapshotPath = chapters/_versions/chapter_<NNNN>/v_<TS>.md
      mkdir -p dirname(snapshotPath)
      copyFile(currentMainPath, snapshotPath)
      T.push(() => unlink(snapshotPath))
    
    # 6. 原子寫主檔（write to .tmp, fsync, rename）
    tmpMain = targetMainPath + '.tmp'
    writeFile(tmpMain, draftText)
    fsync(tmpMain)
    rename(tmpMain, targetMainPath)
    T.push(() => 
      if snapshotPath: rename(snapshotPath, targetMainPath)
      else: unlink(targetMainPath)
    )
    
    # 7. 若舊主檔路徑與新不同（標題變化），刪舊
    if currentMainPath != targetMainPath:
      unlink(currentMainPath)
      # 不 rollback unlink；snapshot 已保留內容
    
    # 8. 寫 prompt.md（append-mode，多次採用累積歷史）
    promptText = renderPromptMarkdown(promptSnapshot, adoptedAt=now)
    if exists(promptPath):
      appendFile(promptPath, '\n\n---\n\n' + promptText)
    else:
      writeFile(promptPath, promptText)
    T.push(() => 
      # 移除剛追加的部分；用 marker 識別
    )
    
    # 9. 標記 draft 為已採用（DB UPDATE）
    updateDraft(draftId, { adoptedAt: now })
    
    # 10. 觸發 status-updater
    jobId = jobQueue(projectHash).enqueue({
      type: "status-update",
      chapterNumber,
      contextHash: draft.contextHash,
    })
    
    # 11. 產出 undo entry（記在 SQLite）
    undoEntry = recordUndoEntry({
      draftId, chapterNumber,
      snapshotPath, promptMarkerOffset, targetMainPath,
      label: "採用 chapter-writer 草稿"
    })
    
    return { mainPath: targetMainPath, promptPath, snapshotPath, statusUpdateJobId: jobId, undoEntry }
    
  except Exception as e:
    for rollback in reversed(T): rollback()
    throw IO_ERROR or rethrow
```

`prompt.md` 的 marker 採每次採用前後加 `<!-- adopt-marker:<undoEntryId> -->`，方便 unadopt 時準確切回；marker 對使用者不可見（HTML 註解）。

## prompt.md 渲染

```markdown
<!-- adopt-marker:<undoEntryId> -->
---
generatedAt: 2026-05-10T12:34:56Z
adoptedAt: 2026-05-10T12:40:01Z
agent: chapter-writer
agentVersion: v0.3
model: ollama:qwen2.5:14b
chapterNumber: 1
chapterTitle: 梅雨初晴
contextHash: 3f9a2b...
---

## System prompt

[完整 system prompt]

## User prompt

[組裝的 user prompt]

## 上下文摘要

- synopsis 哈希: 8a2f...
- 用到角色: [蘇晴, 林書言]
- story_status 哈希: 02c1...
- character_status 哈希: 5e8b...
- 前章摘要哈希: <前章為空時為 null>

## 模型回應 metadata

- 串流耗時: 47s
- 輸入 token: 2310
- 輸出 token: 1842
<!-- /adopt-marker -->
```

## 資料模型

新增至 `packages/shared-types/src/project.ts`：

```ts
export interface UndoEntry {
  id: string;                  // uuid
  type: "adopt-draft" | "apply-skill";  // 預留 Skill 套用
  projectHash: string;
  chapterNumber: number;
  draftId?: string;
  snapshotPath: string | null;
  targetMainPath: string;
  promptMarkerStartOffset: number | null;  // 用於 unadopt 切 prompt.md
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
  snapshot_path TEXT,
  target_main_path TEXT NOT NULL,
  prompt_marker_start_offset INTEGER,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0
);
```

## 章節版本快照路徑規則

```
<projectPath>/
└── chapters/
    ├── chapter_0001_梅雨初晴.md
    └── _versions/
        └── chapter_0001/
            ├── v_20260510_124001.md
            ├── v_20260510_134522.md
            └── ...
```

`_versions/` 與章節同層；以 chapter_NNNN 子目錄分組，避免一個資料夾爆量。檔名 `v_YYYYMMDD_HHMMSS.md`。

**自動快照**（採用前）與**手動快照**（Story 014）共用此目錄結構。Story 015 從這個目錄列出版本。

## 跨元件協議

```
client                apps/api              ContextCollector  fs/cache  JobQueue
  │                      │                       │             │          │
  │ POST .../adopt ─────▶│                       │             │          │
  │                      │── validate draft ───────────────────▶│          │
  │                      │── collect context hash ▶│             │          │
  │                      │◀── currentHash ─────────│             │          │
  │                      │── compare with draft.contextHash      │          │
  │                      │   if mismatch and not force: 409 DRAFT_STALE     │
  │                      │                       │             │          │
  │                      │── snapshot main → _versions ────────▶│          │
  │                      │── atomic write main ────────────────▶│          │
  │                      │── append prompt.md ─────────────────▶│          │
  │                      │── mark draft adopted ───────────────▶│          │
  │                      │── enqueue status-update ────────────────────────▶│
  │                      │◀── jobId ─────────────────────────────────────────│
  │                      │── record undoEntry ─────────────────▶│          │
  │ 200 OK ──────────────│                                       │          │
```

## 並發與一致性

- 同一 `(projectHash, chapterNumber)` 同時最多一個採用流程在跑（用 `JobQueue` 的 in-flight 標記，不是另一個 queue）
- 若使用者連點兩次「採用」：第二次見到 in-flight，回 409 `DRAFT_STALE` 之前先回 409 `ADOPT_IN_PROGRESS`
- 採用流程**不**等待 status-updater 完成才回應 client：採用 200 OK 後 status-updater 在背景跑（spec 007）

## LLM adapter 合約

不直接呼叫 LLM。但**觸發** spec 007 的 status-updater，後者會呼叫。

## 非功能性

- **效能**：採用整流程 p95 < 500ms（純檔案 I/O，幾百 KB 內）；不含 status-updater
- **容量**：單章主檔上限 200 KB；prompt.md 隨採用次數線性成長，10 次採用內可控
- **安全**：主檔路徑必須在 projectPath 之下（防 path traversal）；snapshot 檔名只用時間戳（不來自使用者輸入）
- **可用性**：純本機；採用失敗 = 主檔不變、無副作用
- **資源**：`_versions/` 不自動清理（使用者珍貴資產）；應用提供「壓縮舊版本」工具留待後續

## 開發任務拆解

- [ ] **types**: `packages/shared-types/src/project.ts` 補 `UndoEntry`
- [ ] **be-1**: `apps/api/src/services/atomic-fs.ts` — 原子寫入（write tmp + fsync + rename）+ rollback stack helper
- [ ] **be-2**: `apps/api/src/services/version-snapshot.ts` — `_versions/chapter_NNNN/v_*.md` 讀寫
- [ ] **be-3**: `apps/api/src/services/prompt-md.ts` — 渲染 + append + marker offset 記錄 + unadopt 切片
- [ ] **be-4**: `apps/api/src/services/undo-store.ts` — `undo_entries` table 讀寫
- [ ] **be-5**: `apps/api/src/routes/adopt.ts` — `POST /adopt` 主流程（→ Scenario 1, 2, 4, 5, 6）
- [ ] **be-6**: `apps/api/src/routes/unadopt.ts` — `POST /unadopt`（→ Scenario 3）
- [ ] **be-7**: 與 spec 007 的 JobQueue 整合（採用尾端 enqueue status-update）
- [ ] **fe-1**: 二次確認對話框（→ Scenario 1, 2）
- [ ] **fe-2**: 採用按鈕綠色強調 + 進度顯示（→ Scenario 1）
- [ ] **fe-3**: undo 整合：採用後從 response 取 undoEntry 推進編輯器 undo stack（呼叫 unadopt API）
- [ ] **fe-4**: 「您在草稿產生後修改了上下文」確認流程（DRAFT_STALE → force: true）
- [ ] **qa-1**: cucumber-js step definitions for `006.feature`
- [ ] **qa-2**: rollback 路徑測試：模擬 fsync 失敗、rename 衝突
- [ ] **qa-3**: 端對端：產 draft → adopt → 主檔內容、prompt.md、snapshot 三個檔案斷言

## 變更紀錄

- `2026-05-10`: 初版 Ready
