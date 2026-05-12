import { writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";

import { CASE_PROFILE, CASE_MAX_TOKENS, RuntimeProfile, SAMPLING_PROFILES } from "../config.js";
import { parseAllTestCases } from "../parsers/test-case-parser.js";
import { runCase } from "./case-runner.js";
import { writeReportToMarkdown } from "../reporting/report-writer.js";
import { writeOutputMarkdown } from "../reporting/output-md-writer.js";
import { generateSuggestions } from "../scoring/suggestions.js";
import { logger, fmtDuration } from "../utils/logger.js";
import { Runtime } from "../runtimes/runtime.js";
import { CaseId, CaseResult, EvaluationReport, TestCaseRun } from "../types.js";
import oraDefault from "ora";

const ora = (oraDefault as unknown as { default?: typeof oraDefault }).default ?? oraDefault;

export interface RunContext {
  runtime: Runtime;
  runtimeProfile: RuntimeProfile;
  testCasesDir: string;
  resultTemplatePath: string;
  resultOutputPath: string;
  caseFilter?: CaseId[];
  dryRun: boolean;
  maxTokensOverride?: number;
  jsonOutPath?: string;
  /** Optional explicit path to write the full I/O markdown.
   *  If omitted, defaults to `<resultOutputPath without ext>-output.md`. */
  outputMdPath?: string;
  autoYes: boolean;
}

export async function runEvaluation(ctx: RunContext): Promise<EvaluationReport> {
  const startedAt = new Date().toISOString();

  if (!ctx.dryRun) {
    const h = await ctx.runtime.health();
    if (!h.ok) {
      throw new Error(
        `Runtime ${ctx.runtime.name} not reachable: ${h.error}\n` +
          `請先啟動 runtime；詳見 docs/architecture/model-evaluation/runtimes/${ctx.runtime.name}.md`,
      );
    }
    logger.success(`Runtime ${ctx.runtime.name} is healthy`);
  }

  const allRuns = await parseAllTestCases(ctx.testCasesDir);
  let runs = allRuns;
  if (ctx.caseFilter && ctx.caseFilter.length > 0) {
    const set = new Set(ctx.caseFilter);
    runs = runs.filter((r) => set.has(r.caseId));
  }
  if (runs.length === 0) {
    throw new Error("No test cases matched the filter.");
  }

  applySamplingDefaults(runs, ctx);

  logger.info(`Planned runs: ${runs.length}`);
  for (const r of runs) {
    logger.info(`  • ${describeRun(r)}`);
  }

  if (ctx.dryRun) {
    for (const r of runs) {
      console.log(`\n--- ${describeRun(r)} ---`);
      console.log(`[system]\n${r.systemPrompt}`);
      console.log(`[user]\n${r.userPrompt}`);
      console.log(
        `[sampling] T=${r.sampling.temperature} top_p=${r.sampling.topP} ` +
          `pp=${r.sampling.presencePenalty ?? "-"} fp=${r.sampling.frequencyPenalty ?? "-"} ` +
          `max=${r.maxTokens}`,
      );
    }
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      runtime: { name: ctx.runtimeProfile.name, endpoint: ctx.runtimeProfile.endpoint },
      cases: [],
      architectureObs: {},
      suggestions: [],
    };
  }

  const results: CaseResult[] = [];
  for (const r of runs) {
    const label = describeRun(r);
    const spinner = ora(`Running ${label}`).start();
    try {
      const result = await runCase(ctx.runtime, r, ctx.runtimeProfile.stop);
      results.push(result);
      spinner.succeed(
        `${label} — ${result.usage.outputTokens}t in ${fmtDuration(result.durationMs)}`,
      );
    } catch (err) {
      spinner.fail(`${label} — ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        caseId: r.caseId,
        variant: r.variant,
        subtest: r.subtest,
        runIndex: undefined,
        systemPrompt: r.systemPrompt,
        userPrompt: r.userPrompt,
        sampling: r.sampling,
        maxTokens: r.maxTokens,
        output: "",
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 0,
        finishReason: "error",
        scores: {},
        redFlags: [`Runtime error: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  const report: EvaluationReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    runtime: { name: ctx.runtimeProfile.name, endpoint: ctx.runtimeProfile.endpoint },
    cases: results,
    architectureObs: deriveArchitectureObs(results),
    suggestions: [],
  };
  report.suggestions = generateSuggestions(report);

  if (ctx.jsonOutPath) {
    await writeFile(ctx.jsonOutPath, JSON.stringify(report, null, 2), "utf-8");
    logger.info(`JSON report → ${ctx.jsonOutPath}`);
  }

  await writeReportToMarkdown({
    templatePath: ctx.resultTemplatePath,
    outputPath: ctx.resultOutputPath,
    report,
  });
  logger.success(`Result markdown updated → ${ctx.resultOutputPath}`);

  const outputMdPath = ctx.outputMdPath ?? deriveOutputMdPath(ctx.resultOutputPath);
  const modelDisplay = deriveModelDisplay(ctx.resultOutputPath);
  await writeOutputMarkdown({
    outputPath: outputMdPath,
    report,
    modelDisplayName: modelDisplay,
  });
  logger.success(`Full I/O markdown → ${outputMdPath}`);

  printSummary(report);
  return report;
}

function deriveOutputMdPath(resultPath: string): string {
  const dir = dirname(resultPath);
  const ext = extname(resultPath);
  const stem = basename(resultPath, ext);
  return resolve(dir, `${stem}-output${ext || ".md"}`);
}

function deriveModelDisplay(resultPath: string): string {
  const stem = basename(resultPath, extname(resultPath));
  // strip leading date prefix YYYY-MM-DD-
  return stem.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function describeRun(r: TestCaseRun): string {
  const parts: string[] = [r.caseId];
  if (r.subtest) parts.push(`sub=${r.subtest}`);
  if (r.variant) parts.push(`var=${r.variant}`);
  if (r.rerun && r.rerun > 1) parts.push(`x${r.rerun}`);
  return parts.join(" ");
}

function applySamplingDefaults(runs: TestCaseRun[], ctx: RunContext) {
  const thinkingBudget = ctx.runtimeProfile.thinkingTokenBudget ?? 0;
  for (const r of runs) {
    const profileKey = CASE_PROFILE[r.caseId];
    const baseProfile = SAMPLING_PROFILES[profileKey];
    const runtimeOverride = ctx.runtimeProfile.samplingOverrides?.[profileKey] ?? {};
    r.sampling = { ...baseProfile, ...runtimeOverride };
    if (!r.maxTokens) {
      r.maxTokens = CASE_MAX_TOKENS[r.caseId] ?? 1024;
    }
    if (ctx.maxTokensOverride) r.maxTokens = ctx.maxTokensOverride;
    else r.maxTokens += thinkingBudget;
  }
}

function deriveArchitectureObs(results: CaseResult[]): EvaluationReport["architectureObs"] {
  const obs: EvaluationReport["architectureObs"] = {};

  const tc07Default = results.find(
    (r) => r.caseId === "TC-07" && (r.variant === "default" || !r.variant),
  );
  const tc07End = results.find((r) => r.caseId === "TC-07" && r.variant === "end-emphasis");
  if (tc07Default && tc07End) {
    const photoDefault = /照片/.test(tc07Default.output);
    const photoEnd = /照片/.test(tc07End.output);
    const lines: string[] = [];
    lines.push(`- TC-07 default 變體：${photoDefault ? "✅ 有提到「照片」" : "❌ 漏掉「照片」"}`);
    lines.push(`- TC-07 end-emphasis 變體：${photoEnd ? "✅ 有提到「照片」" : "❌ 漏掉「照片」"}`);
    if (!photoDefault && photoEnd) {
      lines.push("- 結論：把關鍵指令搬到末尾顯著改善記憶衰減（典型 RNN 行為）");
    } else if (photoDefault && photoEnd) {
      lines.push("- 結論：兩個變體都記得照片，記憶衰減對此 prompt 不致命");
    } else if (!photoDefault && !photoEnd) {
      lines.push("- 結論：兩個變體都漏掉照片；模型可能不適合 chapter-writer");
    } else {
      lines.push("- 結論：default 提到、end-emphasis 漏掉（不尋常）—— 須人工檢視");
    }
    obs.memoryDecay = lines.join("\n");
  }

  return obs;
}

function printSummary(report: EvaluationReport) {
  const total = report.cases.length;
  const errors = report.cases.filter((c) => c.finishReason === "error").length;
  const redFlags = report.cases.filter((c) => c.redFlags.length > 0).length;
  console.log("\n=== Summary ===");
  console.log(`Total runs: ${total}`);
  console.log(`Errors: ${errors}`);
  console.log(`Runs with red flags: ${redFlags}`);
  for (const c of report.cases) {
    const tag = c.finishReason === "error" ? "✗" : c.redFlags.length ? "⚠" : "✓";
    const label = [c.caseId, c.subtest, c.variant, c.runIndex && `#${c.runIndex}`]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${tag} ${label}`);
  }
}
