import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateProject } from "./project-validator.js";

describe("validateProject", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "validator-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeValidProject(name = "test") {
    const projectPath = join(tmpRoot, name);
    mkdirSync(join(projectPath, "chapters"), { recursive: true });
    mkdirSync(join(projectPath, "characters"), { recursive: true });
    mkdirSync(join(projectPath, "status"), { recursive: true });
    writeFileSync(
      join(projectPath, "project.yaml"),
      yaml.dump({
        title: name,
        createdAt: "2026-01-01T00:00:00Z",
        schemaVersion: 1,
      }),
      "utf-8",
    );
    writeFileSync(join(projectPath, "synopsis.md"), "", "utf-8");
    writeFileSync(join(projectPath, "characters", "_index.md"), "", "utf-8");
    writeFileSync(join(projectPath, "status", "story_status.md"), "", "utf-8");
    return projectPath;
  }

  it("returns 400 INVALID_PATH for relative path", async () => {
    const result = await validateProject("relative/path", false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_PATH");
  });

  it("returns 404 PATH_NOT_FOUND for missing directory", async () => {
    const result = await validateProject(join(tmpRoot, "nonexistent"), false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PATH_NOT_FOUND");
  });

  it("returns 422 MISSING_PROJECT_YAML when project.yaml absent", async () => {
    const path = join(tmpRoot, "empty");
    mkdirSync(path);
    const result = await validateProject(path, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_PROJECT_YAML");
  });

  it("returns 422 CORRUPTED_PROJECT_YAML when yaml invalid", async () => {
    const path = join(tmpRoot, "bad");
    mkdirSync(path);
    writeFileSync(join(path, "project.yaml"), ":not valid yaml: [", "utf-8");
    const result = await validateProject(path, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CORRUPTED_PROJECT_YAML");
  });

  it("returns 422 SCHEMA_VERSION_TOO_NEW when version too high", async () => {
    const path = join(tmpRoot, "newer");
    mkdirSync(path);
    writeFileSync(
      join(path, "project.yaml"),
      yaml.dump({ title: "x", createdAt: "2026", schemaVersion: 99 }),
      "utf-8",
    );
    const result = await validateProject(path, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA_VERSION_TOO_NEW");
  });

  it("returns ok=true for valid project with no warnings", async () => {
    const path = makeValidProject("good");
    const result = await validateProject(path, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.meta.title).toBe("good");
      const nonGitWarnings = result.data.warnings.filter(
        (w) => w.code !== "no_git_repo" && w.code !== "missing_optional_file",
      );
      expect(nonGitWarnings).toHaveLength(0);
    }
  });

  it("adds no_git_repo warning when .git missing", async () => {
    const path = makeValidProject("nogit");
    const result = await validateProject(path, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.warnings.find((w) => w.code === "no_git_repo")).toBeDefined();
    }
  });

  it("adds missing_optional_file warning when style.md absent", async () => {
    const path = makeValidProject("missing-style");
    const result = await validateProject(path, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w = result.data.warnings.find(
        (w) => w.code === "missing_optional_file" && w.message.includes("style.md"),
      );
      expect(w).toBeDefined();
    }
  });
});
