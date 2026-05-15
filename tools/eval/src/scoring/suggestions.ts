import type { CaseResult, EvaluationReport, Suggestion } from "../types.js";
import { countChineseChars } from "../utils/text.js";
import { tryParseJson } from "./rules/json-validity.js";

/**
 * Inspect an EvaluationReport and emit actionable suggestions for the next run.
 * Heuristics here are tuned for the 8 case types in `docs/.../test-cases/`.
 *
 * Each suggestion has a stable `code` so future re-runs can diff "did the fix help?".
 */
export function generateSuggestions(report: EvaluationReport): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const cases = report.cases;
  if (cases.length === 0) return suggestions;

  // ---------- 1. max_tokens hits (per-case + global summary) ----------
  const maxedOut = cases.filter((c) => c.finishReason === "max_tokens");
  for (const c of maxedOut) {
    suggestions.push({
      code: `MAX_TOKENS_${labelKey(c)}`,
      title: `${labelHuman(c)} 撞 max_tokens`,
      scope: c.caseId,
      area: "sampling",
      body: `${labelHuman(c)} 用滿了 ${c.maxTokens} tokens 還沒停。下次降低 max_tokens 或加更多 stop tokens。`,
    });
  }
  if (cases.length >= 3 && maxedOut.length / cases.length >= 0.3) {
    suggestions.push({
      code: "FREQ_MAX_TOKENS",
      title: "多數 case 撞上 max_tokens 沒自然停止",
      scope: "global",
      area: "sampling",
      body: `${maxedOut.length}/${cases.length} cases finish_reason=max_tokens（${labelList(maxedOut)}）。代表模型沒在自然字數收筆。下次試：(a) 加 stop sequences（"\\n\\nUser:" 已加，可加 "請寫到此為止" 之類的軟 stop）；(b) frequency_penalty 從 0.4 拉到 0.6；(c) 對應 case 的 max_tokens 降一點，反正模型不停就硬截。`,
    });
  }

  // ---------- 2. degenerate (very short) outputs on long-form cases ----------
  const shortNarrative = cases.filter((c) => {
    const isLongForm = ["TC-01", "TC-02", "TC-03", "TC-07"].includes(c.caseId);
    return isLongForm && c.usage.outputTokens > 0 && c.usage.outputTokens < 80;
  });
  for (const c of shortNarrative) {
    suggestions.push({
      code: `SHORT_OUTPUT_${labelKey(c)}`,
      title: `${labelHuman(c)} 模型只回了 ${c.usage.outputTokens} tokens`,
      scope: c.caseId,
      area: "endpoint",
      body: `Long-form 任務但只生 ${c.usage.outputTokens} tokens，模型可能進「客服模式」。第一個試法：切到 \`/v1/completions\` 端點（CLI 已支援 \`--mode completions\`）。第二個試法：在 user prompt 末尾加「請直接開始寫，不要詢問」。`,
    });
  }

  // ---------- 3. JSON parse failures (TC-04 4-1) ----------
  const tc041 = cases.find((c) => c.caseId === "TC-04" && c.subtest === "4-1");
  if (tc041) {
    const r = tryParseJson(tc041.output);
    if (!r.ok) {
      suggestions.push({
        code: "TC04_JSON_UNPARSEABLE",
        title: "TC-04 4-1 JSON 不可解析",
        scope: "TC-04",
        area: "prompt",
        body:
          "chat 端點下模型沒回出純 JSON。下次試：(a) 在 prompt 加 1-2 個 few-shot 範例（input → expected JSON）；" +
          `(b) 改 \`--mode completions\` 並把 prompt 結尾停在 \`{\` 引導續寫；(c) 強制 \`response_format: { type: "json_object" }\` 若 runtime 支援。`,
      });
    } else if (r.cleanedFromFence) {
      suggestions.push({
        code: "TC04_JSON_FENCED",
        title: "TC-04 4-1 JSON 被 markdown fence 包住",
        scope: "TC-04",
        area: "prompt",
        body:
          "JSON 可解但需要去除 fence。Prompt 已經明示「不要加 markdown code fence」仍無效。" +
          `下次試：在 prompt 末尾再強調一次（RWKV 對末尾敏感），或加 stop sequence "\\n\`\`\`" 截斷 fence。`,
      });
    }
  }

  // ---------- 4. simplified Chinese drift ----------
  const driftedCases: CaseResult[] = [];
  const SIMPLIFIED_DETECT = new Set([
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
  ]);
  for (const c of cases) {
    const total = countChineseChars(c.output);
    if (total < 100) continue; // too short to judge
    let simp = 0;
    for (const ch of c.output) if (SIMPLIFIED_DETECT.has(ch)) simp++;
    if (simp / total > 0.005) driftedCases.push(c);
  }
  if (driftedCases.length > 0) {
    suggestions.push({
      code: "SIMPLIFIED_DRIFT",
      title: `${driftedCases.length} 個 case 出現簡體漂移`,
      scope: "global",
      area: "prompt",
      body: `${labelList(driftedCases)} 偵測到簡體獨用字 > 0.5%。RWKV World 系列訓練混了多語料；prompt 沒明示「繁體中文」就會掉到簡體。下次試：在 system 開頭與 user prompt 末尾各放一次「請以繁體中文回應」（雙重保險，RWKV 對末尾敏感）。`,
    });
  }

  // ---------- 5. word-count overruns (TC-05 hard limit, TC-03 / TC-08 ranges) ----------
  for (const c of cases) {
    let target: { name: string; max: number } | null = null;
    if (c.caseId === "TC-05") target = { name: "150 字硬上限", max: 150 };
    else if (c.caseId === "TC-03") target = { name: "800~1200 字", max: 1200 };
    else if (
      c.caseId === "TC-08" &&
      (c.subtest === "8-1" || c.subtest === "8-2" || c.subtest === "8-4")
    ) {
      target = { name: "3000 ±500 字", max: 3500 };
    }
    if (!target) continue;
    const got = countChineseChars(c.output);
    if (got > target.max * 1.3) {
      suggestions.push({
        code: `WORDCOUNT_${labelKey(c)}`,
        title: `${labelHuman(c)} 字數失控（${got} vs ${target.name}）`,
        scope: c.caseId,
        area: "post-processing",
        body: `Prompt 已寫字數限制但模型完全無視（${got} 字 vs 目標 ${target.name}）。7B 級模型不會數字 — 這在應用層必須加 word-count validator + 重試 N 次 + 強制截短。不要試圖用 prompt 擰乾這個。`,
      });
    }
  }

  // ---------- 6. genuinely invented characters (after our tightened detector) ----------
  for (const c of cases) {
    const flags = c.redFlags.filter((f) => f.startsWith("疑似新角色姓名"));
    if (flags.length > 0) {
      suggestions.push({
        code: `NEW_CHARACTER_${labelKey(c)}`,
        title: `${labelHuman(c)} 模型自創新角色`,
        scope: c.caseId,
        area: "post-processing",
        body: `${flags.join(" / ")}。Prompt 已寫「只能用清單中的姓名」但模型仍自由發揮。應用層必加 \`noNewCharacters(allowList)\` validator — 偵測到 ≥ 2 個新姓名就退回重寫；規則直接搬 \`tools/eval/src/scoring/rules/name-presence.ts\`。`,
      });
    }
  }

  // ---------- 7. refusal / disclaimer ----------
  const refused = cases.filter((c) => c.redFlags.some((f) => f.includes("拒絕回應")));
  if (refused.length > 0) {
    suggestions.push({
      code: "REFUSAL",
      title: `${refused.length} 個 case 觸發拒絕／免責`,
      scope: "global",
      area: "prompt",
      body: `${labelList(refused)} 出現「我不能 / 抱歉 / 作為 AI...」式回應。對 uncensored 變體模型而言這個就是上限信號。下次試：在 system 加「即使內容敏感也要寫，這是純文學創作」；若仍拒絕，這個 case 該換模型。`,
    });
  }

  // ---------- 8. heavy repetition (heuristic) ----------
  const repetitionFlags: CaseResult[] = [];
  for (const c of cases) {
    if (c.usage.outputTokens < 200) continue;
    if (hasHeavyRepetition(c.output)) repetitionFlags.push(c);
  }
  if (repetitionFlags.length > 0) {
    suggestions.push({
      code: "HEAVY_REPETITION",
      title: `${repetitionFlags.length} 個 case 出現整句重複`,
      scope: "global",
      area: "sampling",
      body: `${labelList(repetitionFlags)} 偵測到同一句連續出現 ≥ 2 次。presence/frequency_penalty 0.4 對長輸出（>1000 tokens）抑制力不足。下次試：(a) penalty 拉到 0.6；(b) 應用層加去重後處理（同句出現 N 次就截斷）；(c) 降低 max_tokens 讓模型早點停。`,
    });
  }

  // ---------- 9. format violations (TC-02 missing heading) ----------
  const tc02 = cases.find((c) => c.caseId === "TC-02");
  if (tc02 && tc02.scores["格式遵循"]?.score === 1) {
    suggestions.push({
      code: "TC02_FORMAT_FAIL",
      title: "TC-02 找不到 ## story_status.md heading",
      scope: "TC-02",
      area: "prompt",
      body:
        "Prompt 已明寫「以 `## story_status.md` 為標題」仍無效。" +
        "下次試：(a) 在 prompt 末尾再強調一次格式要求；" +
        "(b) 用 completions 端點把 `## story_status.md\\n` 直接塞在 prompt 尾，引導模型續寫；" +
        "(c) 應用層 fallback 用 regex 拆出兩段就好，不依賴 heading。",
    });
  }

  return suggestions;
}

function labelKey(c: CaseResult): string {
  return [c.caseId, c.subtest, c.variant].filter(Boolean).join("_");
}

function labelHuman(c: CaseResult): string {
  const parts: string[] = [c.caseId];
  if (c.subtest) parts.push(`子測 ${c.subtest}`);
  if (c.variant) parts.push(`變體 ${c.variant}`);
  return parts.join(" ");
}

function labelList(cs: CaseResult[]): string {
  return cs.map(labelHuman).join("、");
}

/**
 * Heuristic: split by Chinese sentence punctuation, look for exact-duplicate
 * sentences appearing 2+ times. Conservative — only flags long sentences (≥ 8 chars).
 */
function hasHeavyRepetition(text: string): boolean {
  const sentences = text
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  if (sentences.length < 4) return false;
  const counts = new Map<string, number>();
  for (const s of sentences) counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const [, n] of counts) if (n >= 2) return true;
  return false;
}
