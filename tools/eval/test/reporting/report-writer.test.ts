import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyReport } from "../../src/reporting/report-writer.js";
import { CaseResult, EvaluationReport } from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, "..", "fixtures", "result-template.md");

function buildResult(partial: Partial<CaseResult>): CaseResult {
  return {
    caseId: "TC-01",
    systemPrompt: "stub system",
    userPrompt: "stub user",
    sampling: { temperature: 0.7, topP: 0.9 },
    maxTokens: 1000,
    output: "默認輸出",
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 1000,
    finishReason: "end",
    scores: {},
    redFlags: [],
    ...partial,
  };
}

function buildReport(cases: CaseResult[]): EvaluationReport {
  return {
    startedAt: "2026-05-10T00:00:00Z",
    completedAt: "2026-05-10T00:10:00Z",
    runtime: { name: "rwkv-runner", endpoint: "http://localhost:27777/v1" },
    cases,
    architectureObs: {},
    suggestions: [],
  };
}

describe("applyReport", () => {
  it("fills TC-01 output and per-row scores", async () => {
    const md = await readFile(TEMPLATE_PATH, "utf-8");
    const tc01 = buildResult({
      caseId: "TC-01",
      output: "蘇晴推開言字書店的木門。林書言抬頭看了她一眼。雨剛好停。",
      scores: {
        "不新增未提供角色": { score: 5, explanation: "5/5 — 無新角色" },
        "不修改既有角色名": { score: 5, explanation: "5/5 — 名字正確" },
        "角色屬性貼合卡片": { score: null, explanation: "_/5 — 待人工" },
      },
    });
    const out = applyReport(md, buildReport([tc01]));
    expect(out).toContain("蘇晴推開言字書店");
    expect(out).toContain("| 不新增未提供角色 | 5/5");
    expect(out).toContain("| 不修改既有角色名 | 5/5");
    expect(out).toContain("| 角色屬性貼合卡片 | _/5");
  });

  it("fills TC-04 subtest 4-1 score table", async () => {
    const md = await readFile(TEMPLATE_PATH, "utf-8");
    const tc041 = buildResult({
      caseId: "TC-04",
      subtest: "4-1",
      output: '{"wordCount": 30, "characters": ["蘇晴", "林書言"], "mood": "靜謐"}',
      scores: {
        "純 JSON 可解析": { score: 5, explanation: "5/5" },
        "欄位正確": { score: 5, explanation: "5/5" },
        "角色辨識": { score: 5, explanation: "5/5" },
      },
    });
    const out = applyReport(md, buildReport([tc041]));
    expect(out).toContain('"wordCount": 30');
    expect(out).toContain("| 純 JSON 可解析 | 5/5");
  });

  it("writes TC-05 rerun table from runs[]", async () => {
    const md = await readFile(TEMPLATE_PATH, "utf-8");
    const stub = (n: number) => "啊".repeat(n);
    const subRuns = [
      buildResult({ caseId: "TC-05", output: stub(120) }),
      buildResult({ caseId: "TC-05", output: stub(200) }),
      buildResult({ caseId: "TC-05", output: stub(80) }),
    ];
    const tc05: CaseResult = {
      ...buildResult({ caseId: "TC-05", runIndex: 3, output: stub(120) }),
      runs: subRuns,
    };
    const out = applyReport(md, buildReport([tc05]));
    expect(out).toContain("| 1 | 120 | ✅ |");
    expect(out).toContain("| 2 | 200 | ⚠️ |");
    expect(out).toContain("| 3 | 80 | ✅ |");
  });

  it("inserts TC-07 memory-decay observation", async () => {
    const md = await readFile(TEMPLATE_PATH, "utf-8");
    const report = buildReport([
      buildResult({ caseId: "TC-07", variant: "default", output: "蘇晴沒有提到任何重要" }),
      buildResult({ caseId: "TC-07", variant: "end-emphasis", output: "蘇晴帶著母親的舊照片" }),
    ]);
    report.architectureObs.memoryDecay =
      "- TC-07 default 變體：❌ 漏掉「照片」\n- TC-07 end-emphasis 變體：✅ 有提到「照片」\n- 結論：把關鍵指令搬到末尾顯著改善記憶衰減（典型 RNN 行為）";
    const out = applyReport(md, report);
    expect(out).toContain("default 變體：❌ 漏掉「照片」");
    expect(out).toContain("end-emphasis 變體：✅ 有提到「照片」");
  });

  it("flips Status header from 待跑 to 已跑", async () => {
    const md = await readFile(TEMPLATE_PATH, "utf-8");
    const out = applyReport(md, buildReport([]));
    expect(out).toMatch(/Status: \*\*已跑/);
  });

  it("supports fenced ```<貼這裡>``` placeholders (Qwen template)", async () => {
    const QWEN_TEMPLATE_PATH = resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "docs",
      "architecture",
      "model-evaluation",
      "results",
      "2026-05-10-qwen3.5-35b-a3b-iq4xs.md",
    );
    const md = await readFile(QWEN_TEMPLATE_PATH, "utf-8");
    const tc01 = buildResult({
      caseId: "TC-01",
      output: "蘇晴推門進來，林書言抬頭。",
      scores: {
        "不新增未提供角色": { score: 5, explanation: "5/5" },
        "不修改既有角色名": { score: 5, explanation: "5/5" },
        "角色屬性貼合卡片": { score: null, explanation: "_/5" },
      },
    });
    const out = applyReport(md, buildReport([tc01]));
    expect(out).toContain("蘇晴推門進來，林書言抬頭。");
    expect(out).toMatch(/Status: \*\*已跑/);
  });
});
