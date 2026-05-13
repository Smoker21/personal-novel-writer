import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { projects } from "./projects.js";

describe("POST /api/projects", () => {
  let tmpHome: string;
  let tmpProject: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  function makeValidProject(name: string): string {
    const path = join(tmpProject, name);
    mkdirSync(join(path, "chapters"), { recursive: true });
    mkdirSync(join(path, "characters"), { recursive: true });
    mkdirSync(join(path, "status"), { recursive: true });
    writeFileSync(
      join(path, "project.yaml"),
      yaml.dump({ title: name, createdAt: "2026-01-01T00:00:00Z", schemaVersion: 1 }),
    );
    writeFileSync(join(path, "synopsis.md"), "");
    writeFileSync(join(path, "characters", "_index.md"), "");
    writeFileSync(join(path, "status", "story_status.md"), "");
    return path;
  }

  beforeEach(() => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "projects-home-"));
    tmpProject = mkdtempSync(join(tmpdir(), "projects-test-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(tmpProject, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
  });

  it("POST /open returns 200 for valid project", async () => {
    const path = makeValidProject("hello");
    const res = await projects.request("/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source: "browse" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { title: string }; warnings: unknown[] };
    expect(body.project.title).toBe("hello");
  });

  it("POST /open returns 422 MISSING_PROJECT_YAML for empty dir", async () => {
    const path = join(tmpProject, "empty");
    mkdirSync(path);
    const res = await projects.request("/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source: "browse" }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /open returns 404 PATH_NOT_FOUND", async () => {
    const res = await projects.request("/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: join(tmpProject, "nope"), source: "browse" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /recent/remove returns removed:false for unknown hash", async () => {
    const res = await projects.request("/recent/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hash: "unknown" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removed: boolean };
    expect(body.removed).toBe(false);
  });

  it("POST /recent/clear empties list", async () => {
    const res = await projects.request("/recent/clear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cleared: boolean };
    expect(body.cleared).toBe(true);
  });
});
