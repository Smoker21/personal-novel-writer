// Chapter editor focused re-capture after v2 redesign
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../docs/prototypes/screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5175';
const W = 1440, H = 900;

async function waitReady(page) {
  await page.waitForSelector('header', { timeout: 12000 });
  await page.waitForTimeout(700);
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── Session 1: light mode ──────────────────────────────────────
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    colorScheme: 'light',
    locale: 'zh-TW',
  });
  const page = await ctx.newPage();

  // First visit home to seed IDB
  await page.goto(BASE + '/');
  await waitReady(page);
  await page.waitForTimeout(1500);

  // Enable anthropic via IDB so AI buttons work
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const req = indexedDB.open('novel-writer');
      req.onsuccess = function (e) {
        const db = e.target.result;
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const g = store.get('singleton');
        g.onsuccess = function (e2) {
          const s = e2.target.result;
          if (s) {
            const p = s.providers.find(p => p.id === 'anthropic');
            if (p) { p.enabled = true; p.apiKey = 'sk-demo'; p.testStatus = 'success'; }
            store.put(s);
          }
        };
        tx.oncomplete = resolve;
      };
    });
  });

  // ── 03b 章節編輯器（三欄展開 — AI 工作區）────────────────────
  await page.goto(BASE + '/p/spring-diary/chapters/2');
  await waitReady(page);
  await page.waitForSelector('textarea', { timeout: 8000 });

  // Open AI panel
  const aiBtn = page.locator('button').filter({ hasText: '✨ AI 撰寫本章' });
  await aiBtn.click();
  await page.waitForTimeout(1000); // context loading

  await shot(page, '03b-chapter-editor-3col-open');

  // ── 09b AI 串流中（三欄）────────────────────────────────────────
  // Find the start-generate button in ContextPanel or DraftPanel
  // The agent may have put a "開始生成" button or the AI btn triggers directly
  // Let's check what's in the draft panel area
  const startGenBtn = page.locator('button').filter({ hasText: /開始生成|重新生成|✨ 生成/ }).first();
  const hasStartBtn = await startGenBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasStartBtn) {
    await startGenBtn.click();
  }
  // else the AI panel auto-starts on open — wait for stream
  await page.waitForTimeout(1800);
  await shot(page, '09b-chapter-editor-streaming-3col');

  // ── 10b 草稿可編輯（已手動修改 badge）──────────────────────────
  // Stop the stream
  const stopBtn = page.locator('button').filter({ hasText: '中止' });
  if (await stopBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await stopBtn.click();
    await page.waitForTimeout(400);
  }
  // Now type something in the draft textarea (third column)
  // Find a textarea that is editable (not the main one)
  const textareas = page.locator('textarea');
  const count = await textareas.count();
  // The draft textarea should be the second or third one
  for (let i = count - 1; i >= 0; i--) {
    const ta = textareas.nth(i);
    const isDisabled = await ta.getAttribute('disabled');
    if (!isDisabled) {
      const val = await ta.inputValue();
      if (val.length > 10) { // likely the draft textarea with content
        await ta.click();
        await ta.type('（人工加筆：夜風帶來了梔子花的香氣。）');
        await page.waitForTimeout(300);
        break;
      }
    }
  }
  await shot(page, '10b-chapter-editor-draft-manually-edited');

  // ── Params panel expanded ─────────────────────────────────────
  // Find and click the params accordion toggle
  const paramsToggle = page.locator('button, summary').filter({ hasText: /生成參數|⚙/ }).first();
  if (await paramsToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await paramsToggle.click();
    await page.waitForTimeout(400);
    await shot(page, '09c-params-panel-expanded');
  }

  // ── enable_thinking toggle ────────────────────────────────────
  const thinkingToggle = page.locator('input[type="checkbox"]').filter({ hasText: /thinking/ });
  // Try finding by label text instead
  const thinkingLabel = page.locator('label').filter({ hasText: /思考模式|enable_thinking/ });
  if (await thinkingLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
    await thinkingLabel.locator('input[type="checkbox"]').click();
    await page.waitForTimeout(300);
    await shot(page, '09d-params-thinking-enabled');
  }

  // ── Dark mode – 3col layout ──────────────────────────────────
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('novel-writer-dark', 'true');
  });
  await page.waitForTimeout(300);
  await shot(page, '21b-dark-mode-3col-chapter');

  await browser.close();
  console.log('\n✅ v2 chapter editor screenshots done');
})();
