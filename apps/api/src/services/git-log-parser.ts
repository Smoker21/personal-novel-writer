import { spawnSync } from "node:child_process";
import type { GitCommit, GitCommitFile, GitCommitType } from "@novel-writer/shared-types";

function parseType(msg: string): GitCommitType {
  if (msg.startsWith("init:")) return "init";
  if (msg.startsWith("chapter:")) return "chapter";
  if (msg.startsWith("character:")) return "character";
  if (msg.startsWith("status:")) return "status";
  if (msg.startsWith("style:")) return "style";
  return "meta";
}

export async function parseGitLog(
  projectPath: string,
  opts: { file?: string; limit?: number; before?: string },
): Promise<{ commits: GitCommit[]; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 500);

  const args = [
    "log",
    "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s",
    "--numstat",
    `--max-count=${limit + 1}`,
  ];
  if (opts.before) args.push(`--before=${opts.before}`);
  if (opts.file) args.push("--", opts.file);

  const result = spawnSync("git", args, {
    cwd: projectPath,
    encoding: "utf-8",
    env: { ...process.env, LC_ALL: "C.UTF-8", GIT_TERMINAL_PROMPT: "0" },
    timeout: 10_000,
  });

  if (result.status !== 0) return { commits: [], hasMore: false };

  const raw = result.stdout ?? "";
  const commits: GitCommit[] = [];

  // Each commit block is separated by blank line (from numstat format)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: \x1f is the unit separator used in git --format
  const blocks = raw.trim().split(/\n(?=[0-9a-f]{40}\x1f)/);

  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0];
    if (!header) continue;

    const parts = header.split("\x1f");
    if (parts.length < 5) continue;

    const [sha, shortSha, author, date, ...msgParts] = parts;
    if (!sha || !shortSha || !author || !date) continue;
    const message = msgParts.join("\x1f");

    const files: GitCommitFile[] = [];
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const m = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (!m?.[3]) continue;
      files.push({
        path: m[3],
        status: "modified",
        additions: m[1] === "-" ? 0 : Number(m[1]),
        deletions: m[2] === "-" ? 0 : Number(m[2]),
      });
    }

    commits.push({ sha, shortSha, author, date, message, type: parseType(message), files });
  }

  const hasMore = commits.length > limit;
  return { commits: commits.slice(0, limit), hasMore };
}
