import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { CASE_MAX_TOKENS, CASE_PROFILE, SAMPLING_PROFILES } from "../config.js";
import type { CaseId, TestCaseRun } from "../types.js";
import { findAllSections, findSection, firstCodeBlock, parseSections } from "./md-sections.js";

const TC_FILES: Record<CaseId, string> = {
  "TC-01": "tc-01-character-consistency.md",
  "TC-02": "tc-02-status-extraction.md",
  "TC-03": "tc-03-chapter-writing.md",
  "TC-04": "tc-04-format-compliance.md",
  "TC-05": "tc-05-token-budget.md",
  "TC-06": "tc-06-chinese-fluency.md",
  "TC-07": "tc-07-context-utilization.md",
  "TC-08": "tc-08-content-freedom.md",
};

const TC07_END_EMPHASIS_TAIL = "\n\n請特別注意：本章必須提到蘇晴帶來的母親照片。";

function baseRun(caseId: CaseId, systemPrompt: string, userPrompt: string): TestCaseRun {
  const profile = CASE_PROFILE[caseId];
  return {
    caseId,
    systemPrompt,
    userPrompt,
    sampling: { ...SAMPLING_PROFILES[profile] },
    maxTokens: CASE_MAX_TOKENS[caseId],
  };
}

function extractSimplePrompts(md: string): { system: string; user: string } {
  const sections = parseSections(md);
  const sysSec = findSection(sections, 2, /^System prompt$/i);
  const userSec = findSection(sections, 2, /^User prompt$/i);
  if (!sysSec || !userSec) {
    throw new Error("Cannot find ## System prompt or ## User prompt");
  }
  const sys = firstCodeBlock(sysSec.body);
  const user = firstCodeBlock(userSec.body);
  if (sys == null || user == null) {
    throw new Error("System / User prompt code block missing");
  }
  return { system: sys, user };
}

export function parseSimpleCase(caseId: CaseId, md: string): TestCaseRun[] {
  const { system, user } = extractSimplePrompts(md);
  return [baseRun(caseId, system, user)];
}

export function parseTC04(md: string): TestCaseRun[] {
  const sections = parseSections(md);
  // each subtest is a level-2 heading like "## 子測 4-1：JSON 輸出"
  const subtestSections = findAllSections(sections, 2, /^子測\s*4-\d/);
  if (subtestSections.length === 0) {
    throw new Error("TC-04: no subtests found");
  }
  const runs: TestCaseRun[] = [];
  for (const sub of subtestSections) {
    const m = /子測\s*(4-\d)/.exec(sub.title);
    if (!m) continue;
    const subId = m[1];
    const sysSec = findSection(sections, 3, /^System prompt$/i, sub);
    const userSec = findSection(sections, 3, /^User prompt$/i, sub);
    if (!sysSec || !userSec) {
      throw new Error(`TC-04 subtest ${subId}: System/User prompt missing`);
    }
    const sys = firstCodeBlock(sysSec.body);
    const user = firstCodeBlock(userSec.body);
    if (sys == null || user == null) {
      throw new Error(`TC-04 subtest ${subId}: code block missing`);
    }
    runs.push({
      ...baseRun("TC-04", sys, user),
      subtest: subId,
    });
  }
  return runs;
}

export function parseTC08(md: string): TestCaseRun[] {
  const sections = parseSections(md);
  const subtestSections = findAllSections(sections, 2, /^子測\s*8-\d/);
  if (subtestSections.length === 0) {
    throw new Error("TC-08: no subtests found");
  }
  const runs: TestCaseRun[] = [];
  let lastSystemPrompt = "";
  for (const sub of subtestSections) {
    const m = /子測\s*(8-\d)/.exec(sub.title);
    if (!m) continue;
    const subId = m[1];
    const sysSec = findSection(sections, 3, /^System prompt$/i, sub);
    const userSec = findSection(sections, 3, /^User prompt$/i, sub);
    if (!userSec) {
      throw new Error(`TC-08 subtest ${subId}: User prompt missing`);
    }
    let sys = sysSec ? firstCodeBlock(sysSec.body) : null;
    if (sys == null) {
      // text says e.g. "同 8-1" — reuse last
      if (!lastSystemPrompt) {
        throw new Error(`TC-08 subtest ${subId}: no system prompt and no prior to inherit`);
      }
      sys = lastSystemPrompt;
    } else {
      lastSystemPrompt = sys;
    }
    const user = firstCodeBlock(userSec.body);
    if (user == null) {
      throw new Error(`TC-08 subtest ${subId}: User prompt code block missing`);
    }
    runs.push({
      ...baseRun("TC-08", sys, user),
      subtest: subId,
    });
  }
  return runs;
}

export function parseTC05(md: string): TestCaseRun[] {
  const [run] = parseSimpleCase("TC-05", md);
  return [{ ...run, rerun: 3 }];
}

export function parseTC07(md: string): TestCaseRun[] {
  const [base] = parseSimpleCase("TC-07", md);
  return [
    { ...base, variant: "default" },
    {
      ...base,
      variant: "end-emphasis",
      userPrompt: base.userPrompt + TC07_END_EMPHASIS_TAIL,
    },
  ];
}

const CASE_MAPPERS: Record<CaseId, (md: string) => TestCaseRun[]> = {
  "TC-01": (md) => parseSimpleCase("TC-01", md),
  "TC-02": (md) => parseSimpleCase("TC-02", md),
  "TC-03": (md) => parseSimpleCase("TC-03", md),
  "TC-04": (md) => parseTC04(md),
  "TC-05": (md) => parseTC05(md),
  "TC-06": (md) => parseSimpleCase("TC-06", md),
  "TC-07": (md) => parseTC07(md),
  "TC-08": (md) => parseTC08(md),
};

export async function parseAllTestCases(testCasesDir: string): Promise<TestCaseRun[]> {
  const entries = await readdir(testCasesDir);
  const present = new Set(entries);
  const runs: TestCaseRun[] = [];
  for (const [caseId, file] of Object.entries(TC_FILES) as [CaseId, string][]) {
    if (!present.has(file)) {
      throw new Error(`Missing test case file: ${file}`);
    }
    const md = await readFile(resolve(testCasesDir, file), "utf-8");
    const cases = CASE_MAPPERS[caseId](md);
    runs.push(...cases);
  }
  return runs;
}

export const __test = {
  TC_FILES,
  CASE_MAPPERS,
};
