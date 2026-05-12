# 產品內 Skill

> **這是什麼**：應用程式內**單次明確操作**的 AI 能力規格。每個 Skill 接受明確輸入、回傳明確輸出，不跑多步流程。
> **何時用**：使用者選取一段文字後想對它做某種變換（潤飾、精簡、擴展、口語化…）時。
> **不做什麼**：自主多步流程（那是 `docs/agents/` 的事）；開發期 Claude Code skill（那是 `.claude/skills/`）。

---

## 與 Agent 的差別

| 維度 | Agent (`docs/agents/`) | Skill (`docs/skills/`) |
|------|----------------------|----------------------|
| 性質 | 自主多步流程 | 單次操作 |
| 命名 | 名詞職稱（`chapter-writer`） | 動詞 + 受詞（`polish-prose`） |
| 觸發 | UI 上的角色面板 / 自動流程節點 | 選取文字 → 右鍵 / 工具列按鈕 |
| 輸出 | 整段成果（一章、一份角色卡） | 對輸入的單次變換結果 |
| UI 控件 | 進度 / 中止 / 採用 | 套用 / 取消 / 重做 |

範例對照：
- `chapter-writer`（Agent）寫完一章 → 使用者再用 `polish-prose`（Skill）潤飾其中一段
- `character-designer`（Agent）產角色卡 → 使用者用 `make-dialogue-natural`（Skill）改某句台詞口語

## 與 Claude Code 開發期 Skill 的差別

| 維度 | `.claude/skills/`（開發期） | `docs/skills/`（產品內） |
|------|---------------------------|--------------------------|
| 由誰用 | Claude Code 自己 | 應用使用者 |
| 例子 | write-user-story、create-adr | polish-prose、shorten |

兩者形式相似但用途不同，**不互相替代**。

## 命名與檔頭規則

見 [ADR-0002](../architecture/adr/0002-agent-skill-naming.md)。重點：

- 用**動詞 + 受詞**命名（`polish-prose` 而非 `prose-polisher`）
- kebab-case，副檔名 `.md`
- 開頭強制三句話：「這是什麼 / 何時用 / 不做什麼」

## 三層解析順序

執行時，同名 Skill 解析順序：

```
<project>/skills/<name>.md          (專案 override，最高)
       ↑ fallback
~/.novel-writer/skills/<name>.md    (使用者全域)
       ↑ fallback
<bundled defaults>                   (應用內建出貨)
```

`docs/skills/` 中的設計即為應用內建 default，會在打包時複製到 `~/.novel-writer/skills/`。

## 規劃中的 Skill（建議起點）

> 實際以 stories 與 PM 排序為準。

- **polish-prose** — 潤飾選取段落，禁止改變角色名與情節
- **shorten** — 在保留資訊量的前提下精簡選取段落
- **expand** — 擴展選取段落，補齊細節
- **make-dialogue-natural** — 把對白改得更口語化、更符合該角色設定
- **add-sensory-details** — 補感官描寫（視 / 聽 / 嗅 / 觸 / 味）
- **rewrite-as-style** — 改寫為指定寫作風格

## 設計原則

1. **單次完成**：一次呼叫一個結果（Agent 才會跑多步）
2. **可逆**：每次套用都產生可 undo 的版本，使用者隨時可回退
3. **明確邊界**：禁止改動的範圍（角色名、情節、章節結構）必須寫死在提示詞
4. **可驗收**：每個 Skill 至少 3 條可觀察的不變性，能寫成 golden test
