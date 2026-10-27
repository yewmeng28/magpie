// Made-up but realistic data for screenshots and demos: three months of a Singapore routine across every category,
// three split bills, a few learned merchants, and a short statement to import. Plain JS so scripts/screenshots.mjs can
// use it in Node. src/domain/demoData.test.ts checks it against the app's defaults and its backup/import validation.

const CATEGORIES = [
  { id: 'food', name: 'Food & Drinks', emoji: '🍜', color: '#3987e5' },
  { id: 'groceries', name: 'Groceries', emoji: '🛒', color: '#008300' },
  { id: 'transport', name: 'Transport', emoji: '🚇', color: '#c98500' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#d55181' },
  { id: 'bills', name: 'Bills & Utilities', emoji: '🧾', color: '#9085e9' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬', color: '#d95926' },
  { id: 'health', name: 'Health & Personal Care', emoji: '💊', color: '#199e70' },
  { id: 'travel', name: 'Travel', emoji: '✈️', color: '#e66767' },
  { id: 'other', name: 'Other', emoji: '🪙', color: '#898781' },
];

const ACCOUNTS = [
  { id: 'cash', name: 'Cash', kind: 'cash', color: '#5aa454' },
  { id: 'posb-everyday', name: 'POSB Everyday', kind: 'credit', color: '#d6372f', aliases: ['POSB everyday Card'] },
  { id: 'hsbc-revolution', name: 'HSBC Revolution', kind: 'credit', color: '#db0011', aliases: ['HSBC VISA REVOLUTION', 'HSBC Visa Revolution Card'] },
];

// Things bought most months: [merchant, statement description, category, account, min $, max $, times a month].
const ROUTINE = [
  ['Ya Kun Kaya Toast', 'YA KUN KAYA TOAST', 'food', 'cash', 3.2, 5.6, 8],
  ['Chicken rice', 'TIAN TIAN HAINANESE', 'food', 'cash', 4.5, 6.5, 6],
  ['Luckin Coffee', 'LUCKIN COFFEE (SGP) PT', 'food', 'hsbc-revolution', 3.3, 7.75, 6],
  ['A Kitchen', 'A KITCHEN - TAMPINES 1', 'food', 'hsbc-revolution', 18, 45, 2],
  ['Bus/MRT', 'BUS/MRT', 'transport', 'posb-everyday', 1.1, 2.6, 18],
  ['Grab', 'GRAB*', 'transport', 'posb-everyday', 11, 24, 3],
  ['NTUC FairPrice', 'NTUC FP-BEDOK', 'groceries', 'posb-everyday', 18, 76, 4],
  ['Guardian', 'GUARDIAN ION ORCHARD', 'health', 'hsbc-revolution', 9, 36, 1],
  ['Uniqlo', 'UNIQLO JEM', 'shopping', 'hsbc-revolution', 19.9, 79.9, 1],
  ['Shopee', 'SHOPEE SINGAPORE', 'shopping', 'posb-everyday', 8, 42, 2],
];

// Bills on a fixed day: [merchant, description, category, account, $, day of month].
const MONTHLY = [
  ['Anytime Fitness', 'ANYTIME FITNESS', 'health', 'hsbc-revolution', 98, 1],
  ['Singtel', 'SINGTEL MOBILE', 'bills', 'posb-everyday', 45.6, 3],
  ['SP Group', 'SP DIGITAL', 'bills', 'posb-everyday', 92.35, 8],
  ['Netflix', 'NETFLIX.COM', 'entertainment', 'hsbc-revolution', 19.98, 12],
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysIn = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const cents = (dollars) => Math.round(dollars * 100);

/** Small seeded generator (mulberry32), so the same day always gives the same screenshots. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first of the month `back` months before `now`, and how many of its days have happened by `now`. */
function month(now, back) {
  const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return { start, days: back === 0 ? now.getDate() : daysIn(start) };
}

const on = (start, day) => iso(new Date(start.getFullYear(), start.getMonth(), day));

/** A MagPie backup holding the demo data, with dates ending today. Restore it from Settings to explore the app. */
export function demoBackup(now = new Date()) {
  const random = seeded(2026);
  const expenses = [];
  const add = (date, merchant, description, categoryId, accountId, amount, extra = {}) =>
    expenses.push({
      id: `demo-${expenses.length + 1}`,
      date,
      merchant,
      description,
      amount,
      currency: 'SGD',
      categoryId,
      accountId,
      createdAt: Date.parse(`${date}T12:00:00Z`) + expenses.length,
      updatedAt: Date.parse(`${date}T12:00:00Z`) + expenses.length,
      ...extra,
    });

  for (const back of [2, 1, 0]) {
    const { start, days } = month(now, back);
    for (const [merchant, description, category, account, min, max, perMonth] of ROUTINE) {
      const times = Math.round((perMonth * days) / daysIn(start));
      for (let i = 0; i < times; i++) {
        const day = 1 + Math.floor(random() * days);
        const amount = Math.round((min + random() * (max - min)) * 20) * 5;
        const ref = description === 'BUS/MRT' ? ` ${900000000 + Math.floor(random() * 99999999)}` : description === 'GRAB*' ? ` A-${Math.floor(random() * 36 ** 8).toString(36).toUpperCase()}` : '';
        add(on(start, day), merchant, description + ref, category, account, amount);
      }
    }
    for (const [merchant, description, category, account, dollars, day] of MONTHLY) {
      if (day <= days) add(on(start, day), merchant, description, category, account, cents(dollars));
    }
  }

  // One-offs that give each month some character.
  const [two, last, now0] = [month(now, 2), month(now, 1), month(now, 0)];
  add(on(two.start, 14), 'Agoda', 'AGODA.COM', 'travel', 'hsbc-revolution', cents(428.4));
  add(on(two.start, 15), 'Scoot', 'SCOOT TIGERAIR', 'travel', 'hsbc-revolution', cents(212));
  add(on(two.start, 20), 'Golden Village', 'GV PLAZA', 'entertainment', 'hsbc-revolution', cents(27));
  add(on(last.start, 9), 'Pop-up stall', 'SQ *POP UP STALL', null, 'posb-everyday', cents(12.8));
  add(on(last.start, 18), 'Birthday gift for Chloe', 'TANGS ORCHARD', 'other', 'hsbc-revolution', cents(90), {
    split: { shares: [{ id: 'ben', name: 'Ben', amount: cents(45), repaid: cents(20) }] },
  });
  add(iso(now), 'Haidilao', 'HAIDILAO HOT POT', 'food', 'hsbc-revolution', cents(180), {
    note: 'Ben’s farewell',
    split: {
      shares: [
        { id: 'alice', name: 'Alice', amount: cents(60), repaid: cents(60) },
        { id: 'ben', name: 'Ben', amount: cents(60), repaid: 0 },
      ],
    },
  });
  add(on(now0.start, Math.max(1, now0.days - 2)), 'Grab to airport', 'GRAB* A-AIRPORT1', 'transport', 'posb-everyday', cents(32), {
    split: { shares: [{ id: 'friend', name: '', amount: cents(16), repaid: 0 }] },
  });

  return {
    magpie: 'backup',
    version: 1,
    exportedAt: now.getTime(),
    expenses,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    rules: [
      { id: 'AKITCHEN', categoryId: 'food', updatedAt: now.getTime() },
      { id: 'TIANTIANHAINANESE', categoryId: 'food', updatedAt: now.getTime() },
    ],
  };
}

/**
 * Last month's HSBC statement in MagPie's import format, meant to be imported on top of demoBackup: it repeats the
 * Netflix bill (flagged "already imported?"), pays off the card, refunds a purchase and has a merchant MagPie
 * doesn't know, so the review screen shows every kind of row.
 */
export function demoImport(now = new Date()) {
  const { start } = month(now, 1);
  const rows = [
    { date: on(start, 12), description: 'NETFLIX.COM', amount: 19.98, kind: 'expense' },
    { date: on(start, 16), description: 'SUSHIRO - CAUSEWAY POINT', amount: 38.2, kind: 'expense' },
    { date: on(start, 19), description: 'COLD STORAGE GREAT WORLD', amount: 54.1, kind: 'expense' },
    { date: on(start, 21), description: 'MAMA SHOP BEDOK', amount: 6.4, kind: 'expense' },
    { date: on(start, 22), description: 'GV PLAZA', amount: 14.5, kind: 'expense' },
    { date: on(start, 24), description: 'UNIQLO JEM', amount: 19.9, kind: 'refund' },
    { date: on(start, 25), description: 'PAYMENT - THANK YOU', amount: 500, kind: 'payment' },
  ];
  const purchases = rows.filter((r) => r.kind === 'expense').reduce((t, r) => t + cents(r.amount), 0);
  return {
    magpie: 1,
    statement: { account: 'HSBC VISA REVOLUTION', currency: 'SGD', purchasesTotal: purchases / 100 },
    transactions: rows,
  };
}
