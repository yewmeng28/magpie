/**
 * Chart colours. The eight category hues are the dataviz skill's validated categorical palette (dark-mode steps),
 * checked against MagPie's panel surface #1e2430: lightness band, chroma floor and 3:1 contrast all pass, and
 * neighbouring slots pass colour-blind (CVD) and normal-vision separation.
 */
export const SERIES_COLORS = {
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  yellow: '#c98500',
  magenta: '#d55181',
  green: '#008300',
  violet: '#9085e9',
  red: '#e66767',
} as const;

/** De-emphasis grey for "everything else": the folded tail of a chart, and the Other category. */
export const FOLD_COLOR = '#898781';

/** Single-series charts (total spend, repayment meters) use slot 1. */
export const PRIMARY_COLOR = SERIES_COLORS.blue;

const HUES = new Set<string>(Object.values(SERIES_COLORS));

/** Whether a colour is one of the eight category hues; anything else is drawn as part of the grey fold. */
export const isSeriesColor = (color: string) => HUES.has(color.toLowerCase());

/**
 * Hue pairs that are hard to tell apart when they touch, from running the validator on every pair (`--pairs all`,
 * dark mode, surface #1e2430). 2 = fails the hard floors (CVD ΔE < 6 or normal-vision ΔE < 15);
 * 1 = in the 6–8 CVD band, legal only with secondary encoding (MagPie always has the legend and emoji).
 */
const CLASHES: [keyof typeof SERIES_COLORS, keyof typeof SERIES_COLORS, 1 | 2][] = [
  ['blue', 'violet', 2],
  ['orange', 'yellow', 2],
  ['orange', 'magenta', 2],
  ['orange', 'green', 2],
  ['orange', 'red', 2],
  ['aqua', 'magenta', 2],
  ['aqua', 'green', 2],
  ['aqua', 'red', 1],
  ['yellow', 'green', 1],
  ['yellow', 'red', 2],
  ['magenta', 'red', 2],
];

const clashKey = (a: string, b: string) => [a.toLowerCase(), b.toLowerCase()].sort().join('|');
const CLASH = new Map(CLASHES.map(([a, b, level]) => [clashKey(SERIES_COLORS[a], SERIES_COLORS[b]), level]));

export const clash = (a: string, b: string): number => CLASH.get(clashKey(a, b)) ?? 0;

/**
 * Order donut slices so hues that blur together don't touch. A donut puts any two categories side by side, so the
 * palette's slot order alone can't keep neighbours apart. The largest slice stays at 12 o'clock and, among the
 * arrangements with the fewest clashes, the one closest to largest-first wins. At most 6 slices, so trying every
 * order is cheap.
 */
export function arrangeSlices<T extends { color: string }>(slices: T[]): T[] {
  if (slices.length < 3) return slices;
  const [first, ...rest] = slices;
  const cost = (order: T[]) => order.reduce((total, s, i) => total + clash(s.color, order[(i + 1) % order.length].color), 0);
  let best = slices;
  let bestCost = cost(slices);
  const permute = (prefix: T[], remaining: T[]) => {
    if (!remaining.length) {
      const order = [first, ...prefix];
      const c = cost(order);
      if (c < bestCost) [best, bestCost] = [order, c];
      return;
    }
    remaining.forEach((s, i) => permute([...prefix, s], [...remaining.slice(0, i), ...remaining.slice(i + 1)]));
  };
  if (bestCost > 0) permute([], rest);
  return best;
}
