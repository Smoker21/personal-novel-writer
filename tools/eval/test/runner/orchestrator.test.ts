import { describe, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runEvaluation } from "../../src/runner/orchestrator.js";
import { ChatRequest, ChatResponse, Runtime } from "../../src/runtimes/runtime.js";

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
const TEMPLATE_PATH = resolve(__dirname, "..", "fixtures", "result-template.md");

class FakeRuntime implements Runtime {
  readonly name = "rwkv-runner";
  public requests: ChatRequest[] = [];
  async health() {
    return { ok: true, modelInfo: "fake-model" };
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.requests.push(req);
    // Return a stable per-case-style stub by inspecting prompt content
    const userText = req.messages.find((m) => m.role === "user")?.content ?? "";
    let text = "蘇晴與林書言彼此望了一眼。";
    if (userText.includes("分析這段文字")) {
      text = '{"wordCount": 30, "characters": ["蘇晴", "林書言"], "mood": "靜謐"}';
    } else if (userText.includes("章節原文")) {
      text =
        "## story_status.md\n蘇晴避雨進入言字書店。\n## character_status.md\n蘇晴：克制；林書言：分寸。";
    } else if (userText.includes("照片")) {
      text = "蘇晴帶來了母親的舊照片，林書言提議幫忙問鄰居。";
    }
    return {
      text,
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "end",
      durationMs: 5,
    };
  }
}

describe("runEvaluation", () => {
  it("dry-run produces empty cases array", async () => {
    const report = await runEvaluation({
      runtime: new FakeRuntime(),
      runtimeProfile: {
        name: "rwkv-runner",
        endpoint: "http://x",
        defaultProfile: "creative",
      },
      testCasesDir: TEST_CASES_DIR,
      resultTemplatePath: TEMPLATE_PATH,
      resultOutputPath: TEMPLATE_PATH,
      dryRun: true,
      autoYes: true,
    });
    expect(report.cases.length).toBe(0);
  });

  it("end-to-end against fake runtime writes back to a copy of the template", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "eval-test-"));
    const out = resolve(dir, "result.md");
    const original = await readFile(TEMPLATE_PATH, "utf-8");
    await writeFile(out, original, "utf-8");

    const runtime = new FakeRuntime();
    const report = await runEvaluation({
      runtime,
      runtimeProfile: {
        name: "rwkv-runner",
        endpoint: "http://x",
        defaultProfile: "creative",
      },
      testCasesDir: TEST_CASES_DIR,
      resultTemplatePath: out,
      resultOutputPath: out,
      caseFilter: ["TC-04", "TC-07"],
      dryRun: false,
      autoYes: true,
    });
    expect(report.cases.length).toBeGreaterThan(0);
    expect(runtime.requests.length).toBeGreaterThan(0);

    const rewritten = await readFile(out, "utf-8");
    expect(rewritten).toMatch(/Status: \*\*已跑/);
    expect(rewritten).toContain("蘇晴帶來了母親的舊照片");
  });
});
