import { describe, expect, it } from "vitest";
import { parseStatus } from "./git-status-parser.js";

describe("parseStatus", () => {
  it("clean working tree", () => {
    const stdout = `# branch.oid abc123\n# branch.head main\n# branch.ab +0 -0\n`;
    const result = parseStatus(stdout);
    expect(result).toEqual({
      clean: true,
      branch: "main",
      detached: false,
      changes: [],
      ahead: 0,
      behind: 0,
    });
  });

  it("modified file", () => {
    const stdout = `# branch.head main\n1 .M N... 100644 100644 100644 abc def chapters/c.md\n`;
    const result = parseStatus(stdout);
    expect(result.clean).toBe(false);
    expect(result.changes).toEqual([{ path: "chapters/c.md", status: "modified" }]);
  });

  it("added (untracked staged)", () => {
    const stdout = `# branch.head main\n1 A. N... 000000 100644 100644 0 def new.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "new.md", status: "added" });
  });

  it("deleted", () => {
    const stdout = `# branch.head main\n1 .D N... 100644 100644 000000 abc 0 gone.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "gone.md", status: "deleted" });
  });

  it("renamed", () => {
    const stdout = `# branch.head main\n2 R. N... 100644 100644 100644 abc def R90 chapters/new.md\tchapters/old.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({
      path: "chapters/new.md",
      status: "renamed",
      oldPath: "chapters/old.md",
    });
  });

  it("untracked", () => {
    const stdout = `# branch.head main\n? unknown.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "unknown.md", status: "untracked" });
  });

  it("conflicted", () => {
    const stdout = `# branch.head main\nu UU N... 100644 100644 100644 100644 abc def ghi conflict.md\n`;
    const result = parseStatus(stdout);
    expect(result.changes[0]).toEqual({ path: "conflict.md", status: "conflicted" });
  });

  it("detached HEAD", () => {
    const stdout = `# branch.oid abc123\n# branch.head (detached)\n`;
    const result = parseStatus(stdout);
    expect(result.detached).toBe(true);
    expect(result.branch).toBe("(detached)");
  });

  it("ahead/behind tracking", () => {
    const stdout = `# branch.head main\n# branch.ab +3 -2\n`;
    const result = parseStatus(stdout);
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(2);
  });
});
