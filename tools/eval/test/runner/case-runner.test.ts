import { describe, expect, it } from "vitest";
import { runCase } from "../../src/runner/case-runner.js";
import type { ChatRequest, ChatResponse, Runtime } from "../../src/runtimes/runtime.js";
import type { TestCaseRun } from "../../src/types.js";

class MockRuntime implements Runtime {
  readonly name = "mock";
  public requests: ChatRequest[] = [];
  public responses: string[] = [];
  private idx = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async health() {
    return { ok: true };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.requests.push(req);
    return {
      text: this.responses[this.idx++ % this.responses.length],
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "end",
      durationMs: 12,
    };
  }
}

const baseRun: TestCaseRun = {
  caseId: "TC-04",
  subtest: "4-1",
  systemPrompt: "sys",
  userPrompt: "user",
  sampling: { temperature: 0.5, topP: 0.5 },
  maxTokens: 200,
};

describe("runCase", () => {
  it("scores TC-04 4-1 from a clean JSON output", async () => {
    const rt = new MockRuntime([
      '{"wordCount": 30, "characters": ["蘇晴", "林書言"], "mood": "靜謐"}',
    ]);
    const r = await runCase(rt, baseRun);
    expect(r.caseId).toBe("TC-04");
    expect(r.subtest).toBe("4-1");
    expect(r.scores["純 JSON 可解析"].score).toBe(5);
    expect(r.scores["欄位正確"].score).toBe(5);
    expect(r.scores["角色辨識"].score).toBe(5);
  });

  it("aggregates rerun results for TC-05", async () => {
    const stub = (n: number) => "啊".repeat(n);
    const rt = new MockRuntime([stub(120), stub(200), stub(80)]);
    const tc05Run: TestCaseRun = {
      caseId: "TC-05",
      systemPrompt: "sys",
      userPrompt: "user",
      sampling: { temperature: 0.5, topP: 0.5 },
      maxTokens: 600,
      rerun: 3,
    };
    const r = await runCase(rt, tc05Run);
    expect(rt.requests.length).toBe(3);
    expect(r.runs?.length).toBe(3);
  });
});
