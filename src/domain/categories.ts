import { DEFAULT_CATEGORIES } from './defaults';
import { FOLD_COLOR, isSeriesColor, SERIES_COLORS } from './palette';
import type { Category, Expense, MerchantRule } from './types';

const DEFAULT_INDEX = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.id, i]));

/** Display order: an explicit `order` first, then the default categories' own order, then by name. */
export function sortCategories(categories: Category[]): Category[] {
  const rank = (c: Category) => c.order ?? 1000 + (DEFAULT_INDEX.get(c.id) ?? 100);
  return [...categories].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** What a picker offers: every shown category, plus a hidden one that's already chosen so it isn't lost. */
export const pickable = (categories: Category[], chosen: string | null = null) =>
  categories.filter((c) => !c.hidden || c.id === chosen);

/** The first of the eight hues no category uses yet, or grey once they're all taken. */
export function freeHue(categories: Category[]): string {
  const used = new Set(categories.map((c) => c.color.toLowerCase()));
  return Object.values(SERIES_COLORS).find((h) => !used.has(h)) ?? FOLD_COLOR;
}

/** A readable, unique id for a new category: "Pets & Vet" → "pets-vet", "pets-vet-2", … */
export function newCategoryId(name: string, categories: Category[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  const taken = new Set(categories.map((c) => c.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Give `id` the colour `color`. Two categories on one hue would read as one in the charts, so a hued colour moves:
 * whoever had it falls back to grey. Returns every category that changed.
 */
export function recolour(categories: Category[], id: string, color: string): Category[] {
  const changed: Category[] = [];
  for (const c of categories) {
    if (c.id === id) {
      if (c.color !== color) changed.push({ ...c, color });
    } else if (isSeriesColor(color) && c.color.toLowerCase() === color.toLowerCase()) {
      changed.push({ ...c, color: FOLD_COLOR });
    }
  }
  return changed;
}

/** Swap a category with its neighbour. Writes an explicit order for the whole list so it sticks; returns what changed. */
export function move(categories: Category[], id: string, by: -1 | 1): Category[] {
  const list = sortCategories(categories);
  const i = list.findIndex((c) => c.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return [];
  [list[i], list[j]] = [list[j], list[i]];
  const before = new Map(categories.map((c) => [c.id, c.order]));
  return list.map((c, order) => ({ ...c, order })).filter((c) => c.order !== before.get(c.id));
}

/**
 * The readable name for a learned merchant: the most recent expense it matched, as shown in lists. Rules are keyed
 * by a squashed brand ("AKITCHEN"), which is how MagPie matches, not how anyone writes the shop's name.
 */
export function ruleNames(rules: MerchantRule[], expenses: Expense[], keyOf: (text: string) => string): Map<string, string> {
  const ids = new Set(rules.map((r) => r.id));
  const names = new Map<string, { name: string; at: number }>();
  for (const e of expenses) {
    for (const text of [e.description, e.merchant]) {
      if (!text) continue;
      const key = keyOf(text);
      if (!ids.has(key)) continue;
      const seen = names.get(key);
      if (!seen || e.updatedAt > seen.at) names.set(key, { name: e.merchant, at: e.updatedAt });
      break;
    }
  }
  return new Map(rules.map((r) => [r.id, names.get(r.id)?.name ?? r.id.charAt(0) + r.id.slice(1).toLowerCase()]));
}
