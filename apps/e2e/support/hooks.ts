/**
 * Cucumber hooks for BDD tests.
 *
 * IMPORTANT: settings backup/restore
 * ------------------------------------
 * ~/.novel-writer/settings.yaml is the developer's real settings file, which
 * contains API keys and routing configuration. The BDD scenarios for 032 modify
 * this file as part of their preconditions and assertions.
 *
 * Strategy:
 *   BeforeAll: snapshot current file (or null) to memory.
 *   AfterAll:  restore from snapshot (delete if it was absent).
 *   Before(each scenario): set the file to the state the scenario requires
 *              (done in individual step definitions via settings-fs.ts helpers).
 *   After(each scenario): no-op; BeforeAll/AfterAll handle the bookend restore.
 *
 * Pre-requisite: `pnpm dev` must be running (Vite at :5173 + Hono API at :3001).
 * Tests will fail with a clear message if the servers are not available.
 */
import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import type { NovelWriterWorld } from "./world.js";
import { readSettingsRaw, writeSettingsRaw, deleteSettings } from "./settings-fs.js";

// Using a flag+value pair because null is a valid state (file absent).
let _captured = false;
let _snapshotValue: string | null = null;

BeforeAll(async function () {
  // Snapshot the real settings.yaml before any test touches it.
  _snapshotValue = readSettingsRaw();
  _captured = true;
  console.log(
    `[hooks] settings.yaml snapshot taken: ${_snapshotValue === null ? "FILE ABSENT" : `${_snapshotValue.length} bytes`}`,
  );
});

AfterAll(async function () {
  if (!_captured) {
    console.error("[hooks] WARN: snapshot was never taken — skipping restore to avoid data loss");
    return;
  }
  // Restore the original state.
  if (_snapshotValue === null) {
    deleteSettings();
    console.log("[hooks] settings.yaml deleted (restored to absent state)");
  } else {
    writeSettingsRaw(_snapshotValue);
    console.log("[hooks] settings.yaml restored from snapshot");
  }
});

// Each scenario gets a fresh browser/context/page.
Before(async function (this: NovelWriterWorld) {
  await this.openBrowser();
});

After(async function (this: NovelWriterWorld) {
  await this.closeBrowser();
});
