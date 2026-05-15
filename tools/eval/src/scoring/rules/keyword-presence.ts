import type { AutoScore } from "../../types.js";

export interface KeywordRule {
  /** Phrase to find */
  pattern: RegExp;
  description: string;
}

export function scoreKeywordPresence(text: string, rule: KeywordRule): AutoScore {
  if (rule.pattern.test(text)) {
    return { score: 5, explanation: `5/5 — 偵測到「${rule.description}」` };
  }
  return {
    score: 1,
    explanation: `1/5 — 未偵測到「${rule.description}」`,
  };
}

export function scoreNeighborProposal(text: string): AutoScore {
  // outline says: "林書言提議幫蘇晴問認識的老鄰居"
  const hasNeighbor = /鄰居/.test(text);
  const hasAsk = /問|請|找|拜託/.test(text);
  if (hasNeighbor && hasAsk) {
    return {
      score: 5,
      explanation: "5/5 — 提到「鄰居」且有詢問動作",
    };
  }
  if (hasNeighbor) {
    return {
      score: 3,
      explanation: "3/5 — 提到「鄰居」但沒明確的詢問動作",
    };
  }
  return { score: 1, explanation: "1/5 — 未提到「鄰居」" };
}
