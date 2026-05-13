import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRecentProject,
  clearRecentProjects,
  relocateRecentProject,
  removeRecentProject,
  updateRecentProjectMeta,
} from "./recent-projects-store.js";
import { readSettings } from "./settings-store.js";

describe("recent-projects-store", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "rps-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
  });

  it("addRecentProject inserts new entry", async () => {
    await addRecentProject("hash1", "/projects/a", "Novel A");
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(1);
    expect(settings.recentProjects[0]?.hash).toBe("hash1");
    expect(settings.recentProjects[0]?.title).toBe("Novel A");
  });

  it("addRecentProject updates lastOpenedAt when hash exists", async () => {
    await addRecentProject("hash1", "/projects/a", "Novel A");
    const firstAt = (await readSettings()).recentProjects[0]?.lastOpenedAt;
    await new Promise((r) => setTimeout(r, 10));
    await addRecentProject("hash1", "/projects/a", "Novel A");
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(1);
    expect(settings.recentProjects[0]?.lastOpenedAt).not.toBe(firstAt);
  });

  it("addRecentProject enforces 10 entry LRU cap", async () => {
    for (let i = 0; i < 12; i++) {
      await addRecentProject(`hash${i}`, `/projects/${i}`, `Novel ${i}`);
    }
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(10);
    // most recent first
    expect(settings.recentProjects[0]?.hash).toBe("hash11");
  });

  it("removeRecentProject removes by hash", async () => {
    await addRecentProject("hash1", "/projects/a", "A");
    await addRecentProject("hash2", "/projects/b", "B");
    const removed = await removeRecentProject("hash1");
    expect(removed).toBe(true);
    const settings = await readSettings();
    expect(settings.recentProjects.map((r) => r.hash)).toEqual(["hash2"]);
  });

  it("removeRecentProject returns false when hash missing", async () => {
    const removed = await removeRecentProject("nonexistent");
    expect(removed).toBe(false);
  });

  it("clearRecentProjects empties the list", async () => {
    await addRecentProject("h1", "/a", "A");
    await addRecentProject("h2", "/b", "B");
    const count = await clearRecentProjects();
    expect(count).toBe(2);
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(0);
  });

  it("updateRecentProjectMeta patches existing entry", async () => {
    await addRecentProject("h1", "/a", "A");
    await updateRecentProjectMeta("h1", { lastChapter: 3, chapterCount: 5 });
    const settings = await readSettings();
    expect(settings.recentProjects[0]?.lastChapter).toBe(3);
    expect(settings.recentProjects[0]?.chapterCount).toBe(5);
  });

  it("relocateRecentProject swaps oldHash for newPath", async () => {
    await addRecentProject("oldh", "/old/path", "Title");
    await relocateRecentProject("oldh", "/new/path", "NewTitle");
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(1);
    expect(settings.recentProjects[0]?.path).toBe("/new/path");
    expect(settings.recentProjects[0]?.title).toBe("NewTitle");
    expect(settings.recentProjects[0]?.hash).not.toBe("oldh");
  });
});
