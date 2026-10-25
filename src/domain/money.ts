import type { Cents } from './types';

/** Decimal dollars (as typed or as given in an import file) to cents. Returns null for anything that isn't a plain amount. */
export function toCents(value: number | string): Cents | null {
  if (typeof value === 'number') {
    const cents = Math.round(value * 100);
    // Reject sub-cent amounts, but tolerate float noise like 57.68 * 100 = 5767.999999999999.
    return Number.isFinite(value) && Math.abs(value * 100 - cents) < 1e-6 ? cents : null;
  }
  const text = value.replace(/[,\s$]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export function formatMoney(cents: Cents, currency = 'SGD'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-SG');
  const symbol = currency === 'SGD' ? '$' : `${currency} `;
  return `${sign}${symbol}${dollars}.${String(abs % 100).padStart(2, '0')}`;
}
