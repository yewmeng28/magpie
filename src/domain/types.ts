/** Money is stored as integer cents so sums never pick up floating-point drift. */
export type Cents = number;

export type AccountKind = 'credit' | 'debit' | 'cash' | 'ewallet';

/** A card, bank account or wallet that expenses are paid from. */
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  color: string;
  /** Other names a statement might use for it, e.g. "POSB everyday". Matched ignoring case. */
  aliases?: string[];
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Position in pickers and lists; categories without one follow, in the default order. */
  order?: number;
  /** Hidden from pickers. Its expenses and learned merchants keep it. */
  hidden?: boolean;
}

export interface Expense {
  id: string;
  /** Local calendar day, YYYY-MM-DD (the transaction date, not the posting date). */
  date: string;
  /** Cleaned-up merchant name shown in lists. */
  merchant: string;
  /** Raw statement text, kept so rules can be re-learned from it. */
  description?: string;
  /** Positive for spending; negative for a refund. */
  amount: Cents;
  currency: string;
  /** null = uncategorised. */
  categoryId: string | null;
  accountId: string | null;
  note?: string;
  /** Set when the expense came from a statement import. */
  importId?: string;
  /** Set when a recurring payment added it (see domain/recurring.ts). */
  recurringId?: string;
  /** Set when I paid for others too. Only my share counts as my spending. */
  split?: Split;
  createdAt: number;
  updatedAt: number;
}

/** The other people on a split expense. My share is whatever is left of the expense after theirs. */
export interface Split {
  shares: SplitShare[];
}

/** What one person owes me for an expense, and how much of it they've paid back. */
export interface SplitShare {
  /** Stable within the expense, so editing a split keeps each person's repayments. */
  id: string;
  /** Empty for someone unnamed, shown as "Friend 1", "Friend 2", … */
  name: string;
  amount: Cents;
  /** Paid back so far, from 0 up to `amount`. */
  repaid: Cents;
}

/** A merchant → category mapping the user taught MagPie. `id` is the merchant key (see merchantKey). */
export interface MerchantRule {
  id: string;
  categoryId: string;
  updatedAt: number;
}
