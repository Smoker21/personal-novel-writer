import type { Runtime } from "../runtimes/runtime.js";
import { scoreCase } from "../scoring/scorer.js";
import type { CaseResult, TestCaseRun } from "../types.js";

export async function runCase(
  runtime: Runtime,
  run: TestCaseRun,
  stop?: string[],
): Promise<CaseResult> {
  const reqMessages = [
    { role: "system" as const, content: run.systemPrompt },
    { role: "user" as const, content: run.userPrompt },
  ];

  if (run.rerun && run.rerun > 1) {
    const aggregated: CaseResult = {
      caseId: run.caseId,
      variant: run.variant,
      subtest: run.subtest,
      runIndex: undefined,
      systemPrompt: run.systemPrompt,
      userPrompt: run.userPrompt,
      sampling: run.sampling,
      maxTokens: run.maxTokens,
      output: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      finishReason: "end",
      scores: {},
      redFlags: [],
    };
    const subResults: CaseResult[] = [];
    for (let i = 1; i <= run.rerun; i++) {
      const res = await runtime.chat({
        messages: reqMessages,
        temperature: run.sampling.temperature,
        topP: run.sampling.topP,
        presencePenalty: run.sampling.presencePenalty,
        frequencyPenalty: run.sampling.frequencyPenalty,
        maxTokens: run.maxTokens,
        stop,
      });
      const r: CaseResult = scoreCase(run, res, i);
      subResults.push(r);
      aggregated.usage.inputTokens += r.usage.inputTokens;
      aggregated.usage.outputTokens += r.usage.outputTokens;
      aggregated.durationMs += r.durationMs;
    }
    aggregated.runIndex = subResults.length;
    aggregated.output = subResults.map((r, idx) => `### Run ${idx + 1}\n${r.output}`).join("\n\n");
    aggregated.scores = subResults[0]?.scores ?? {};
    aggregated.redFlags = subResults.flatMap((r) => r.redFlags);
    aggregated.runs = subResults;
    return aggregated;
  }

  const res = await runtime.chat({
    messages: reqMessages,
    temperature: run.sampling.temperature,
    topP: run.sampling.topP,
    presencePenalty: run.sampling.presencePenalty,
    frequencyPenalty: run.sampling.frequencyPenalty,
    maxTokens: run.maxTokens,
    stop,
  });
  return scoreCase(run, res);
}
