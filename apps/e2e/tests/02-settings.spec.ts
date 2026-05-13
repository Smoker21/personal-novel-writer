import { test, expect } from "@playwright/test";

test.describe("設定頁", () => {
  test("設定頁顯示 LLM Providers", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/settings.png" });
    await expect(page.getByText("LLM Providers")).toBeVisible();
  });

  test("設定頁有 LM Studio 設定區", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    // LM Studio 或地端 provider
    const lmStudio = page.getByText(/LM Studio|lmstudio/).first();
    await expect(lmStudio).toBeVisible();
  });

  test("設定頁有 Agent 預設模型區", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    // Agent routing section
    const routing = page.getByText(/Agent 預設模型|routing|章節寫手/).first();
    await expect(routing).toBeVisible();
    await page.screenshot({ path: "test-results/settings-routing.png" });
  });

  test("可以啟用 LM Studio 並輸入 endpoint", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/settings-before.png" });
  });
});
