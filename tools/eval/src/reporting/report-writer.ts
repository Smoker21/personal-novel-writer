import { readFile, writeFile } from "node:fs/promises";

import type { CaseResult, EvaluationReport } from "../types.js";
import { countChineseChars } from "../utils/text.js";

export interface WriteReportOpts {
  templatePath: string;
  outputPath: string;
  report: EvaluationReport;
}

export async function writeReportToMarkdown(opts: WriteReportOpts): Promise<void> {
  const original = await readFile(opts.templatePath, "utf-8");
  const updated = applyReport(original, opts.report);
  await writeFile(opts.outputPath, updated, "utf-8");
}

export function applyReport(md: string, report: EvaluationReport): string {
  let out = md;

  // 1) Per-case sections
  for (const c of report.cases) {
    out = applyCaseToMarkdown(out, c);
  }

  // 2) TC-05 rerun summary table
  const tc05 = report.cases.find((c) => c.caseId === "TC-05");
  if (tc05?.runs) {
    out = applyTC05RerunTable(out, tc05);
  }

  // 3) TC-07 memory-decay observation block
  if (report.architectureObs.memoryDecay) {
    out = applyTC07MemoryDecay(out, report);
  }

  // 4) Auto-suggestions (insert before 評分總表 if it exists, else append)
  if (report.suggestions.length > 0) {
    out = applyAutoSuggestions(out, report);
  }

  // 5) Status header
  out = out.replace(
    /^> Status: \*\*待跑\*\*（[^\n)]*?）/m,
    "> Status: **已跑（自動評分填回，主觀維度待人工）**",
  );

  return out;
}

const SECTION_ANCHORS: Record<string, RegExp> = {
  "TC-01": /^### TC-01 .+$/m,
  "TC-02": /^### TC-02 .+$/m,
  "TC-03": /^### TC-03 .+$/m,
  "TC-04": /^### TC-04 .+$/m,
  "TC-05": /^### TC-05 .+$/m,
  "TC-06": /^### TC-06 .+$/m,
  "TC-07": /^### TC-07 .+$/m,
  "TC-08": /^### TC-08 .+$/m,
};

function applyCaseToMarkdown(md: string, c: CaseResult): string {
  // Find the case section bounds
  const anchor = SECTION_ANCHORS[c.caseId];
  if (!anchor) return md;
  const start = md.search(anchor);
  if (start < 0) return md;
  const after = md.slice(start + 1);
  const nextHeading = /\n### TC-\d|\n## /.exec(after);
  const endRel = nextHeading ? nextHeading.index : after.length;
  const sectionStart = start;
  const sectionEnd = start + 1 + endRel;
  const section = md.slice(sectionStart, sectionEnd);

  let updated = section;

  // Subtest-aware: TC-04 / TC-08 have 4-1 etc.
  if (c.subtest) {
    updated = applySubtestToSection(updated, c);
  } else if (c.caseId === "TC-07" && c.variant) {
    // TC-07 has only one main scoring table; apply default variant scores there.
    if (c.variant === "default") {
      updated = applyOutputBlock(updated, c.output);
      updated = applyScoreTable(updated, c.scores);
    }
    // end-emphasis variant only contributes to memory-decay obs and shows up there
  } else {
    updated = applyOutputBlock(updated, c.output);
    updated = applyScoreTable(updated, c.scores);
  }

  return md.slice(0, sectionStart) + updated + md.slice(sectionEnd);
}

function applySubtestToSection(section: string, c: CaseResult): string {
  // anchor on "#### 子測 4-1" style headings
  const subAnchorRe = new RegExp(`^####\\s+子測\\s*${escapeReg(c.subtest!)}.*$`, "m");
  const subStart = section.search(subAnchorRe);
  if (subStart < 0) return section;
  const after = section.slice(subStart + 1);
  const nextRe = /\n#### |\n### |\n## /;
  const m = nextRe.exec(after);
  const subEndRel = m ? m.index : after.length;
  const subStartAbs = subStart;
  const subEndAbs = subStart + 1 + subEndRel;
  const subSection = section.slice(subStartAbs, subEndAbs);
  let updated = applyOutputBlock(subSection, c.output);
  updated = applyScoreTable(updated, c.scores);
  return section.slice(0, subStartAbs) + updated + section.slice(subEndAbs);
}

// Match either:
//   "    <貼這裡>" / "    <貼輸出>"  (indented code-block style — RWKV template)
//   "```\n<貼這裡>\n```"             (fenced code-block style — Qwen template)
const INDENTED_PLACEHOLDER_RE = /^[ \t]{4}<貼(?:這裡|輸出)>$/m;
const FENCED_PLACEHOLDER_RE = /^[ \t]*```\s*\n[ \t]*<貼(?:這裡|輸出)>\s*\n[ \t]*```/m;

function indent4(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

function applyOutputBlock(text: string, output: string): string {
  // Find all placeholders (both styles), in document order.
  type Hit = { kind: "indented" | "fenced"; index: number; matchLen: number };
  const hits: Hit[] = [];
  for (const m of text.matchAll(new RegExp(INDENTED_PLACEHOLDER_RE.source, "gm"))) {
    hits.push({ kind: "indented", index: m.index!, matchLen: m[0].length });
  }
  for (const m of text.matchAll(new RegExp(FENCED_PLACEHOLDER_RE.source, "gm"))) {
    hits.push({ kind: "fenced", index: m.index!, matchLen: m[0].length });
  }
  if (hits.length === 0) return text;
  hits.sort((a, b) => a.index - b.index);

  const head = hits.length > 1 ? output.slice(0, 200) : output;
  const tail = output.length > 200 ? output.slice(-200) : output;

  let result = "";
  let cursor = 0;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const piece = hits.length === 1 ? output : i === 0 ? head : tail;
    result += text.slice(cursor, h.index);
    if (h.kind === "indented") {
      result += indent4(piece);
    } else {
      result += `\`\`\`\n${piece.replace(/\r\n/g, "\n")}\n\`\`\``;
    }
    cursor = h.index + h.matchLen;
  }
  result += text.slice(cursor);
  return result;
}

function applyScoreTable(
  text: string,
  scores: Record<string, { score: number | null; explanation: string }>,
): string {
  // Match table rows like: | 維度 | _/5 | <空白> | (template)
  // OR             rows like: | 維度 | 3/5 | … |    (already filled — re-runs)
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = /^(\s*\|\s*)([^|]+?)(\s*\|\s*)(?:_|\d)\/5(\s*\|)(.*)$/.exec(ln);
    if (!m) continue;
    const dim = m[2].trim();
    const tail = m[5];
    const matched = matchScoreKey(dim, scores);
    if (!matched) continue;
    const sc = scores[matched];
    const scoreCell = sc.score === null ? "_/5" : `${sc.score}/5`;
    const hasExplanationColumn = /\|/.test(tail);
    if (hasExplanationColumn) {
      const tailCleaned = tail.replace(/^\s*[^|]*/, ` ${truncate(sc.explanation, 80)} `);
      lines[i] = `${m[1]}${m[2]}${m[3]}${scoreCell}${m[4]}${tailCleaned}`;
    } else {
      lines[i] = `${m[1]}${m[2]}${m[3]}${scoreCell}${m[4]}`;
    }
  }
  return lines.join("\n");
}

function matchScoreKey(dim: string, scores: Record<string, unknown>): string | undefined {
  // Exact, then contains-based fuzzy match
  if (scores[dim] !== undefined) return dim;
  const stripped = dim.replace(/[（(].*?[)）]/g, "").trim();
  for (const k of Object.keys(scores)) {
    const ks = k.replace(/[（(].*?[)）]/g, "").trim();
    if (ks === stripped) return k;
    if (k.includes(stripped) || stripped.includes(ks)) return k;
  }
  return undefined;
}

function applyTC05RerunTable(md: string, tc05: CaseResult): string {
  const runs = tc05.runs ?? [];
  const tc05Anchor = /^### TC-05 .+$/m;
  const start = md.search(tc05Anchor);
  if (start < 0) return md;
  const after = md.slice(start);
  const tableRe = /(\| Run \| 字數 \| Pass？ \|\n\|[-\s|]+\|\n)((?:\|\s*\d\s*\|[^\n]*\n)+)/m;
  const tableMatch = tableRe.exec(after);
  if (!tableMatch) return md;
  const header = tableMatch[1];
  const newRows = runs
    .map((r, i) => {
      const n = countChineseChars(r.output);
      const pass = n <= 150 ? "✅" : n <= 225 ? "⚠️" : "❌";
      return `| ${i + 1} | ${n} | ${pass} |`;
    })
    .join("\n");
  const fullReplacement = `${header}${newRows}\n`;
  const offsetInMd = start + (tableMatch.index ?? 0);
  return md.slice(0, offsetInMd) + fullReplacement + md.slice(offsetInMd + tableMatch[0].length);
}

const SUGGESTIONS_MARKER_BEGIN = "<!-- AUTO-SUGGESTIONS BEGIN -->";
const SUGGESTIONS_MARKER_END = "<!-- AUTO-SUGGESTIONS END -->";

function applyAutoSuggestions(md: string, report: EvaluationReport): string {
  const block = renderSuggestionsBlock(report);
  const wrapped = `${SUGGESTIONS_MARKER_BEGIN}\n${block}\n${SUGGESTIONS_MARKER_END}`;

  // Idempotency: if a previous run injected a block, replace it in-place.
  const existingRe = new RegExp(
    `${escapeReg(SUGGESTIONS_MARKER_BEGIN)}[\\s\\S]*?${escapeReg(SUGGESTIONS_MARKER_END)}`,
  );
  if (existingRe.test(md)) {
    return md.replace(existingRe, wrapped);
  }

  // Otherwise insert before "## 評分總表" (or "## 各 case 詳評" / append at end).
  const insertAnchors = [/^## 評分總表/m, /^## 各 case 詳評/m];
  for (const re of insertAnchors) {
    const m = re.exec(md);
    if (m) {
      const idx = m.index;
      return `${md.slice(0, idx) + wrapped}\n\n${md.slice(idx)}`;
    }
  }
  return `${md}\n\n${wrapped}\n`;
}

function renderSuggestionsBlock(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push(
    "## 自動建議（下次跑這個 model 時可以調的方向）",
    "",
    `> 由 \`tools/eval\` 自動產出，依據本次 run 的 ${report.cases.length} 個 case + redFlags + finishReason 推導。每條附 stable code，re-run 時可比對「上次的建議是否消失」。`,
    "",
  );

  const groups: Record<string, typeof report.suggestions> = {};
  for (const s of report.suggestions) {
    (groups[s.area] ??= []).push(s);
  }

  const areaLabels: Record<string, string> = {
    endpoint: "📡 Endpoint / 介面",
    prompt: "✍️ Prompt 工程",
    sampling: "🎚️ Sampling 參數",
    runtime: "⚙️ Runtime / 啟動",
    "post-processing": "🛠️ 應用層後處理（adapter 必做）",
    other: "其他",
  };
  const areaOrder = ["endpoint", "prompt", "sampling", "runtime", "post-processing", "other"];

  for (const area of areaOrder) {
    const items = groups[area];
    if (!items || items.length === 0) continue;
    lines.push(`### ${areaLabels[area]}`);
    lines.push("");
    for (const s of items) {
      const scopeTag = s.scope === "global" ? "**[全域]**" : `**[${s.scope}]**`;
      lines.push(`- ${scopeTag} **${s.title}** \`code:${s.code}\``);
      for (const bodyLine of s.body.split("\n")) {
        lines.push(`  - ${bodyLine}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function applyTC07MemoryDecay(md: string, report: EvaluationReport): string {
  if (!report.architectureObs.memoryDecay) return md;
  const tc07Anchor = /\*\*RWKV 關鍵觀察 — 記憶衰減\*\*：/;
  const m = tc07Anchor.exec(md);
  if (!m) return md;
  const insertionPoint = m.index + m[0].length;
  // find the bullet block "模型是否提到「照片」？" etc. and just inject computed result before it
  const block = `\n\n${report.architectureObs.memoryDecay}\n`;
  return md.slice(0, insertionPoint) + block + md.slice(insertionPoint);
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}
