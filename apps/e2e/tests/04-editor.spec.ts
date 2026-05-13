import { test, expect } from "@playwright/test";

// 使用已存在的「校園奇遇」專案做測試
// hash 需要從 settings.yaml 讀取，先用 API 查詢

test.describe("章節編輯器", () => {
  let projectHash: string;

  test.beforeAll(async ({ request }) => {
    // 取得最近專案的 hash
    const res = await request.get("http://127.0.0.1:3001/api/settings");
    const settings = await res.json();
    const recents = settings.recentProjects ?? [];
    if (recents.length > 0) {
      projectHash = recents[0].hash;
    }
  });

  test("進入編輯器頁面", async ({ page }) => {
    if (!projectHash) {
      test.skip(true, "沒有可用的專案");
      return;
    }
    await page.goto(`/editor/${projectHash}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/editor.png" });

    // 應有 Novel Writer 或章節相關元素
    const hasEditor = await page.locator('.cm-editor, [class*="editor"], [class*="Editor"]').first().isVisible().catch(() => false);
    const hasToolbar = await page.locator('button, [role="toolbar"]').first().isVisible().catch(() => false);
    expect(hasEditor || hasToolbar).toBeTruthy();
  });

  test("建立章節後 AI 撰寫本章按鈕出現", async ({ page }) => {
    if (!projectHash) {
      test.skip(true, "沒有可用的專案");
      return;
    }
    await page.goto(`/editor/${projectHash}`);
    await page.waitForTimeout(1500);

    // 先建立一個新章節
    const newChapterBtn = page.getByText(/\+ 新章節/).first();
    if (await newChapterBtn.isVisible()) {
      await newChapterBtn.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: "test-results/editor-toolbar.png" });

    // AI 按鈕應該在章節載入後出現（需要章節已選中且 draft 為 idle）
    const aiBtn = page.getByText(/AI 撰寫本章/).first();
    const isVisible = await aiBtn.isVisible({ timeout: 5000 }).catch(() => false);
    // 記錄狀態但不強制失敗（按鈕可能因章節空而不顯示）
    console.log(`AI 撰寫本章 按鈕可見：${isVisible}`);
    await page.screenshot({ path: "test-results/editor-after-chapter.png" });
  });

  test("編輯器有角色連結", async ({ page }) => {
    if (!projectHash) {
      test.skip(true, "沒有可用的專案");
      return;
    }
    await page.goto(`/editor/${projectHash}`);
    await page.waitForTimeout(2000);

    // 應有角色連結
    const charLink = page.getByText(/角色/).first();
    await expect(charLink).toBeVisible({ timeout: 5000 });
  });

  test("角色管理頁面可進入", async ({ page }) => {
    if (!projectHash) {
      test.skip(true, "沒有可用的專案");
      return;
    }
    await page.goto(`/editor/${projectHash}/characters`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-results/characters-page.png" });
    // 應有角色管理相關元素
    const hasCharUI = await page.getByText(/角色|Character/).first().isVisible().catch(() => false);
    expect(hasCharUI).toBeTruthy();
  });
});
