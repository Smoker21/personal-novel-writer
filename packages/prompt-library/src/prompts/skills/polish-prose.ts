/**
 * polish-prose Skill — 普通 LLM provider path 的 prompt template。
 *
 * xiaohuangwen path 不使用本模組（API 端內建 prompt engineering）。
 *
 * 參照：
 *   - docs/skills/polish-prose.md §5 System prompt
 *   - docs/skills/polish-prose.md §5 User message template
 *   - docs/architecture/specs/012-polish-prose-flow.md
 */

export interface PolishProsePromptInput {
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  /** 空字串 = 自由潤飾 */
  polishInput: string;
}

export interface PolishProsePrompt {
  systemPrompt: string;
  userMessage: string;
}

const SYSTEM_PROMPT = `你是繁體中文小說的潤稿編輯。任務是對使用者選取的段落做用詞與節奏的微調潤飾。

規則（不可違反）：
1. 不增加或刪除任何情節事件
2. 不修改角色名稱（即使罕見字也保留原樣）
3. 不修改對白的實質內容（只可調整周邊敘述）
4. 不修改時序、視角、時態
5. 不擴寫、不縮寫至改變段落長度大幅變化（± 30% 內）
6. 保持原作者的整體文風（不擅自轉換語氣，例如把第一人稱寫成第三人稱）
7. 保留段落分隔（若選取文字含有 \\n\\n，輸出中必須保留）

輸入會包含：
- 選取段落（要潤的對象）
- 選取段落前後文（僅供銜接參考，不可修改）
- 使用者潤稿指令（若為空，做保守自由潤飾）

只回傳潤後的選取段落，不要解釋、不要 markdown 包裝、不要 \`\`\`code fence\`\`\`。`;

/**
 * 組 polish-prose 的 system prompt + user message。
 *
 * @param input - 潤稿輸入（selectedText 為必填；其餘可選）
 * @returns `{ systemPrompt, userMessage }` — 直接傳給 LLMRouter.stream()
 */
export function buildPolishProsePrompt(input: PolishProsePromptInput): PolishProsePrompt {
  const { selectedText, contextBefore, contextAfter, polishInput } = input;

  const parts: string[] = [];

  if (contextBefore && contextBefore.trim().length > 0) {
    parts.push(`【前文（不可修改）】\n${contextBefore}`);
  }

  parts.push(`【選取段落（請潤稿）】\n${selectedText}`);

  if (contextAfter && contextAfter.trim().length > 0) {
    parts.push(`【後文（不可修改）】\n${contextAfter}`);
  }

  const instruction =
    polishInput.trim().length > 0 ? polishInput.trim() : "（無特別指令，請做保守潤飾）";
  parts.push(`【使用者指令】\n${instruction}`);

  return {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: parts.join("\n\n"),
  };
}
