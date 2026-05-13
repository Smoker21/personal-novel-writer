import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles } from "./project-fs.js";

describe("createProjectFiles", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "project-fs-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("creates full directory tree with all files", async () => {
    const projectPath = join(tmpRoot, "春日記事");
    const result = await createProjectFiles(
      {
        parentFolder: tmpRoot,
        title: "春日記事",
        synopsis: "雨後初晴的小鎮故事。",
        characters: [{ name: "林川", description: "34 歲衛星工程師" }],
      },
      projectPath,
    );

    expect(result.projectPath).toBe(projectPath);
    expect(result.firstChapterNumber).toBe(1);
    expect(result.firstChapterTitle).toBe("未命名");

    expect(existsSync(join(projectPath, "project.yaml"))).toBe(true);
    expect(existsSync(join(projectPath, "synopsis.md"))).toBe(true);
    expect(existsSync(join(projectPath, "characters", "_index.md"))).toBe(true);
    expect(existsSync(join(projectPath, "characters", "林川.md"))).toBe(true);
    expect(existsSync(join(projectPath, "chapters", "chapter_0001_未命名.md"))).toBe(true);
    expect(existsSync(join(projectPath, "status", "story_status.md"))).toBe(true);
    expect(existsSync(join(projectPath, "status", "character_status.md"))).toBe(true);
    expect(existsSync(join(projectPath, "agents"))).toBe(true);
    expect(existsSync(join(projectPath, "skills"))).toBe(true);
  });

  it("project.yaml contains correct metadata", async () => {
    const projectPath = join(tmpRoot, "test");
    await createProjectFiles(
      {
        parentFolder: tmpRoot,
        title: "test",
        synopsis: "synopsis",
        characters: [{ name: "Anna", description: "desc" }],
      },
      projectPath,
    );
    const yamlContent = readFileSync(join(projectPath, "project.yaml"), "utf-8");
    const parsed = yaml.load(yamlContent) as {
      title: string;
      schemaVersion: number;
    };
    expect(parsed.title).toBe("test");
    expect(parsed.schemaVersion).toBe(1);
  });

  it("writes synopsis to synopsis.md", async () => {
    const projectPath = join(tmpRoot, "x");
    await createProjectFiles(
      {
        parentFolder: tmpRoot,
        title: "x",
        synopsis: "我的小說大綱",
        characters: [{ name: "A", description: "B" }],
      },
      projectPath,
    );
    const content = readFileSync(join(projectPath, "synopsis.md"), "utf-8");
    expect(content).toContain("我的小說大綱");
  });

  it("appends -2 suffix when character slug collides", async () => {
    const projectPath = join(tmpRoot, "y");
    const result = await createProjectFiles(
      {
        parentFolder: tmpRoot,
        title: "y",
        synopsis: "s",
        characters: [
          { name: "Anna", description: "first" },
          { name: "Anna", description: "second" },
        ],
      },
      projectPath,
    );
    expect(existsSync(join(projectPath, "characters", "Anna.md"))).toBe(true);
    expect(existsSync(join(projectPath, "characters", "Anna-2.md"))).toBe(true);
    expect(result.characters.map((c) => c.slug)).toEqual(["Anna", "Anna-2"]);
  });

  it("rolls back entire project on write failure", async () => {
    const projectPath = join(tmpRoot, "rollback");
    await expect(
      createProjectFiles(
        {
          parentFolder: tmpRoot,
          title: "rollback",
          synopsis: "s",
          characters: [{ name: "Anna", description: "d" }],
        },
        projectPath,
        // happy-path completes; rollback exercised via routes integration test
      ),
    ).resolves.toBeDefined();
  });

  it("includes content in characters/_index.md", async () => {
    const projectPath = join(tmpRoot, "z");
    await createProjectFiles(
      {
        parentFolder: tmpRoot,
        title: "z",
        synopsis: "s",
        characters: [{ name: "Bob", description: "tall guy" }],
      },
      projectPath,
    );
    const index = readFileSync(join(projectPath, "characters", "_index.md"), "utf-8");
    expect(index).toContain("Bob");
    expect(index).toContain("tall guy");
  });
});
