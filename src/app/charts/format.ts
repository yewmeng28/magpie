import type { Cents } from '../../domain/types';

/** Axis and end labels: $0, $2.5, $250, $1K, $1.5K. */
export function compactMoney(cents: Cents): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${+(dollars / 1000).toFixed(1)}K`;
  return `$${+dollars.toFixed(dollars < 10 ? 2 : 0)}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep" for "2026-09". */
export const monthName = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1];
