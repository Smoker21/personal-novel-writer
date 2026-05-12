import { describe, expect, it } from "vitest";
import { renderOutputMarkdown } from "../../src/reporting/output-md-writer.js";
import { CaseResult, EvaluationReport } from "../../src/types.js";

function mkResult(over: Partial<CaseResult>): CaseResult {
  return {
    caseId: "TC-01",
    systemPrompt: "你是中文小說章節寫手。",
    userPrompt: "寫一段大約 600 字的場景。",
    sampling: { temperature: 1.0, topP: 0.6, presencePenalty: 0.4, frequencyPenalty: 0.4 },
    maxTokens: 1200,
    output: "蘇晴推門進來。林書言抬頭。雨剛好停了。",
    usage: { inputTokens: 200, outputTokens: 50 },
    durationMs: 12345,
    finishReason: "end",
    scores: {
      "不新增未提供角色": { score: 5, explanation: "5/5 — 無新角色" },
      "角色屬性貼合卡片": { score: null, explanation: "_/5 — 待人工" },
    },
    redFlags: [],
    ...over,
  };
}

function mkReport(cases: CaseResult[]): EvaluationReport {
  return {
    startedAt: "2026-05-10T10:00:00Z",
    completedAt: "2026-05-10T10:12:00Z",
    runtime: { name: "rwkv-runner", endpoint: "http://localhost:27777/v1" },
    cases,
    architectureObs: {},
    suggestions: [],
  };
}

describe("renderOutputMarkdown", () => {
  it("renders system / user / output / sampling / scores per case", () => {
    const md = renderOutputMarkdown({
      report: mkReport([mkResult({})]),
      modelDisplayName: "rwkv-5-h-world",
      outputPath: "x",
    });
    expect(md).toContain("# 完整輸入 / 輸出：rwkv-5-h-world");
    expect(md).toContain("Runtime: rwkv-runner @ http://localhost:27777/v1");
    expect(md).toContain("## TC-01");
    expect(md).toContain("### System prompt");
    expect(md).toContain("你是中文小說章節寫手。");
    expect(md).toContain("### User prompt");
    expect(md).toContain("寫一段大約 600 字的場景。");
    expect(md).toContain("### Model output");
    expect(md).toContain("蘇晴推門進來");
    expect(md).toContain("temperature=1, top_p=0.6");
    expect(md).toContain("| 不新增未提供角色 | 5/5 |");
    expect(md).toContain("| 角色屬性貼合卡片 | _/5 |");
  });

  it("renders rerun (TC-05) per-run sub-sections", () => {
    const subRuns = [
      mkResult({ caseId: "TC-05", output: "AAAA" }),
      mkResult({ caseId: "TC-05", output: "BBBB" }),
      mkResult({ caseId: "TC-05", output: "CCCC" }),
    ];
    const tc05 = mkResult({ caseId: "TC-05", runs: subRuns, output: "agg" });
    const md = renderOutputMarkdown({
      report: mkReport([tc05]),
      modelDisplayName: "m",
      outputPath: "x",
    });
    expect(md).toContain("### Model output — Run 1");
    expect(md).toContain("AAAA");
    expect(md).toContain("### Model output — Run 2");
    expect(md).toContain("BBBB");
    expect(md).toContain("### Model output — Run 3");
    expect(md).toContain("CCCC");
  });

  it("escapes backtick fences inside output by widening fence length", () => {
    const out = "before\n```\nfake fence\n```\nafter";
    const md = renderOutputMarkdown({
      report: mkReport([mkResult({ output: out })]),
      modelDisplayName: "m",
      outputPath: "x",
    });
    // The wrapping fence must be 4+ backticks, since output contains 3-backtick blocks
    expect(md).toMatch(/````\n[\s\S]*?fake fence[\s\S]*?\n````/);
  });

  it("captures variant and subtest in heading", () => {
    const c = mkResult({ caseId: "TC-07", variant: "end-emphasis" });
    const md = renderOutputMarkdown({
      report: mkReport([c]),
      modelDisplayName: "m",
      outputPath: "x",
    });
    expect(md).toContain("## TC-07 變體 end-emphasis");
  });
});
