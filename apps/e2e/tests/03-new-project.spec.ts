import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Page, expect, test } from "@playwright/test";

// 每個 test 用獨立的臨時目錄
let tmpDir: string;

test.beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `novel-e2e-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// biome-ignore lint/correctness/noUnusedVariables: utility function for future tests
async function createProject(page: Page, title: string, synopsis: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // 點「新小說」按鈕
  const newBtn = page.getByRole("button", { name: /新小說|建立/ }).first();
  await newBtn.click();

  // 等待對話框出現
  await page.waitForSelector('[role="dialog"], form', { timeout: 5000 }).catch(() => null);
  await page.screenshot({ path: "test-results/new-project-dialog.png" });

  // 填寫標題
  const titleInput = page.getByPlaceholder(/標題|title/i).first();
  if (await titleInput.isVisible()) {
    await titleInput.fill(title);
  }

  // 填寫簡介
  const synopsisInput = page.getByPlaceholder(/簡介|synopsis/i).first();
  if (await synopsisInput.isVisible()) {
    await synopsisInput.fill(synopsis);
  }

  await page.screenshot({ path: "test-results/new-project-filled.png" });
}

test.describe("新建專案", () => {
  test("點「新小說」開啟對話框", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const newBtn = page.getByRole("button", { name: /新小說|建立/ }).first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    await page.waitForTimeout(1000);
    await page.screenshot({ path: "test-results/after-new-btn-click.png" });
    // 期望有某種對話框或表單出現
    const hasForm = await page
      .locator('input[type="text"], textarea, [role="dialog"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasForm).toBeTruthy();
  });
});
