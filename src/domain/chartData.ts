import { arrangeSlices, FOLD_COLOR, isSeriesColor, PRIMARY_COLOR } from './palette';
import type { Category, Cents } from './types';

export interface Labelled {
  label: string;
  emoji: string;
  color: string;
}

const UNCATEGORISED: Labelled = { label: 'Uncategorised', emoji: '❔', color: FOLD_COLOR };

export function describeCategory(categories: Category[], id: string | null): Labelled {
  const c = id === null ? undefined : categories.find((cat) => cat.id === id);
  return c ? { label: c.name, emoji: c.emoji, color: c.color } : UNCATEGORISED;
}

export interface SliceMember extends Labelled {
  categoryId: string | null;
  value: Cents;
}

export interface Slice extends Labelled {
  key: string;
  value: Cents;
  /** The categories in this slice: one, or several for the grey "everything else" slice. */
  members: SliceMember[];
}

const FOLD_KEY = 'fold';

/** One slice standing for several categories; a lone member keeps its own name. */
function foldOf(members: SliceMember[], key: string): Slice {
  const single = members.length === 1 ? members[0] : null;
  return {
    key,
    label: single ? single.label : 'Everything else',
    emoji: single ? single.emoji : '➕',
    color: FOLD_COLOR,
    value: members.reduce((t, m) => t + m.value, 0),
    members,
  };
}

/**
 * Donut slices: at most `max` (a donut stops reading as part-to-whole past ~6). The biggest hued categories get their
 * own slice; the rest, plus every grey category (Other, Uncategorised), fold into one grey slice, so two greys never
 * sit side by side. Slices come back in drawing order (see arrangeSlices).
 */
export function donutSlices(totals: { categoryId: string | null; total: Cents }[], categories: Category[], max = 6): Slice[] {
  const members = totals
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((t): SliceMember => ({ categoryId: t.categoryId, value: t.total, ...describeCategory(categories, t.categoryId) }));
  const hued = members.filter((m) => isSeriesColor(m.color));
  const grey = members.filter((m) => !isSeriesColor(m.color));
  const own = !grey.length && hued.length <= max ? hued : hued.slice(0, max - 1);
  const folded = members.filter((m) => !own.includes(m));
  const slices: Slice[] = own.map((m) => ({ key: m.categoryId ?? 'none', label: m.label, emoji: m.emoji, color: m.color, value: m.value, members: [m] }));
  if (folded.length) slices.push(foldOf(folded, FOLD_KEY));
  return arrangeSlices(slices.sort((a, b) => b.value - a.value));
}

export interface LineSeries extends Labelled {
  key: string;
  values: Cents[];
}

/** 'total', 'each' (one line per category), or a category id ('none' = uncategorised). */
export type TrendView = string;

const sumColumns = (rows: Cents[][], length: number) =>
  Array.from({ length }, (_, i) => rows.reduce((t, row) => t + row[i], 0));

/**
 * Line series for the monthly trend. 'each' gives every hued category with spending its own line (in its own colour,
 * whatever else is shown) and folds the grey categories into one grey line.
 */
export function trendSeries(monthly: Map<string | null, Cents[]>, categories: Category[], view: TrendView, months: number): LineSeries[] {
  const rows = [...monthly].map(([categoryId, values]) => ({ categoryId, values, ...describeCategory(categories, categoryId) }));
  if (view === 'total') {
    return [{ key: 'total', label: 'All spending', emoji: '🪙', color: PRIMARY_COLOR, values: sumColumns(rows.map((r) => r.values), months) }];
  }
  if (view !== 'each') {
    const id = view === 'none' ? null : view;
    const row = rows.find((r) => r.categoryId === id);
    const d = describeCategory(categories, id);
    return [{ key: view, ...d, values: row?.values ?? Array<Cents>(months).fill(0) }];
  }
  const withSpend = rows.filter((r) => r.values.some((v) => v > 0));
  const total = (r: { values: Cents[] }) => r.values.reduce((t, v) => t + v, 0);
  const series: LineSeries[] = withSpend
    .filter((r) => isSeriesColor(r.color))
    .sort((a, b) => total(b) - total(a))
    .map((r) => ({ key: r.categoryId ?? 'none', label: r.label, emoji: r.emoji, color: r.color, values: r.values }));
  const grey = withSpend.filter((r) => !isSeriesColor(r.color));
  if (grey.length) {
    const single = grey.length === 1 ? grey[0] : null;
    series.push({
      key: FOLD_KEY,
      label: single ? single.label : 'Everything else',
      emoji: single ? single.emoji : '➕',
      color: FOLD_COLOR,
      values: sumColumns(grey.map((r) => r.values), months),
    });
  }
  return series;
}
