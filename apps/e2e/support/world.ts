/**
 * Custom World for BDD tests.
 *
 * Exposes a Playwright Browser, BrowserContext, and Page, as well as helpers
 * for simulating "app restart" (new context) and accessing the API base URL.
 */
import { setWorldConstructor, World } from "@cucumber/cucumber";
import { type Browser, chromium, type BrowserContext, type Page } from "@playwright/test";

export const WEB_BASE_URL = "http://localhost:5173";
export const API_BASE_URL = "http://localhost:3001";

export class NovelWriterWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;

  /** Initialise browser + context + page. Called in BeforeScenario hook. */
  async openBrowser(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ baseURL: WEB_BASE_URL });
    this.page = await this.context.newPage();
  }

  /** Close page+context+browser. Called in AfterScenario hook. */
  async closeBrowser(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }

  /**
   * Simulate "重新啟動應用": closes current context and opens a fresh one.
   * This is the closest a Playwright test can get to an app restart without
   * re-spawning servers. Documented as D5 自治決策.
   */
  async restartApp(): Promise<void> {
    await this.context.close();
    this.context = await this.browser.newContext({ baseURL: WEB_BASE_URL });
    this.page = await this.context.newPage();
  }

  /** Navigate to the app root and wait for it to settle. */
  async gotoHome(): Promise<void> {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }
}

setWorldConstructor(NovelWriterWorld);
