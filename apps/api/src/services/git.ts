import { spawn } from "node:child_process";
import PQueue from "p-queue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitError {
  code: "not_installed" | "not_a_repo" | "command_failed" | "io_error";
  command: string;
  stderr: string;
  cause?: unknown;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitError };

export interface GitStatus {
  /** Files staged for commit (index changed). */
  staged: string[];
  /** Files modified in the working tree but not staged. */
  unstaged: string[];
  /** Untracked files. */
  untracked: string[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  date: string;
  subject: string;
}

export interface GitWrapper {
  init(projectPath: string): Promise<GitResult<void>>;
  add(projectPath: string, files: string[]): Promise<GitResult<void>>;
  commit(projectPath: string, message: string): Promise<GitResult<{ sha: string }>>;
  status(projectPath: string): Promise<GitResult<GitStatus>>;
  log(
    projectPath: string,
    opts?: { limit?: number; file?: string },
  ): Promise<GitResult<GitCommit[]>>;
  show(projectPath: string, sha: string, file: string): Promise<GitResult<string>>;
  diff(projectPath: string, args: string[]): Promise<GitResult<string>>;
  checkoutFile(projectPath: string, sha: string, file: string): Promise<GitResult<void>>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Per-project serialisation queues (concurrency: 1). */
const queues = new Map<string, PQueue>();

function getQueue(projectPath: string): PQueue {
  const existing = queues.get(projectPath);
  if (existing !== undefined) return existing;
  const q = new PQueue({ concurrency: 1 });
  queues.set(projectPath, q);
  return q;
}

/**
 * Fixed author identity for all commits (M0 decision — no user accounts).
 */
const AUTHOR_ARGS = ["-c", "user.name=novel-writer-app", "-c", "user.email=noreply@local"];

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a git subcommand. Uses spawn (not exec) to avoid shell injection.
 * The `command` field in the returned error is a human-readable description.
 */
function runGit(projectPath: string, args: string[]): Promise<GitResult<SpawnResult>> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>;

    try {
      proc = spawn("git", [...AUTHOR_ARGS, ...args], { cwd: projectPath });
    } catch (err) {
      // spawn itself throws synchronously on very bad errors (rare).
      resolve({
        ok: false,
        error: {
          code: "not_installed",
          command: `git ${args.join(" ")}`,
          stderr: "",
          cause: err,
        },
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("error", (err) => {
      const isENOENT = (err as NodeJS.ErrnoException).code === "ENOENT";
      resolve({
        ok: false,
        error: {
          code: isENOENT ? "not_installed" : "io_error",
          command: `git ${args.join(" ")}`,
          stderr: "",
          cause: err,
        },
      });
    });

    proc.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
      const exitCode = code ?? 1;

      if (exitCode !== 0) {
        const stderrLower = stderr.toLowerCase();
        let errorCode: GitError["code"] = "command_failed";
        if (stderrLower.includes("not a git repository")) {
          errorCode = "not_a_repo";
        }
        resolve({
          ok: false,
          error: {
            code: errorCode,
            command: `git ${args.join(" ")}`,
            stderr,
          },
        });
        return;
      }

      resolve({ ok: true, value: { stdout, stderr, exitCode } });
    });
  });
}

/**
 * Run a git command through the per-project queue to ensure serial execution.
 */
async function queuedGit(projectPath: string, args: string[]): Promise<GitResult<SpawnResult>> {
  const q = getQueue(projectPath);
  return q.add(() => runGit(projectPath, args)) as Promise<GitResult<SpawnResult>>;
}

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

function parseStatusPorcelain(raw: string): GitStatus {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of raw.split("\n")) {
    if (line.length < 3) continue;
    const x = line[0] ?? " "; // index status
    const y = line[1] ?? " "; // worktree status
    const file = line.slice(3);

    if (x === "?" && y === "?") {
      untracked.push(file);
    } else {
      if (x !== " " && x !== "?") staged.push(file);
      if (y !== " " && y !== "?") unstaged.push(file);
    }
  }

  return { staged, unstaged, untracked };
}

function parseLogLine(line: string): GitCommit | null {
  const parts = line.split("|");
  // Format: SHA|shortSha|date|subject
  const sha = parts[0];
  const shortSha = parts[1];
  const date = parts[2];
  // Subject may contain "|" — rejoin the rest.
  const subject = parts.slice(3).join("|");

  if (sha === undefined || shortSha === undefined || date === undefined) return null;
  return { sha, shortSha, date, subject };
}

// ---------------------------------------------------------------------------
// GitWrapper implementation
// ---------------------------------------------------------------------------

export const git: GitWrapper = {
  async init(projectPath) {
    const q = getQueue(projectPath);
    const result = (await q.add(() => runGit(projectPath, ["init"]))) as GitResult<SpawnResult>;
    if (!result.ok) return result;
    return { ok: true, value: undefined };
  },

  async add(projectPath, files) {
    const q = getQueue(projectPath);
    const result = (await q.add(() =>
      runGit(projectPath, ["add", "--", ...files]),
    )) as GitResult<SpawnResult>;
    if (!result.ok) return result;
    return { ok: true, value: undefined };
  },

  async commit(projectPath, message) {
    // Commit + retrieve sha in sequence within the queue.
    const q = getQueue(projectPath);

    return q.add(async () => {
      const commitResult = await runGit(projectPath, ["commit", "-m", message]);
      if (!commitResult.ok) return commitResult;

      const shaResult = await runGit(projectPath, ["rev-parse", "HEAD"]);
      if (!shaResult.ok) return shaResult;

      return { ok: true as const, value: { sha: shaResult.value.stdout } };
    }) as Promise<GitResult<{ sha: string }>>;
  },

  async status(projectPath) {
    const result = await queuedGit(projectPath, ["status", "--porcelain=v1"]);
    if (!result.ok) return result;
    return { ok: true, value: parseStatusPorcelain(result.value.stdout) };
  },

  async log(projectPath, opts = {}) {
    const args = ["log", "--format=%H|%h|%ai|%s"];
    if (opts.limit !== undefined) args.push("-n", String(opts.limit));
    if (opts.file !== undefined) args.push("--follow", "--", opts.file);

    const result = await queuedGit(projectPath, args);
    if (!result.ok) return result;

    const commits: GitCommit[] = [];
    for (const line of result.value.stdout.split("\n")) {
      if (line.trim() === "") continue;
      const commit = parseLogLine(line);
      if (commit !== null) commits.push(commit);
    }

    return { ok: true, value: commits };
  },

  async show(projectPath, sha, file) {
    const result = await queuedGit(projectPath, ["show", `${sha}:${file}`]);
    if (!result.ok) return result;
    return { ok: true, value: result.value.stdout };
  },

  async diff(projectPath, args) {
    const result = await queuedGit(projectPath, ["diff", "--no-color", ...args]);
    if (!result.ok) return result;
    return { ok: true, value: result.value.stdout };
  },

  async checkoutFile(projectPath, sha, file) {
    const result = await queuedGit(projectPath, ["checkout", sha, "--", file]);
    if (!result.ok) return result;
    return { ok: true, value: undefined };
  },
};
