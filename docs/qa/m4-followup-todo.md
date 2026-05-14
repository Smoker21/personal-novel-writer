# M4 QA Follow-up — 交接 Todo

> **狀態快照**：2026-05-15
> **背景**：M4 milestone 已完成 release v0.1.0。後續 UX review + BDD review 發現 5 個 bug 已修（commit `288a9cc`）。本文件記錄**剩餘待辦**供下個 dev session 接手。
> **基線**：所有 tests pass（406/406），typecheck 5 packages 全綠。

---

## ✅ 已完成的修復（2026-05-15）

| Bug ID | 嚴重度 | 修復內容 | Commit |
|---|---|---|---|
| BUG-A | P0 | 前端 chapters API 拿掉 trailing slash | `288a9cc` |
| BUG-D | P0 | adopt 路徑重複拼接（`join(projectPath, chapter.path)` → `chapter.path`） | `288a9cc` |
| BUG-02 | P0 | 初始角色卡改用 YAML frontmatter 格式 + 建立 `<slug>_status.md` | `288a9cc` |
| BUG-B | P1 | `provider-tester` 友善錯誤訊息（繁中、區分地端/雲端） | `288a9cc` |
| BUG-C | P1 | `NewProjectDialog` disabled 按鈕加 amber 提示 + tooltip | `288a9cc` |

---

## 🔴 P0 — 必修（影響核心使用）

### TD-1：完成 StatusEditorPage 直接寫檔（M3 遺留 pol-9）

**現狀**：StatusEditorPage 只有「複製內容」按鈕，使用者必須手動貼到 .md 檔。  
**根因**：缺 `POST /api/projects/:hash/status/write` endpoint，前端只能 clipboard.writeText。  
**做法**：
1. 後端新增 `POST /api/projects/:hash/status/write` 接受 `{ fileType: 'story' | 'character', characterSlug?, content }`
2. 使用 atomicWriteFile 寫到 `status/story_status.md` 或 `characters/<slug>_status.md`
3. 寫入後自動 git commit「status: manual edit」
4. 前端把「複製內容」改名為「儲存」並接這個 endpoint
5. 失敗時保留 textarea 內容，顯示錯誤
6. 「複製內容」改為次要功能（icon button）

**檔案**：
- 新建：`apps/api/src/routes/status.ts` 新增 endpoint
- 修改：`apps/web/src/features/status/StatusEditorPage.tsx`

---

### TD-2：BUG-03 hash 長度不一致

**現狀**：兩個 hash 函數同時存在：
- `apps/api/src/services/recent-projects-store.ts::hashPath` → `slice(0, 16)`
- `apps/api/src/services/project-resolver.ts::hashProjectPath` → `slice(0, 8)`

`resolveProjectPath` 比對時，stored 16-char vs computed 8-char，**靠巧合**運作（前 8 字元相同）。任何 path normalize 差異就會破。

**已觀察症狀**：settings.yaml 中同一個專案出現兩個項目（forward slash + back slash 路徑各一個 hash）。

**做法**：
1. 統一改為 8-char 或 16-char（建議 16-char 降低碰撞風險）
2. 寫 migration：讀 settings.yaml 時補正 hash
3. 同時修正路徑 normalize（一律用 `path.normalize` 確保斜線方向）

**檔案**：
- `apps/api/src/services/recent-projects-store.ts`
- `apps/api/src/services/project-resolver.ts`
- 加 migration test

---

### TD-3：清理 settings.yaml 中的重複專案

**現狀**：UX 截圖（A1-HomePage）顯示 4 個 recent projects 但實際只有 3 個獨立專案，因 path 斜線差異造成重複。  
**做法**：
- TD-2 修完後寫 migration 自動 dedupe
- 或加 `path.resolve` 確保 stored path 一致

---

## ⚠️ P1 — 重要（影響使用體驗）

### TD-4：Pol-1 Light/Dark 模式統一

**現狀**：
- Light：HomePage、SettingsPage、NewProjectDialog、ChapterEditorPage
- Dark：CharactersPage、CharacterEditor、StatusEditorPage

切換頁面有明顯跳切感。

**做法**：
1. 新增 design token（Tailwind v4 `@theme`）：`--color-bg-primary`、`--color-text-primary` 等
2. 決定全域用 Dark 或讓使用者切換（建議：v0.1 鎖定 Dark，v0.2 再加切換）
3. 改寫所有頁面用 token 而非寫死 `bg-white`/`bg-neutral-950`

**檔案**：
- `apps/web/src/index.css`（design token）
- 全部 features/*/*.tsx（替換背景色）

**範圍**：~20 個檔案、估 1 個 PR

---

### TD-5：On-4 Agent routing「未設定」紅字警告

**現狀**：設定頁所有 Agent dropdown 顯示「未設定」但沒有任何警示，使用者不知道這會導致 AI 功能全不能用。  
**做法**：
1. `AgentRoutingCard` 偵測 `primary === ''` 或 `undefined`
2. 顯示橘色文字「⚠️ 未設定 — 此 Agent 無法使用」
3. 整體儲存前若還有未設定的，「儲存」按鈕加警示樣式（不擋儲存，僅提示）

**檔案**：
- `apps/web/src/features/settings/AgentRoutingCard.tsx`

---

### TD-6：Pol-6 統一 loading spinner

**現狀**：各處 loading 提示不一致（「載入中…」純文字、ChapterEditor 中央灰字、設定頁無 spinner）。  
**做法**：
1. 抽 `<Spinner />` 元件（svg + Tailwind 動畫）
2. 統一各 loading 使用
3. 「+ 新章節」失敗時加 toast 提示（目前是靜默失敗）

**檔案**：
- 新建：`apps/web/src/components/Spinner.tsx`
- 取代各處：`apps/web/src/features/**/*.tsx`

---

### TD-7：Provider card 折疊指示

**現狀**：Provider 卡片預設折疊，只看名稱 + 啟用 checkbox，**沒有展開指示**，使用者不知道可以點開。  
**做法**：
1. 卡片右側加 `▶`（折疊）/`▼`（展開）icon
2. 點卡片任何位置都能展開（不只 checkbox）
3. 或：直接預設展開（簡化邏輯）

**檔案**：
- `apps/web/src/features/settings/ProviderCard.tsx`

---

### TD-8：CharactersPage 加「歷史」按鈕（10.10）

**現狀**：歷史按鈕只在 ChapterEditorPage 工具列。角色卡修改後 git 有 commit，但 UI 沒有入口看歷史。  
**做法**：
1. CharactersPage 工具列加「歷史」按鈕
2. 點開 HistoryPanel，target file 設為 `characters/<slug>.md`
3. 同樣 status 編輯頁也加（檔案：`characters/<slug>_status.md` 或 `status/story_status.md`）

**檔案**：
- `apps/web/src/features/characters/CharactersPage.tsx`
- `apps/web/src/features/status/StatusEditorPage.tsx`

---

### TD-9：FirstLaunchWarningDialog 鎖 ESC + click outside（32.6/7）

**現狀**：spec 要求「不可點外面關掉」「不可 ESC 跳過」，但實作未驗證。可能直接點外面就關閉。  
**做法**：
1. Dialog 元件加 `onBackdropClick` 不關閉
2. `onKeyDown` 攔 ESC（return early）
3. 加測試驗證

**檔案**：
- `apps/web/src/features/startup/FirstLaunchWarningDialog.tsx`

---

## 💡 P2 — 拋光（可延後）

### TD-10：Pol-2 字型 self-host（Noto Serif TC）

讓繁中編輯體驗一致。下載 Noto Serif TC subset，CSS @font-face 載入，editor 用此字型。

---

### TD-11：Pol-3 動畫

Dialog/Drawer slide-in 動畫；採用流程的步驟進度條。

---

### TD-12：Pol-4 a11y（keyboard navigation）

biome 警告的：
- PortraitSection 圖片 onClick 無對應 keyboard event
- HistoryPanel close mask onClick 無 keyboard
- CharacterEditor `<label>` 無對應 `<input>` for/htmlFor

---

### TD-13：Pol-5 空狀態文字對比度

ChapterEditorPage 中央「請從左側選擇或新建章節」文字顏色極淡。  
做法：加 icon（📝）+ 加大字體 + 文字顏色提升對比。

---

### TD-14：CharacterEditor AI 統整敘述區可折疊

固定佔下方 25% 螢幕高度的「AI 統整敘述」區可摺疊（節省表單空間）。

---

### TD-15：親密 tab 摺疊提示

預設摺疊符合 spec 002 2.9，但無視覺提示告知有內容可填。  
做法：摺疊狀態加說明文字「點此展開親密場景描寫」。

---

### TD-16：emoji 改 icon

StatusEditorPage 工具列「保留 🔖/✨ 段」的 emoji 在某些渲染環境顯示為方塊。改用 lucide-react icon。

---

## 🚫 BDD 待補（修完上述後重跑）

### TD-17：Story 006 全部 7 scenarios 重跑（BUG-D 已修）

修 BUG-D 後，採用流程應能完整跑：
- 6.1 採用 AI 草稿並完成歸檔
- 6.2 二次確認取消
- 6.3 採用後 Undo
- 6.4 主檔寫入失敗 rollback
- 6.5 採用空主檔章節
- 6.6 多次採用 prompt.md 累積
- 6.7 有 dirty draft 時採用

跑法：透過 Playwright MCP 或 API（更新 `scripts/bdd-test.mjs` 加 6.x scenarios）。

---

### TD-18：Story 007 補測 7.5/7.6/7.7/7.11

需要 LM Studio 或重新測 Gemini（需新 API key — 舊的應已撤銷）：
- 7.5 AI 精簡 story_status
- 7.6 精簡時勾選 🔖/✨ 段
- 7.7 status-updater 失敗不破壞既有 status
- 7.11 手改 status 後再觸發

---

### TD-19：UX dialogs/flows 待補（修 BUG-A 後）

修 BUG-A 後，編輯器可正常用，以下可補截圖 + 觀察：
- B1 ChapterList（有章節時）
- B2 ChapterEditor (CM6) 實際打字
- B3 DraftPanel（AI 生成中、完成、丟棄）
- B6 HistoryPanel（drawer 開啟）
- C2 ConflictDialog（製造 mtime 衝突）
- C3 MissingProjectDialog（刪除專案資料夾再開）
- C4 FirstLaunchWarningDialog（重置 settings）
- C6 LlmNotConfiguredModal（清空 routing 再點 AI）
- C7 AdoptConfirmDialog（採用前確認）
- D1 採用 11 步事務（端到端跑）
- D2 章節載入衝突偵測
- D3 Window Focus 重檢

---

## 📋 開發環境注意事項

### 必讀

1. **dev:api 啟動**：tsx watch 模式，遇到 `unhandled rejection`（如 fetch 失敗）會 crash，需手動重啟
2. **Bash tool vs PowerShell**：Bash tool 環境**沒有 node**，跑 node/pnpm 必須包 `cmd //c "..."` 或讓使用者在 PowerShell 跑
3. **CRLF 警告**：git add 時會看到 `LF will be replaced by CRLF` 警告，這是 Windows 正常行為
4. **資料路徑**：
   - 測試專案在 `F:\workspace\bdd-test\梅雨中的書卷v2`（hash `d5d426b5`）
   - settings.yaml 在 `~\.novel-writer\settings.yaml`

### 已驗證可用

- ✅ Node v26.1.0（透過 D:\nvm）
- ✅ Playwright MCP（瀏覽器自動化）
- ✅ Chrome DevTools MCP

### Gemini key 安全

⚠️ 之前測試暴露的 Gemini key（`AIzaSyDeVbDyVAH39YMQIM44ha9cw8YTlp025OU`）**請確認已撤銷**。若還沒撤，到 https://aistudio.google.com/app/apikey 立刻撤銷重發。

---

## 🎯 建議優先序

**第一波（1-2 天）**：TD-1（status 寫檔）、TD-17（補測 Story 006）、TD-9（FirstLaunch 鎖 ESC）

**第二波（3-5 天）**：TD-4（design token）、TD-5（routing 警告）、TD-6（spinner 統一）、TD-7（provider 折疊指示）、TD-8（角色卡歷史）

**第三波（5-7 天）**：TD-2（hash 統一）、TD-10~16（拋光項目）

**最後**：TD-18~19（UX/BDD 補測）

---

## 📂 相關文件

- [m4-ux-review-result.md](./m4-ux-review-result.md) — UX 截圖報告（含 16 張截圖 + 16 個 review 區）
- [m4-bdd-ai-result.md](./m4-bdd-ai-result.md) — BDD AI scenarios 結果（含 AI 生成的章節 + status 內容）
- [m4-bdd-review-result.md](./m4-bdd-review-result.md) — BDD 非 AI scenarios 結果
- [ux-screenshots/](./ux-screenshots/) — UX 截圖目錄
- [ai-bdd-output/](./ai-bdd-output/) — AI 生成內容備份
