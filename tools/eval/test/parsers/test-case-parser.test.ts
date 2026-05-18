import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAllTestCases } from "../../src/parsers/test-case-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_CASES_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "docs",
  "architecture",
  "model-evaluation",
  "test-cases",
);

describe("parseAllTestCases", () => {
  it("parses all 8 cases into 14 runs (TC-08 has 4 subtests)", async () => {
    const runs = await parseAllTestCases(TEST_CASES_DIR);
    // 4 simple (TC-01, 02, 03, 06) + TC-04*3 + TC-05*1(rerun=3) + TC-07*2 + TC-08*4 = 14
    expect(runs.length).toBe(14);

    const ids = runs.map((r) => r.caseId);
    expect(ids.filter((x) => x === "TC-01").length).toBe(1);
    expect(ids.filter((x) => x === "TC-04").length).toBe(3);
    expect(ids.filter((x) => x === "TC-07").length).toBe(2);
    expect(ids.filter((x) => x === "TC-08").length).toBe(4);

    const tc05 = runs.find((r) => r.caseId === "TC-05");
    expect(tc05?.rerun).toBe(3);

    const tc07Default = runs.find((r) => r.caseId === "TC-07" && r.variant === "default");
    const tc07End = runs.find((r) => r.caseId === "TC-07" && r.variant === "end-emphasis");
    expect(tc07Default).toBeDefined();
    expect(tc07End).toBeDefined();
    expect(tc07End?.userPrompt.endsWith("照片。")).toBe(true);
    expect(tc07End?.userPrompt.length).toBeGreaterThan(tc07Default?.userPrompt.length);

    const tc08Subtests = runs.filter((r) => r.caseId === "TC-08").map((r) => r.subtest);
    expect(tc08Subtests).toEqual(["8-1", "8-2", "8-3", "8-4"]);

    const tc041 = runs.find((r) => r.subtest === "4-1");
    expect(tc041?.systemPrompt).toContain("文字分析助手");
    expect(tc041?.userPrompt).toContain("蘇晴推開言字書店");
  });

  it("TC-08 8-2 inherits 8-1 system prompt", async () => {
    const runs = await parseAllTestCases(TEST_CASES_DIR);
    const tc81 = runs.find((r) => r.subtest === "8-1");
    const tc82 = runs.find((r) => r.subtest === "8-2");
    expect(tc82?.systemPrompt).toBe(tc81?.systemPrompt);
  });

  it("applies sampling profiles per case (creative vs instruct)", async () => {
    const runs = await parseAllTestCases(TEST_CASES_DIR);
    // biome-ignore lint/style/noNonNullAssertion: find result is guaranteed by test setup
    const tc01 = runs.find((r) => r.caseId === "TC-01")!;
    // biome-ignore lint/style/noNonNullAssertion: find result is guaranteed by test setup
    const tc04 = runs.find((r) => r.caseId === "TC-04")!;
    expect(tc01.sampling.temperature).toBe(1.0);
    expect(tc04.sampling.temperature).toBe(0.5);
  });
});
