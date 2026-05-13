import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:child_process before importing the module under test.
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import * as cp from "node:child_process";
import { git } from "./git.js";

const spawnMock = vi.mocked(cp.spawn);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attach minimal stdout/stderr EventEmitters to an EventEmitter
 * so it behaves like a ChildProcess.
 */
function attachStreams(proc: EventEmitter): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proc as any).stdout = new EventEmitter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proc as any).stderr = new EventEmitter();
}

/**
 * Create a fake process that resolves via setImmediate with given output.
 */
function makeFakeProcess(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  enoentError?: boolean;
}): ReturnType<typeof cp.spawn> {
  const proc = new EventEmitter();
  attachStreams(proc);

  setImmediate(() => {
    if (opts.enoentError === true) {
      const err = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      proc.emit("error", err);
      return;
    }
    if (opts.stdout) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (proc as any).stdout.emit("data", Buffer.from(opts.stdout));
    }
    if (opts.stderr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (proc as any).stderr.emit("data", Buffer.from(opts.stderr));
    }
    proc.emit("close", opts.exitCode ?? 0);
  });

  return proc as ReturnType<typeof cp.spawn>;
}

/**
 * Unique project path counter to keep queue states isolated across tests.
 */
let _pathCounter = 0;
function uniqueProject(): string {
  _pathCounter += 1;
  return `/mock/project/${_pathCounter}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

describe("git.init", () => {
  it("returns ok:true on success", async () => {
    const proj = uniqueProject();
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: "Initialized empty Git repository" }));

    const result = await git.init(proj);

    expect(result.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["init"]),
      expect.objectContaining({ cwd: proj }),
    );
  });
});

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

describe("git.commit", () => {
  it("returns the sha after a successful commit", async () => {
    const proj = uniqueProject();
    const SHA = "abc1234567890abcdef";
    // First call: commit; second call: rev-parse HEAD
    spawnMock
      .mockReturnValueOnce(makeFakeProcess({ stdout: "[main abc1234] test commit" }))
      .mockReturnValueOnce(makeFakeProcess({ stdout: SHA }));

    const result = await git.commit(proj, "test commit");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sha).toBe(SHA);
    }
  });

  it("propagates commit failure", async () => {
    const proj = uniqueProject();
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 1, stderr: "nothing to commit" }));

    const result = await git.commit(proj, "empty");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("command_failed");
    }
  });
});

// ---------------------------------------------------------------------------
// error mapping
// ---------------------------------------------------------------------------

describe("error mapping", () => {
  it("maps 'not a git repository' stderr to not_a_repo", async () => {
    const proj = uniqueProject();
    spawnMock.mockReturnValue(
      makeFakeProcess({
        exitCode: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git",
      }),
    );

    const result = await git.status(proj);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_a_repo");
    }
  });

  it("maps ENOENT spawn error to not_installed", async () => {
    const proj = uniqueProject();
    spawnMock.mockReturnValue(makeFakeProcess({ enoentError: true }));

    const result = await git.init(proj);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_installed");
    }
  });
});

// ---------------------------------------------------------------------------
// Per-project queue: serial execution
// ---------------------------------------------------------------------------

describe("per-project queue serialisation", () => {
  it("ensures second commit waits for the first to complete", async () => {
    const proj = uniqueProject();
    const completionOrder: number[] = [];

    // Manually controlled processes for commit 1.
    const commitProc1 = new EventEmitter();
    attachStreams(commitProc1);

    const revParseProc1 = new EventEmitter();
    attachStreams(revParseProc1);

    // Manually controlled processes for commit 2.
    const commitProc2 = new EventEmitter();
    attachStreams(commitProc2);

    const revParseProc2 = new EventEmitter();
    attachStreams(revParseProc2);

    spawnMock
      .mockReturnValueOnce(commitProc1 as ReturnType<typeof cp.spawn>)
      .mockReturnValueOnce(revParseProc1 as ReturnType<typeof cp.spawn>)
      .mockReturnValueOnce(commitProc2 as ReturnType<typeof cp.spawn>)
      .mockReturnValueOnce(revParseProc2 as ReturnType<typeof cp.spawn>);

    // Start both commits concurrently without awaiting.
    const p1 = git.commit(proj, "commit 1").then((r) => {
      completionOrder.push(1);
      return r;
    });
    const p2 = git.commit(proj, "commit 2").then((r) => {
      completionOrder.push(2);
      return r;
    });

    // Let the queue start the first task.
    await new Promise<void>((r) => setImmediate(r));

    // Only the first commit should have been spawned so far.
    expect(spawnMock).toHaveBeenCalledTimes(1);

    // Resolve commit 1 → triggers rev-parse spawn.
    commitProc1.emit("close", 0);
    await new Promise<void>((r) => setImmediate(r));

    // Now spawn should have been called twice (commit1 + rev-parse1).
    expect(spawnMock).toHaveBeenCalledTimes(2);

    // Resolve rev-parse 1 → first git.commit() task completes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (revParseProc1 as any).stdout.emit("data", Buffer.from("sha1111"));
    revParseProc1.emit("close", 0);

    // Let the queue transition to the second task.
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Queue should have started commit 2 (3rd spawn total).
    expect(spawnMock).toHaveBeenCalledTimes(3);

    // Resolve commit 2 → triggers rev-parse spawn.
    commitProc2.emit("close", 0);
    await new Promise<void>((r) => setImmediate(r));

    expect(spawnMock).toHaveBeenCalledTimes(4);

    // Resolve rev-parse 2.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (revParseProc2 as any).stdout.emit("data", Buffer.from("sha2222"));
    revParseProc2.emit("close", 0);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Commit 1 must have finished before commit 2.
    expect(completionOrder).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// log parsing
// ---------------------------------------------------------------------------

describe("git.log", () => {
  it("parses log output into GitCommit objects", async () => {
    const proj = uniqueProject();
    const logLine = "abc1234567890|abc1234|2026-05-12 10:00:00 +0800|Initial commit";
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: logLine }));

    const result = await git.log(proj, { limit: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      const commit = result.value[0];
      expect(commit?.sha).toBe("abc1234567890");
      expect(commit?.subject).toBe("Initial commit");
    }
  });
});

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

describe("git.show", () => {
  it("returns file content for the given sha", async () => {
    const proj = uniqueProject();
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: "file content here" }));

    const result = await git.show(proj, "abc1234", "chapter-01.md");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("file content here");
    }
  });
});
