// Screenshots of every MagPie screen on phone-sized browsers, for design review. It serves the production build,
// loads the demo data through Settings → Restore backup like a person would, and walks every screen. Fails if a
// page throws. Runs on every push (.github/workflows/screenshots.yml); to run it locally:
//   npm install --no-save playwright@1.52.0 && npx playwright install chromium webkit
//   npm run build && npm run screenshots
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from 'playwright';
import { preview } from 'vite';
import { demoBackup, demoImport } from './demo-data.mjs';

const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));

// A small iPhone (catches overflow), a current iPhone, and an Android phone. WebKit stands in for iOS Safari.
const PHONES = [
  { name: 'iphone-se', browser: webkit, device: devices['iPhone SE'] },
  { name: 'iphone-15', browser: webkit, device: devices['iPhone 15'] ?? devices['iPhone 14'] },
  { name: 'pixel-7', browser: chromium, device: devices['Pixel 7'] },
];
// Without a device profile the pages would render at desktop size, so a missing one is an error, not a fallback.
const unknown = PHONES.filter((p) => !p.device).map((p) => p.name);
if (unknown.length) throw new Error(`Playwright has no device profile for: ${unknown.join(', ')}`);

const server = await preview({ preview: { port: 4173, strictPort: true } });
const url = server.resolvedUrls.local[0];
rmSync(OUT, { recursive: true, force: true });
const failures = [];
const now = new Date();

for (const { name, browser, device } of PHONES) {
  const dir = `${OUT}${name}/`;
  mkdirSync(dir, { recursive: true });
  const instance = await browser.launch();
  const context = await instance.newContext({
    ...device,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    colorScheme: 'dark',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  const shot = async (file, fullPage = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${dir}${file}.png`, fullPage });
  };
  const tab = (label) => page.locator('nav.tabs button', { hasText: label }).click();
  const closeSheet = () => page.keyboard.press('Escape');
  const addMenu = async (item) => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: item }).click();
  };

  try {
    await page.goto(url);
    await page.getByText('Nothing shiny here yet').waitFor();
    await shot('00-first-launch');

    // Demo data in, the way a person would restore a backup.
    await tab('Settings');
    await page.locator('input[type=file][accept*="json"]').setInputFiles({
      name: 'magpie-demo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(demoBackup(now))),
    });
    await page.getByText(/Restored \d+ expenses/).waitFor();

    await tab('Spending');
    await page.locator('.donut svg path').first().waitFor();
    await shot('01-spending');
    await shot('01-spending-full', true);
    // Hovering a slice shows what holding a finger on it does.
    const donut = await page.locator('.donut svg').boundingBox();
    await page.mouse.move(donut.x + donut.width * (0.5 + 0.38 * Math.sin(0.3)), donut.y + donut.height * (0.5 - 0.38 * Math.cos(0.3)));
    await shot('02-spending-slice-held');
    await page.mouse.move(1, 1);
    await page.getByRole('radio', { name: 'Bars' }).click();
    await shot('03-spending-bars');
    await page.getByRole('radio', { name: 'Pie' }).click();
    // Tapping a category lists only its expenses.
    await page.locator('ul.legend > li > button').first().click();
    await page.locator('.filter-row').waitFor();
    await shot('03b-spending-filtered');
    await page.locator('.filter-row .chip').click();

    await page.locator('.expense-row', { hasText: 'Haidilao' }).click();
    await page.locator('dialog.sheet .split').scrollIntoViewIfNeeded();
    await shot('04-expense-split');
    await closeSheet();
    await addMenu('Add expense');
    await page.locator('dialog.sheet').waitFor();
    await shot('05-add-expense');
    await closeSheet();

    await tab('Trends');
    await page.locator('.line-chart svg path.series').first().waitFor();
    await shot('06-trends');
    await page.locator('.filters select').selectOption('each');
    await page.locator('.line-legend').waitFor();
    await shot('07-trends-each-category');
    await shot('07-trends-each-category-full', true);

    await tab('Owed');
    await page.getByText('Waiting to be paid back').waitFor();
    await shot('08-owed');
    await shot('08-owed-full', true);

    await addMenu('Import a statement');
    await shot('09-import');
    await page.locator('textarea').fill(JSON.stringify(demoImport(now), null, 2));
    await page.getByRole('button', { name: 'Review draft' }).click();
    await page.getByRole('heading', { name: 'Review draft' }).waitFor();
    await shot('10-import-review');
    await shot('10-import-review-full', true);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await tab('Settings');
    await shot('11-settings-full', true);
    await page.locator('.row-link', { hasText: 'Guide' }).click();
    await shot('12-guide');
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
    await shot('zz-failure', true).catch(() => {});
  }
  failures.push(...errors.map((e) => `${name}: page error: ${e}`));
  await instance.close();
  console.log(`${name}: done`);
}

await server.close();
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Screenshots in ${OUT}`);
