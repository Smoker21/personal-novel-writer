import { AutoScore } from "../../types.js";

export interface ParsedJson {
  ok: boolean;
  parsed?: unknown;
  cleanedFromFence?: boolean;
  error?: string;
}

const FENCE_RE = /^\s*```(?:json)?\s*([\s\S]*?)```\s*$/i;

export function tryParseJson(text: string): ParsedJson {
  const trimmed = text.trim();
  try {
    return { ok: true, parsed: JSON.parse(trimmed) };
  } catch {
    // try fence
    const m = FENCE_RE.exec(trimmed);
    if (m) {
      try {
        return { ok: true, parsed: JSON.parse(m[1].trim()), cleanedFromFence: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    // try first {...} block
    const objMatch = /\{[\s\S]*\}/.exec(trimmed);
    if (objMatch) {
      try {
        return { ok: true, parsed: JSON.parse(objMatch[0]), cleanedFromFence: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    return { ok: false, error: "no parsable JSON found" };
  }
}

export function scoreJsonValidity(text: string): AutoScore {
  const r = tryParseJson(text);
  if (r.ok && !r.cleanedFromFence) {
    return { score: 5, explanation: "5/5 — 純 JSON 可直接 JSON.parse" };
  }
  if (r.ok && r.cleanedFromFence) {
    return {
      score: 3,
      explanation: "3/5 — 含 markdown fence / 廢話前後綴，去除後可解析",
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 無法解析為 JSON：${r.error}`,
  };
}

export interface TC04Schema {
  wordCount?: unknown;
  characters?: unknown;
  mood?: unknown;
}

export function scoreTC04Fields(parsed: unknown): AutoScore {
  if (!parsed || typeof parsed !== "object") {
    return { score: 1, explanation: "1/5 — 不是 JSON 物件" };
  }
  const obj = parsed as TC04Schema;
  const issues: string[] = [];
  if (typeof obj.wordCount !== "number") issues.push("wordCount 非 number");
  if (
    !Array.isArray(obj.characters) ||
    !obj.characters.every((c) => typeof c === "string")
  ) {
    issues.push("characters 非 string[]");
  }
  if (typeof obj.mood !== "string") issues.push("mood 非 string");
  if (issues.length === 0) {
    if (typeof obj.mood === "string" && obj.mood.length > 8) {
      return { score: 3, explanation: `3/5 — 全欄位但 mood 過長（${obj.mood.length} 字）` };
    }
    return { score: 5, explanation: "5/5 — 全欄位且型別正確" };
  }
  if (issues.length === 1) {
    return { score: 3, explanation: `3/5 — ${issues[0]}` };
  }
  return { score: 1, explanation: `1/5 — ${issues.join("；")}` };
}

export function scoreTC04Characters(parsed: unknown): AutoScore {
  if (!parsed || typeof parsed !== "object") {
    return { score: 1, explanation: "1/5 — 不是 JSON 物件" };
  }
  const obj = parsed as TC04Schema;
  if (!Array.isArray(obj.characters)) {
    return { score: 1, explanation: "1/5 — characters 不存在或不是陣列" };
  }
  const set = new Set(obj.characters.filter((c): c is string => typeof c === "string"));
  const expected = ["蘇晴", "林書言"];
  const missing = expected.filter((e) => !set.has(e));
  const extra = [...set].filter((c) => !expected.includes(c));
  if (missing.length === 0 && extra.length === 0) {
    return { score: 5, explanation: "5/5 — 完全包含「蘇晴」「林書言」且無多餘" };
  }
  if (missing.length === 0 && extra.length > 0) {
    return {
      score: 3,
      explanation: `3/5 — 全對，但多了：${extra.join("、")}`,
      evidence: extra,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 缺：${missing.join("、")}；多：${extra.join("、") || "（無）"}`,
    evidence: missing,
  };
}
