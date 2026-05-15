import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUNTIME_PROFILES } from "../../src/config.js";
import { runEvaluation } from "../../src/runner/orchestrator.js";
import type { ChatRequest, ChatResponse, Runtime } from "../../src/runtimes/runtime.js";

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
const TEMPLATE_PATH = resolve(
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

class CapturingRuntime implements Runtime {
  readonly name = "lm-studio";
  public requests: ChatRequest[] = [];
  async health() {
    return { ok: true };
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.requests.push(req);
    return {
      text: "stub output",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "end",
      durationMs: 1,
    };
  }
}

describe("LM Studio runtime — sampling override", () => {
  it("uses Transformer-friendly defaults (T=0.7 top_p=0.9 for creative, T=0.2 top_p=0.9 for instruct)", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "eval-test-"));
    const out = resolve(dir, "result.md");
    await writeFile(out, await readFile(TEMPLATE_PATH, "utf-8"), "utf-8");

    const runtime = new CapturingRuntime();
    await runEvaluation({
      runtime,
      runtimeProfile: RUNTIME_PROFILES["lm-studio"],
      testCasesDir: TEST_CASES_DIR,
      resultTemplatePath: out,
      resultOutputPath: out,
      caseFilter: ["TC-01", "TC-04"],
      dryRun: false,
      autoYes: true,
    });

    const tc01Req = runtime.requests[0];
    expect(tc01Req.temperature).toBe(0.7);
    expect(tc01Req.topP).toBe(0.9);
    expect(tc01Req.presencePenalty).toBeUndefined();
    expect(tc01Req.frequencyPenalty).toBeUndefined();

    const tc04Req = runtime.requests[1];
    expect(tc04Req.temperature).toBe(0.2);
    expect(tc04Req.topP).toBe(0.9);
  });
});
