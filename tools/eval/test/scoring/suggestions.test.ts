import { describe, expect, it } from "vitest";
import { generateSuggestions } from "../../src/scoring/suggestions.js";
import type { CaseResult, EvaluationReport } from "../../src/types.js";

function mkResult(over: Partial<CaseResult>): CaseResult {
  return {
    caseId: "TC-01",
    systemPrompt: "sys",
    userPrompt: "user",
    sampling: { temperature: 1.0, topP: 0.6 },
    maxTokens: 1200,
    output: "lorem ipsum",
    usage: { inputTokens: 0, outputTokens: 100 },
    durationMs: 0,
    finishReason: "end",
    scores: {},
    redFlags: [],
    ...over,
  };
}

function mkReport(cases: CaseResult[]): EvaluationReport {
  return {
    startedAt: "x",
    completedAt: "y",
    runtime: { name: "rwkv-runner", endpoint: "http://x" },
    cases,
    architectureObs: {},
    suggestions: [],
  };
}

describe("generateSuggestions", () => {
  it("flags max_tokens hit on a single case", () => {
    const r = generateSuggestions(
      mkReport([
        mkResult({ finishReason: "max_tokens", usage: { inputTokens: 0, outputTokens: 1200 } }),
      ]),
    );
    expect(r.some((s) => s.code.startsWith("MAX_TOKENS_"))).toBe(true);
  });

  it("flags global pattern when ≥30% of cases hit max_tokens", () => {
    const cases: CaseResult[] = Array.from({ length: 5 }, (_, i) =>
      mkResult({
        caseId: i < 3 ? "TC-01" : "TC-02",
        finishReason: i < 2 ? "max_tokens" : "end",
        usage: { inputTokens: 0, outputTokens: i < 2 ? 1200 : 50 },
      }),
    );
    const r = generateSuggestions(mkReport(cases));
    expect(r.some((s) => s.code === "FREQ_MAX_TOKENS")).toBe(true);
  });

  it("flags degenerate short output on long-form cases", () => {
    const r = generateSuggestions(
      mkReport([mkResult({ caseId: "TC-03", usage: { inputTokens: 100, outputTokens: 16 } })]),
    );
    expect(r.find((s) => s.code === "SHORT_OUTPUT_TC-03")?.area).toBe("endpoint");
  });

  it("flags TC-04 4-1 JSON parse failure", () => {
    const r = generateSuggestions(
      mkReport([
        mkResult({
          caseId: "TC-04",
          subtest: "4-1",
          output: "not json at all",
          usage: { inputTokens: 0, outputTokens: 5 },
        }),
      ]),
    );
    expect(r.some((s) => s.code === "TC04_JSON_UNPARSEABLE")).toBe(true);
  });

  it("flags simplified-Chinese drift when ratio > 0.5%", () => {
    const driftedOut =
      "蘇晴打开门走进书店看见林书言。她说话时显得很紧张但仍然保持微笑，对方对她也很友好。" +
      "她走过书架看见许多书种，门外又有人进来，让她有点紧张。" +
      "雨已经停了，街道上还湿漉漉的。她感到一种说不出的奇异感觉。" +
      "他们坐下来对话，她终于愿意把心里的话说出来。" +
      "她说她从小就喜欢看书，特别是文学类的书种。林书言听完后微笑起来。";
    const r = generateSuggestions(
      mkReport([
        mkResult({
          caseId: "TC-08",
          subtest: "8-1",
          output: driftedOut,
          usage: { inputTokens: 0, outputTokens: 200 },
        }),
      ]),
    );
    expect(r.some((s) => s.code === "SIMPLIFIED_DRIFT")).toBe(true);
  });

  it("flags word-count overrun on TC-05", () => {
    const out = "啊".repeat(400);
    const r = generateSuggestions(mkReport([mkResult({ caseId: "TC-05", output: out })]));
    expect(r.some((s) => s.code === "WORDCOUNT_TC-05")).toBe(true);
  });

  it("flags refusal pattern", () => {
    const r = generateSuggestions(
      mkReport([mkResult({ caseId: "TC-08", subtest: "8-1", redFlags: ["拒絕回應 / 過度免責"] })]),
    );
    expect(r.some((s) => s.code === "REFUSAL")).toBe(true);
  });

  it("flags heavy repetition on long output with duplicated sentences", () => {
    const sentence = "就在此時一隻黃鶯從樹上飛過。";
    const out = `${sentence}她走進房間。`.repeat(20);
    const r = generateSuggestions(
      mkReport([
        mkResult({
          caseId: "TC-01",
          output: out,
          usage: { inputTokens: 0, outputTokens: 1200 },
        }),
      ]),
    );
    expect(r.some((s) => s.code === "HEAVY_REPETITION")).toBe(true);
  });

  it("returns empty array on a clean run", () => {
    const r = generateSuggestions(
      mkReport([
        mkResult({
          caseId: "TC-06",
          output: "純繁體中文段落，沒有任何問題。",
          usage: { inputTokens: 0, outputTokens: 50 },
          finishReason: "end",
          redFlags: [],
        }),
      ]),
    );
    expect(r).toEqual([]);
  });
});
