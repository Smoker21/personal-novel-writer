/**
 * Smoke test for better-sqlite3 native binding.
 *
 * Regression: native addons (better-sqlite3 / sharp) compile against a specific
 * NODE_MODULE_VERSION. Upgrading Node major (e.g. 18 → 26) breaks ABI and the
 * sidecar dies with ERR_DLOPEN_FAILED at first draft creation. This test makes
 * the failure surface during `pnpm test` instead of at runtime.
 *
 * If this fails after a Node upgrade: `pnpm rebuild better-sqlite3 sharp`
 * (already wired via root postinstall hook).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./cache-db.js";

describe("cache-db (smoke)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    tmpHome = mkdtempSync(join(tmpdir(), "cache-db-smoke-"));
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else process.env["HOME"] = undefined;
    if (originalUserprofile !== undefined) process.env["USERPROFILE"] = originalUserprofile;
    else process.env["USERPROFILE"] = undefined;
  });

  it("better-sqlite3 native binding loads + drafts table created", async () => {
    const db = await getDb("smoke-hash-12345678");
    // 寫 / 讀一筆驗證 schema + binding 全綠
    db.prepare(
      `INSERT INTO drafts (
        draft_id, project_hash, chapter_number, status, model_id,
        context_hash, total_chars, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "test-draft",
      "smoke-hash-12345678",
      1,
      "running",
      "test:model",
      "ctx-hash",
      0,
      new Date().toISOString(),
    );
    const row = db
      .prepare("SELECT draft_id, status FROM drafts WHERE draft_id = ?")
      .get("test-draft") as { draft_id: string; status: string };
    expect(row.draft_id).toBe("test-draft");
    expect(row.status).toBe("running");
    db.close();
  });

  it("getDb caches per-projectHash instance", async () => {
    const a1 = await getDb("smoke-hash-aaaa1111");
    const a2 = await getDb("smoke-hash-aaaa1111");
    expect(a1).toBe(a2);
    a1.close();
  });
});
