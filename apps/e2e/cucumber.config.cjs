/**
 * cucumber-js configuration for BDD step definitions.
 *
 * Pre-requisite: `pnpm dev` must be running (Vite at :5173 + Hono API at :3001).
 * This is documented in PR description as a D5 跨檔行為 note.
 *
 * Settings backup: BeforeAll/AfterAll in support/hooks.ts backup and restore
 * ~/.novel-writer/settings.yaml so the developer's real settings are never lost.
 *
 * Excluded features (parse errors — Markdown bullet syntax in step text):
 *   - 002b-character-card-from-image.feature
 *   - 010-git-version-control.feature
 * These are NOT in the M6-A target list; reported to PM for .feature cleanup.
 *
 * cucumber-js config file format: exports a "profiles" object where
 * `default` key is the default profile configuration.
 */

const path = require("node:path");

// Resolve absolute paths to avoid Windows relative-path resolution issues
const featuresDir = path.resolve(__dirname, "../../docs/requirements/features");
const supportDir = path.resolve(__dirname, "support");
const stepDefsDir = path.resolve(__dirname, "step-definitions");

module.exports = {
  default: {
    paths: [
      path.join(featuresDir, "001-create-novel-project.feature"),
      path.join(featuresDir, "002-edit-character-card.feature"),
      path.join(featuresDir, "003-edit-chapter-basic.feature"),
      path.join(featuresDir, "004-undo-redo-chapter.feature"),
      path.join(featuresDir, "005-ai-write-chapter.feature"),
      path.join(featuresDir, "006-adopt-chapter-draft.feature"),
      path.join(featuresDir, "007-update-story-character-status.feature"),
      path.join(featuresDir, "008-open-existing-project.feature"),
      path.join(featuresDir, "009-settings-page.feature"),
      path.join(featuresDir, "012-polish-prose.feature"),
      path.join(featuresDir, "032-first-launch-warning.feature"),
    ],
    require: [
      path.join(supportDir, "world.ts"),
      path.join(supportDir, "hooks.ts"),
      path.join(stepDefsDir, "**/*.ts"),
    ],
    requireModule: ["tsx/cjs"],
    format: ["progress", "summary"],
    publish: false,
  },
};
