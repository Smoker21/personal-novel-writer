import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../docs/prototypes/screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5174';
const W = 1440, H = 900;

async function waitReady(page) {
  await page.waitForSelector('header', { timeout: 12000 });
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png`);
}

// Inject dark mode via IDB manipulation (simpler than clicking through settings)
async function setDarkMode(page, on) {
  await page.evaluate((v) => {
    if (v) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('novel-writer-dark', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('novel-writer-dark', 'false');
    }
  }, on);
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    colorScheme: 'light',
    locale: 'zh-TW',
  });
  const page = await ctx.newPage();

  // ────────────────────────────────────────────────────────────────
  // 01 首頁
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/');
  await waitReady(page);
  await page.waitForTimeout(1500); // IDB seed
  await shot(page, '01-home');

  // ────────────────────────────────────────────────────────────────
  // 02 專案 Dashboard
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary');
  await waitReady(page);
  await shot(page, '02-dashboard');

  // ────────────────────────────────────────────────────────────────
  // 03 章節編輯器（乾淨狀態）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/chapters/1');
  await waitReady(page);
  await page.waitForSelector('textarea', { timeout: 8000 });
  await shot(page, '03-chapter-editor-clean');

  // ────────────────────────────────────────────────────────────────
  // 04 章節編輯器（編輯中 = 🔵 autosave badge）
  // ────────────────────────────────────────────────────────────────
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.type('（測試）');   // triggers dirty state
  await page.waitForTimeout(300);
  await shot(page, '04-chapter-editor-dirty');

  // ────────────────────────────────────────────────────────────────
  // 05 未設定 LLM Modal（按 AI 撰寫本章前，先確認 settings 空的）
  // ────────────────────────────────────────────────────────────────
  // Navigate fresh (seed leaves providers disabled)
  await page.goto(BASE + '/p/spring-diary/chapters/1');
  await waitReady(page);
  await page.waitForSelector('textarea', { timeout: 8000 });
  const aiBtn = page.locator('button').filter({ hasText: '✨ AI 撰寫本章' });
  await aiBtn.click();
  await page.waitForTimeout(400);
  await shot(page, '05-llm-not-configured-modal');

  // ────────────────────────────────────────────────────────────────
  // 06 設定頁（啟用 Anthropic，填入 key，測試連線）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/settings');
  await waitReady(page);
  await page.waitForTimeout(600);
  await shot(page, '06-settings-providers-disabled');

  // Enable anthropic: find checkbox closest to "Anthropic (Claude)" label
  // We'll use evaluate to set IDB directly for reliability
  await page.evaluate(() => {
    // Use IndexedDB to set anthropic as enabled so UI reflects it
    const req = indexedDB.open('novel-writer');
    req.onsuccess = function(e) {
      const db = e.target.result;
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const getReq = store.get('singleton');
      getReq.onsuccess = function(e2) {
        const settings = e2.target.result;
        if (settings) {
          const p = settings.providers.find(p => p.id === 'anthropic');
          if (p) {
            p.enabled = true;
            p.apiKey = 'sk-ant-demo-for-screenshot';
            p.testStatus = 'success';
          }
          store.put(settings);
        }
      };
    };
  });
  // Reload to reflect IDB change
  await page.reload();
  await waitReady(page);
  await page.waitForTimeout(800);
  await shot(page, '07-settings-providers-enabled');

  // ────────────────────────────────────────────────────────────────
  // 08 預設模型 tab
  // ────────────────────────────────────────────────────────────────
  const modelTab = page.locator('button, [role="tab"]').filter({ hasText: '預設模型' });
  if (await modelTab.isVisible()) {
    await modelTab.click();
    await page.waitForTimeout(400);
    await shot(page, '08-settings-model-routing');
  }

  // ────────────────────────────────────────────────────────────────
  // 09 章節編輯器 + AI 草稿側欄（串流進行中）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/chapters/2');
  await waitReady(page);
  await page.waitForSelector('textarea', { timeout: 8000 });
  const aiBtn2 = page.locator('button').filter({ hasText: '✨ AI 撰寫本章' });
  await aiBtn2.click();
  await page.waitForTimeout(2200); // let stream start + show ~50 chars
  await shot(page, '09-chapter-editor-streaming');

  // ────────────────────────────────────────────────────────────────
  // 10 章節編輯器 + AI 草稿側欄（完成，顯示三按鈕）
  // ────────────────────────────────────────────────────────────────
  // Wait for stream to finish (FAKE_AI_CHAPTER_DRAFT ~1500 chars × 35ms ≈ 53s)
  // Instead of waiting 53s, abort mid-stream and take shot of done state
  const stopBtn = page.locator('button').filter({ hasText: '中止' });
  if (await stopBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await stopBtn.click();
    await page.waitForTimeout(400);
  }
  await shot(page, '10-chapter-editor-ai-done');

  // ────────────────────────────────────────────────────────────────
  // 11 採用確認 Modal
  // ────────────────────────────────────────────────────────────────
  const adoptBtn = page.locator('button').filter({ hasText: /^採用$/ }).first();
  if (await adoptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await adoptBtn.click();
    await page.waitForTimeout(400);
    await shot(page, '11-adopt-confirm-modal');
    const cancelBtn = page.locator('button').filter({ hasText: '取消' }).first();
    if (await cancelBtn.isVisible()) await cancelBtn.click();
  }

  // ────────────────────────────────────────────────────────────────
  // 12 歷史抽屜（章節）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/chapters/1');
  await waitReady(page);
  await page.waitForSelector('textarea', { timeout: 8000 });
  const histBtn = page.locator('button').filter({ hasText: '📜 歷史' });
  await histBtn.click();
  await page.waitForTimeout(700);
  await shot(page, '12-history-drawer');

  // click first non-current commit row to expand preview
  const rows = page.locator('li').filter({ hasText: /chapter/ });
  const rowCount = await rows.count();
  if (rowCount > 1) {
    await rows.nth(1).click();
    await page.waitForTimeout(500);
    await shot(page, '13-history-drawer-preview');
  }

  // ────────────────────────────────────────────────────────────────
  // 14 角色卡列表
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/characters');
  await waitReady(page);
  await shot(page, '14-character-list');

  // ────────────────────────────────────────────────────────────────
  // 15 角色卡編輯（蘇晴）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/characters/char-suqing');
  await waitReady(page);
  await page.waitForTimeout(500);
  await shot(page, '15-character-edit');

  // ────────────────────────────────────────────────────────────────
  // 16 角色卡 — AI 生成中（串流效果）
  // ────────────────────────────────────────────────────────────────
  const genBtn = page.locator('button').filter({ hasText: '✨ AI 生成角色描述' });
  if (await genBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await genBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, '16-character-ai-generating');
    await page.waitForTimeout(2000); // let stream finish
    await shot(page, '17-character-ai-done');
  }

  // ────────────────────────────────────────────────────────────────
  // 18 故事狀態
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/status/story');
  await waitReady(page);
  await page.waitForTimeout(400);
  await shot(page, '18-story-status');

  // ────────────────────────────────────────────────────────────────
  // 19 角色狀態（蘇晴）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/status/characters/char-suqing');
  await waitReady(page);
  await shot(page, '19-character-status');

  // ────────────────────────────────────────────────────────────────
  // 20 建立新專案
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/projects/new');
  await waitReady(page);
  await shot(page, '20-project-new');

  // ────────────────────────────────────────────────────────────────
  // 21 Dark mode（章節編輯器）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/p/spring-diary/chapters/1');
  await waitReady(page);
  await page.waitForSelector('textarea', { timeout: 8000 });
  await setDarkMode(page, true);
  await shot(page, '21-dark-mode-chapter-editor');

  // ────────────────────────────────────────────────────────────────
  // 22 Dark mode（首頁）
  // ────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/');
  await waitReady(page);
  await page.waitForTimeout(600);
  await setDarkMode(page, true);
  await shot(page, '22-dark-mode-home');

  await browser.close();
  console.log('\n✅ All screenshots saved to docs/prototypes/screenshots/');
})();
