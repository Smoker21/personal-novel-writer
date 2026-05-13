# 0005. 編輯器選型：CodeMirror 6

- Status: `Accepted`
- Date: `2026-05-12`
- Deciders: spec-architect

## Context

本應用的核心 UX 是「寫小說」。Story 003 / 004 / 006 / 007 全部圍繞編輯器：

- Story 003 章節編輯器（兩層儲存：editor state → IndexedDB → markdown）
- Story 004 Undo / Redo（簡化為用 editor lib 內建合併規則）
- Story 006 採用 AI 草稿（要 transaction API 把 `Ctrl+Z` 一鍵還原採用前狀態）
- Story 007 AI 精簡 status 檔（要在編輯器中視覺標記 `## 🔖 伏筆` / `## ✨ 轉折點` 段）

選錯編輯器會放射性影響上述四個 spec。撰寫 spec 002/003/004/006/007 前必須敲死。

候選來自前輪討論：CodeMirror 6 / TipTap (ProseMirror) / Lexical。

## Decision

採用 **CodeMirror 6（CM6）**。

### 套件清單

```
@codemirror/state            # EditorState、transaction
@codemirror/view             # DOM 顯示
@codemirror/lang-markdown    # Markdown 語法支援
@codemirror/commands         # 內建命令（含 history 整合）
@codemirror/language         # decoration、syntax tree
@codemirror/search           # 找下一個 / 取代（Story 003 提及但非 MVP）
@uiw/react-codemirror        # React wrapper（社群維護，比官方 react-codemirror 活躍）
```

### 整合策略

```
┌──────────────────────────────────────┐
│  React component <ChapterEditor>     │
│  ├─ @uiw/react-codemirror            │
│  ├─ extensions:                      │
│  │    ├─ markdown()                  │
│  │    ├─ history()                   │ ← Story 004
│  │    ├─ EditorView.lineWrapping     │
│  │    ├─ EditorView.updateListener   │ ← Story 003 autosave 觸發
│  │    └─ statusSectionDecoration     │ ← Story 007 🔖/✨ 段視覺
│  └─ stateField: dirtyTracker         │ ← Story 003 兩層儲存狀態
└──────────────────────────────────────┘
```

### 採用流程（Story 006）的 transaction 設計

```ts
const adoptDraft = (view: EditorView, draftText: string) => {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: draftText },
    userEvent: "adopt.chapter-writer",     // 進入 undo stack 的標籤
    annotations: Transaction.userEvent.of("adopt.chapter-writer"),
  });
};
```

`Ctrl+Z` 後 `history` extension 會把整個 adopt transaction 視為一步 undo。

### Story 007 的 `🔖` / `✨` 段視覺

用 `Decoration.line()` 把 `## 🔖 伏筆` 與 `## ✨ 轉折點` heading 下到下個 `##` heading 前的範圍標背景色（淡黃 / 淡紫），讓使用者一眼看到「AI 精簡會跳過這段」。實作走 `EditorView.decorations` of() compute by `syntaxTree`。

## Consequences

**Positive:**

- **純 markdown 寫作體驗**：CM6 對 markdown 是 first-class 支援，不需要 WYSIWYG 包裝層；小說作者打字主要面對純文字
- **中文 IME 穩定度**：CM6 使用 `contenteditable` 但對 IME 的事件處理比 TipTap / Lexical 簡單，較少踩坑
- **Transaction API 完整**：Story 006 / 007 的 atomic undo 與 batch 變更乾淨表達
- **Decoration API 強**：Story 007 的 🔖/✨ 段標記不需要動到 markdown 內容本身
- **Bundle 最小**：核心約 150KB（gzipped），各 extension 按需加；對 Tauri 應用 startup time 友善
- **無 WYSIWYG 假象**：使用者所見即所存（markdown 原始文字），與 .md 檔內容一致；避免「在編輯器看到的是 A、存進去變 B」的怪事

**Negative:**

- **WYSIWYG 需要時要自己做**：未來若要「打 `**bold**` 立刻顯示粗體」的隱藏 markdown syntax 體驗，要寫 decoration（可行但需投入）
- **TS API 門檻較高**：CM6 的型別與 immutable state model 對首次接觸者需 1-2 天適應；但 spec 003/006/007 已抽象掉細節
- **生態小於 Tiptap**：拖放、提及（@mention）、表格等富文本特性沒有現成 extension；MVP 不需要

**Neutral:**

- **手機 / 觸控**：CM6 對行動裝置支援尚可但非首選；本應用為桌面 Tauri 應用，不影響
- **協同編輯**：CM6 有 `@codemirror/collab` 但需自建 backend；本應用個人單機，不需要

## Alternatives considered

### TipTap (ProseMirror)
- Pros: 最易上手；ProseMirror 的 schema 模型強；WYSIWYG 體驗最佳；社群最大
- Cons: bundle 較重（≈ 250KB）；本質是 WYSIWYG（需手刻 markdown serializer 維持「所見即所存」）；中文 IME 偶有 bug；對純 markdown 場景過度設計
- 為何不選：核心 UX 是純 markdown 寫作，TipTap 的優勢（富文本、所見即所得）剛好不是我們要的

### Lexical
- Pros: Meta 出品、現代 React 整合佳、效能好
- Cons: 生態最小；markdown 支援不如 CM6；docs / 範例少；社群尚在成長期
- 為何不選：對 markdown 為中心的應用 maturity 不夠

### Monaco Editor
- Pros: VSCode 同棧，feature 多
- Cons: 體積巨大（> 1MB）；對小說寫作過度（IDE 級工具）；行折斷對長文不友善
- 為何不選：明顯 mismatch

### 自寫 `<textarea>`
- Pros: 零依賴
- Cons: 沒有 transaction、沒有 decoration、沒有正常的 undo/redo、中文 IME 控制困難
- 為何不選：Story 006 的 atomic undo 無法乾淨實作

## 對其他文件的影響

- **Spec 003** 章節編輯器：使用 CM6 EditorState 與 transaction；IndexedDB autosave 透過 `EditorView.updateListener` 觸發；用 `EditorView.lineWrapping` + `markdown()` extension
- **Story 004** Undo / Redo：直接用 `@codemirror/commands` 的 history extension；不再寫自定義合併規則
- **Spec 006** 採用流程：用 `view.dispatch({ changes, userEvent: "adopt.chapter-writer" })` 進入 undo stack 一步
- **Spec 007** AI 精簡 status：用 `Decoration.line()` 標記 `🔖` / `✨` 段；用 syntaxTree 解析 heading 範圍
- **ADR-0008 前端架構**：CM6 與 React 整合走 `@uiw/react-codemirror`；Zustand 中存 editor view ref 與 dirty state

## References

- CodeMirror 6 docs: https://codemirror.net/docs/
- `@uiw/react-codemirror`: https://github.com/uiwjs/react-codemirror
- ProseMirror（TipTap 基底）對 IME 的已知議題：https://github.com/ProseMirror/prosemirror/issues/?q=ime
- Obsidian / Logseq 都用 CM6 作為核心編輯器（驗證了 markdown 為中心場景的成熟度）
