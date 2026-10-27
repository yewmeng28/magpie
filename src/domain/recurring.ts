import { merchantKey } from './merchant';
import type { Cents, Expense } from './types';

export type Every = 'week' | 'month' | 'year';

/** An expense that repeats. Each due date becomes an ordinary expense linked back by `recurringId`. */
export interface Recurring {
  id: string;
  merchant: string;
  description?: string;
  amount: Cents;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  note?: string;
  every: Every;
  /** The first date, which sets the day of the month (or week, or year) it repeats on. */
  start: string;
  /** The latest date already added as an expense. */
  last: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = (day: string) => day.split('-').map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/**
 * The n-th date of a schedule (0 = start). Monthly and yearly dates keep the start's day, moved back to the month's
 * last day when it doesn't exist: the 31st becomes the 30th in April, and 29 Feb becomes the 28th outside leap years.
 */
export function occurrence(start: string, every: Every, n: number): string {
  const [y, m, d] = parts(start);
  if (every === 'week') {
    const date = new Date(y, m - 1, d + 7 * n);
    return iso(date.getFullYear(), date.getMonth(), date.getDate());
  }
  const months = every === 'month' ? n : 12 * n;
  const target = new Date(y, m - 1 + months, 1);
  const [ty, tm] = [target.getFullYear(), target.getMonth()];
  return iso(ty, tm, Math.min(d, daysIn(ty, tm)));
}

/** Dates after `last`, up to and including `today`, that haven't been added yet. */
export function dueDates(rule: Pick<Recurring, 'start' | 'every' | 'last'>, today: string): string[] {
  const dates: string[] = [];
  for (let n = 1; n < 5000; n++) {
    const date = occurrence(rule.start, rule.every, n);
    if (date > today) break;
    if (date > rule.last) dates.push(date);
  }
  return dates;
}

/** The next date after `last`. */
export const nextDate = (rule: Pick<Recurring, 'start' | 'every' | 'last'>) =>
  dueDates(rule, '9999-12-31').slice(0, 1)[0] ?? rule.last;

/** The expenses that are due by `today`, and the rules with `last` moved on. */
export function generate(rules: Recurring[], today: string, now: number, newId: () => string): { expenses: Expense[]; rules: Recurring[] } {
  const expenses: Expense[] = [];
  const updated: Recurring[] = [];
  for (const rule of rules) {
    const dates = dueDates(rule, today);
    if (!dates.length) continue;
    for (const date of dates) {
      const e: Expense = {
        id: newId(),
        date,
        merchant: rule.merchant,
        description: rule.description,
        amount: rule.amount,
        currency: rule.currency,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        note: rule.note,
        recurringId: rule.id,
        createdAt: now,
        updatedAt: now,
      };
      for (const key of ['description', 'note'] as const) if (e[key] === undefined) delete e[key];
      expenses.push(e);
    }
    updated.push({ ...rule, last: dates[dates.length - 1] });
  }
  return { expenses, rules: updated };
}

/** A run of existing expenses that looks like a repeating payment. */
export interface Candidate {
  /** Merchant key and amount, so a dismissed or added candidate can be recognised. */
  key: string;
  merchant: string;
  description?: string;
  amount: Cents;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  every: Every;
  start: string;
  last: string;
  expenseIds: string[];
}

const monthIndex = (day: string) => {
  const [y, m] = parts(day);
  return y * 12 + m;
};

/**
 * Existing expenses that repeat: the same merchant and amount on the same day in at least two back-to-back months
 * (or the same date in back-to-back years). Only runs that are still going count, meaning the next date is no more
 * than one period ago, so a subscription cancelled months back isn't brought back to life.
 */
export function detectRecurring(expenses: Expense[], rules: Recurring[], today: string): Candidate[] {
  const covered = new Set(rules.map((r) => `${merchantKey(r.description ?? r.merchant)}|${r.amount}`));
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.recurringId || e.amount <= 0) continue;
    const key = `${merchantKey(e.description ?? e.merchant)}|${e.amount}`;
    if (covered.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const candidates: Candidate[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (const every of ['month', 'year'] as const) {
      // Longest run, ending at the latest date, where each date is the schedule's next date after the one before.
      let run: Expense[] = [];
      for (const e of sorted) {
        const prev = run[run.length - 1];
        if (prev && e.date === prev.date) continue;
        const follows = prev && occurrence(run[0].date, every, run.length) === e.date;
        const sameDay = prev && parts(prev.date)[2] === parts(e.date)[2];
        run = follows && sameDay && (every === 'year' || monthIndex(e.date) - monthIndex(prev.date) === 1) ? [...run, e] : [e];
      }
      if (run.length < 2) continue;
      const last = run[run.length - 1];
      const next = occurrence(run[0].date, every, run.length);
      const oneBack = occurrence(today, every, -1);
      if (next < oneBack) continue;
      candidates.push({
        key,
        merchant: last.merchant,
        description: last.description,
        amount: last.amount,
        currency: last.currency,
        categoryId: last.categoryId,
        accountId: last.accountId,
        every,
        start: run[0].date,
        last: last.date,
        expenseIds: run.map((e) => e.id),
      });
      break;
    }
  }
  return candidates.sort((a, b) => b.amount - a.amount);
}

/** A rule for a confirmed candidate, picking up after its latest expense. */
export const fromCandidate = (c: Candidate, id: string): Recurring => ({
  id,
  merchant: c.merchant,
  ...(c.description ? { description: c.description } : {}),
  amount: c.amount,
  currency: c.currency,
  categoryId: c.categoryId,
  accountId: c.accountId,
  every: c.every,
  start: c.start,
  last: c.last,
});

/** "12 Nov 2026". */
export function dayLabel(day: string): string {
  const [y, m, d] = parts(day);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const EVERY_LABEL: Record<Every, string> = { week: 'Every week', month: 'Every month', year: 'Every year' };
