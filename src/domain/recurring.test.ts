import { describe, expect, it } from 'vitest';
import { demoBackup } from '../../scripts/demo-data.mjs';
import { detectRecurring, dueDates, fromCandidate, generate, nextDate, occurrence, type Recurring } from './recurring';
import type { Expense } from './types';

const rule = (extra: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  merchant: 'Netflix',
  description: 'NETFLIX.COM',
  amount: 1998,
  currency: 'SGD',
  categoryId: 'entertainment',
  accountId: 'hsbc-revolution',
  every: 'month',
  start: '2026-01-12',
  last: '2026-01-12',
  ...extra,
});

const expense = (id: string, date: string, extra: Partial<Expense> = {}): Expense => ({
  id, date, merchant: 'Netflix', description: 'NETFLIX.COM', amount: 1998, currency: 'SGD', categoryId: 'entertainment',
  accountId: 'hsbc-revolution', createdAt: 0, updatedAt: 0, ...extra,
});

describe('occurrence', () => {
  it('steps by week, month and year', () => {
    expect(occurrence('2026-10-27', 'week', 1)).toBe('2026-11-03');
    expect(occurrence('2026-10-27', 'month', 3)).toBe('2027-01-27');
    expect(occurrence('2026-10-27', 'year', 1)).toBe('2027-10-27');
    expect(occurrence('2026-10-27', 'month', -1)).toBe('2026-09-27');
  });

  it('keeps the 31st as the last day of shorter months, without drifting', () => {
    expect([1, 2, 3].map((n) => occurrence('2026-01-31', 'month', n))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrence('2028-02-29', 'year', 1)).toBe('2029-02-28');
    expect(occurrence('2028-02-29', 'year', 4)).toBe('2032-02-29');
  });
});

describe('due dates and generation', () => {
  it('lists dates after the last one added, up to today', () => {
    expect(dueDates(rule(), '2026-04-11')).toEqual(['2026-02-12', '2026-03-12']);
    expect(dueDates(rule(), '2026-04-12')).toEqual(['2026-02-12', '2026-03-12', '2026-04-12']);
    expect(dueDates(rule({ last: '2026-04-12' }), '2026-04-30')).toEqual([]);
    expect(nextDate(rule({ last: '2026-04-12' }))).toBe('2026-05-12');
  });

  it('creates linked expenses and moves the rule on, once', () => {
    let n = 0;
    const first = generate([rule()], '2026-03-20', 5, () => `e${++n}`);
    expect(first.expenses.map((e) => [e.date, e.amount, e.recurringId, e.merchant])).toEqual([
      ['2026-02-12', 1998, 'r1', 'Netflix'],
      ['2026-03-12', 1998, 'r1', 'Netflix'],
    ]);
    expect(first.rules).toEqual([rule({ last: '2026-03-12' })]);
    expect(generate(first.rules, '2026-03-20', 6, () => 'x')).toEqual({ expenses: [], rules: [] });
  });
});

describe('detectRecurring', () => {
  it('finds the same amount on the same day in back-to-back months', () => {
    const found = detectRecurring([expense('a', '2026-08-12'), expense('b', '2026-09-12'), expense('c', '2026-10-12')], [], '2026-10-27');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ every: 'month', start: '2026-08-12', last: '2026-10-12', expenseIds: ['a', 'b', 'c'] });
    let n = 0;
    expect(generate([fromCandidate(found[0], 'r')], '2026-11-12', 0, () => `${++n}`).expenses.map((e) => e.date)).toEqual(['2026-11-12']);
  });

  it('needs at least two months in a row, on the same day, at the same amount', () => {
    const today = '2026-10-27';
    expect(detectRecurring([expense('a', '2026-08-12'), expense('b', '2026-10-12')], [], today)).toEqual([]);
    expect(detectRecurring([expense('a', '2026-09-12'), expense('b', '2026-10-13')], [], today)).toEqual([]);
    expect(detectRecurring([expense('a', '2026-09-12'), expense('b', '2026-10-12', { amount: 2198 })], [], today)).toEqual([]);
  });

  it('ignores runs that stopped, and ones already set up or added by a rule', () => {
    const stopped = [expense('a', '2026-03-12'), expense('b', '2026-04-12')];
    expect(detectRecurring(stopped, [], '2026-10-27')).toEqual([]);
    const pair = [expense('a', '2026-09-12'), expense('b', '2026-10-12')];
    expect(detectRecurring(pair, [rule()], '2026-10-27')).toEqual([]);
    expect(detectRecurring(pair.map((e) => ({ ...e, recurringId: 'r1' })), [], '2026-10-27')).toEqual([]);
  });

  it('finds yearly payments on the same date', () => {
    const insurance = [expense('a', '2025-03-01', { amount: 50000, description: 'AIA' }), expense('b', '2026-03-01', { amount: 50000, description: 'AIA' })];
    expect(detectRecurring(insurance, [], '2026-10-27')[0]).toMatchObject({ every: 'year', last: '2026-03-01' });
  });

  it('spots the monthly bills in the demo data', () => {
    const b = demoBackup(new Date('2026-10-27T10:00:00'));
    const found = detectRecurring(b.expenses, [], '2026-10-27').map((c) => c.merchant).sort();
    expect(found).toEqual(['Anytime Fitness', 'Netflix', 'SP Group', 'Singtel']);
  });
});
