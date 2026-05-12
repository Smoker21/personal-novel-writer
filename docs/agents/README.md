# 產品內 Agent

> **這是什麼**：應用程式內**自主多步流程**的 AI 角色規格。每個 Agent 在執行時會讀章節 / 角色 / 狀態，多輪呼叫 LLM，產出整段成果。
> **何時用**：寫一個會跑流程、做決策的 AI 角色（例：自動產出整章草稿）時。
> **不做什麼**：單次明確輸入輸出的操作（那是 `docs/skills/` 的事）；開發期的 Claude Code 子代理（那是 `.claude/agents/`）。

---

## 與 Claude Code 開發期 Agent 的差別

| 維度 | `.claude/agents/`（開發期） | `docs/agents/`（產品內） |
|------|---------------------------|--------------------------|
| 由誰扮演 | Claude Code 自己 | apps/api 在執行時呼叫 LLM |
| 服務對象 | 開發者 | 應用使用者 |
| 例子 | product-manager、spec-architect | story-creator、chapter-writer |

兩者都用 `.md` + frontmatter，但**不互相替代**。寫程式時要清楚自己在哪一層。

## 命名與檔頭規則

見 [ADR-0002](../architecture/adr/0002-agent-skill-naming.md)。重點：

- 用**名詞職稱**命名（`story-creator` 而非 `create-story`）
- kebab-case，副檔名 `.md`
- 開頭強制三句話：「這是什麼 / 何時用 / 不做什麼」

## 三層解析順序

執行時，同名 Agent 解析順序：

```
<project>/agents/<name>.md          (專案 override，最高)
       ↑ fallback
~/.novel-writer/agents/<name>.md    (使用者全域)
       ↑ fallback
<bundled defaults>                   (應用內建出貨)
```

`docs/agents/` 中的設計即為應用內建 default，會在打包時複製到 `~/.novel-writer/agents/`。

## 規劃中的 Agent（建議起點）

> 實際以 stories 與 PM 排序為準，這裡只是腦力激盪。

- **story-creator** — 故事創作。從大綱、人物、世界觀產出章節大綱與寫作計畫，待使用者確認後進入逐章撰寫
- **chapter-writer** — 章節寫手。讀章節大綱 + character_status + story_status，產出整章草稿
- **chapter-titler** — 章節命名。讀完成的章節內容，產出標題
- **status-updater** — 狀態更新。從採用版本提煉劇情演進與人物關係變化，更新 `story_status.md` / `character_status.md`，並嚴守 token 上限
- **character-designer** — 角色設計。從輸入屬性（MBTI / 星座 / 三圍 / 圖片）彙整成角色卡
- **scene-builder** — 場景建構。從時代 / 背景挑選參考，產出可用的世界觀片段，避免時代錯置
- **continuity-checker** — 連貫性檢查。對照前文摘要，找出設定矛盾
- **reviewer** — 審稿。根據故事背景做文件內容建議

## 設計新 Agent 請用 `design-ai-agent` skill

對應檔案：`docs/agents/<slug>.md`，提示詞模板對應 `packages/prompt-library/prompts/<slug>.ts`。

## 設計原則

1. **單一職責**：每個 Agent 只做一件事
2. **建議而非取代**：預設多方案輸出，由使用者選擇
3. **不假設整本書在 context**：上層只餵摘要 + 相關片段
4. **可驗收的輸出**：寫得出 golden test 的性質
5. **能在地端跑**：標註最小可行模型大小，重度任務才獨佔旗艦雲端模型
