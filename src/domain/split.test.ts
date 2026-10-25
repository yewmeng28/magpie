import { describe, expect, it } from 'vitest';
import { totalSpent, totalsByCategory } from './expenses';
import { equalShares, knownNames, myShare, owedSummary, repay, shareLabel, splitError } from './split';
import type { Expense, SplitShare } from './types';

const share = (id: string, amount: number, extra: Partial<SplitShare> = {}): SplitShare => ({ id, name: '', amount, repaid: 0, ...extra });

const expense = (id: string, amount: number, shares?: SplitShare[], extra: Partial<Expense> = {}): Expense => ({
  id,
  date: '2026-09-14',
  merchant: id,
  amount,
  currency: 'SGD',
  categoryId: 'food',
  accountId: null,
  createdAt: 0,
  updatedAt: 0,
  ...(shares ? { split: { shares } } : {}),
  ...extra,
});

describe('equalShares', () => {
  it('splits evenly with me, and I keep the leftover cents', () => {
    expect(equalShares(1000, 2, true)).toEqual([333, 333]);
    expect(equalShares(9000, 2, true)).toEqual([3000, 3000]);
  });

  it('spreads leftover cents over the others when I am not part of it', () => {
    expect(equalShares(1000, 3, false)).toEqual([334, 333, 333]);
  });

  it('returns nothing for nobody', () => {
    expect(equalShares(1000, 0, true)).toEqual([]);
  });
});

describe('myShare', () => {
  it('is what is left after other people’s shares', () => {
    expect(myShare(expense('dinner', 9000, [share('a', 3000), share('b', 3000)]))).toBe(3000);
    expect(myShare(expense('coffee', 450))).toBe(450);
    expect(myShare(expense('gift', 5000, [share('a', 5000)]))).toBe(0);
  });

  it('is the only part that counts as my spending', () => {
    const list = [expense('dinner', 9000, [share('a', 6000)]), expense('lunch', 1200), expense('cab', 2000, [share('b', 1000)], { categoryId: 'transport' })];
    expect(totalsByCategory(list)).toEqual([
      { categoryId: 'food', total: 4200 },
      { categoryId: 'transport', total: 1000 },
    ]);
    expect(totalSpent(list)).toBe(5200);
  });
});

describe('splitError', () => {
  it('accepts shares that fit inside the expense', () => {
    expect(splitError(9000, [{ amount: 3000 }, { amount: 6000 }])).toBeNull();
  });

  it.each([
    [-500, [{ amount: 100 }], /refund/],
    [9000, [], /at least one person/],
    [9000, [{ amount: 0 }], /above \$0/],
    [9000, [{ amount: null }], /above \$0/],
    [9000, [{ amount: 5000 }, { amount: 5000 }], /more than the expense/],
  ])('rejects %i split as %j', (amount, shares, message) => {
    expect(splitError(amount, shares)).toMatch(message);
  });
});

describe('repay', () => {
  const e = expense('dinner', 9000, [share('a', 3000), share('b', 3000, { repaid: 1000 })]);

  it('records a repayment on one share only', () => {
    expect(repay(e, 'a', 1500, 7).split!.shares).toEqual([share('a', 3000, { repaid: 1500 }), share('b', 3000, { repaid: 1000 })]);
    expect(repay(e, 'a', 1500, 7).updatedAt).toBe(7);
  });

  it('clamps to between nothing and the full share', () => {
    expect(repay(e, 'b', 9999, 7).split!.shares[1].repaid).toBe(3000);
    expect(repay(e, 'b', -5, 7).split!.shares[1].repaid).toBe(0);
  });

  it('leaves an unsplit expense alone', () => {
    const plain = expense('coffee', 450);
    expect(repay(plain, 'a', 100, 7)).toBe(plain);
  });
});

describe('owedSummary', () => {
  const e1 = expense('e1', 9000, [share('a', 3000, { name: 'Alice', repaid: 1000 }), share('u', 2000)], { date: '2026-09-10' });
  const e2 = expense('e2', 3000, [share('a', 500, { name: 'alice ', repaid: 500 }), share('b', 700, { name: 'Bob' })], { date: '2026-09-12' });
  const e3 = expense('e3', 800, [share('b', 400, { name: 'Bob', repaid: 400 })], { date: '2026-09-01' });
  const summary = owedSummary([e1, e2, e3, expense('e4', 100)]);

  it('totals what I lent and what came back', () => {
    expect(summary.lent).toBe(6600);
    expect(summary.repaid).toBe(1900);
  });

  it('groups named people ignoring case, most owed first, keeping the latest spelling', () => {
    expect(summary.people.map((p) => [p.name, p.lent, p.repaid, p.shares.length])).toEqual([
      ['alice', 3500, 1500, 2],
      ['Bob', 1100, 400, 2],
    ]);
  });

  it('keeps unnamed shares separate', () => {
    expect(summary.unnamed).toEqual({ lent: 2000, repaid: 0, count: 1 });
  });

  it('separates open and settled expenses, newest first', () => {
    expect(summary.open.map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(summary.settled.map((e) => e.id)).toEqual(['e3']);
  });

  it('labels unnamed people by position and lists known names', () => {
    expect(shareLabel(share('u', 1), 1)).toBe('Friend 2');
    expect(shareLabel(share('a', 1, { name: ' Alice ' }), 0)).toBe('Alice');
    expect(knownNames([e1, e2, e3])).toEqual(['alice', 'Bob']);
  });
});
