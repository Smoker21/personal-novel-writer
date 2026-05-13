import type { GitFileChange, GitStatus } from "@novel-writer/shared-types";

const STATUS_MAP: Record<string, GitFileChange["status"]> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
};

export function parseStatus(stdout: string): GitStatus {
  let branch = "";
  let detached = false;
  let ahead = 0;
  let behind = 0;
  const changes: GitFileChange[] = [];

  for (const line of stdout.split("\n")) {
    if (!line) continue;

    if (line.startsWith("# branch.head ")) {
      branch = line.slice("# branch.head ".length);
      detached = branch === "(detached)";
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
      continue;
    }
    if (line.startsWith("#")) continue;

    if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      const xy = parts[1] ?? "";
      const path = parts.slice(8).join(" ");
      const code = (xy[0] !== "." ? xy[0] : xy[1]) ?? "";
      const status = STATUS_MAP[code];
      if (status !== undefined) changes.push({ path, status });
      continue;
    }

    if (line.startsWith("2 ")) {
      const parts = line.split(" ");
      const pathPart = parts.slice(9).join(" ");
      const tabIdx = pathPart.indexOf("\t");
      if (tabIdx === -1) continue;
      const newPath = pathPart.slice(0, tabIdx);
      const oldPath = pathPart.slice(tabIdx + 1);
      changes.push({ path: newPath, status: "renamed", oldPath });
      continue;
    }

    if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const path = parts.slice(10).join(" ");
      changes.push({ path, status: "conflicted" });
      continue;
    }

    if (line.startsWith("? ")) {
      changes.push({ path: line.slice(2), status: "untracked" });
      continue;
    }
  }

  return {
    clean: changes.length === 0,
    branch,
    detached,
    changes,
    ahead,
    behind,
  };
}
