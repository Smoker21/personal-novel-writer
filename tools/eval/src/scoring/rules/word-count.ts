import type { AutoScore } from "../../types.js";
import { countChineseChars } from "../../utils/text.js";

export interface RangeRuleOpts {
  min: number;
  max: number;
  hardLimitOnly?: boolean; // when true: only the upper bound matters (TC-05)
}

export function scoreWordCountRange(text: string, opts: RangeRuleOpts): AutoScore {
  const n = countChineseChars(text);
  if (opts.hardLimitOnly) {
    if (n <= opts.max) {
      const margin = (opts.max - n) / opts.max;
      const expl =
        margin >= 0.3
          ? `5/5 — ${n} 字，在上限 ${opts.max} 內且仍有 ${(margin * 100).toFixed(0)}% 餘裕`
          : `4/5 — ${n} 字，在上限 ${opts.max} 內但偏緊繃`;
      const score = margin >= 0.3 ? 5 : 4;
      return { score, explanation: expl };
    }
    if (n <= opts.max * 1.5) {
      return {
        score: 3,
        explanation: `3/5 — ${n} 字，小幅超出上限 ${opts.max}（容忍 50% 內）`,
      };
    }
    return {
      score: 1,
      explanation: `1/5 — ${n} 字，嚴重超出上限 ${opts.max}（>1.5×）`,
    };
  }

  if (n >= opts.min && n <= opts.max) {
    return {
      score: 5,
      explanation: `5/5 — ${n} 字，落在 ${opts.min}~${opts.max} 區間`,
    };
  }
  const tolMin = opts.min * 0.7;
  const tolMax = opts.max * 1.3;
  if (n >= tolMin && n <= tolMax) {
    return {
      score: 3,
      explanation: `3/5 — ${n} 字，略偏離 ${opts.min}~${opts.max}（在 ±30% 容忍內）`,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — ${n} 字，嚴重偏離 ${opts.min}~${opts.max}`,
  };
}

export function scoreWordCountRelative(
  text: string,
  baseline: number,
  tolerancePct = 30,
): AutoScore {
  const n = countChineseChars(text);
  const diffPct = (Math.abs(n - baseline) / baseline) * 100;
  if (diffPct <= tolerancePct / 2) {
    return {
      score: 5,
      explanation: `5/5 — ${n} 字（基準 ${baseline}），誤差 ${diffPct.toFixed(0)}%`,
    };
  }
  if (diffPct <= tolerancePct) {
    return {
      score: 3,
      explanation: `3/5 — ${n} 字（基準 ${baseline}），誤差 ${diffPct.toFixed(0)}%（容忍內）`,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — ${n} 字（基準 ${baseline}），誤差 ${diffPct.toFixed(0)}% 過大`,
  };
}
