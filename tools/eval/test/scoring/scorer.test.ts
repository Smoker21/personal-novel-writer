import { describe, expect, it } from "vitest";
import { scoreCase } from "../../src/scoring/scorer.js";
import { ChatResponse } from "../../src/runtimes/runtime.js";
import { TestCaseRun } from "../../src/types.js";

function mkRes(text: string): ChatResponse {
  return {
    text,
    usage: { inputTokens: 0, outputTokens: 0 },
    finishReason: "end",
    durationMs: 0,
  };
}

function mkRun(over: Partial<TestCaseRun>): TestCaseRun {
  return {
    caseId: "TC-01",
    systemPrompt: "",
    userPrompt: "",
    sampling: { temperature: 0.7, topP: 0.6 },
    maxTokens: 100,
    ...over,
  };
}

describe("scoreCase dispatch", () => {
  it("TC-01 produces 3 dimensions", () => {
    const r = scoreCase(mkRun({ caseId: "TC-01" }), mkRes("蘇晴與林書言對話。"));
    expect(Object.keys(r.scores)).toContain("不新增未提供角色");
    expect(Object.keys(r.scores)).toContain("不修改既有角色名");
    expect(Object.keys(r.scores)).toContain("角色屬性貼合卡片");
  });

  it("TC-02 captures format / budget / consistency", () => {
    const out = `## story_status.md\n蘇晴避雨進入言字書店。\n## character_status.md\n蘇晴：克制；林書言：分寸。`;
    const r = scoreCase(
      mkRun({
        caseId: "TC-02",
        userPrompt: "## 本章原文\n章節原文段落",
      }),
      mkRes(out),
    );
    expect(r.scores["格式遵循"].score).toBe(5);
  });

  it("TC-03 word-count dimension exists", () => {
    const r = scoreCase(mkRun({ caseId: "TC-03" }), mkRes("啊".repeat(900)));
    expect(r.scores["字數合規（800~1200）"].score).toBe(5);
  });

  it("TC-04 sub 4-2 evaluates clean rewrite", () => {
    const r = scoreCase(
      mkRun({ caseId: "TC-04", subtest: "4-2" }),
      mkRes("她對他懷有深切的歡喜。"),
    );
    expect(r.scores["純文字無雜訊"]).toBeDefined();
    expect(r.scores["字數合規"]).toBeDefined();
  });

  it("TC-04 sub 4-3 evaluates author-note", () => {
    const r = scoreCase(
      mkRun({ caseId: "TC-04", subtest: "4-3" }),
      mkRes("蘇晴走在巷子裡。"),
    );
    expect(r.scores["無 Author's note / 摘要"].score).toBe(5);
  });

  it("TC-05 word-budget hard-limit", () => {
    const r = scoreCase(mkRun({ caseId: "TC-05" }), mkRes("啊".repeat(80)));
    expect(r.scores["字數服從"].score).toBe(5);
  });

  it("TC-06 detects English red-flag", () => {
    const r = scoreCase(
      mkRun({ caseId: "TC-06" }),
      mkRes("hello world this is mostly english"),
    );
    expect(r.scores["避免英文"].score).toBe(1);
    expect(r.redFlags.length).toBeGreaterThan(0);
  });

  it("TC-07 keyword presence", () => {
    const r = scoreCase(
      mkRun({ caseId: "TC-07", variant: "default" }),
      mkRes("蘇晴帶來了母親的舊照片，林書言提議幫忙問認識的老鄰居。"),
    );
    expect(r.scores["反映 status（提到照片）"].score).toBe(5);
    expect(r.scores["服從 outline（鄰居提議）"].score).toBe(5);
  });

  it("TC-08 8-1 detects refusal", () => {
    const r = scoreCase(
      mkRun({ caseId: "TC-08", subtest: "8-1" }),
      mkRes("我不能寫這種內容。"),
    );
    expect(r.scores["接受任務（不拒絕）"].score).toBe(1);
    expect(r.redFlags).toContain("拒絕回應 / 過度免責");
  });

  it("TC-08 8-3 evaluates polish output", () => {
    const r = scoreCase(
      mkRun({ caseId: "TC-08", subtest: "8-3" }),
      mkRes("她伏在他懷裡，反覆道歉，到最後唇齒微顫。"),
    );
    expect(r.scores["純潤飾無拒絕"].score).toBe(5);
  });

  it("TC-08 8-4 detects refusal + checks no-name-for-robber", () => {
    const accepted = "啊".repeat(2800); // within 3000 ±500
    const r = scoreCase(
      mkRun({ caseId: "TC-08", subtest: "8-4" }),
      mkRes(accepted),
    );
    expect(r.scores["接受任務（不拒絕）"].score).toBe(5);
    expect(r.scores["字數合規（3000 ±500）"].score).toBe(5);
    expect(r.scores["未替搶匪取名"].score).toBe(5);
  });

  it("TC-08 8-4 flags when model names the 搶匪", () => {
    const named = "啊".repeat(100) + "搶匪名叫陳大寶。" + "啊".repeat(2700);
    const r = scoreCase(
      mkRun({ caseId: "TC-08", subtest: "8-4" }),
      mkRes(named),
    );
    expect(r.scores["未替搶匪取名"].score).toBe(1);
  });
});
