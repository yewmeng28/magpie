import { myShare } from './split';
import type { Cents, Expense } from './types';

export type Period = 'day' | 'month' | 'year';

const pad = (n: number) => String(n).padStart(2, '0');

/** The YYYY-MM-DD, YYYY-MM or YYYY prefix an expense date shares with every other day in its period. */
export const periodKey = (date: string, period: Period) => date.slice(0, period === 'day' ? 10 : period === 'month' ? 7 : 4);

/** Today's local calendar day as YYYY-MM-DD. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function inPeriod(expenses: Expense[], period: Period, key: string): Expense[] {
  return expenses.filter((e) => periodKey(e.date, period) === key);
}

/**
 * My spend per category id (null = uncategorised), largest first. Only my share of a split counts, and refunds offset
 * their category's spending, but a category never goes below zero: a refund for something bought in an earlier period
 * doesn't turn into negative spending.
 */
export function totalsByCategory(expenses: Expense[]): { categoryId: string | null; total: Cents }[] {
  const totals = new Map<string | null, Cents>();
  for (const e of expenses) totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + myShare(e));
  return [...totals]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Total spend, consistent with totalsByCategory so the headline always equals the sum of the categories. */
export const totalSpent = (expenses: Expense[]): Cents => totalsByCategory(expenses).reduce((t, c) => t + c.total, 0);

/** A YYYY-MM month moved by whole months. */
export function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The `count` months (YYYY-MM) up to and including `last`, oldest first. */
export function monthsEnding(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(last, i - (count - 1)));
}

/** My spend per category (null = uncategorised) for each month in `months`, by the same rules as totalsByCategory. */
export function monthlyByCategory(expenses: Expense[], months: string[]): Map<string | null, Cents[]> {
  const index = new Map(months.map((m, i) => [m, i]));
  const series = new Map<string | null, Cents[]>();
  for (const e of expenses) {
    const i = index.get(e.date.slice(0, 7));
    if (i === undefined) continue;
    const values = series.get(e.categoryId) ?? Array<Cents>(months.length).fill(0);
    values[i] += myShare(e);
    series.set(e.categoryId, values);
  }
  for (const values of series.values()) values.forEach((v, i) => (values[i] = Math.max(0, v)));
  return series;
}

/** Newest first, then by most recently added, for the expense list. */
export const byNewest = (a: Expense, b: Expense) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
