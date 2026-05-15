import { writeFile } from "node:fs/promises";

import type { CaseResult, EvaluationReport } from "../types.js";
import { fmtDuration } from "../utils/logger.js";

export interface WriteOutputMdOpts {
  outputPath: string;
  report: EvaluationReport;
  modelDisplayName: string;
}

export async function writeOutputMarkdown(opts: WriteOutputMdOpts): Promise<void> {
  await writeFile(opts.outputPath, renderOutputMarkdown(opts), "utf-8");
}

export function renderOutputMarkdown(opts: WriteOutputMdOpts): string {
  const { report, modelDisplayName } = opts;
  const lines: string[] = [];
  lines.push(`# 完整輸入 / 輸出：${modelDisplayName}`);
  lines.push("");
  lines.push(`> Generated: ${report.completedAt}`);
  lines.push(`> Runtime: ${report.runtime.name} @ ${report.runtime.endpoint}`);
  lines.push(`> Total cases: ${report.cases.length}`);
  lines.push("");
  lines.push(
    "> 此檔自動產出，每個 case 包含 system prompt / user prompt / 模型輸出 / 取樣參數 / 自動評分。",
  );
  lines.push("> Scorecard（評分摘要）見同名的 result markdown。");
  lines.push("");
  lines.push("## 目錄");
  lines.push("");
  for (const c of report.cases) {
    const label = describeCase(c);
    lines.push(`- [${label}](#${anchor(label)})`);
  }
  lines.push("");

  for (const c of report.cases) {
    lines.push(...renderCase(c));
    lines.push("");
  }

  return lines.join("\n");
}

function describeCase(c: CaseResult): string {
  const parts: string[] = [c.caseId];
  if (c.subtest) parts.push(`子測 ${c.subtest}`);
  if (c.variant) parts.push(`變體 ${c.variant}`);
  return parts.join(" ");
}

function anchor(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");
}

function renderCase(c: CaseResult): string[] {
  const lines: string[] = [];
  const label = describeCase(c);
  lines.push(`## ${label}`);
  lines.push("");

  // Sampling + usage
  const s = c.sampling;
  lines.push(
    `**Sampling**: temperature=${s.temperature}, top_p=${s.topP}${s.presencePenalty != null ? `, presence_penalty=${s.presencePenalty}` : ""}${s.frequencyPenalty != null ? `, frequency_penalty=${s.frequencyPenalty}` : ""}, max_tokens=${c.maxTokens}`,
  );
  lines.push(
    `**Usage**: in=${c.usage.inputTokens} tokens, out=${c.usage.outputTokens} tokens, duration=${fmtDuration(c.durationMs)}, finish=${c.finishReason}`,
  );
  if (c.redFlags.length > 0) {
    lines.push(`**Red flags**: ${c.redFlags.join(" / ")}`);
  }
  lines.push("");

  lines.push("### System prompt");
  lines.push("");
  lines.push(fence(c.systemPrompt));
  lines.push("");

  lines.push("### User prompt");
  lines.push("");
  lines.push(fence(c.userPrompt));
  lines.push("");

  if (c.runs && c.runs.length > 0) {
    // TC-05 rerun layout — each run gets its own ### Run N section
    for (let i = 0; i < c.runs.length; i++) {
      const r = c.runs[i];
      lines.push(`### Model output — Run ${i + 1}`);
      lines.push(`*duration ${fmtDuration(r.durationMs)}, out=${r.usage.outputTokens} tokens*`);
      lines.push("");
      lines.push(fence(r.output));
      lines.push("");
    }
  } else {
    lines.push("### Model output");
    lines.push("");
    lines.push(fence(c.output));
    lines.push("");
  }

  if (Object.keys(c.scores).length > 0) {
    lines.push("### Auto-scores");
    lines.push("");
    lines.push("| 維度 | 分數 | 說明 |");
    lines.push("|------|------|------|");
    for (const [dim, sc] of Object.entries(c.scores)) {
      const score = sc.score == null ? "_/5" : `${sc.score}/5`;
      const expl = sc.explanation.replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${dim} | ${score} | ${expl} |`);
    }
    lines.push("");
  }

  return lines;
}

/**
 * Wrap a multi-line text in a fenced code block. Pick a fence length longer than
 * the longest backtick-run inside the body so the block doesn't break.
 */
function fence(body: string): string {
  const trimmed = body.replace(/\r\n/g, "\n");
  let len = 3;
  const inner = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = inner.exec(trimmed)) !== null) {
    if (m[0].length >= len) len = m[0].length + 1;
  }
  const f = "`".repeat(len);
  return `${f}\n${trimmed}\n${f}`;
}
