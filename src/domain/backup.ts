import { localDay } from './expenses';
import type { Account, AccountKind, Category, Expense, MerchantRule, Split } from './types';

/** Everything MagPie stores, for moving it to another browser or device. */
export interface BackupFile {
  magpie: 'backup';
  version: 1;
  exportedAt: number;
  expenses: Expense[];
  accounts: Account[];
  categories: Category[];
  rules: MerchantRule[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isDay = (v: unknown): v is string => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const KINDS: AccountKind[] = ['credit', 'debit', 'cash', 'ewallet'];

function fail(path: string, expected: string): never {
  throw new Error(`Not a valid MagPie backup: ${path} ${expected}`);
}

function each<T>(raw: Obj, key: string, parse: (v: Obj, path: string) => T): T[] {
  const values = raw[key];
  if (!Array.isArray(values)) fail(key, 'must be a list');
  return values.map((v, i) => {
    const path = `${key}[${i}]`;
    if (!isObj(v)) fail(path, 'must be an object');
    return parse(v, path);
  });
}

const optStr = (v: Obj, key: string, p: string): string | undefined => {
  if (v[key] === undefined) return undefined;
  if (!isStr(v[key])) fail(`${p}.${key}`, 'must be text');
  return v[key];
};

function split(v: unknown, amount: number, p: string): Split | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v) || !Array.isArray(v.shares)) fail(p, 'must have a list of shares');
  const shares = v.shares.map((s, i) => {
    const sp = `${p}.shares[${i}]`;
    if (!isObj(s) || !isStr(s.id) || !isStr(s.name)) fail(sp, 'must have a text id and name');
    if (!isInt(s.amount) || s.amount <= 0) fail(`${sp}.amount`, 'must be a whole number of cents above 0');
    if (!isInt(s.repaid) || s.repaid < 0 || s.repaid > s.amount) fail(`${sp}.repaid`, 'must be between 0 and the share');
    return { id: s.id, name: s.name, amount: s.amount, repaid: s.repaid };
  });
  if (shares.reduce((t, s) => t + s.amount, 0) > amount) fail(p, 'shares add up to more than the expense');
  return { shares };
}

const expense = (v: Obj, p: string): Expense => {
  if (!isStr(v.id)) fail(`${p}.id`, 'must be text');
  if (!isDay(v.date)) fail(`${p}.date`, 'must be a YYYY-MM-DD date');
  if (!isStr(v.merchant)) fail(`${p}.merchant`, 'must be text');
  if (!isInt(v.amount)) fail(`${p}.amount`, 'must be a whole number of cents');
  if (!isStr(v.currency) || !/^[A-Z]{3}$/.test(v.currency)) fail(`${p}.currency`, 'must be a 3-letter code');
  if (v.categoryId !== null && !isStr(v.categoryId)) fail(`${p}.categoryId`, 'must be text or null');
  if (v.accountId !== null && !isStr(v.accountId)) fail(`${p}.accountId`, 'must be text or null');
  if (!isNum(v.createdAt) || !isNum(v.updatedAt)) fail(p, 'must have numeric createdAt and updatedAt');
  const e: Expense = {
    id: v.id,
    date: v.date,
    merchant: v.merchant,
    description: optStr(v, 'description', p),
    amount: v.amount,
    currency: v.currency,
    categoryId: v.categoryId,
    accountId: v.accountId,
    note: optStr(v, 'note', p),
    importId: optStr(v, 'importId', p),
    split: split(v.split, v.amount, `${p}.split`),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
  // Leave optional fields out rather than stored as undefined.
  for (const key of ['description', 'note', 'importId', 'split'] as const) if (e[key] === undefined) delete e[key];
  return e;
};

const account = (v: Obj, p: string): Account => {
  if (!isStr(v.id) || !isStr(v.name) || !isStr(v.color)) fail(p, 'must have text id, name and color');
  if (!KINDS.includes(v.kind as AccountKind)) fail(`${p}.kind`, `must be one of ${KINDS.join(', ')}`);
  if (v.aliases !== undefined && !(Array.isArray(v.aliases) && v.aliases.every(isStr))) fail(`${p}.aliases`, 'must be a list of text');
  const a: Account = { id: v.id, name: v.name, kind: v.kind as AccountKind, color: v.color };
  if (v.aliases) a.aliases = v.aliases as string[];
  return a;
};

const category = (v: Obj, p: string): Category => {
  if (!isStr(v.id) || !isStr(v.name) || !isStr(v.emoji) || !isStr(v.color)) fail(p, 'must have text id, name, emoji and color');
  return { id: v.id, name: v.name, emoji: v.emoji, color: v.color };
};

const rule = (v: Obj, p: string): MerchantRule => {
  if (!isStr(v.id) || !isStr(v.categoryId) || !isNum(v.updatedAt)) fail(p, 'must have text id and categoryId, and a numeric updatedAt');
  return { id: v.id, categoryId: v.categoryId, updatedAt: v.updatedAt };
};

/** Validate parsed backup JSON, throwing a descriptive Error for anything malformed, before anything is replaced. */
export function parseBackup(raw: unknown): BackupFile {
  if (!isObj(raw) || raw.magpie !== 'backup') fail('file', 'is not a MagPie backup (a statement import goes in the Import tab)');
  if (raw.version !== 1) fail('version', 'must be 1');
  const backup: BackupFile = {
    magpie: 'backup',
    version: 1,
    exportedAt: isNum(raw.exportedAt) ? raw.exportedAt : 0,
    expenses: each(raw, 'expenses', expense),
    accounts: each(raw, 'accounts', account),
    categories: each(raw, 'categories', category),
    rules: each(raw, 'rules', rule),
  };
  for (const [key, list] of [['expenses', backup.expenses], ['accounts', backup.accounts], ['categories', backup.categories], ['rules', backup.rules]] as const) {
    const ids = new Set<string>();
    list.forEach((item, i) => (ids.has(item.id) ? fail(`${key}[${i}].id`, `repeats "${item.id}"`) : ids.add(item.id)));
  }
  return backup;
}

export const backupFileName = (now: Date) => `magpie-${localDay(now)}.json`;
