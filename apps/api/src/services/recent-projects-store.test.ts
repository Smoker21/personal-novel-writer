import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashProjectPath } from "./path-utils.js";
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

  it("addRecentProject inserts new entry with hash computed from path", async () => {
    const path = "/projects/a";
    const expectedHash = hashProjectPath(path);
    await addRecentProject(expectedHash, path, "Novel A");
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(1);
    // M5: stored hash is re-computed from canonicalized path
    expect(settings.recentProjects[0]?.hash).toBe(hashProjectPath(path));
    expect(settings.recentProjects[0]?.title).toBe("Novel A");
  });

  it("addRecentProject updates lastOpenedAt when path matches existing", async () => {
    const path = "/projects/a";
    const h = hashProjectPath(path);
    await addRecentProject(h, path, "Novel A");
    const firstAt = (await readSettings()).recentProjects[0]?.lastOpenedAt;
    await new Promise((r) => setTimeout(r, 10));
    await addRecentProject(h, path, "Novel A");
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(1);
    expect(settings.recentProjects[0]?.lastOpenedAt).not.toBe(firstAt);
  });

  it("addRecentProject enforces 10 entry LRU cap", async () => {
    const paths: string[] = [];
    for (let i = 0; i < 12; i++) {
      const p = `/projects/${i}`;
      paths.push(p);
      await addRecentProject(hashProjectPath(p), p, `Novel ${i}`);
    }
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(10);
    // most recent first — index 11 is most recent
    expect(settings.recentProjects[0]?.hash).toBe(hashProjectPath(paths[11] as string));
  });

  it("removeRecentProject removes by hash", async () => {
    const pA = "/projects/a";
    const pB = "/projects/b";
    const hA = hashProjectPath(pA);
    const hB = hashProjectPath(pB);
    await addRecentProject(hA, pA, "A");
    await addRecentProject(hB, pB, "B");
    const removed = await removeRecentProject(hA);
    expect(removed).toBe(true);
    const settings = await readSettings();
    expect(settings.recentProjects.map((r) => r.hash)).toEqual([hB]);
  });

  it("removeRecentProject returns false when hash missing", async () => {
    const removed = await removeRecentProject("nonexistent");
    expect(removed).toBe(false);
  });

  it("clearRecentProjects empties the list", async () => {
    await addRecentProject(hashProjectPath("/a"), "/a", "A");
    await addRecentProject(hashProjectPath("/b"), "/b", "B");
    const count = await clearRecentProjects();
    expect(count).toBe(2);
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(0);
  });

  it("updateRecentProjectMeta patches existing entry", async () => {
    const h = hashProjectPath("/a");
    await addRecentProject(h, "/a", "A");
    await updateRecentProjectMeta(h, { lastChapter: 3, chapterCount: 5 });
    const settings = await readSettings();
    expect(settings.recentProjects[0]?.lastChapter).toBe(3);
    expect(settings.recentProjects[0]?.chapterCount).toBe(5);
  });

  it("relocateRecentProject swaps oldHash for newPath", async () => {
    await addRecentProject(hashProjectPath("/old/path"), "/old/path", "Title");
    // Re-read to get the actual stored hash (canonicalized)
    const beforeRelocate = await readSettings();
    const storedOldHash = beforeRelocate.recentProjects[0]?.hash as string;
    await relocateRecentProject(storedOldHash, "/new/path", "NewTitle");
    const settings = await readSettings();
    expect(settings.recentProjects).toHaveLength(1);
    expect(settings.recentProjects[0]?.title).toBe("NewTitle");
    expect(settings.recentProjects[0]?.hash).toBe(hashProjectPath("/new/path"));
    expect(settings.recentProjects[0]?.hash).not.toBe(storedOldHash);
  });
});
