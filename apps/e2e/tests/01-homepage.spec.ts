import { test, expect } from "@playwright/test";

test.describe("首頁", () => {
  test("首頁正確顯示 Novel Writer 標題", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Novel Writer")).toBeVisible();
  });

  test("首頁有「新小說」按鈕", async ({ page }) => {
    await page.goto("/");
    // 等待頁面載入
    await page.waitForLoadState("networkidle");
    // 截圖記錄
    await page.screenshot({ path: "test-results/homepage.png" });
    // 找新小說相關按鈕
    const newBtn = page.getByRole("button", { name: /新小說|新建|建立/ }).first();
    await expect(newBtn).toBeVisible();
  });

  test("首頁有設定連結", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const settingsLink = page.getByRole("link", { name: /設定/ }).first();
    await expect(settingsLink).toBeVisible();
  });
});
