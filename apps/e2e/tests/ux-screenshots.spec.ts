/**
 * UX Review Screenshot Capture
 * 自動截圖所有 21 個 UI 表面，供 UX 報告使用
 */
import { test } from "@playwright/test";

const PROJECT_HASH = "c4609c4e10072ee5";
const EDITOR = `/editor/${PROJECT_HASH}`;
const SCREENSHOTS = "ux-screenshots";

test.use({ viewport: { width: 1280, height: 800 } });

// ─── A. Pages ─────────────────────────────────────────────────────────────

test("A1 HomePage", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOTS}/A1-HomePage.png`, fullPage: true });
});

test("A2 ChapterEditorPage — no chapter selected", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/A2-ChapterEditorPage-empty.png`, fullPage: false });
});

test("A2b ChapterEditorPage — with chapter", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(1500);
  // Try to click first chapter or create one
  const chapterBtn = page
    .locator("button")
    .filter({ hasText: /章節|第\s*\d+|未命名/ })
    .first();
  const newChapterBtn = page.getByText("+ 新章節").first();
  if (await chapterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await chapterBtn.click();
  } else if (await newChapterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newChapterBtn.click();
  }
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: `${SCREENSHOTS}/A2b-ChapterEditorPage-withChapter.png`,
    fullPage: false,
  });
});

test("A3 CharactersPage", async ({ page }) => {
  await page.goto(`${EDITOR}/characters`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/A3-CharactersPage.png`, fullPage: false });
});

test("A4 SettingsPage", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOTS}/A4-SettingsPage-top.png`, fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS}/A4b-SettingsPage-routing.png`, fullPage: false });
});

test("A5 StatusEditorPage", async ({ page }) => {
  await page.goto(`${EDITOR}/status/story`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/A5-StatusEditorPage.png`, fullPage: false });
});

// ─── B. MainPanels ─────────────────────────────────────────────────────────

test("B1 ChapterList panel", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(2000);
  // Focus on left column (chapter list)
  // biome-ignore lint/correctness/noUnusedVariables: selector exists for visual reference
  const leftCol = page.locator(".flex.flex-col.h-full").first();
  await page.screenshot({ path: `${SCREENSHOTS}/B1-ChapterList.png`, fullPage: false });
});

test("B2 ChapterEditor CM6", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(1500);
  const newChapterBtn = page.getByText("+ 新章節").first();
  if (await newChapterBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await newChapterBtn.click();
    await page.waitForTimeout(2000);
  }
  // Type some text to show the editor
  const editor = page.locator(".cm-editor").first();
  if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editor.click();
    await page.keyboard.type("春雨推開圖書館的玻璃門，書香混著雨水的氣息迎面而來。");
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOTS}/B2-ChapterEditor-CM6.png`, fullPage: false });
});

test("B3 DraftPanel — AI generating", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(2000);
  // Take screenshot of DraftPanel state (after chapter is created and draft started)
  // Since we can't easily trigger AI without LM Studio, show the panel in idle state
  await page.screenshot({ path: `${SCREENSHOTS}/B3-DraftPanel-idle.png`, fullPage: false });
});

test("B4 CharacterPanel", async ({ page }) => {
  await page.goto(`${EDITOR}/characters`);
  await page.waitForTimeout(2000);
  // Screenshot focuses on the left character list panel
  await page.screenshot({ path: `${SCREENSHOTS}/B4-CharacterPanel.png`, fullPage: false });
});

test("B5 CharacterEditor — new character", async ({ page }) => {
  await page.goto(`${EDITOR}/characters`);
  await page.waitForTimeout(1500);
  // Click 新增 button
  const newBtn = page.getByText("+ 新增").first();
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: `${SCREENSHOTS}/B5-CharacterEditor-new.png`, fullPage: false });
});

test("B5b CharacterEditor — tabs", async ({ page }) => {
  await page.goto(`${EDITOR}/characters`);
  await page.waitForTimeout(1500);
  const newBtn = page.getByText("+ 新增").first();
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(500);
  }
  // Click 個性 tab
  const personalityTab = page.getByText("個性").first();
  if (await personalityTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await personalityTab.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({
    path: `${SCREENSHOTS}/B5b-CharacterEditor-personality-tab.png`,
    fullPage: false,
  });
});

test("B6 HistoryPanel", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(2000);
  // Click 歷史 button
  const histBtn = page.getByText("歷史").first();
  if (await histBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await histBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${SCREENSHOTS}/B6-HistoryPanel.png`, fullPage: false });
});

// ─── C. Dialogs / Modals ───────────────────────────────────────────────────

test("C1 NewProjectDialog", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const newBtn = page.getByRole("button", { name: /新小說/ }).first();
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${SCREENSHOTS}/C1-NewProjectDialog.png`, fullPage: false });
});

test("C1b NewProjectDialog — step 2", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const newBtn = page.getByRole("button", { name: /新小說/ }).first();
  if (await newBtn.isVisible().catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(500);
    // Fill title and click next
    const titleInput = page.locator('input[type="text"]').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill("梅雨中的書卷");
    }
    const nextBtn = page.getByText("下一步").first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }
  }
  await page.screenshot({ path: `${SCREENSHOTS}/C1b-NewProjectDialog-step2.png`, fullPage: false });
});

test("C4 FirstLaunchWarningDialog", async ({ page }) => {
  // Clear the first launch flag by navigating directly
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Try to trigger it via localStorage manipulation
  await page.evaluate(() => {
    // This dialog is controlled by settings API, not localStorage
    // Just screenshot current state
  });
  await page.screenshot({
    path: `${SCREENSHOTS}/C4-FirstLaunchWarning-state.png`,
    fullPage: false,
  });
});

test("C6 LlmNotConfiguredModal", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(2000);
  // Create chapter first
  const newChapterBtn = page.getByText("+ 新章節").first();
  if (await newChapterBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await newChapterBtn.click();
    await page.waitForTimeout(1500);
  }
  // Click AI 撰寫本章 button (should trigger modal if not configured)
  const aiBtn = page.getByText("AI 撰寫本章").first();
  if (await aiBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await aiBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS}/C6-LlmNotConfiguredModal.png`, fullPage: false });
  } else {
    await page.screenshot({
      path: `${SCREENSHOTS}/C6-LlmNotConfiguredModal-not-triggered.png`,
      fullPage: false,
    });
  }
});

test("C7 AdoptButton states", async ({ page }) => {
  await page.goto(EDITOR);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/C7-AdoptButton-initial.png`, fullPage: false });
});

// ─── Full page scroll captures ─────────────────────────────────────────────

test("FULL SettingsPage", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOTS}/FULL-SettingsPage.png`, fullPage: true });
});

test("FULL HomePage", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOTS}/FULL-HomePage.png`, fullPage: true });
});
