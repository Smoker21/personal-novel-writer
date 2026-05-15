import type { AutoScore } from "../../types.js";
import { countChineseChars } from "../../utils/text.js";

/**
 * Simplified-only characters that *strongly* differ from their traditional form.
 * Each entry is a simplified character with no orthographic overlap with traditional usage.
 * (Some characters like 干/幹/乾 are ambiguous; we exclude them.)
 */
const SIMPLIFIED_ONLY = new Set([
  "这",
  "为",
  "来",
  "过",
  "会",
  "时",
  "样",
  "现",
  "见",
  "话",
  "说",
  "种",
  "门",
  "对",
  "没",
  "还",
  "进",
  "让",
  "学",
  "国",
  "实",
  "应",
  "发",
  "于",
  "万",
  "几",
  "谁",
  "买",
  "卖",
  "听",
  "热",
  "湿",
  "灵",
  "灯",
  "无",
  "动",
  "认",
  "识",
  "议",
  "课",
  "记",
  "讲",
  "请",
  "证",
  "诗",
  "读",
  "谁",
  "书",
  "马",
  "鸟",
  "鱼",
  "鸡",
  "鸭",
  "龙",
  "贝",
  "贵",
  "财",
  "费",
  "贫",
  "贺",
  "页",
  "题",
  "颜",
  "类",
  "鸣",
  "丽",
  "举",
  "亲",
  "亿",
  "仅",
  "仪",
  "传",
  "伟",
  "体",
  "余",
  "侠",
  "侦",
  "俭",
  "倾",
  "偿",
  "儿",
  "党",
  "兴",
  "军",
  "农",
  "冯",
  "冲",
  "击",
  "决",
  "况",
  "净",
  "凉",
  "减",
  "刚",
  "刘",
  "则",
  "创",
  "办",
  "动",
  "务",
  "厂",
  "厅",
  "历",
  "县",
  "参",
  "双",
  "发",
  "变",
  "叠",
  "号",
  "团",
  "园",
  "围",
  "图",
  "国",
  "圆",
  "块",
  "坚",
  "垄",
  "垒",
]);

const _SIMPLIFIED_PUNCTUATION = ["「", "」"]; // not relevant; we only check chars

export interface TraditionalScoreOpts {
  /** when ratio above this → fail */
  failRatio?: number; // default 0.05 (5%)
  partialRatio?: number; // default 0.005 (0.5%)
}

export function scoreTraditionalChinese(text: string, opts: TraditionalScoreOpts = {}): AutoScore {
  const failRatio = opts.failRatio ?? 0.05;
  const partialRatio = opts.partialRatio ?? 0.005;
  const total = countChineseChars(text);
  if (total === 0) {
    return { score: null, explanation: "_/5 — 沒有中文字，無法判定" };
  }
  const hits: string[] = [];
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.has(ch)) hits.push(ch);
  }
  const ratio = hits.length / total;
  const seen = [...new Set(hits)].slice(0, 10);
  if (hits.length === 0) {
    return { score: 5, explanation: "5/5 — 全文未發現簡體獨用字" };
  }
  if (ratio < partialRatio) {
    return {
      score: 4,
      explanation: `4/5 — 偶有簡體字（${hits.length} 個 / ${total} 字，${(ratio * 100).toFixed(2)}%）：${seen.join(" ")}`,
      evidence: seen,
    };
  }
  if (ratio < failRatio) {
    return {
      score: 3,
      explanation: `3/5 — 部分簡體（${hits.length} 個 / ${total} 字，${(ratio * 100).toFixed(2)}%）：${seen.join(" ")}`,
      evidence: seen,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 大量簡體（${hits.length} / ${total}，${(ratio * 100).toFixed(2)}%）：${seen.join(" ")}`,
    evidence: seen,
  };
}
