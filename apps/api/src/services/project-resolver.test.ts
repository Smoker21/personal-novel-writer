import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalize } from "node:path";

// Mock settings-store so we don't touch the filesystem.
vi.mock("./settings-store.js", () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn().mockResolvedValue(undefined),
}));

import * as settingsStore from "./settings-store.js";
import { hashProjectPath, resolveProjectPath, touchProject } from "./project-resolver.js";
import { defaultSettings } from "@novel-writer/shared-types";
import type { AppSettings, RecentProject } from "@novel-writer/shared-types";

const readSettings = vi.mocked(settingsStore.readSettings);
const writeSettings = vi.mocked(settingsStore.writeSettings);

function makeSettings(recentProjects: RecentProject[] = []): AppSettings {
  return { ...defaultSettings(), recentProjects };
}

beforeEach(() => {
  vi.clearAllMocks();
  writeSettings.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// hashProjectPath
// ---------------------------------------------------------------------------

describe("hashProjectPath", () => {
  it("produces a stable 8-character hex string", () => {
    const hash = hashProjectPath("/some/project/path");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("same input always yields same hash", () => {
    const path = "/my/novel/project";
    expect(hashProjectPath(path)).toBe(hashProjectPath(path));
  });

  it("different paths yield different hashes", () => {
    expect(hashProjectPath("/project/a")).not.toBe(hashProjectPath("/project/b"));
  });
});

// ---------------------------------------------------------------------------
// resolveProjectPath
// ---------------------------------------------------------------------------

describe("resolveProjectPath", () => {
  it("returns the path when the hash matches a recent project", async () => {
    const projectPath = normalize("/my/novel");
    const hash = hashProjectPath(projectPath);

    readSettings.mockResolvedValue(
      makeSettings([
        {
          hash,
          path: projectPath,
          title: "My Novel",
          lastOpenedAt: "2026-01-01T00:00:00Z",
          pinned: false,
        },
      ]),
    );

    const result = await resolveProjectPath(hash);
    expect(result).toBe(projectPath);
  });

  it("returns null when no project matches the hash", async () => {
    readSettings.mockResolvedValue(
      makeSettings([
        {
          hash: "aabbccdd",
          path: "/other/project",
          title: "Other",
          lastOpenedAt: "2026-01-01T00:00:00Z",
          pinned: false,
        },
      ]),
    );

    const result = await resolveProjectPath("deadbeef");
    expect(result).toBeNull();
  });

  it("returns null when recentProjects is empty", async () => {
    readSettings.mockResolvedValue(makeSettings([]));

    const result = await resolveProjectPath("anything");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// touchProject
// ---------------------------------------------------------------------------

describe("touchProject", () => {
  it("adds a new project when it is not in recentProjects", async () => {
    readSettings.mockResolvedValue(makeSettings([]));

    await touchProject("/new/novel", "New Novel");

    expect(writeSettings).toHaveBeenCalledOnce();
    const saved = writeSettings.mock.calls[0]?.[0];
    expect(saved?.recentProjects).toHaveLength(1);
    expect(saved?.recentProjects[0]?.title).toBe("New Novel");
    expect(saved?.recentProjects[0]?.pinned).toBe(false);
  });

  it("updates lastOpenedAt for an existing project", async () => {
    const existing = normalize("/my/novel");
    const hash = hashProjectPath(existing);
    readSettings.mockResolvedValue(
      makeSettings([
        { hash, path: existing, title: "My Novel", lastOpenedAt: "2020-01-01T00:00:00Z", pinned: false },
      ]),
    );

    const before = Date.now();
    await touchProject(existing, "My Novel");
    const after = Date.now();

    const saved = writeSettings.mock.calls[0]?.[0];
    expect(saved?.recentProjects).toHaveLength(1);
    const updatedAt = saved?.recentProjects[0]?.lastOpenedAt;
    expect(updatedAt).toBeDefined();
    const ts = new Date(updatedAt as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("does not duplicate a project when touched twice", async () => {
    const projectPath = normalize("/my/novel");
    const hash = hashProjectPath(projectPath);

    // First call: no projects
    readSettings
      .mockResolvedValueOnce(makeSettings([]))
      .mockResolvedValueOnce(
        makeSettings([
          { hash, path: projectPath, title: "My Novel", lastOpenedAt: "2026-01-01T00:00:00Z", pinned: false },
        ]),
      );

    await touchProject(projectPath, "My Novel");
    await touchProject(projectPath, "My Novel");

    // Both writes should keep list length at 1
    const firstSave = writeSettings.mock.calls[0]?.[0];
    const secondSave = writeSettings.mock.calls[1]?.[0];
    expect(firstSave?.recentProjects).toHaveLength(1);
    expect(secondSave?.recentProjects).toHaveLength(1);
  });
});
