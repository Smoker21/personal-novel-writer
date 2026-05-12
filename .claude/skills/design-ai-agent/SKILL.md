---
name: design-ai-agent
description: Design a new in-product AI capability — either an Agent (autonomous multi-step flow, e.g. chapter-writer, character-designer) under docs/agents/, or a Skill (single-shot operation, e.g. polish-prose, shorten) under docs/skills/. Outputs a spec — not implementation code. Use when the user wants to add or revise any AI assistant feature. Naming and layering follow ADR-0002.
---

# Design AI Agent or Skill

## When to use

- 「設計一個故事創作代理」（→ Agent）
- 「我想加一個檢查角色台詞是否符合人設的 AI」（→ Agent，因為要查 character.md）
- 「優化現有的文筆潤飾的提示詞」（→ Skill，因為是單次操作）
- 「加一個『改成更口語』的選取工具」（→ Skill）

## Steps

1. **判斷類別**：先判定是 Agent 還是 Skill。依 ADR-0002 的口訣「Agent 是誰、Skill 是做什麼」：
   - 自主多步、會做決策、產出整段成果 → **Agent**（命名用名詞職稱）
   - 單次、選取輸入、明確輸出 → **Skill**（命名用動詞片語）
   - 邊界模糊時 AskUserQuestion 確認
2. **讀情境**：
   - Agent → Read `docs/agents/_template.md` 與既有 `docs/agents/*.md`
   - Skill → Read `docs/skills/_template.md` 與既有 `docs/skills/*.md`
   - 兩者都 Read `docs/architecture/adr/0002-agent-skill-naming.md` 確認命名規則
3. **AskUserQuestion 釐清**：
   - 此 Agent / Skill 的**單一職責**是什麼？（一句話）
   - 在 UI 哪裡觸發？
   - 上層會餵什麼上下文？
   - 輸出格式：純文字、多選方案、JSON？
   - 預期模型大小：地端 7B / 14B / 雲端旗艦？
4. **產出**：
   - Agent → `docs/agents/<slug>.md`（套 `docs/agents/_template.md`）
   - Skill → `docs/skills/<slug>.md`（套 `docs/skills/_template.md`）
   - 若已建 `packages/prompt-library/`：對應 `prompts/<slug>.ts`（Agent）或 `prompts/skills/<slug>.ts`（Skill）
5. **檔頭三句話**：強制 frontmatter 之後寫「這是什麼 / 何時用 / 不做什麼」（ADR-0002 強制要求）
6. **驗收條件**：每個 Agent / Skill 至少給 3 條可觀察的驗收條件
7. **失敗模式**：列出至少 2 個已知會失敗的情境與緩解

## Critical rules

- **此規格不是讓 Claude Code 扮演的角色**。提示詞要寫得讓另一個 LLM 在執行時讀到後表現一致
- 假設執行時**沒有完整小說 context**——上層只會餵摘要與相關片段，提示詞要尊重這個限制
- Agent 預設提供**多方案**而非單一答案；Skill 是單次變換，不需多方案
- 中文小說情境用繁體中文寫提示詞
- 命名用 kebab-case：Agent 用名詞（`character-designer`），Skill 用動詞（`polish-prose`）

## Output checklist

- [ ] 檔案位置正確（Agent 在 `docs/agents/`、Skill 在 `docs/skills/`）
- [ ] 檔頭三句話齊全（這是什麼 / 何時用 / 不做什麼）
- [ ] frontmatter 含 `name`、`type: agent | skill`、`description`
- [ ] 完整段落（見對應 `_template.md`）
- [ ] 至少 3 條可觀察的驗收條件
- [ ] 至少 2 個失敗模式 + 緩解
- [ ] 模型建議含「雲端首選」「地端最小可行」
