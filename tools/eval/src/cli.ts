#!/usr/bin/env node
import { existsSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { consola } from "consola";

import { RUNTIME_PROFILES, type RuntimeProfile } from "./config.js";
import type { Runtime } from "./runtimes/runtime.js";
import { RwkvRunnerRuntime } from "./runtimes/rwkv-runner.js";
import { ALL_CASE_IDS, type CaseId } from "./types.js";
import { logger } from "./utils/logger.js";

const program = new Command();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const TEST_CASES_DIR = resolve(REPO_ROOT, "docs", "architecture", "model-evaluation", "test-cases");

function makeRuntime(
  profile: RuntimeProfile,
  endpointOverride?: string,
  modeOverride?: "chat" | "completions",
): Runtime {
  const cfg = {
    endpoint: endpointOverride ?? profile.endpoint,
    modelId: profile.modelId,
    mode: modeOverride ?? profile.mode,
    extraBody: profile.extraBody,
  };
  switch (profile.name) {
    case "rwkv-runner":
      return new RwkvRunnerRuntime(cfg);
    case "lm-studio":
    case "ollama":
      return new RwkvRunnerRuntime(cfg);
    default:
      throw new Error(`Unknown runtime: ${profile.name}`);
  }
}

function resolveProfile(target: string): RuntimeProfile {
  const profile = RUNTIME_PROFILES[target];
  if (!profile) {
    const known = Object.keys(RUNTIME_PROFILES).join(", ");
    throw new Error(`Unknown --target ${target}. Known: ${known}`);
  }
  return profile;
}

/**
 * Insert a 3-digit run-index suffix before the file extension.
 *   foo.md          + 1 → foo.001.md
 *   foo.report.json + 7 → foo.report.007.json
 */
function withRunIndex(originalPath: string, idx: number): string {
  if (idx === 0) return originalPath;
  const ext = extname(originalPath);
  const stem = basename(originalPath, ext);
  return resolve(dirname(originalPath), `${stem}.${String(idx).padStart(3, "0")}${ext}`);
}

/**
 * Find the lowest non-existing run index across the three artifact paths so
 * they all share the same suffix. Index 0 means "use the original path".
 *
 *   - If none of the original paths exist → idx=0
 *   - Else scan idx=1..999, return the first index where ALL three derived
 *     paths are free
 */
function allocateRunIndex(paths: string[]): number {
  if (paths.every((p) => !existsSync(p))) return 0;
  for (let i = 1; i < 1000; i++) {
    if (paths.every((p) => !existsSync(withRunIndex(p, i)))) return i;
  }
  throw new Error("Run-index space exhausted (>999 prior runs?)");
}

function parseCaseFilter(value: string | undefined): CaseId[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  for (const id of ids) {
    if (!ALL_CASE_IDS.includes(id as CaseId)) {
      throw new Error(`Unknown case id ${id}. Known: ${ALL_CASE_IDS.join(", ")}`);
    }
  }
  return ids as CaseId[];
}

program
  .name("eval")
  .description("Run model-evaluation test cases against a local LLM runtime")
  .version("0.1.0");

program
  .option("--target <runtime>", "rwkv-runner | lm-studio | ollama", "rwkv-runner")
  .option("--endpoint <url>", "override runtime endpoint")
  .option(
    "--mode <chat|completions>",
    "force chat or completions endpoint (default: profile-specific; rwkv-runner=completions)",
  )
  .option("--result <path>", "path to result markdown (input + output same file)")
  .option("--only <case-ids>", "comma-separated CaseIds, e.g. TC-01,TC-04")
  .option("--dry-run", "print what would run without calling the model")
  .option("--max-tokens <n>", "override max_tokens for all cases", Number.parseInt)
  .option("--json-out <path>", "write raw EvaluationReport JSON here")
  .option(
    "--output-md <path>",
    "write the full system/user/output markdown here (default: <result>-output.md)",
  )
  .option(
    "--reset-from <template>",
    "before running, copy this template over --result so re-runs start clean",
  )
  .option(
    "--no-thinking-budget",
    "skip the per-runtime thinkingTokenBudget addition (use when target model has no chain-of-thought, like the *-instruct-* variants)",
  )
  .option("--health", "only check runtime health then exit")
  .option("-y, --yes", "skip confirmation prompt")
  .action(async (opts) => {
    const profile = resolveProfile(opts.target);
    if (opts.mode && opts.mode !== "chat" && opts.mode !== "completions") {
      consola.error(`--mode must be 'chat' or 'completions', got '${opts.mode}'`);
      process.exit(2);
    }
    const runtime = makeRuntime(profile, opts.endpoint, opts.mode);

    if (opts.health) {
      const h = await runtime.health();
      if (h.ok) {
        consola.success(`${profile.name} responded OK at ${opts.endpoint ?? profile.endpoint}`);
        if (h.modelInfo) consola.info(h.modelInfo.slice(0, 500));
        process.exit(0);
      } else {
        consola.error(
          `${profile.name} not reachable at ${opts.endpoint ?? profile.endpoint}: ${h.error}`,
        );
        consola.info(
          "請先啟動 RWKV-Runner，於「模型」頁載入模型並點 Run。詳見 docs/architecture/model-evaluation/runtimes/rwkv-runner.md",
        );
        process.exit(1);
      }
    }

    if (!opts.result) {
      consola.error("--result <path> is required (or pass --health to just probe).");
      process.exit(2);
    }

    const resultBasePath = resolve(process.cwd(), opts.result);
    if (opts.resetFrom) {
      const tplPath = resolve(process.cwd(), opts.resetFrom);
      if (!existsSync(tplPath)) {
        consola.error(`--reset-from template not found: ${tplPath}`);
        process.exit(2);
      }
      const { copyFileSync } = await import("node:fs");
      copyFileSync(tplPath, resultBasePath);
      consola.info(`Reset ${resultBasePath} from ${tplPath}`);
    }
    if (!existsSync(resultBasePath)) {
      consola.error(`Result template not found: ${resultBasePath}`);
      process.exit(2);
    }

    // Default sibling paths
    const ext = extname(resultBasePath);
    const stem = basename(resultBasePath, ext);
    const dirPath = dirname(resultBasePath);
    const defaultOutputMdPath = resolve(dirPath, `${stem}-output${ext || ".md"}`);
    const defaultJsonPath = resolve(dirPath, `${stem}.report.json`);

    const explicitOutputMd = opts.outputMd
      ? resolve(process.cwd(), opts.outputMd)
      : defaultOutputMdPath;
    const explicitJson = opts.jsonOut ? resolve(process.cwd(), opts.jsonOut) : defaultJsonPath;

    // Allocate ONE run index that's free across all three artifact paths.
    // The result template (`resultBasePath`) is treated as the "input" — it
    // already exists (we just verified). The OUTPUT result path is the next
    // free index.
    const runIdx = allocateRunIndex([
      resultBasePath, // intentionally counts existing template as "taken"
      explicitOutputMd,
      explicitJson,
    ]);
    const resultOutputPath = withRunIndex(resultBasePath, runIdx);
    const outputMdPath = withRunIndex(explicitOutputMd, runIdx);
    const jsonOutPath = withRunIndex(explicitJson, runIdx);

    if (runIdx > 0) {
      consola.info(
        `Prior outputs detected — this run will write index .${String(runIdx).padStart(
          3,
          "0",
        )} (no overwrite)`,
      );
    }

    const caseFilter = parseCaseFilter(opts.only);

    const { runEvaluation } = await import("./runner/orchestrator.js");
    try {
      // commander turns --no-thinking-budget into opts.thinkingBudget = false
      const effectiveProfile =
        opts.thinkingBudget === false ? { ...profile, thinkingTokenBudget: 0 } : profile;

      await runEvaluation({
        runtime,
        runtimeProfile: effectiveProfile,
        testCasesDir: TEST_CASES_DIR,
        resultTemplatePath: resultBasePath,
        resultOutputPath,
        caseFilter,
        dryRun: !!opts.dryRun,
        maxTokensOverride: opts.maxTokens,
        jsonOutPath,
        outputMdPath,
        autoYes: !!opts.yes,
      });
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  consola.error(err);
  process.exit(1);
});
