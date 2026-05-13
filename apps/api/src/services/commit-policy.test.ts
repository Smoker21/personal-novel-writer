import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitIfChanged } from "./commit-policy.js";

describe("commitIfChanged (integration)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "commit-policy-"));
    execSync("git init -q", { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "test"', { cwd: tmpDir });
    writeFileSync(join(tmpDir, "seed.txt"), "seed");
    execSync("git add . && git commit -q -m seed", { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when working tree is clean", async () => {
    const result = await commitIfChanged(tmpDir, "save-chapter", "no changes");
    expect(result).toBeNull();
  });

  it("commits when file modified", async () => {
    writeFileSync(join(tmpDir, "seed.txt"), "changed content");
    const result = await commitIfChanged(tmpDir, "save-chapter", "ch1 saved");
    expect(result).not.toBeNull();
    expect(result?.sha).toMatch(/^[a-f0-9]{40}$/);
    const log = execSync("git log --oneline -1", { cwd: tmpDir }).toString();
    expect(log).toContain("chapter: ch1 saved");
  });

  it("commits when untracked file present", async () => {
    writeFileSync(join(tmpDir, "new.txt"), "new file");
    const result = await commitIfChanged(tmpDir, "create-project", "novel created");
    expect(result).not.toBeNull();
    const log = execSync("git log --oneline -1", { cwd: tmpDir }).toString();
    expect(log).toContain("init: novel created");
  });

  it("uses chapter prefix for rename-chapter trigger", async () => {
    writeFileSync(join(tmpDir, "renamed.txt"), "renamed");
    await commitIfChanged(tmpDir, "rename-chapter", "ch1 retitled");
    const log = execSync("git log --oneline -1", { cwd: tmpDir }).toString();
    expect(log).toContain("chapter: ch1 retitled");
  });
});
