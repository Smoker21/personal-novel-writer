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

## 已設計的 Skill（Designed）

| Slug | Status | 規格 | 受 style.md 影響 |
|---|---|---|---|
| [status-updater](./status-updater.md) | Designed | docs/skills/status-updater.md | ❌（結構化資料） |
| [status-shortener](./status-updater.md#附錄status-shortener-skill) | Designed | 附於 status-updater 檔末 | ❌ |
| [character-card-consolidator](./character-card-consolidator.md) | Designed | docs/skills/character-card-consolidator.md | ❌（設定文件） |
| **[character-image-extractor](./character-image-extractor.md)** | **Designed 2026-05-13** | docs/skills/character-image-extractor.md | ❌（vision 解析→設定欄位） |

## 規劃中的 Skill（v0.2+，未設計）

| Slug | 用途 | 受 style.md 影響 | 對應 Story |
|---|---|---|---|
| polish-prose | 潤飾選取段落 | ✅ | 021 |
| shorten | 精簡段落 | ✅ | 021 |
| expand | 擴展段落 | ✅ | 021 |
| make-dialogue-natural | 對白口語化 | ✅ | 021 |
| add-sensory-details | 補感官描寫 | ✅ | 021 |
| rewrite-as-style | 改寫為指定風格 | ✅ | 021 |

## 設計原則

1. **單次完成**：一次呼叫一個結果（Agent 才會跑多步）
2. **可逆**：每次套用都產生可 undo 的版本，使用者隨時可回退
3. **明確邊界**：禁止改動的範圍（角色名、情節、章節結構）必須寫死在提示詞
4. **可驗收**：每個 Skill 至少 3 條可觀察的不變性，能寫成 golden test
