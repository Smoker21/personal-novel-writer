import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs/promises before importing the module under test.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import * as fsp from "node:fs/promises";
import { atomicWriteFile, atomicWriteJson } from "./atomic-fs.js";

const mkdir = vi.mocked(fsp.mkdir);
const writeFile = vi.mocked(fsp.writeFile);
const rename = vi.mocked(fsp.rename);
const unlink = vi.mocked(fsp.unlink);

beforeEach(() => {
  vi.clearAllMocks();
  mkdir.mockResolvedValue(undefined);
  writeFile.mockResolvedValue(undefined);
  rename.mockResolvedValue(undefined);
  unlink.mockResolvedValue(undefined);
});

describe("atomicWriteFile", () => {
  it("writes tmp then renames on success", async () => {
    const filePath = "/some/dir/file.txt";
    await atomicWriteFile(filePath, "hello");

    expect(writeFile).toHaveBeenCalledWith(`${filePath}.tmp`, "hello", "utf-8");
    expect(rename).toHaveBeenCalledWith(`${filePath}.tmp`, filePath);
    expect(unlink).not.toHaveBeenCalled();
  });

  it("cleans up tmp file and rethrows when rename fails", async () => {
    const filePath = "/some/dir/file.txt";
    const renameError = new Error("rename failed");
    rename.mockRejectedValue(renameError);

    await expect(atomicWriteFile(filePath, "hello")).rejects.toThrow("rename failed");

    expect(unlink).toHaveBeenCalledWith(`${filePath}.tmp`);
  });

  it("creates parent directory when it does not exist", async () => {
    const filePath = "/deep/nested/path/file.txt";
    await atomicWriteFile(filePath, "content");

    expect(mkdir).toHaveBeenCalledWith("/deep/nested/path", { recursive: true });
  });
});

describe("atomicWriteJson", () => {
  it("serialises data and delegates to atomicWriteFile", async () => {
    const filePath = "/some/file.json";
    const data = { key: "value", num: 42 };

    await atomicWriteJson(filePath, data);

    expect(writeFile).toHaveBeenCalledWith(
      `${filePath}.tmp`,
      JSON.stringify(data, null, 2),
      "utf-8",
    );
    expect(rename).toHaveBeenCalledWith(`${filePath}.tmp`, filePath);
  });
});
