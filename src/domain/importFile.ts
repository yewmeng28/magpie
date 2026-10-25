import { suggestCategory, type CategorySource } from './dictionary';
import { cleanMerchant, merchantKey } from './merchant';
import { toCents } from './money';
import type { Account, Category, Cents, Expense, MerchantRule } from './types';

/**
 * MagPie import format, version 1. Written by Claude (or by hand) from a statement, pasted into the Import screen.
 * Amounts are positive decimals; `kind` says whether a row is spending, a refund, or a card payment/transfer to skip.
 */
export interface ImportFile {
  magpie: 1;
  statement: {
    /** Account name as the app lists it, or as printed on the statement. */
    account?: string;
    currency: string;
    /** The statement's own total of new purchases/debits (not payments), used to check nothing was missed. */
    purchasesTotal?: number;
    /** Opening and closing balances (negative when in credit). When both are given, every row, payments included,
     * is checked against them: previous + expenses − refunds − payments = new. */
    previousBalance?: number;
    newBalance?: number;
  };
  transactions: ImportTransaction[];
}

export type ImportKind = 'expense' | 'refund' | 'payment';

export interface ImportTransaction {
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  kind: ImportKind;
  category?: string;
  account?: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const optStr = (v: unknown) => v === undefined || v === null || isStr(v);
const KINDS: ImportKind[] = ['expense', 'refund', 'payment'];

function fail(path: string, expected: string): never {
  throw new Error(`Not a valid MagPie import: ${path} ${expected}`);
}

/** Pull the JSON object out of a chat reply, which may wrap it in ```json fences or a sentence or two. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON found. Paste the whole reply, including the { … } block.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error(`The JSON is incomplete or malformed (${(e as Error).message}). Ask Claude to resend it as one block.`);
  }
}

export function parseImportFile(raw: unknown): ImportFile {
  if (!isObj(raw)) fail('file', 'must be an object');
  if (raw.magpie !== 1) fail('magpie', 'must be 1 (the format version)');
  const s = raw.statement;
  if (!isObj(s)) fail('statement', 'must be an object');
  if (!isStr(s.currency) || !/^[A-Z]{3}$/.test(s.currency)) fail('statement.currency', 'must be a 3-letter code like SGD');
  if (!optStr(s.account)) fail('statement.account', 'must be text');
  for (const key of ['purchasesTotal', 'previousBalance', 'newBalance'] as const) {
    if (s[key] != null && (typeof s[key] !== 'number' || toCents(s[key]) === null)) fail(`statement.${key}`, 'must be an amount like 374.76');
  }
  if (!Array.isArray(raw.transactions)) fail('transactions', 'must be a list');

  const transactions = raw.transactions.map((t, i): ImportTransaction => {
    const p = `transactions[${i}]`;
    if (!isObj(t)) fail(p, 'must be an object');
    if (!isStr(t.date) || !isIsoDay(t.date)) fail(`${p}.date`, 'must be a date like 2026-09-14');
    if (!isStr(t.description) || !t.description.trim()) fail(`${p}.description`, 'must be text');
    if (typeof t.amount !== 'number' || toCents(t.amount) === null || t.amount < 0)
      fail(`${p}.amount`, 'must be a positive amount like 12.30');
    if (!KINDS.includes(t.kind as ImportKind)) fail(`${p}.kind`, `must be one of ${KINDS.join(', ')}`);
    for (const key of ['merchant', 'category', 'account'] as const) if (!optStr(t[key])) fail(`${p}.${key}`, 'must be text');
    return {
      date: t.date,
      description: t.description.trim(),
      merchant: (t.merchant as string | undefined) ?? undefined,
      amount: t.amount,
      kind: t.kind as ImportKind,
      category: (t.category as string | undefined) ?? undefined,
      account: (t.account as string | undefined) ?? undefined,
    };
  });

  return {
    magpie: 1,
    statement: {
      account: (s.account as string | undefined) ?? undefined,
      currency: s.currency,
      purchasesTotal: (s.purchasesTotal as number | undefined) ?? undefined,
      previousBalance: (s.previousBalance as number | undefined) ?? undefined,
      newBalance: (s.newBalance as number | undefined) ?? undefined,
    },
    transactions,
  };
}

function isIsoDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(text);
}

/** One editable row of the review screen. */
export interface DraftRow {
  key: string;
  include: boolean;
  date: string;
  merchant: string;
  description: string;
  /** Positive for spending, negative for a refund. */
  amount: Cents;
  kind: ImportKind;
  categoryId: string | null;
  /** Where the suggested category came from; 'statement' = the import file's own guess. */
  categorySource: CategorySource | 'statement' | null;
  accountId: string | null;
  /** Id of an existing expense this row seems to repeat. */
  duplicateOf?: string;
}

export interface Draft {
  currency: string;
  rows: DraftRow[];
  /**
   * What the statement says against what the rows add up to, when it prints a total. 'purchases' compares the
   * expense rows with its purchases total; 'balance' compares all rows with the change from previous to new balance.
   */
  reconciliation?: { basis: 'purchases' | 'balance'; expected: Cents; actual: Cents };
}

const norm = (s: string) => s.trim().toLowerCase();
/** Letters and digits only, minus a trailing "card", so "HSBC Visa Revolution Card" matches "HSBC VISA REVOLUTION". */
const accountKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/card$/, '');

function findCategory(categories: Category[], name: string | undefined): Category | undefined {
  return name ? categories.find((c) => norm(c.name) === norm(name) || c.id === norm(name)) : undefined;
}

export function findAccount(accounts: Account[], name: string | undefined): Account | undefined {
  if (!name) return undefined;
  return accounts.find((a) => [a.name, ...(a.aliases ?? [])].some((n) => accountKey(n) === accountKey(name)));
}

/**
 * Turn a parsed file into review rows. Category precedence: the user's own rules, then the file's suggestion,
 * then the starter dictionary. Payments are skipped by default, as are rows that look already imported.
 */
export function buildDraft(
  file: ImportFile,
  ctx: { categories: Category[]; accounts: Account[]; rules: MerchantRule[]; existing: Expense[] },
): Draft {
  const statementAccount = findAccount(ctx.accounts, file.statement.account);
  const rows = file.transactions.map((t, i): DraftRow => {
    const suggestion = suggestCategory(t.description, ctx.rules);
    const fromFile = findCategory(ctx.categories, t.category);
    const [categoryId, categorySource] =
      suggestion?.source === 'rule'
        ? [suggestion.categoryId, suggestion.source]
        : fromFile
          ? [fromFile.id, 'statement' as const]
          : suggestion
            ? [suggestion.categoryId, suggestion.source]
            : [null, null];
    const amount = toCents(t.amount)! * (t.kind === 'refund' ? -1 : 1);
    const accountId = (findAccount(ctx.accounts, t.account) ?? statementAccount)?.id ?? null;
    const row: DraftRow = {
      key: `${i}`,
      include: t.kind !== 'payment',
      date: t.date,
      merchant: t.merchant?.trim() || cleanMerchant(t.description),
      description: t.description,
      amount,
      kind: t.kind,
      categoryId,
      categorySource,
      accountId,
    };
    const duplicate = findDuplicate(row, ctx.existing);
    if (duplicate) {
      row.duplicateOf = duplicate.id;
      row.include = false;
    }
    return row;
  });

  const cents = (n: number | undefined) => (n == null ? null : toCents(n));
  const purchases = cents(file.statement.purchasesTotal);
  const [opening, closing] = [cents(file.statement.previousBalance), cents(file.statement.newBalance)];
  return {
    currency: file.statement.currency,
    rows,
    reconciliation:
      purchases !== null
        ? { basis: 'purchases', expected: purchases, actual: sumKind(rows, 'expense') }
        : opening !== null && closing !== null
          ? { basis: 'balance', expected: closing - opening, actual: sumKind(rows, 'expense') - sumKind(rows, 'refund') - sumKind(rows, 'payment') }
          : undefined,
  };
}

/** Sum of a kind's rows regardless of `include`: reconciliation checks the file against the statement, not the user's picks. */
export function sumKind(rows: DraftRow[], kind: ImportKind): Cents {
  return rows.filter((r) => r.kind === kind).reduce((total, r) => total + Math.abs(r.amount), 0);
}

function findDuplicate(row: DraftRow, existing: Expense[]): Expense | undefined {
  const key = merchantKey(row.description);
  return existing.find(
    (e) =>
      e.date === row.date &&
      e.amount === row.amount &&
      (row.accountId === null || e.accountId === null || e.accountId === row.accountId) &&
      merchantKey(e.description ?? e.merchant) === key,
  );
}

/**
 * The expenses and learned rules to save when the user confirms a draft.
 * A rule is learned for every included row whose category MagPie couldn't have worked out locally (it came from the
 * import file, or the user picked or changed it), so the next import of that merchant needs no fixing.
 */
export function commitDraft(
  rows: DraftRow[],
  ctx: { currency: string; importId: string; now: number; rules: MerchantRule[]; newId: () => string },
): { expenses: Expense[]; rules: MerchantRule[] } {
  const included = rows.filter((r) => r.include);
  const expenses = included.map(
    (r): Expense => ({
      id: ctx.newId(),
      date: r.date,
      merchant: r.merchant,
      description: r.description,
      amount: r.amount,
      currency: ctx.currency,
      categoryId: r.categoryId,
      accountId: r.accountId,
      importId: ctx.importId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }),
  );

  const learned = new Map<string, MerchantRule>();
  for (const r of included) {
    if (!r.categoryId || r.kind === 'payment') continue;
    const key = merchantKey(r.description);
    if (!key || suggestCategory(r.description, ctx.rules)?.categoryId === r.categoryId) continue;
    learned.set(key, { id: key, categoryId: r.categoryId, updatedAt: ctx.now });
  }
  return { expenses, rules: [...learned.values()] };
}
