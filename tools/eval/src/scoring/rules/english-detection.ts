import { AutoScore } from "../../types.js";

/**
 * Detects ASCII English words. Single letters in the middle of math / "AI" etc. are excluded
 * by requiring 2+ alphabetic chars in a row. Numbers don't count.
 */
export function findEnglishWords(text: string): string[] {
  // 1+ alphabetic characters (and the typical word punctuation in the middle)
  const matches = text.match(/[A-Za-z]+(?:['\-][A-Za-z]+)*/g) ?? [];
  return matches;
}

export function scoreEnglishAvoidance(text: string): AutoScore {
  const words = findEnglishWords(text);
  if (words.length === 0) {
    return { score: 5, explanation: "5/5 — 完全沒有英文詞" };
  }
  const sample = words.slice(0, 8);
  if (words.length <= 2) {
    return {
      score: 4,
      explanation: `4/5 — 偶現 ${words.length} 個英文：${sample.join(", ")}`,
      evidence: sample,
    };
  }
  if (words.length <= 5) {
    return {
      score: 3,
      explanation: `3/5 — 出現 ${words.length} 個英文：${sample.join(", ")}`,
      evidence: sample,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 大量英文（${words.length} 個）：${sample.join(", ")}`,
    evidence: sample,
  };
}
