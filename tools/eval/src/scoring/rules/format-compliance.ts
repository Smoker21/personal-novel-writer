import type { AutoScore } from "../../types.js";
import { countChineseChars, longestCommonSubstring } from "../../utils/text.js";

export function scoreStatusFormat(text: string): AutoScore {
  const hasStory = /^##\s*story_status\.md/m.test(text);
  const hasChar = /^##\s*character_status\.md/m.test(text);
  if (hasStory && hasChar) {
    return { score: 5, explanation: "5/5 — 兩個 Markdown heading 都正確" };
  }
  if (hasStory || hasChar) {
    const which = hasStory ? "story_status.md" : "character_status.md";
    return {
      score: 3,
      explanation: `3/5 — 只找到 ${which}，缺另一個`,
    };
  }
  if (/story_status/.test(text) && /character_status/.test(text)) {
    return {
      score: 3,
      explanation: "3/5 — 兩個關鍵字都出現，但沒用 ## heading 格式",
    };
  }
  return { score: 1, explanation: "1/5 — 找不到 story_status / character_status 段落" };
}

export interface StatusBudgetOpts {
  storyMax: number;
  charMax: number;
}

interface SectionExtract {
  story: string;
  character: string;
}

function extractStatusSections(text: string): SectionExtract {
  const storyM = /^##\s*story_status\.md\s*\n([\s\S]*?)(?=\n##\s|\n*$)/m.exec(text);
  const charM = /^##\s*character_status\.md\s*\n([\s\S]*?)(?=\n##\s|\n*$)/m.exec(text);
  return {
    story: storyM?.[1] ?? "",
    character: charM?.[1] ?? "",
  };
}

export function scoreStatusBudget(text: string, opts: StatusBudgetOpts): AutoScore {
  const { story, character } = extractStatusSections(text);
  const storyN = countChineseChars(story);
  const charN = countChineseChars(character);
  const storyOk = storyN > 0 && storyN <= opts.storyMax;
  const charOk = charN > 0 && charN <= opts.charMax;
  if (storyOk && charOk) {
    const margin =
      Math.min(opts.storyMax - storyN, opts.charMax - charN) /
      Math.max(opts.storyMax, opts.charMax);
    if (margin >= 0.3) {
      return {
        score: 5,
        explanation: `5/5 — story=${storyN}/${opts.storyMax}、char=${charN}/${opts.charMax}，仍有 30% 餘裕`,
      };
    }
    return {
      score: 4,
      explanation: `4/5 — story=${storyN}/${opts.storyMax}、char=${charN}/${opts.charMax}，已用接近上限`,
    };
  }
  if (storyN === 0 && charN === 0) {
    return { score: null, explanation: "_/5 — 找不到任何 status 段落" };
  }
  if (!storyOk && !charOk) {
    return {
      score: 1,
      explanation: `1/5 — 兩段都超限：story=${storyN}/${opts.storyMax}、char=${charN}/${opts.charMax}`,
    };
  }
  const which = !storyOk ? "story" : "character";
  return {
    score: 1,
    explanation: `1/5 — ${which} 超限：story=${storyN}/${opts.storyMax}、char=${charN}/${opts.charMax}`,
  };
}

export function scoreNotCopiedFromInput(
  output: string,
  originalChapter: string,
  threshold = 30,
): AutoScore {
  const lcs = longestCommonSubstring(output, originalChapter);
  if (lcs <= threshold / 2) {
    return { score: 5, explanation: `5/5 — 最長共同子字串 ${lcs} 字，全部濃縮重寫` };
  }
  if (lcs <= threshold) {
    return {
      score: 3,
      explanation: `3/5 — 最長共同子字串 ${lcs} 字，部分原句搬運`,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 最長共同子字串 ${lcs} 字，疑似抄原文`,
  };
}
