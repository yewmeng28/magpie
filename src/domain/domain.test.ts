import { describe, expect, it } from 'vitest';
import { suggestCategory } from './dictionary';
import { byNewest, inPeriod, periodKey, totalsByCategory } from './expenses';
import { cleanMerchant, merchantKey } from './merchant';
import { formatMoney, toCents } from './money';
import type { Expense } from './types';

const expense = (id: string, extra: Partial<Expense> = {}): Expense => ({
  id,
  date: '2026-09-14',
  merchant: id,
  amount: 100,
  currency: 'SGD',
  categoryId: 'food',
  accountId: null,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

describe('money', () => {
  it('converts decimal amounts to cents without float drift', () => {
    expect(toCents(57.68)).toBe(5768);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('1,121.00')).toBe(112100);
    expect(toCents('$4.5')).toBe(450);
    expect(toCents('-3')).toBe(-300);
  });

  it('rejects anything that is not a plain amount', () => {
    expect(toCents(1.234)).toBeNull();
    expect(toCents('12.3.4')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents(Number.NaN)).toBeNull();
  });

  it('formats cents', () => {
    expect(formatMoney(112100)).toBe('$1,121.00');
    expect(formatMoney(-450)).toBe('-$4.50');
    expect(formatMoney(5, 'USD')).toBe('USD 0.05');
  });
});

describe('merchant cleanup', () => {
  // Description formats as printed on POSB/DBS and HSBC statements.
  it.each([
    ['LUCKIN COFFEE (SGP) PT SINGAPORE SG', 'Luckin Coffee'],
    ['GRAB* A-9N92OWBWW5PEAV', 'Grab'],
    ['BUS/MRT 907133239', 'Bus/Mrt'],
    ['SMP**Casa Vostra (Jem) SG SG', 'Casa Vostra (Jem)'],
    ['SMP*WU WEI TANG MALA Singapore SG', 'Wu Wei Tang Mala'],
    ['SONG FA - ESR BIZPARK SINGAPORE 486 SG', 'Song Fa - Esr Bizpark'],
    ['NTUC FP-BEDOK SINGAPORE 065', 'Ntuc Fp-Bedok'],
    ['AVENUE CREAMERY PTE LT', 'Avenue Creamery'],
    ['M1LTD RECURRING', 'M1ltd'],
    ['Wingstop Singapore SG SG', 'Wingstop'],
  ])('%s → %s', (description, name) => {
    expect(cleanMerchant(description)).toBe(name);
  });

  it('gives every outlet of a brand the same key', () => {
    expect(merchantKey('CEDELE -RAFFLES CITY SINGAPORE SG')).toBe('CEDELE');
    expect(merchantKey('CEDELE - BUGIS')).toBe('CEDELE');
    expect(merchantKey('EAT. @ BUGIS JUNCTION SINGAPORE 188')).toBe('EAT');
    expect(merchantKey('LUCKINCOFFEE')).toBe(merchantKey('LUCKIN COFFEE (SGP) PT SINGAPORE SG'));
  });
});

describe('suggestCategory', () => {
  it.each([
    ['BUS/MRT 910383377', 'transport'],
    ['GRAB* A-9NCD6RFGWDDFAV', 'transport'],
    ['NTUC FP-BEDOK SINGAPORE 065', 'groceries'],
    ['FAIRPRICE XTRA-JURONG SINGAPORE SG', 'groceries'],
    ['7-ELEVEN-TAMPINES MRT', 'groceries'],
    ['MCDONALD\'S (CCP) SINGAPORE SG', 'food'],
    ['LUCKINCOFFEE', 'food'],
    ['KKV BUSINESS MANAGEMEN', 'shopping'],
    ['M1LTD RECURRING', 'bills'],
    ['GUARDIAN ION ORCHARD Singapore SG', 'health'],
    ['H&M ORCHARD', 'shopping'],
  ])('%s → %s', (description, categoryId) => {
    expect(suggestCategory(description, [])).toEqual({ categoryId, source: 'starter' });
  });

  it('prefers the longest starter pattern', () => {
    expect(suggestCategory('GRABFOOD SINGAPORE', [])?.categoryId).toBe('food');
  });

  it('only matches very short patterns exactly', () => {
    expect(suggestCategory('HMART KOREAN MART', [])).toBeNull();
    expect(suggestCategory('EATON GROCER', [])).toBeNull();
  });

  it('lets the user\'s rules override the starter dictionary', () => {
    const rules = [{ id: 'GRAB', categoryId: 'food', updatedAt: 0 }];
    expect(suggestCategory('GRAB* A-9N92OWBWW5PEAV', rules)).toEqual({ categoryId: 'food', source: 'rule' });
  });

  it('returns null for unknown merchants', () => {
    expect(suggestCategory('SOME NEW PLACE SINGAPORE SG', [])).toBeNull();
  });
});

describe('expenses', () => {
  it('groups by period', () => {
    expect(periodKey('2026-09-14', 'day')).toBe('2026-09-14');
    expect(periodKey('2026-09-14', 'month')).toBe('2026-09');
    expect(periodKey('2026-09-14', 'year')).toBe('2026');
    const list = [expense('a'), expense('b', { date: '2026-08-31' })];
    expect(inPeriod(list, 'month', '2026-09').map((e) => e.id)).toEqual(['a']);
    expect(inPeriod(list, 'year', '2026')).toHaveLength(2);
  });

  it('totals by category, netting refunds and dropping non-positive totals', () => {
    const totals = totalsByCategory([
      expense('a', { amount: 500 }),
      expense('b', { amount: -200 }),
      expense('c', { amount: 900, categoryId: 'transport' }),
      expense('d', { amount: 300, categoryId: null }),
      expense('e', { amount: -100, categoryId: 'shopping' }),
    ]);
    expect(totals).toEqual([
      { categoryId: 'transport', total: 900 },
      { categoryId: 'food', total: 300 },
      { categoryId: null, total: 300 },
    ]);
  });

  it('sorts newest first', () => {
    const list = [expense('old', { date: '2026-01-01' }), expense('new', { createdAt: 2 }), expense('mid', { createdAt: 1 })];
    expect(list.sort(byNewest).map((e) => e.id)).toEqual(['new', 'mid', 'old']);
  });
});
