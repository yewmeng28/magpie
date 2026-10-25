import { describe, expect, it } from 'vitest';
import { donutSlices, trendSeries } from './chartData';
import { DEFAULT_CATEGORIES } from './defaults';
import { monthlyByCategory, monthsEnding } from './expenses';
import { arrangeSlices, clash, FOLD_COLOR, isSeriesColor, SERIES_COLORS } from './palette';
import type { Category, Expense } from './types';

const { blue, orange, aqua, yellow, green, magenta, violet, red } = SERIES_COLORS;

describe('palette', () => {
  it('knows which hues blur together, in either order', () => {
    expect(clash(blue, violet)).toBe(2);
    expect(clash(violet, blue)).toBe(2);
    expect(clash(yellow, green)).toBe(1);
    expect(clash(blue, orange)).toBe(0);
    expect(clash(FOLD_COLOR, red)).toBe(0);
  });

  it('gives each default category its own validated hue, and Other the grey', () => {
    const hued = DEFAULT_CATEGORIES.filter((c) => c.id !== 'other');
    expect(hued.every((c) => isSeriesColor(c.color))).toBe(true);
    expect(new Set(hued.map((c) => c.color)).size).toBe(hued.length);
    expect(DEFAULT_CATEGORIES.find((c) => c.id === 'other')!.color).toBe(FOLD_COLOR);
  });

  it('reorders donut slices so clashing hues never touch, keeping the biggest first', () => {
    const slices = [blue, violet, yellow, green, magenta].map((color) => ({ color }));
    const arranged = arrangeSlices(slices);
    expect(arranged[0].color).toBe(blue);
    const touching = arranged.map((s, i) => clash(s.color, arranged[(i + 1) % arranged.length].color));
    expect(touching).toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps largest-first order when nothing clashes', () => {
    const slices = [blue, orange, aqua].map((color) => ({ color }));
    expect(arrangeSlices(slices)).toBe(slices);
  });
});

const categories: Category[] = [
  ...DEFAULT_CATEGORIES,
  { id: 'gifts', name: 'Gifts & Donations', emoji: '🎁', color: FOLD_COLOR },
];

describe('donutSlices', () => {
  it('gives up to six hued categories their own slice', () => {
    const totals = ['food', 'groceries', 'transport', 'shopping', 'bills', 'travel'].map((id, i) => ({ categoryId: id, total: 600 - i * 50 }));
    const slices = donutSlices(totals, categories);
    expect(slices).toHaveLength(6);
    expect(slices.every((s) => s.members.length === 1)).toBe(true);
  });

  it('folds the tail into one grey "Everything else" slice past six', () => {
    const totals = ['food', 'groceries', 'transport', 'shopping', 'bills', 'travel', 'health'].map((id, i) => ({ categoryId: id, total: 700 - i * 50 }));
    const slices = donutSlices(totals, categories);
    expect(slices).toHaveLength(6);
    const fold = slices.find((s) => s.key === 'fold')!;
    expect(fold).toMatchObject({ label: 'Everything else', color: FOLD_COLOR, value: 450 + 400 });
    expect(fold.members.map((m) => m.categoryId)).toEqual(['travel', 'health']);
  });

  it('always folds grey categories, naming a lone one', () => {
    const slices = donutSlices([{ categoryId: 'food', total: 500 }, { categoryId: 'other', total: 100 }], categories);
    expect(slices.map((s) => [s.label, s.color])).toEqual([
      ['Food & Drinks', blue],
      ['Other', FOLD_COLOR],
    ]);
    const greys = donutSlices([{ categoryId: 'other', total: 100 }, { categoryId: null, total: 50 }, { categoryId: 'gifts', total: 20 }], categories);
    expect(greys).toHaveLength(1);
    expect(greys[0]).toMatchObject({ label: 'Everything else', value: 170 });
  });

  it('drops categories with nothing spent', () => {
    expect(donutSlices([{ categoryId: 'food', total: 0 }], categories)).toEqual([]);
  });
});

const expense = (id: string, date: string, amount: number, categoryId: string | null): Expense => ({
  id, date, merchant: id, amount, currency: 'SGD', categoryId, accountId: null, createdAt: 0, updatedAt: 0,
});

describe('monthly trend', () => {
  const months = monthsEnding('2026-02', 3);
  const monthly = monthlyByCategory(
    [
      expense('a', '2025-12-03', 1000, 'food'),
      expense('b', '2026-01-10', 500, 'food'),
      expense('c', '2026-01-11', 300, 'transport'),
      expense('d', '2026-02-01', 200, 'other'),
      expense('e', '2026-02-02', 100, null),
      expense('f', '2026-02-05', -900, 'shopping'),
      expense('g', '2025-11-30', 9999, 'food'),
    ],
    months,
  );

  it('lists months across a year boundary, oldest first', () => {
    expect(months).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('totals every category per month, never below zero', () => {
    expect(trendSeries(monthly, categories, 'total', 3)[0].values).toEqual([1000, 800, 300]);
  });

  it('draws each hued category in its own colour and folds the greys into one line', () => {
    expect(trendSeries(monthly, categories, 'each', 3).map((s) => [s.label, s.color, s.values])).toEqual([
      ['Food & Drinks', blue, [1000, 500, 0]],
      ['Transport', yellow, [0, 300, 0]],
      ['Everything else', FOLD_COLOR, [0, 0, 300]],
    ]);
  });

  it('shows one category, or zeros when it has no spending', () => {
    expect(trendSeries(monthly, categories, 'transport', 3)[0]).toMatchObject({ label: 'Transport', values: [0, 300, 0] });
    expect(trendSeries(monthly, categories, 'travel', 3)[0].values).toEqual([0, 0, 0]);
    expect(trendSeries(monthly, categories, 'none', 3)[0]).toMatchObject({ label: 'Uncategorised', values: [0, 0, 100] });
  });
});
