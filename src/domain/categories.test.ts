import { describe, expect, it } from 'vitest';
import { freeHue, move, newCategoryId, pickable, recolour, ruleNames, sortCategories } from './categories';
import { DEFAULT_CATEGORIES } from './defaults';
import { merchantKey } from './merchant';
import { FOLD_COLOR, SERIES_COLORS } from './palette';
import type { Category, Expense } from './types';

const byId = [...DEFAULT_CATEGORIES].sort((a, b) => a.id.localeCompare(b.id));
const pets: Category = { id: 'pets', name: 'Pets', emoji: '🐶', color: FOLD_COLOR };

describe('category order', () => {
  it('keeps the default order however the database returns them, with new ones after', () => {
    expect(sortCategories([pets, ...byId]).map((c) => c.id)).toEqual([...DEFAULT_CATEGORIES.map((c) => c.id), 'pets']);
  });

  it('moves a category one step, writing an order for the list', () => {
    const changed = move(DEFAULT_CATEGORIES, 'groceries', -1);
    const after = sortCategories(DEFAULT_CATEGORIES.map((c) => changed.find((x) => x.id === c.id) ?? c));
    expect(after.slice(0, 3).map((c) => c.id)).toEqual(['groceries', 'food', 'transport']);
    expect(move(DEFAULT_CATEGORIES, 'food', -1)).toEqual([]);
  });

  it('leaves hidden categories out of pickers unless already chosen', () => {
    const list = [{ ...pets, hidden: true }, DEFAULT_CATEGORIES[0]];
    expect(pickable(list).map((c) => c.id)).toEqual(['food']);
    expect(pickable(list, 'pets').map((c) => c.id)).toEqual(['pets', 'food']);
  });
});

describe('new categories', () => {
  it('makes readable unique ids', () => {
    expect(newCategoryId('Pets & Vet', [])).toBe('pets-vet');
    expect(newCategoryId('Pets', [pets])).toBe('pets-2');
    expect(newCategoryId('🎉', [])).toBe('category');
  });

  it('takes a free hue, or grey when all eight are used', () => {
    expect(freeHue([])).toBe(SERIES_COLORS.blue);
    expect(freeHue(DEFAULT_CATEGORIES)).toBe(FOLD_COLOR);
    expect(freeHue(DEFAULT_CATEGORIES.filter((c) => c.id !== 'travel'))).toBe(SERIES_COLORS.red);
  });

  it('moves a hue to its new owner and greys the old one; grey can be shared', () => {
    expect(recolour(DEFAULT_CATEGORIES, 'other', SERIES_COLORS.blue).map((c) => [c.id, c.color])).toEqual([
      ['food', FOLD_COLOR],
      ['other', SERIES_COLORS.blue],
    ]);
    expect(recolour([pets, DEFAULT_CATEGORIES[8]], 'pets', FOLD_COLOR)).toEqual([]);
  });
});

describe('learned merchant names', () => {
  const e = (merchant: string, description: string | undefined, updatedAt: number) =>
    ({ id: merchant, merchant, description, updatedAt }) as Expense;

  it('names a rule after the latest expense it matched, or tidies the key', () => {
    const rules = [{ id: 'AKITCHEN', categoryId: 'food', updatedAt: 0 }, { id: 'ZZSHOP', categoryId: 'food', updatedAt: 0 }];
    const names = ruleNames(rules, [e('A Kitchen', 'AKITCHEN SINGAPORE SG', 1), e('A-Kitchen (Bugis)', 'A KITCHEN', 2)], merchantKey);
    expect(names.get('AKITCHEN')).toBe('A-Kitchen (Bugis)');
    expect(names.get('ZZSHOP')).toBe('Zzshop');
  });
});
