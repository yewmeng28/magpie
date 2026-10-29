// Screenshots of every MagPie screen on phone-sized browsers, for design review. It serves the production build,
// loads the demo data through Settings → Restore backup like a person would, and walks every screen. Fails if a
// page throws. Runs on every push (.github/workflows/screenshots.yml). On your own machine:
//   npm run screenshots:setup     once: installs Playwright and its browsers
//   npm run screenshots           builds, then writes screenshots/<phone>/*.png
//   npm run screenshots:readme    the same, and refreshes the README images in docs/screenshots/
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from 'playwright';
import { preview } from 'vite';
import { demoBackup, demoImport } from './demo-data.mjs';

const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));

// Playwright's iPhone profiles use a Safari tab's viewport (without the address bar's space). MagPie runs from the
// Home Screen, where it gets the whole screen, so the iPhones use full-screen sizes in points.
const fullScreen = (device, width, height) => device && { ...device, viewport: { width, height }, screen: { width, height } };

// A small iPhone (catches overflow), a current iPhone, and an Android phone. WebKit stands in for iOS Safari.
const PHONES = [
  { name: 'iphone-se', browser: webkit, device: fullScreen(devices['iPhone SE'], 375, 667) },
  { name: 'iphone-16', browser: webkit, device: fullScreen(devices['iPhone 15'] ?? devices['iPhone 14'], 393, 852) },
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

  // The last step started, so a failure says where it happened.
  let step = 'start';
  const shot = async (file, fullPage = false) => {
    step = `screenshot ${file}`;
    await page.evaluate(() => document.fonts.ready);
    // Finish animations first: headless WebKit doesn't play them, so a fading-in message would be caught invisible.
    await page.screenshot({ path: `${dir}${file}.png`, fullPage, animations: 'disabled' });
  };
  const tab = (label) => {
    step = `tab ${label}`;
    return page.locator('nav.tabs button', { hasText: label }).click();
  };
  // Tap Cancel and wait for the sheet to go: Escape doesn't close it in WebKit while a text field has focus.
  const closeSheet = async () => {
    step = 'close sheet';
    await page.locator('dialog.sheet').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('dialog.sheet').waitFor({ state: 'detached' });
  };
  const addMenu = async (item) => {
    step = `+ menu: ${item}`;
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: item }).click();
  };

  try {
    await page.goto(url);
    await page.getByText('Nothing shiny here yet').waitFor();
    await page.getByRole('region', { name: 'Get started' }).waitFor();
    await shot('00-first-launch');
    // Hidden from here on, as a person would once they've read it.
    step = 'hide Get started';
    await page.getByRole('button', { name: 'Hide Get started' }).click();

    // Demo data in, the way a person would restore a backup.
    await tab('Settings');
    await page.locator('input[type=file][accept*="json"]').setInputFiles({
      name: 'magpie-demo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(demoBackup(now))),
    });
    step = 'replace everything';
    await page.getByRole('button', { name: 'Replace everything' }).click();
    await page.getByText(/Restored \d+ expenses/).waitFor();

    await tab('Spending');
    await page.locator('.donut svg path').first().waitFor();
    // Demo data has never been backed up, so the monthly reminder shows; snooze it after its shot.
    step = 'backup reminder';
    await page.getByRole('region', { name: 'Backup reminder' }).waitFor();
    await shot('01a-backup-reminder');
    await page.getByRole('button', { name: 'Later' }).click();
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
    await page.locator('.category-trends').waitFor();
    await shot('07-trends-each-category');
    await shot('07-trends-each-category-full', true);

    await tab('Owed');
    await page.getByRole('heading', { name: /Waiting to be paid back/ }).waitFor();
    await shot('08-owed');
    await shot('08-owed-full', true);
    await page.locator('.person-row', { hasText: 'Ben' }).click();
    await page.locator('dialog.sheet .person-bills').waitFor();
    await shot('08b-owed-person');
    await page.locator('dialog.sheet').getByRole('button', { name: 'Close' }).click();
    await page.locator('dialog.sheet').waitFor({ state: 'detached' });

    await addMenu('Import a statement');
    await shot('09-import');
    step = 'Claude route';
    await page.locator('details.claude > summary').click();
    await page.locator('textarea').fill(JSON.stringify(demoImport(now), null, 2));
    await page.getByRole('button', { name: 'Review draft' }).click();
    await page.locator('.sticky-actions').waitFor();
    await shot('10-import-review');
    step = 'show all rows';
    await page.getByRole('radio', { name: /^All/ }).click();
    await shot('10-import-review-full', true);
    // Adding shows a message with Undo; undo it so the rest of the walk sees the demo data unchanged.
    step = 'add import';
    await page.locator('.sticky-actions .primary').click();
    await page.locator('.toast').waitFor();
    await shot('10b-import-added-undo');
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();

    await tab('Settings');
    await shot('11-settings');
    await shot('11-settings-full', true);
    step = 'edit a category';
    await page.locator('.list-row', { hasText: 'Food & Drinks' }).click();
    await page.locator('dialog.sheet .hues').waitFor();
    await shot('11a-category-sheet');
    await closeSheet();
    step = 'add recurring';
    await page.getByRole('heading', { name: 'Recurring payments' }).evaluate((h) => h.scrollIntoView({ block: 'start' }));
    await page.getByRole('button', { name: 'Add all' }).click();
    await page.locator('.toast').waitFor();
    await shot('11b-recurring-added');
    await page.locator('.row-link', { hasText: 'Guide' }).click();
    await shot('12-guide');
  } catch (e) {
    failures.push(`${name}, at ${step}: ${e.message.split('\n')[0]}`);
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

// The README's gallery: six iPhone 16 screens.
if (process.argv.includes('--readme')) {
  const docs = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
  const gallery = [
    ['01-spending', 'spending'],
    ['04-expense-split', 'split'],
    ['06-trends', 'trends'],
    ['08-owed', 'owed'],
    ['10-import-review', 'import'],
    ['11b-recurring-added', 'recurring'],
  ];
  for (const [from, to] of gallery) {
    copyFileSync(`${OUT}iphone-16/${from}.png`, `${docs}${to}.png`);
  }
  console.log(`README screenshots updated in ${docs}`);
}
