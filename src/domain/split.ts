import type { Cents, Expense, SplitShare } from './types';

const total = (shares: { amount: Cents }[]) => shares.reduce((t, s) => t + s.amount, 0);

/** What I actually spent: the whole expense, or what's left after other people's shares. */
export const myShare = (e: Expense): Cents => e.amount - (e.split ? total(e.split.shares) : 0);

export const outstanding = (s: SplitShare): Cents => s.amount - s.repaid;

/** "Alice", or "Friend 2" for the second share when it has no name. */
export const shareLabel = (s: SplitShare, index: number) => s.name.trim() || `Friend ${index + 1}`;

/**
 * Equal shares of `amount` for `people` others, plus me when `includeMe`. Leftover cents stay with me so friends are
 * never overcharged; when I'm not part of it, they go one each to the first people so the shares still add up.
 */
export function equalShares(amount: Cents, people: number, includeMe: boolean): Cents[] {
  if (people < 1) return [];
  const base = Math.floor(amount / (people + (includeMe ? 1 : 0)));
  if (includeMe) return Array<Cents>(people).fill(base);
  const leftover = amount - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < leftover ? 1 : 0));
}

/** Why a split can't be saved, or null if it can. */
export function splitError(amount: Cents, shares: { amount: Cents | null }[]): string | null {
  if (amount <= 0) return 'Only an expense, not a refund, can be split.';
  if (!shares.length) return 'Add at least one person.';
  if (shares.some((s) => s.amount === null || s.amount <= 0)) return 'Every person needs an amount above $0.';
  if (total(shares as { amount: Cents }[]) > amount) return 'Other people’s shares add up to more than the expense.';
  return null;
}

/** Record a repayment, clamped so nobody pays back less than nothing or more than they owe. */
export function repay(e: Expense, shareId: string, repaid: Cents, now: number): Expense {
  if (!e.split) return e;
  const shares = e.split.shares.map((s) => (s.id === shareId ? { ...s, repaid: Math.max(0, Math.min(s.amount, repaid)) } : s));
  return { ...e, split: { shares }, updatedAt: now };
}

export interface ShareRef {
  expense: Expense;
  share: SplitShare;
  /** Position within the expense's shares, for the "Friend 2" label. */
  index: number;
}

export interface PersonOwed {
  /** Lowercased name, so "alice" and "Alice " are one person. */
  key: string;
  name: string;
  lent: Cents;
  repaid: Cents;
  shares: ShareRef[];
}

export interface OwedSummary {
  lent: Cents;
  repaid: Cents;
  /** Named people, most owed first. */
  people: PersonOwed[];
  /** Shares without a name, which can't be matched across expenses. */
  unnamed: { lent: Cents; repaid: Cents; count: number };
  /** Split expenses with money still owed, newest first. */
  open: Expense[];
  settled: Expense[];
}

export function owedSummary(expenses: Expense[]): OwedSummary {
  const split = expenses.filter((e) => e.split?.shares.length).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const people = new Map<string, PersonOwed>();
  const unnamed = { lent: 0, repaid: 0, count: 0 };
  for (const expense of split) {
    expense.split!.shares.forEach((share, index) => {
      const name = share.name.trim();
      if (!name) {
        unnamed.lent += share.amount;
        unnamed.repaid += share.repaid;
        unnamed.count += 1;
        return;
      }
      const key = name.toLowerCase();
      // Expenses are newest first, so the name keeps its most recent spelling.
      const person = people.get(key) ?? { key, name, lent: 0, repaid: 0, shares: [] };
      person.lent += share.amount;
      person.repaid += share.repaid;
      person.shares.push({ expense, share, index });
      people.set(key, person);
    });
  }
  const owes = (e: Expense) => e.split!.shares.some((s) => outstanding(s) > 0);
  const named = [...people.values()];
  return {
    lent: named.reduce((t, p) => t + p.lent, unnamed.lent),
    repaid: named.reduce((t, p) => t + p.repaid, unnamed.repaid),
    people: named.sort((a, b) => b.lent - b.repaid - (a.lent - a.repaid) || a.name.localeCompare(b.name)),
    unnamed,
    open: split.filter(owes),
    settled: split.filter((e) => !owes(e)),
  };
}

/** Names used on earlier splits, for autocomplete. */
export function knownNames(expenses: Expense[]): string[] {
  const names = new Map<string, string>();
  for (const e of expenses) for (const s of e.split?.shares ?? []) if (s.name.trim()) names.set(s.name.trim().toLowerCase(), s.name.trim());
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
